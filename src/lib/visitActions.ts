import { supabase } from "@/integrations/supabase/client";
import {
  attendedPatientsCount,
  distributeLines,
  normalizeLines,
  statusAfterDone,
  toAmount,
  visitTotal,
  type PaymentLine,
  type PaymentVisit,
} from "@/lib/payments";
import { pluralPatients } from "@/lib/quickEntry";
import type { VisitStatus } from "@/types";

/**
 * Escrituras compartidas sobre `visits` / `visit_patients`.
 *
 * Viven aquí (y no en cada pantalla) porque la misma acción se dispara desde
 * Hoy, el detalle de la visita y Finanzas, y antes cada sitio hacía una cosa
 * distinta: unos guardaban `paid_at` y otros no.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Fila mínima que necesitamos para poder actualizar el cobro. */
interface VisitPatientRow {
  id: string;
  price_charged: number | string | null;
}

/**
 * Marca la visita como realizada. Si queda importe por cobrar la deja en
 * «Pendiente de cobro», que es lo que alimenta el aviso de Hoy: realizar una
 * visita ya no da el cobro por hecho.
 */
export async function markVisitDone(visit: PaymentVisit & { id: string }): Promise<ActionResult & { status?: VisitStatus }> {
  const status = statusAfterDone(visit);
  const { error } = await supabase.from("visits").update({ status }).eq("id", visit.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, status };
}

/**
 * Confirma el cobro de una visita y guarda el desglose por forma de pago.
 *
 * El desglose se reparte entre los pacientes de la visita en proporción a lo
 * que se le cobra a cada uno, de modo que la suma de cada paciente cuadre con
 * su `price_charged`. En los registros rápidos sólo hay una fila agregada, así
 * que el desglose se guarda entero en ella.
 *
 * Sólo se guarda `payment_breakdown` cuando hay más de una forma de pago: con
 * una sola (el caso habitual) la información ya está en el centro y guardarla
 * sólo ensuciaría los datos.
 */
export async function registerVisitPayment(
  visit: PaymentVisit & { id: string },
  lines: readonly PaymentLine[],
): Promise<ActionResult> {
  const clean = normalizeLines(lines);
  const shouldStoreBreakdown = clean.length > 1;
  const paidAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("visit_patients")
    .select("id, price_charged")
    .eq("visit_id", visit.id);
  if (error) return { ok: false, error: error.message };

  const rows: VisitPatientRow[] = data ?? [];

  if (rows.length > 0) {
    const perPatient = shouldStoreBreakdown
      ? distributeLines(clean, rows.map((row) => toAmount(row.price_charged)))
      : [];

    const updates = rows.map((row, index) =>
      supabase
        .from("visit_patients")
        .update({
          payment_status: "Cobrado",
          paid_at: paidAt,
          payment_breakdown: shouldStoreBreakdown ? perPatient[index] ?? [] : null,
        })
        .eq("id", row.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) return { ok: false, error: failed.error.message };
  } else if (shouldStoreBreakdown) {
    // Visitas antiguas sin detalle por paciente: se crea la fila agregada para
    // que el desglose por forma de pago tenga dónde guardarse. El importe es el
    // mismo bruto de la visita, así que los totales no cambian.
    const { error: insertError } = await supabase.from("visit_patients").insert({
      visit_id: visit.id,
      patient_id: null,
      patient_name: pluralPatients(Math.max(1, attendedPatientsCount(visit))),
      price_charged: visitTotal(visit),
      payment_status: "Cobrado",
      paid_at: paidAt,
      payment_breakdown: clean,
      attended: true,
    });
    if (insertError) return { ok: false, error: insertError.message };
  }

  const { error: visitError } = await supabase.from("visits").update({ status: "Cobrada" }).eq("id", visit.id);
  if (visitError) return { ok: false, error: visitError.message };
  return { ok: true };
}
