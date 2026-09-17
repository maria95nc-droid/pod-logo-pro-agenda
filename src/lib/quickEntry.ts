import { supabase } from "@/integrations/supabase/client";
import { roundCents, toAmount } from "@/lib/payments";
import { toIsoDate } from "@/lib/format";
import type { VisitStatus } from "@/types";

/**
 * Altas «sobre la marcha»: lo que David necesita apuntar entre centro y centro,
 * con el mínimo de campos posible.
 *
 * - Un **domicilio** es un `center` de tipo `Domicilio` + el `patient` que vive
 *   en él. No hay tabla nueva: la dirección ya cabe en `centers`.
 * - Una **residencia/centro** sólo necesita nombre y precio por paciente.
 * - Una **visita rápida** no marca pacientes uno a uno: precio × nº de
 *   pacientes, y una única fila agregada en `visit_patients` para que el cobro
 *   (y su desglose por forma de pago) tenga dónde guardarse.
 */

export interface QuickResult {
  ok: boolean;
  error?: string;
}

/** Límite defensivo: un dedo torpe en el móvil no debe crear una visita de 9999 pacientes. */
export const MAX_PATIENTS_PER_VISIT = 99;

export const clampPatientsCount = (value: number): number => {
  const n = Math.round(toAmount(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PATIENTS_PER_VISIT);
};

/** «Calle, 12» a partir de calle y número; sin número, sólo la calle. */
export const buildStreetAddress = (street: string, streetNumber: string): string | null => {
  const s = street.trim();
  const n = streetNumber.trim();
  if (!s && !n) return null;
  if (!n) return s;
  if (!s) return n;
  return `${s}, ${n}`;
};

export const pluralPatients = (count: number): string => `${count} paciente${count === 1 ? "" : "s"}`;

const AGGREGATE_LABEL = /^\d+\s+pacientes?$/i;

/**
 * ¿Es la fila agregada de un registro rápido («6 pacientes») y no una persona?
 * Sirve para no pintar sus iniciales como si fuese un nombre propio.
 */
export const isQuickAggregateRow = (row: { patient_id?: string | null; patient_name?: string | null }): boolean =>
  !row.patient_id && AGGREGATE_LABEL.test((row.patient_name ?? "").trim());

export interface NewHomeInput {
  userId: string;
  /** Nombre y apellidos del paciente: da nombre también al domicilio. */
  fullName: string;
  street: string;
  streetNumber: string;
  city: string;
}

export interface NewHomeResult extends QuickResult {
  centerId?: string;
  patientId?: string;
}

/** Crea el domicilio (centro) y el paciente que vive en él. */
export async function createHome(input: NewHomeInput): Promise<NewHomeResult> {
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Falta el nombre y apellidos" };

  const city = input.city.trim();
  const { data: center, error } = await supabase
    .from("centers")
    .insert({
      user_id: input.userId,
      name: fullName,
      type: "Domicilio",
      address: buildStreetAddress(input.street, input.streetNumber),
      city: city || null,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !center) return { ok: false, error: error?.message ?? "No se pudo crear el domicilio" };

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .insert({
      user_id: input.userId,
      center_id: center.id,
      full_name: fullName,
      is_active: true,
    })
    .select("id")
    .single();
  if (patientError) return { ok: false, error: patientError.message, centerId: center.id };

  return { ok: true, centerId: center.id, patientId: patient?.id };
}

export interface NewCenterInput {
  userId: string;
  name: string;
  /** Precio por paciente: se autorrellena después en la visita rápida. */
  pricePerPatient: number | null;
}

export interface NewCenterResult extends QuickResult {
  centerId?: string;
}

/** Crea una residencia/centro con lo imprescindible: nombre y precio por paciente. */
export async function createCenter(input: NewCenterInput): Promise<NewCenterResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Falta el nombre del centro" };

  const price = input.pricePerPatient;
  const { data, error } = await supabase
    .from("centers")
    .insert({
      user_id: input.userId,
      name,
      type: "Residencia",
      default_price_per_patient: price != null && price > 0 ? roundCents(price) : null,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear el centro" };
  return { ok: true, centerId: data.id };
}

export interface QuickVisitInput {
  userId: string;
  centerId: string;
  date: string; // yyyy-mm-dd
  startTime?: string | null;
  endTime?: string | null;
  pricePerPatient: number;
  patientsCount: number;
  irpfPercentage: number;
  travelCost: number;
}

export interface QuickVisitResult extends QuickResult {
  visitId?: string;
  status?: VisitStatus;
}

/**
 * Estado de una visita registrada en modo rápido: si es de hoy o de un día
 * pasado ya está hecha y, salvo que no haya importe, queda pendiente de cobro.
 */
export function quickVisitStatus(date: string, gross: number, today: string = toIsoDate()): VisitStatus {
  if (date > today) return "Programada";
  return gross > 0 ? "Pendiente de cobro" : "Realizada";
}

/** Crea la visita y su fila agregada de pacientes (sin selección uno a uno). */
export async function createQuickVisit(input: QuickVisitInput): Promise<QuickVisitResult> {
  if (!input.centerId) return { ok: false, error: "Selecciona un centro" };
  if (!input.date) return { ok: false, error: "Falta la fecha" };

  const patientsCount = clampPatientsCount(input.patientsCount);
  const price = Math.max(0, roundCents(toAmount(input.pricePerPatient)));
  const gross = roundCents(price * patientsCount);
  const irpfPercentage = Math.max(0, toAmount(input.irpfPercentage));
  const travelCost = Math.max(0, roundCents(toAmount(input.travelCost)));
  const net = roundCents(gross - (gross * irpfPercentage) / 100 - travelCost);
  const status = quickVisitStatus(input.date, gross);

  const { data: visit, error } = await supabase
    .from("visits")
    .insert({
      user_id: input.userId,
      center_id: input.centerId,
      visit_date: input.date,
      start_time: input.startTime || null,
      end_time: input.endTime || null,
      status,
      gross_amount: gross,
      irpf_percentage: irpfPercentage,
      travel_cost: travelCost,
      estimated_net_amount: net,
      patients_count: patientsCount,
    })
    .select("id")
    .single();
  if (error || !visit) return { ok: false, error: error?.message ?? "No se pudo crear la visita" };

  // Fila agregada: representa a todos los pacientes de la visita. Es la que
  // recibe el estado de cobro y el desglose por forma de pago.
  const { error: vpError } = await supabase.from("visit_patients").insert({
    visit_id: visit.id,
    patient_id: null,
    patient_name: pluralPatients(patientsCount),
    price_charged: gross,
    payment_status: "Pendiente",
    attended: status !== "Programada",
  });
  if (vpError) return { ok: false, error: vpError.message, visitId: visit.id, status };

  return { ok: true, visitId: visit.id, status };
}
