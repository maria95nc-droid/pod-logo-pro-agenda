import type { PaymentStatus, VisitStatus } from "@/types";

/**
 * Lógica pura de cobros. Sin dependencias de Supabase ni de React para que sea
 * testeable y compartible entre Hoy, Finanzas y el detalle de visita.
 *
 * Reglas del negocio (David, podólogo autónomo):
 * - Marcar una visita como realizada **no** implica haberla cobrado: muchos
 *   centros pagan días después. Por eso la visita pasa a «Pendiente de cobro»
 *   y sigue apareciendo en los avisos hasta que se confirma el cobro.
 * - Un mismo cobro puede repartirse entre varias formas de pago (efectivo +
 *   Bizum, por ejemplo). Ese reparto se guarda en
 *   `visit_patients.payment_breakdown`.
 */

/** Una línea del desglose: forma de pago + importe. */
export interface PaymentLine {
  method: string;
  amount: number;
}

/** Forma mínima de una fila de `visit_patients` para estos cálculos. */
export interface PaymentVisitPatient {
  id?: string;
  patient_id?: string | null;
  price_charged?: number | string | null;
  payment_status?: string | null;
  attended?: boolean | null;
}

/** Forma mínima de una visita para estos cálculos (las filas de Supabase encajan). */
export interface PaymentVisit {
  status?: string | null;
  gross_amount?: number | string | null;
  patients_count?: number | string | null;
  visit_patients?: PaymentVisitPatient[] | null;
}

/** Estados de cobro que ya no reclaman dinero. */
export const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "Cobrado",
  "Incluido en factura",
  "No cobra",
];

const SETTLED = new Set<string>(SETTLED_PAYMENT_STATUSES);

/** Estados de visita que ya se consideran cobrados/facturados. */
const CLOSED_VISIT_STATUSES = new Set<string>(["Cobrada", "Facturada"]);

/** `numeric` de Postgres puede llegar como string. */
export const toAmount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Redondeo a céntimos, evitando el clásico 0.1 + 0.2. */
export const roundCents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Dos importes se consideran iguales si difieren menos de medio céntimo. */
export const sameAmount = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

export const isSettledPaymentStatus = (status?: string | null): boolean => !!status && SETTLED.has(status);

const visitPatientsOf = (visit: PaymentVisit): PaymentVisitPatient[] => visit.visit_patients ?? [];

/**
 * Importe total de la visita: la suma de lo cobrado a cada paciente cuando hay
 * detalle, y el bruto agregado cuando no lo hay (registro rápido antiguo).
 */
export function visitTotal(visit: PaymentVisit): number {
  const vps = visitPatientsOf(visit);
  if (vps.length === 0) return roundCents(toAmount(visit.gross_amount));
  return roundCents(vps.reduce((sum, vp) => sum + toAmount(vp.price_charged), 0));
}

/**
 * Fila agregada de un registro rápido: una sola línea, sin paciente concreto,
 * que representa a todos los pacientes atendidos en la visita.
 */
export function isAggregateVisitPatient(vp: PaymentVisitPatient | undefined): boolean {
  return !!vp && !vp.patient_id;
}

/**
 * Pacientes realmente atendidos en la visita. En los registros rápidos el
 * número vive en `patients_count` (hay una sola fila agregada en
 * `visit_patients`), así que contar filas se quedaría corto.
 */
export function attendedPatientsCount(visit: PaymentVisit): number {
  const vps = visitPatientsOf(visit);
  const declared = Math.max(0, Math.round(toAmount(visit.patients_count)));
  if (vps.length === 0) return declared;
  const attended = vps.filter((vp) => vp.attended !== false).length;
  if (vps.length === 1 && isAggregateVisitPatient(vps[0])) return Math.max(attended, declared);
  return attended;
}

/** `true` si no queda nada por cobrar en la visita. */
export function isVisitSettled(visit: PaymentVisit): boolean {
  if (CLOSED_VISIT_STATUSES.has(visit.status ?? "")) return true;
  const vps = visitPatientsOf(visit);
  if (vps.length > 0 && vps.every((vp) => isSettledPaymentStatus(vp.payment_status))) return true;
  return visitTotal(visit) <= 0;
}

