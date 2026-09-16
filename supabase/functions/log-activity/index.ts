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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-assistant-token",
};

const OWNER_USER_ID = "71a0caa3-f335-4090-95b7-7882dfcf5523";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      return Object.values(parsed)[0] ?? "";
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
      .maybeSingle();
    if (findErr) return { id: "", error: findErr.message };
    if (existing) return { id: existing.id };

    const { data: created, error: createErr } = await admin
      .from("centers")
      .insert({ user_id: OWNER_USER_ID, name: trimmed, type: "Residencia", is_active: true })
      .select("id")
      .single();
    if (createErr) return { id: "", error: createErr.message };
    return { id: created.id };
  }

  try {
    if (action === "add_visit") {
      const centerName = String(body.center ?? "").trim();
      if (!centerName) return json({ error: "Falta el nombre del centro" }, 400);

      const { id: centerId, error: centerErr } = await findOrCreateCenter(centerName);
      if (centerErr) return json({ error: centerErr }, 500);

      const grossAmount = Number(body.gross_amount ?? 0);
      const patientsCount = Number(body.patients_count ?? 0);
      const visitDate = String(body.date ?? new Date().toISOString().slice(0, 10));

      const { data: visit, error: visitErr } = await admin
        .from("visits")
        .insert({
          user_id: OWNER_USER_ID,
          center_id: centerId,
          visit_date: visitDate,
          status: "Realizada",
          gross_amount: grossAmount,
          patients_count: patientsCount,
          estimated_net_amount: grossAmount,
          general_notes: body.notes ? String(body.notes) : null,
        })
        .select("id")
        .single();
      if (visitErr) return json({ error: visitErr.message }, 500);

      return json({ ok: true, visit_id: visit.id, center_id: centerId });
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

      const { data: patient, error: patientErr } = await admin
        .from("patients")
        .insert({
          user_id: OWNER_USER_ID,
          center_id: centerId,
          full_name: name,
          usual_treatment: body.treatment ? String(body.treatment) : null,
          default_price: body.price != null ? Number(body.price) : null,
          clinical_notes: body.notes ? String(body.notes) : null,
          is_active: true,
        })
        .select("id")
        .single();
      if (patientErr) return json({ error: patientErr.message }, 500);

      return json({ ok: true, patient_id: patient.id });
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
          default_price_per_patient: body.price != null ? Number(body.price) : null,
          payment_method: body.payment_method ? String(body.payment_method) : null,
          notes: body.notes ? String(body.notes) : null,
          is_active: true,
        })
        .select("id")
        .single();
      if (centerErr) return json({ error: centerErr.message }, 500);

      return json({ ok: true, center_id: center.id });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error desconocido" }, 500);
  }
});
