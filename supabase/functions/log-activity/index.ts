// Permite que el "gestor personal" (Claude, en conversación con David) apunte
// directamente centros, pacientes y visitas en esta base de datos, sin pasar
// por el formulario de la app.
//
// Usa la service role key (con acceso total, salta las políticas RLS) porque
// quien llama no es un usuario con sesión iniciada, sino un proceso de confianza
// que actúa en nombre del único usuario de esta app (David). Por eso:
// 1. Todo se escribe siempre bajo el mismo user_id fijo (el de David).
// 2. Se exige un secreto compartido en la cabecera "x-assistant-token" que
//    solo conoce quien despliega esta función — sin él, la petición se rechaza.
//
// Revisado tras una auditoría de seguridad (2026-09-24) que encontró fallos
// reales de integridad de datos: ver los comentarios junto a cada corrección.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-assistant-token",
};

const OWNER_USER_ID = "71a0caa3-f335-4090-95b7-7882dfcf5523";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Número finito y no NaN. `Number("")` da 0 en JS, así que un campo vacío
 *  pasaría como "0 €" sin avisar: aquí lo tratamos como dato ausente/erróneo. */
function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedToken = Deno.env.get("ASSISTANT_SHARED_SECRET");
  const providedToken = req.headers.get("x-assistant-token");
  if (!expectedToken || providedToken !== expectedToken) {
    return json({ error: "No autorizado" }, 401);
  }

  function resolveServiceKey(): string {
    const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (legacy) return legacy;
    const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      // Preferir explícitamente la clave "service_role" si viene identificada;
      // si no, la primera disponible (antes se cogía siempre "la primera que
      // haya", que con más de una clave da resultados impredecibles).
      return parsed.service_role ?? Object.values(parsed)[0] ?? "";
    } catch {
      return "";
    }
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    resolveServiceKey(),
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const action = String(body.action ?? "");

  async function findOrCreateCenter(name: string): Promise<{ id: string; error?: string }> {
    const trimmed = name.trim();
    const { data: existing, error: findErr } = await admin
      .from("centers")
      .select("id")
      .eq("user_id", OWNER_USER_ID)
      .ilike("name", trimmed)
      .limit(1);
    if (findErr) return { id: "", error: findErr.message };
    if (existing && existing.length > 0) return { id: existing[0].id };

    const { data: created, error: createErr } = await admin
      .from("centers")
      .insert({ user_id: OWNER_USER_ID, name: trimmed, type: "Residencia", is_active: true })
      .select("id")
      .single();
    if (createErr) return { id: "", error: createErr.message };
    return { id: created.id };
  }

  // Evita duplicar la ficha de un paciente que ya existe (p. ej. al reimportar
  // varias facturas de la misma persona). Prioriza el DNI cuando se conoce:
  // dos personas con el mismo nombre son habituales (p. ej. "María García")
  // y buscar solo por nombre podía asignarle a una la factura de la otra.
  // Usa `.limit(1)` en vez de `.maybeSingle()`: con nombres duplicados ya
  // existentes, `.maybeSingle()` lanza error en vez de elegir uno, y eso
  // dejaba la visita ya creada huérfana (sin paciente) al fallar a mitad.
  async function findOrCreatePatient(
    name: string,
    centerId: string | null,
    extra: { dni?: string; price?: number; treatment?: string } = {},
  ): Promise<{ id: string; error?: string }> {
    const trimmed = name.trim();

    if (extra.dni) {
      const { data: byDni, error: dniErr } = await admin
        .from("patients")
        .select("id")
        .eq("user_id", OWNER_USER_ID)
        .eq("patient_code", extra.dni)
        .limit(1);
      if (dniErr) return { id: "", error: dniErr.message };
      if (byDni && byDni.length > 0) return { id: byDni[0].id };
    }

    let query = admin.from("patients").select("id").eq("user_id", OWNER_USER_ID).ilike("full_name", trimmed);
    query = centerId ? query.eq("center_id", centerId) : query.is("center_id", null);
    const { data: existing, error: findErr } = await query.limit(1);
    if (findErr) return { id: "", error: findErr.message };
    if (existing && existing.length > 0) return { id: existing[0].id };

    const { data: created, error: createErr } = await admin
      .from("patients")
      .insert({
        user_id: OWNER_USER_ID,
        center_id: centerId,
        full_name: trimmed,
        patient_code: extra.dni ?? null,
        usual_treatment: extra.treatment ?? null,
        default_price: extra.price ?? null,
        is_active: true,
      })
      .select("id")
      .single();
    if (createErr) return { id: "", error: createErr.message };
    return { id: created.id };
  }

  try {
    if (action === "add_visit") {
      const centerName = String(body.center ?? "").trim();
      if (!centerName) return json({ error: "Falta el nombre del centro" }, 400);

      const visitDate = String(body.date ?? "");
      if (!DATE_RE.test(visitDate)) {
        return json({ error: "La fecha debe tener el formato AAAA-MM-DD" }, 400);
      }

      const grossAmount = parseAmount(body.gross_amount);
      if (grossAmount === null) return json({ error: "gross_amount ausente o no numérico" }, 400);
      if (grossAmount < 0) return json({ error: "gross_amount no puede ser negativo (usa una nota para devoluciones)" }, 400);

      const patientsCount = Number(body.patients_count ?? 0);
      if (!Number.isFinite(patientsCount) || patientsCount < 0) {
        return json({ error: "patients_count debe ser un número ≥ 0" }, 400);
      }

      const irpfPercentage = body.irpf_percentage != null ? Number(body.irpf_percentage) : 0;
      if (!Number.isFinite(irpfPercentage) || irpfPercentage < 0 || irpfPercentage > 100) {
        return json({ error: "irpf_percentage debe estar entre 0 y 100" }, 400);
      }

      // Neto real si se conoce (p. ej. el "TOTAL A PAGAR" de una factura ya
      // emitida); si no se indica, se calcula con la MISMA fórmula que usa el
      // resto de la app (bruto − IRPF), no se asume igual al bruto como antes.
      const explicitNet = parseAmount(body.net_amount);
      const netAmount = explicitNet ?? grossAmount - (grossAmount * irpfPercentage) / 100;
      const status = body.status ? String(body.status) : "Realizada";

      // Idempotencia: si se indica `source_ref` (p. ej. "factura:F-2026-066")
      // y ya existe una visita con esa referencia para este usuario, se
      // devuelve tal cual en vez de insertar un duplicado. Antes, reintentar
      // una importación (por un fallo de red a mitad, por ejemplo) podía
      // duplicar el ingreso sin que nada lo impidiera.
      const sourceRef = body.source_ref ? String(body.source_ref) : null;
      if (sourceRef) {
        const { data: dupe, error: dupeErr } = await admin
          .from("visits")
          .select("id, center_id")
          .eq("user_id", OWNER_USER_ID)
          .eq("source_ref", sourceRef)
          .limit(1);
        if (dupeErr) return json({ error: dupeErr.message }, 500);
        if (dupe && dupe.length > 0) {
          return json({ ok: true, visit_id: dupe[0].id, center_id: dupe[0].center_id, deduplicated: true });
        }
      }

      const { id: centerId, error: centerErr } = await findOrCreateCenter(centerName);
      if (centerErr) return json({ error: centerErr }, 500);

      const { data: visit, error: visitErr } = await admin
        .from("visits")
        .insert({
          user_id: OWNER_USER_ID,
          center_id: centerId,
          visit_date: visitDate,
          status,
          gross_amount: grossAmount,
          irpf_percentage: irpfPercentage,
          patients_count: patientsCount,
          estimated_net_amount: netAmount,
          general_notes: body.notes ? String(body.notes) : null,
          source_ref: sourceRef,
          import_batch: body.import_batch ? String(body.import_batch) : null,
        })
        .select("id")
        .single();
      if (visitErr) return json({ error: visitErr.message }, 500);

      // Paciente concreto asociado a esta visita (p. ej. facturas individuales
      // a domicilio o a un particular): crea/reutiliza su ficha y enlaza el
      // cobro real de esa visita, en vez de dejarlo solo como texto suelto.
      let patientId: string | null = null;
      const patientInput = body.patient as Record<string, unknown> | undefined;
      if (patientInput?.name) {
        const patientPrice = parseAmount(patientInput.price);
        // Si hay más de un paciente en la visita, el precio de ESTE paciente
        // tiene que venir indicado explícitamente: usar el importe total de
        // la visita como si fuera el de un solo paciente sobrefacturaría a
        // quien conste con nombre (antes pasaba con visitas de residencia).
        if (patientPrice === null && patientsCount > 1) {
          return json({ error: "patient.price es obligatorio cuando patients_count > 1" }, 400);
        }
        const { id, error: patErr } = await findOrCreatePatient(String(patientInput.name), centerId, {
          dni: patientInput.dni ? String(patientInput.dni) : undefined,
          price: patientPrice ?? undefined,
          treatment: patientInput.treatment ? String(patientInput.treatment) : undefined,
        });
        if (patErr) return json({ error: patErr }, 500);
        patientId = id;
        const { error: vpErr } = await admin.from("visit_patients").insert({
          visit_id: visit.id,
          patient_id: patientId,
          patient_name: String(patientInput.name),
          treatment_done: patientInput.treatment ? String(patientInput.treatment) : null,
          price_charged: patientPrice ?? grossAmount,
          payment_status: patientInput.payment_status ? String(patientInput.payment_status) : "Pendiente",
          attended: true,
        });
        if (vpErr) return json({ error: vpErr.message }, 500);
      }

      return json({ ok: true, visit_id: visit.id, center_id: centerId, patient_id: patientId });
    }

    if (action === "add_patient") {
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "Falta el nombre del paciente" }, 400);

      let centerId: string | null = null;
      if (body.center) {
        const { id, error: centerErr } = await findOrCreateCenter(String(body.center));
        if (centerErr) return json({ error: centerErr }, 500);
        centerId = id;
      }

      // Reutiliza la misma búsqueda que add_visit (por DNI primero, luego por
      // nombre+centro) para no crear una ficha duplicada de la misma persona.
      const { id: patientId, error: patErr } = await findOrCreatePatient(name, centerId, {
        dni: body.dni ? String(body.dni) : undefined,
        price: parseAmount(body.price) ?? undefined,
        treatment: body.treatment ? String(body.treatment) : undefined,
      });
      if (patErr) return json({ error: patErr }, 500);

      return json({ ok: true, patient_id: patientId });
    }

    if (action === "add_center") {
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "Falta el nombre del centro" }, 400);

      const { data: center, error: centerErr } = await admin
        .from("centers")
        .insert({
          user_id: OWNER_USER_ID,
          name,
          type: body.type ? String(body.type) : "Residencia",
          default_price_per_patient: parseAmount(body.price) ?? null,
          payment_method: body.payment_method ? String(body.payment_method) : null,
          notes: body.notes ? String(body.notes) : null,
          is_active: true,
        })
        .select("id")
        .single();
      if (centerErr) return json({ error: centerErr.message }, 500);

      return json({ ok: true, center_id: center.id });
    }

    if (action === "delete_visits_by_batch") {
      // Borrado acotado por COINCIDENCIA EXACTA de `import_batch`, nunca por
      // patrón sobre texto libre. La versión anterior (`delete_visits_by_
      // note_prefix`, buscando con ILIKE sobre `general_notes`) tenía un
      // fallo real: PostgREST trata '*' como comodín además de '%' y '_', así
      // que un prefijo con asteriscos podía casar con cualquier nota y borrar
      // visitas fuera del lote. Con `.eq()` sobre una columna dedicada no hay
      // patrón que interpretar: o coincide el lote exacto, o no coincide nada.
      const batch = String(body.import_batch ?? "").trim();
      if (!batch) return json({ error: "Falta import_batch" }, 400);

      const { data: toDelete, error: findErr } = await admin
        .from("visits")
        .select("id")
        .eq("user_id", OWNER_USER_ID)
        .eq("import_batch", batch);
      if (findErr) return json({ error: findErr.message }, 500);
      const ids = (toDelete ?? []).map((v) => v.id);
      if (ids.length === 0) return json({ ok: true, deleted: 0 });

      // Modo de recuento: permite comprobar cuántas filas se borrarían antes
      // de borrarlas de verdad.
      if (body.dry_run === true) return json({ ok: true, would_delete: ids.length });

      const { error: delErr } = await admin.from("visits").delete().in("id", ids);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true, deleted: ids.length });
    }

    if (action === "delete_visits_by_note_prefix") {
      // Mantenido solo para poder limpiar lotes importados ANTES de que
      // existiera la columna `import_batch` (que es el mecanismo correcto,
      // ver `delete_visits_by_batch`). El fallo real que tenía esta acción:
      // PostgREST trata '*' como comodín además de '%' y '_' en ILIKE, así
      // que escapar solo esos dos no bastaba — un prefijo con asteriscos
      // podía casar con cualquier nota y borrar visitas fuera del lote.
      // Ahora se RECHAZA cualquier prefijo que contenga un comodín, en vez
      // de intentar escaparlo: o el texto es completamente literal, o no se
      // ejecuta la búsqueda.
      const prefix = String(body.note_prefix ?? "").trim();
      if (!prefix || prefix.length < 10) {
        return json({ error: "note_prefix demasiado corto o ausente (mínimo 10 caracteres, por seguridad)" }, 400);
      }
      if (/[%_*\\]/.test(prefix)) {
        return json({ error: "note_prefix no puede contener comodines (%, _, *, \\) — deben ser texto literal" }, 400);
      }
      const { data: toDelete, error: findErr } = await admin
        .from("visits")
        .select("id")
        .eq("user_id", OWNER_USER_ID)
        .ilike("general_notes", `${prefix}%`);
      if (findErr) return json({ error: findErr.message }, 500);
      const ids = (toDelete ?? []).map((v) => v.id);
      if (ids.length === 0) return json({ ok: true, deleted: 0 });
      if (body.dry_run === true) return json({ ok: true, would_delete: ids.length });
      const { error: delErr } = await admin.from("visits").delete().in("id", ids);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true, deleted: ids.length });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error desconocido" }, 500);
  }
});
