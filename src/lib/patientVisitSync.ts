import { supabase } from "@/integrations/supabase/client";

export interface PatientVisitSyncInput {
  userId: string;
  patientId: string;
  patientName: string;
  centerId: string | null;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM
  price: number;
}

/**
 * Crea o actualiza una visita programada para el paciente en la fecha/hora/centro indicados.
 * Si ya existe una visita en la misma fecha/hora/centro, sólo añade el paciente a visit_patients.
 * Devuelve el visit_id resultante o null si no se pudo sincronizar.
 */
export async function syncPatientNextVisit(input: PatientVisitSyncInput): Promise<string | null> {
  const { userId, patientId, patientName, centerId, date, time, price } = input;
  if (!date || !centerId) return null;

  // Buscar visita existente en misma fecha/hora/centro
  let query = supabase
    .from("visits")
    .select("id, gross_amount, patients_count")
    .eq("user_id", userId)
    .eq("visit_date", date)
    .eq("center_id", centerId);
  if (time) query = query.eq("start_time", time);
  const { data: existing } = await query.maybeSingle();

  let visitId: string;
  if (existing) {
    visitId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("visits")
      .insert({
        user_id: userId,
        center_id: centerId,
        visit_date: date,
        start_time: time || null,
        status: "Programada",
        patients_count: 0,
        gross_amount: 0,
      })
      .select("id")
      .single();
    if (error || !created) return null;
    visitId = created.id;
  }

  // ¿Ya existe relación visit_patients para este paciente y visita?
  const { data: vpExisting } = await supabase
    .from("visit_patients")
    .select("id")
    .eq("visit_id", visitId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (vpExisting) {
    await supabase
      .from("visit_patients")
      .update({ price_charged: price, patient_name: patientName })
      .eq("id", vpExisting.id);
  } else {
    await supabase.from("visit_patients").insert({
      visit_id: visitId,
      patient_id: patientId,
      patient_name: patientName,
      price_charged: price,
      payment_status: "Pendiente",
      attended: false,
    });
  }

  // Recalcular totales de la visita en función de todos los visit_patients
  const { data: vps } = await supabase
    .from("visit_patients")
    .select("price_charged")
    .eq("visit_id", visitId);
  const total = (vps ?? []).reduce((s, x: any) => s + Number(x.price_charged || 0), 0);
  await supabase
    .from("visits")
    .update({ patients_count: vps?.length ?? 0, gross_amount: total })
    .eq("id", visitId);

  return visitId;
}

/**
 * Elimina la relación visit_patients del paciente para fechas futuras programadas.
 * Si la visita queda sin pacientes, también la elimina.
 */
export async function removePatientFromFutureVisits(userId: string, patientId: string) {
  const { data: vps } = await supabase
    .from("visit_patients")
    .select("id, visit_id, visits!inner(id, status, user_id)")
    .eq("patient_id", patientId);
  if (!vps) return;
  for (const vp of vps as any[]) {
    if (vp.visits?.user_id !== userId) continue;
    if (vp.visits?.status !== "Programada") continue;
    await supabase.from("visit_patients").delete().eq("id", vp.id);
    const { data: rest } = await supabase.from("visit_patients").select("id, price_charged").eq("visit_id", vp.visit_id);
    if (!rest || rest.length === 0) {
      await supabase.from("visits").delete().eq("id", vp.visit_id);
    } else {
      const total = rest.reduce((s, x: any) => s + Number(x.price_charged || 0), 0);
      await supabase.from("visits").update({ patients_count: rest.length, gross_amount: total }).eq("id", vp.visit_id);
    }
  }
}
