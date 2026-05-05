import { supabase } from "@/integrations/supabase/client";
import type { VoiceInterpretation } from "@/types/voice";

const TYPE_MAP: Record<string, string> = {
  residencia: "Residencia",
  centro_dia: "Centro de día",
  domicilio: "Domicilio",
};

export interface SaveResult {
  ok: boolean;
  message: string;
  /** Tipos de datos invalidados — para refrescar React Query */
  invalidates: Array<"centers" | "patients" | "visits" | "materials" | "expenses">;
  redirect?: string;
}

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sesión no iniciada");
  return data.user.id;
}

async function findCenterByName(name: string, userId: string) {
  const { data } = await supabase
    .from("centers")
    .select("id, name, default_price_per_patient")
    .eq("user_id", userId)
    .ilike("name", `%${name}%`)
    .limit(1);
  return data?.[0] ?? null;
}

async function findPatientByName(name: string, userId: string) {
  const { data } = await supabase
    .from("patients")
    .select("id, full_name, default_price")
    .eq("user_id", userId)
    .ilike("full_name", `%${name}%`)
    .limit(1);
  return data?.[0] ?? null;
}

export async function saveVoiceInterpretation(d: VoiceInterpretation): Promise<SaveResult> {
  const userId = await getUserId();

  switch (d.intent) {
    case "centro": {
      const c = d.center ?? {};
      if (!c.name?.trim()) return { ok: false, message: "Falta el nombre del centro", invalidates: [] };
      const { error } = await supabase.from("centers").insert({
        user_id: userId,
        name: c.name.trim(),
        type: (c.type && TYPE_MAP[c.type]) || "Residencia",
        address: c.address ?? null,
        city: c.city ?? null,
        contact_person: c.contactName ?? null,
        contact_phone: c.contactPhone ?? null,
        default_price_per_patient: c.defaultPricePerPatient ?? null,
        notes: c.notes ?? null,
      });
      if (error) return { ok: false, message: error.message, invalidates: [] };
      return { ok: true, message: "Centro creado", invalidates: ["centers"], redirect: "/pacientes" };
    }

    case "paciente": {
      const p = d.patient ?? {};
      if (!p.fullName?.trim()) return { ok: false, message: "Falta el nombre del paciente", invalidates: [] };
      let centerId: string | null = null;
      if (p.centerName) {
        const found = await findCenterByName(p.centerName, userId);
        centerId = found?.id ?? null;
      }
      const { error } = await supabase.from("patients").insert({
        user_id: userId,
        center_id: centerId,
        full_name: p.fullName.trim(),
        usual_treatment: p.usualTreatment ?? null,
        default_price: p.defaultPrice ?? null,
        next_visit_date: p.nextVisitDate || null,
        important_warnings: p.warnings ?? null,
        clinical_notes: p.notes ?? null,
      });
      if (error) return { ok: false, message: error.message, invalidates: [] };
      return { ok: true, message: "Paciente creado", invalidates: ["patients"], redirect: "/pacientes" };
    }

    case "visita": {
      const v = d.visit ?? {};
      if (!v.date) return { ok: false, message: "Falta la fecha de la visita", invalidates: [] };
      let centerId: string | null = null;
      let pricePerPatient = v.pricePerPatient ?? null;
      if (v.centerName) {
        const found = await findCenterByName(v.centerName, userId);
        centerId = found?.id ?? null;
        if (!pricePerPatient && found?.default_price_per_patient) {
          pricePerPatient = Number(found.default_price_per_patient);
        }
      }
      const patientNames = v.patientNames ?? [];
      const patientsCount = patientNames.length;
      const grossAmount = (pricePerPatient ?? 0) * patientsCount;
      const irpf = grossAmount * 0.07;
      const travel = v.travelCost ?? 0;
      const material = v.materialCost ?? 0;
      const net = grossAmount - irpf - travel - material;

      const { data: visit, error } = await supabase
        .from("visits")
        .insert({
          user_id: userId,
          center_id: centerId,
          visit_date: v.date,
          start_time: v.startTime ?? null,
          end_time: v.endTime ?? null,
          status: "Programada",
          gross_amount: grossAmount,
          irpf_percentage: 7,
          travel_cost: travel,
          material_cost: material,
          estimated_net_amount: net,
          patients_count: patientsCount,
          general_notes: v.notes ?? null,
        })
        .select("id")
        .single();
      if (error || !visit) return { ok: false, message: error?.message ?? "Error al crear visita", invalidates: [] };

      if (patientNames.length > 0) {
        const rows = await Promise.all(
          patientNames.map(async (name) => {
            const found = await findPatientByName(name, userId);
            return {
              visit_id: visit.id,
              patient_id: found?.id ?? null,
              patient_name: name,
              price_charged: pricePerPatient ?? Number(found?.default_price ?? 0),
              payment_status: "Pendiente",
              attended: true,
            };
          }),
        );
        await supabase.from("visit_patients").insert(rows);
      }
      return { ok: true, message: "Visita creada", invalidates: ["visits"], redirect: "/agenda" };
    }

    case "material": {
      const m = d.material ?? {};
      if (!m.name?.trim()) return { ok: false, message: "Falta el nombre del material", invalidates: [] };
      const { error } = await supabase.from("materials").insert({
        user_id: userId,
        name: m.name.trim(),
        category: m.category || "Otros",
        current_stock: m.currentStock ?? 0,
        minimum_stock: m.minimumStock ?? 0,
        unit: m.unit || "unidad",
        estimated_unit_cost: m.unitCost ?? null,
      });
      if (error) return { ok: false, message: error.message, invalidates: [] };
      return { ok: true, message: "Material añadido", invalidates: ["materials"], redirect: "/material" };
    }

    case "tratamiento": {
      // Registrar como gasto sólo si hay importe — si no, no hay tabla destino
      const t = d.treatment ?? {};
      const text = [t.patientName, t.treatmentDone, t.notes].filter(Boolean).join(" — ");
      if (typeof t.amountCharged === "number" && t.amountCharged > 0) {
        const { error } = await supabase.from("expenses").insert({
          user_id: userId,
          expense_date: new Date().toISOString().slice(0, 10),
          category: "Tratamiento",
          amount: t.amountCharged,
          description: text,
        });
        if (error) return { ok: false, message: error.message, invalidates: [] };
        return { ok: true, message: "Tratamiento registrado como gasto", invalidates: ["expenses"], redirect: "/finanzas" };
      }
      return { ok: false, message: "Necesitas asociar el tratamiento a una visita.", invalidates: [] };
    }

    case "cobro": {
      const p = d.payment ?? {};
      if (!p.target?.trim()) return { ok: false, message: "Indica a quién marcar como cobrado", invalidates: [] };
      // 1) Buscar paciente
      const found = await findPatientByName(p.target, userId);
      const newStatus = p.newStatus === "facturada" ? "Incluido en factura" : "Cobrado";
      const newVisitStatus = p.newStatus === "facturada" ? "Facturada" : "Cobrada";

      if (found) {
        // Buscar última visita pendiente con ese paciente
        const { data: vps } = await supabase
          .from("visit_patients")
          .select("id, visit_id")
          .eq("patient_id", found.id)
          .eq("payment_status", "Pendiente")
          .limit(1);
        const vp = vps?.[0];
        if (vp) {
          await supabase.from("visit_patients").update({ payment_status: newStatus }).eq("id", vp.id);
          await supabase.from("visits").update({ status: newVisitStatus }).eq("id", vp.visit_id);
          return { ok: true, message: "Cobro registrado", invalidates: ["visits"], redirect: "/finanzas" };
        }
      }
      // 2) Si no, intentar centro
      const center = await findCenterByName(p.target, userId);
      if (center) {
        const { data: vs } = await supabase
          .from("visits")
          .select("id")
          .eq("center_id", center.id)
          .eq("status", "Pendiente de cobro")
          .order("visit_date", { ascending: false })
          .limit(1);
        const vid = vs?.[0]?.id;
        if (vid) {
          await supabase.from("visits").update({ status: newVisitStatus }).eq("id", vid);
          await supabase.from("visit_patients").update({ payment_status: newStatus }).eq("visit_id", vid);
          return { ok: true, message: "Cobro del centro registrado", invalidates: ["visits"], redirect: "/finanzas" };
        }
      }
      return { ok: false, message: "No he encontrado visita pendiente para ese nombre", invalidates: [] };
    }

    default:
      return { ok: false, message: "Intención no reconocida", invalidates: [] };
  }
}