/**
 * Estado en el que queda una visita al pulsar «Realizada».
 *
 * Antes se marcaba siempre como «Realizada», lo que equivalía a dar el cobro
 * por hecho: el aviso de «pendiente de cobro» nunca llegaba a saltar. Ahora
 * sólo se cierra si realmente no queda dinero por cobrar.
 */
export function statusAfterDone(visit: PaymentVisit): VisitStatus {
  if (CLOSED_VISIT_STATUSES.has(visit.status ?? "")) return visit.status as VisitStatus;
  const vps = visitPatientsOf(visit);
  if (vps.length > 0 && vps.every((vp) => isSettledPaymentStatus(vp.payment_status))) return "Cobrada";
  if (visitTotal(visit) <= 0) return "Realizada";
  return "Pendiente de cobro";
}

/** Suma de las líneas de un desglose, redondeada a céntimos. */
export const linesTotal = (lines: readonly PaymentLine[]): number =>
  roundCents(lines.reduce((sum, line) => sum + toAmount(line.amount), 0));

/** Descarta líneas vacías o sin importe y redondea a céntimos. */
export const normalizeLines = (lines: readonly PaymentLine[]): PaymentLine[] =>
  lines
    .map((line) => ({ method: line.method.trim(), amount: roundCents(toAmount(line.amount)) }))
    .filter((line) => line.method !== "" && line.amount > 0);

/**
 * Reparte el desglose entre los pacientes de la visita, en proporción a lo que
 * se le cobra a cada uno, de forma que la suma del desglose de cada paciente
 * cuadre exactamente con su `price_charged`.
 *
 * El último paciente absorbe el redondeo, así que la suma total nunca se
 * desvía de lo introducido por el usuario.
 */
export function distributeLines(
  lines: readonly PaymentLine[],
  patientAmounts: readonly number[],
): PaymentLine[][] {
  const clean = normalizeLines(lines);
  const count = patientAmounts.length;
  if (count === 0) return [];
  if (clean.length === 0) return patientAmounts.map(() => []);
  if (count === 1) return [clean.map((line) => ({ ...line }))];

  const amounts = patientAmounts.map((amount) => Math.max(0, toAmount(amount)));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const result: PaymentLine[][] = amounts.map(() => []);

  for (const line of clean) {
    let assigned = 0;
    for (let i = 0; i < count; i += 1) {
      const isLast = i === count - 1;
      // Sin importes de referencia (todo a 0) el reparto es a partes iguales.
      const share = total > 0 ? line.amount * (amounts[i] / total) : line.amount / count;
      const value = isLast ? roundCents(line.amount - assigned) : roundCents(share);
      assigned = roundCents(assigned + value);
      if (value > 0) result[i].push({ method: line.method, amount: value });
    }
  }

  return result;
}

/**
 * Lee un `payment_breakdown` de la base de datos con desconfianza: es `jsonb`
 * libre y puede venir de la función `log-activity` o de datos antiguos.
 */
export function parsePaymentBreakdown(value: unknown): PaymentLine[] | null {
  if (!Array.isArray(value)) return null;
  const lines: PaymentLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const method = (entry as { method?: unknown }).method;
    const amount = (entry as { amount?: unknown }).amount;
    if (typeof method !== "string" || method.trim() === "") continue;
    const parsed = roundCents(toAmount(amount));
    if (!(parsed > 0)) continue;
    lines.push({ method: method.trim(), amount: parsed });
  }
  return lines.length > 0 ? lines : null;
}

/** Resumen legible de un desglose: «Efectivo 20 € · Bizum 15 €». */
export const describeLines = (lines: readonly PaymentLine[], formatAmount: (n: number) => string): string =>
  lines.map((line) => `${line.method} ${formatAmount(line.amount)}`).join(" · ");
