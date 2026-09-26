import { monthLabel } from "@/lib/calendar";
import { CANCELLED_STATUS, dayKey, monthKey } from "@/lib/agendaStats";
import { centerInfo, isHomeLikeCenter, type CenterInfo } from "@/lib/centers";
import { normalizeIncomeType, type IncomeType } from "@/lib/fiscalCalculations";
import {
  describeLines,
  isAggregateVisitPatient,
  isSettledPaymentStatus,
  parsePaymentBreakdown,
  roundCents,
  sameAmount,
  toAmount,
  visitTotal,
  type PaymentLine,
  type PaymentVisitPatient,
} from "@/lib/payments";

/**
 * Libro de movimientos: una fila por visita con **de dónde sale** cada euro.
 *
 * Todo el cálculo es puro (sin React ni Supabase) para poder probarlo y para
 * que la página sólo se ocupe de pintar. Los criterios se comparten a
 * propósito con el resto de la app:
 *
 * - El importe de una visita es `visitTotal()`, el mismo criterio que
 *   `Finance.tsx` y la hoja de cobro: la suma de `visit_patients` cuando hay
 *   detalle y el bruto agregado cuando no lo hay.
 * - Las visitas canceladas **se listan** (son parte de la exposición detallada)
 *   pero no suman en los totales de dinero, que es lo que el usuario lee como
 *   «lo que he ingresado».
 * - Los pacientes se cuentan con `attendedPatientsCount()` — ver
 *   `src/lib/payments.ts` — porque un registro rápido guarda una sola fila
 *   agregada («6 pacientes») en `visit_patients`.
 */

/** Fila de `visit_patients` tal como la necesita el libro de movimientos. */
export interface LedgerVisitPatient extends PaymentVisitPatient {
  patient_name?: string | null;
  payment_breakdown?: unknown;
}

/** Forma mínima de una visita (las filas de Supabase encajan). */
export interface LedgerVisit {
  id: string;
  visit_date: string;
  start_time?: string | null;
  status?: string | null;
  gross_amount?: number | string | null;
  patients_count?: number | string | null;
  center_id?: string | null;
  general_notes?: string | null;
  /** Quién paga: `Empresa`, `Particular` o `null` (sin clasificar todavía). */
  income_type?: string | null;
  invoice_number?: string | null;
  visit_patients?: LedgerVisitPatient[] | null;
}

export interface LedgerEntry {
  id: string;
  /** Fecha civil `yyyy-mm-dd`, nunca un `Date` (ver regla de husos del proyecto). */
  date: string;
  month: string;
  startTime: string | null;
  center: CenterInfo;
  status: string;
  patients: number;
  gross: number;
  /** Importe realmente cobrado de esa visita. */
  settled: number;
  /** Importe que no se va a cobrar («No cobra»): ni entra ni se reclama. */
  waived: number;
  /** Lo que todavía se debe (0 en canceladas). */
  pending: number;
  /** Precio por paciente, o `null` si no se puede deducir. */
  pricePerPatient: number | null;
  /** `true` si el precio es una media (bruto ÷ pacientes) y no un precio fijado. */
  priceIsAverage: boolean;
  /** Formas de pago con importe, ya agregadas por método. */
  payments: PaymentLine[];
  /** Forma de cobro habitual del centro: se usa cuando no hay desglose. */
  fallbackMethod: string | null;
  cancelled: boolean;
  /** Trabajo registrado sin importe todavía (pendiente de facturar por la gestora). */
  unbilled: boolean;
  note: string | null;
  /** Quién paga, para el filtro fiscal; `null` = sin clasificar. */
  incomeType: IncomeType | null;
  /** Número de factura apuntado, si lo hay. */
  invoiceNumber: string | null;
  /** Una línea por fila de `visit_patients`, para el desplegable de la fila. */
  patientLines: LedgerPatientLine[];
  /**
   * Importe marcado «No cobra` en las líneas que **sí** cuenta `settled`.
   *
   * Una visita en estado `Cobrada` da por cobrado todo su bruto (ver
   * `splitAmountsOf`), aunque alguna línea diga «No cobra». El total no se toca
   * —es el criterio con el que están hechas las cifras que el dueño ya da por
   * buenas— pero el desplegable enseña las dos cosas a la vez, y una
   * contradicción sin explicar destruye la confianza en la pantalla. Aquí se
   * deja el dato para poder avisar. 0 cuando no hay nada raro.
   */
  waivedNotDiscounted: number;
}

/** Una fila de `visit_patients` tal como se enseña en el desplegable. */
export interface LedgerPatientLine {
  /** Clave estable para React (el id de la fila, o su posición si no lo hay). */
  key: string;
  /** Nombre del paciente, o el texto de la fila agregada («6 pacientes»). */
  name: string;
  amount: number;
  /** Estado de cobro apuntado en esa línea, o `null` si no hay ninguno. */
  status: string | null;
  /**
   * `true` si es la fila agregada de un registro rápido y no un paciente real.
   * La pantalla lo necesita para no dar «6 pacientes» por nombre de persona.
   */
  aggregate: boolean;
  /** `false` si la visita quedó apuntada como no atendida. */
  attended: boolean;
  /** Formas de pago concretas de esa línea, si se partió el cobro. */
  payments: PaymentLine[];
}

/** Estados de visita que ya se dan por cobrados o facturados. */
const CLOSED_VISIT_STATUSES = new Set<string>(["Cobrada", "Facturada"]);

/** Paciente al que se decide no cobrarle: ni entra ni se reclama. */
const WAIVED_PAYMENT_STATUS = "No cobra";

const clean = (value?: string | null): string | null => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

/**
 * Suma las formas de pago de todas las filas de `visit_patients`, agrupando por
 * método y conservando el orden en que aparecen.
 */
export function collectPayments(vps: readonly LedgerVisitPatient[]): PaymentLine[] {
  const byMethod = new Map<string, number>();
  for (const vp of vps) {
    const lines = parsePaymentBreakdown(vp?.payment_breakdown);
    if (!lines) continue;
    for (const line of lines) {
      byMethod.set(line.method, roundCents((byMethod.get(line.method) ?? 0) + line.amount));
    }
  }
  return Array.from(byMethod, ([method, amount]) => ({ method, amount }));
}

/**
 * Precio por paciente.
 *
 * - Si hay filas reales de pacientes y todas cobran lo mismo, ése es el precio.
 * - Si cobran importes distintos, se da la media y se marca como tal.
 * - Si sólo existe la fila agregada de un registro rápido, se deduce
 *   dividiendo: se marca como media **sólo si la división no cuadra**, porque
 *   un registro rápido guarda precio × nº de pacientes y ahí el reparto es
 *   exacto por construcción.
 */
export function pricePerPatientOf(
  vps: readonly LedgerVisitPatient[],
  gross: number,
  patients: number,
): { price: number | null; isAverage: boolean } {
  const real = vps.filter((vp) => !isAggregateVisitPatient(vp));
  if (real.length > 0) {
    const prices = real.map((vp) => roundCents(toAmount(vp.price_charged)));
    const first = prices[0];
    if (first > 0 && prices.every((price) => price === first)) return { price: first, isAverage: false };
  }
  if (!(patients > 0) || !(gross > 0)) return { price: null, isAverage: false };

  const price = roundCents(gross / patients);
  const exact = real.length === 0 && sameAmount(roundCents(price * patients), gross);
  return { price, isAverage: !exact };
}

/**
 * Reparto del importe de una visita entre lo **cobrado** y lo **condonado**.
 *
 * `isSettledPaymentStatus()` mete «No cobra» en el mismo saco que «Cobrado»
 * porque allí la pregunta es «¿queda algo por reclamar?». Aquí la pregunta es
 * otra —«¿cuánto dinero ha entrado?»— y un paciente al que no se le cobra no
 * es dinero cobrado ni dinero pendiente: es dinero que no llega.
 */
export function splitAmountsOf(
  status: string,
  vps: readonly LedgerVisitPatient[],
  gross: number,
): { collected: number; waived: number } {
  if (CLOSED_VISIT_STATUSES.has(status)) return { collected: gross, waived: 0 };
  if (vps.length === 0) return { collected: 0, waived: 0 };

  let collected = 0;
  let waived = 0;
  for (const vp of vps) {
    const amount = Math.max(0, toAmount(vp.price_charged));
    if (vp.payment_status === WAIVED_PAYMENT_STATUS) waived += amount;
    else if (isSettledPaymentStatus(vp.payment_status)) collected += amount;
  }
  // Nunca por encima del importe de la visita: los datos importados pueden
  // tener un `price_charged` que no cuadre con el bruto.
  collected = Math.max(0, Math.min(roundCents(collected), gross));
  waived = Math.max(0, Math.min(roundCents(waived), roundCents(gross - collected)));
  return { collected, waived };
}

/**
 * Pacientes de la visita.
 *
 * A diferencia de `attendedPatientsCount()`, aquí **no** se redondea nunca
 * hacia arriba: las visitas de agosto importadas están a la espera de que la
 * gestora confirme cuántos pacientes fueron (`patients_count = 0`), y mostrar
 * «1 paciente» por la fila agregada sería inventarse un dato. Un 0 se pinta en
 * la lista como «pendiente», que es la verdad.
 */
export function patientsOf(visit: LedgerVisit, vps: readonly LedgerVisitPatient[]): number {
  const declared = Math.max(0, Math.round(toAmount(visit.patients_count)));
  if (declared > 0) return declared;
  return vps.filter((vp) => !isAggregateVisitPatient(vp) && vp.attended !== false).length;
}

/**
 * Filas de `visit_patients` para el desplegable, **en el orden en que llegan**
 * (es el orden de la visita, no uno alfabético inventado).
 *
 * La fila agregada de un registro rápido se incluye pero se marca como tal: es
 * la que lleva el estado de cobro y el desglose de un registro rápido, así que
 * esconderla dejaría el desplegable vacío justo en las visitas de residencia,
 * que son las que el dueño quería poder desplegar.
 */
export function patientLinesOf(vps: readonly LedgerVisitPatient[]): LedgerPatientLine[] {
  return vps.map((vp, index) => {
    const aggregate = isAggregateVisitPatient(vp);
    const name = clean(vp?.patient_name);
    return {
      key: clean(vp?.id) ?? `vp-${index}`,
      // Sin nombre guardado no se inventa ninguno: «Paciente 1» es más honesto
      // que repetir el nombre del centro o dejar la línea en blanco.
      name: name ?? (aggregate ? "Pacientes de la visita" : `Paciente ${index + 1}`),
      amount: roundCents(toAmount(vp?.price_charged)),
      status: clean(vp?.payment_status),
      aggregate,
      attended: vp?.attended !== false,
      payments: parsePaymentBreakdown(vp?.payment_breakdown) ?? [],
    };
  });
}

/**
 * Importe de las líneas «No cobra» que el reparto de la visita **no** ha sacado
 * de lo cobrado. Es sólo un aviso para la pantalla: no cambia ningún total.
 */
export function waivedNotDiscountedOf(
  vps: readonly LedgerVisitPatient[],
  waived: number,
  cancelled: boolean,
): number {
  if (cancelled) return 0;
  let inLines = 0;
  for (const vp of vps) {
    if (vp?.payment_status === WAIVED_PAYMENT_STATUS) inLines += Math.max(0, toAmount(vp.price_charged));
  }
  return Math.max(0, roundCents(roundCents(inLines) - roundCents(waived)));
}

/** Construye el libro de movimientos, del más reciente al más antiguo. */
export function buildLedgerEntries(
  visits: readonly LedgerVisit[],
  centers: ReadonlyMap<string, CenterInfo>,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const visit of visits) {
    if (!visit?.id || !visit.visit_date) continue;
    const vps = visit.visit_patients ?? [];
    const status = clean(visit.status) ?? "Programada";
    const cancelled = status === CANCELLED_STATUS;
    const gross = roundCents(visitTotal(visit));
    const patients = patientsOf(visit, vps);
    const { collected, waived } = cancelled
      ? { collected: 0, waived: 0 }
      : splitAmountsOf(status, vps, gross);
    const { price, isAverage } = pricePerPatientOf(vps, gross, patients);
    const date = dayKey(visit.visit_date);
    const center = centerInfo(centers, visit.center_id);

    entries.push({
      id: visit.id,
      date,
      month: monthKey(date),
      startTime: clean(visit.start_time)?.slice(0, 5) ?? null,
      center,
      status,
      patients,
      gross,
      settled: collected,
      waived,
      pending: cancelled ? 0 : roundCents(Math.max(0, gross - collected - waived)),
      pricePerPatient: price,
      priceIsAverage: isAverage,
      payments: collectPayments(vps),
      fallbackMethod: center.paymentMethod,
      cancelled,
      // Sólo el 0 es «trabajo sin importe todavía»: un importe negativo es una
      // devolución y tiene que verse como el dinero que sale, no como un
      // pendiente de facturar.
      unbilled: !cancelled && gross === 0,
      note: clean(visit.general_notes),
      incomeType: normalizeIncomeType(visit.income_type),
      invoiceNumber: clean(visit.invoice_number),
      patientLines: patientLinesOf(vps),
      waivedNotDiscounted: waivedNotDiscountedOf(vps, waived, cancelled),
    });
  }

  // Más reciente primero, con la hora como desempate y el id como último
  // criterio para que el orden sea estable entre renders.
  entries.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.startTime ?? "").localeCompare(a.startTime ?? "") ||
      a.id.localeCompare(b.id),
  );
  return entries;
}

export interface PaymentSource {
  text: string;
  /** `true` si es el reparto real guardado, `false` si es la forma habitual del centro. */
  exact: boolean;
}

/**
 * Cómo entró (o entrará) el dinero de esa visita. Se prefiere siempre el
 * desglose real guardado al cobrar; si no lo hay, se enseña la forma de cobro
 * habitual del centro, dejando claro que es una referencia y no un hecho.
 */
export function describePaymentSource(
  entry: LedgerEntry,
  formatAmount: (value: number) => string,
): PaymentSource | null {
  if (entry.payments.length > 0) return { text: describeLines(entry.payments, formatAmount), exact: true };
  if (entry.fallbackMethod) return { text: entry.fallbackMethod, exact: false };
  return null;
}

// ── Filtros ──────────────────────────────────────────────────────────────────

export const ALL_FILTER = "all";

/** Estados por los que el usuario filtra de verdad (no son estados de visita). */
export type LedgerStateFilter = "all" | "pending" | "unbilled" | "settled";

/** Quién paga: los dos valores reales, `none` para las que faltan por clasificar. */
export type LedgerPayerFilter = "all" | IncomeType | "none";

export interface LedgerFilters {
  /** `yyyy-mm` o `all`. */
  month: string;
  /** id de centro, `home` (sólo domicilios) o `all`. */
  centerId: string;
  state: LedgerStateFilter;
  payer: LedgerPayerFilter;
}

export const HOME_FILTER = "home";
export const UNCLASSIFIED_PAYER_FILTER = "none";

export const EMPTY_FILTERS: Readonly<LedgerFilters> = Object.freeze({
  month: ALL_FILTER,
  centerId: ALL_FILTER,
  state: ALL_FILTER,
  payer: ALL_FILTER,
});

const matchesState = (entry: LedgerEntry, state: LedgerStateFilter): boolean => {
  switch (state) {
    case "pending":
      return entry.pending > 0;
    case "unbilled":
      return entry.unbilled;
    case "settled":
      // Dinero que realmente entró: una visita condonada por completo no está
      // «cobrada», sólo está cerrada.
      return !entry.cancelled && entry.settled > 0 && entry.pending === 0;
    default:
      return true;
  }
};

const matchesPayer = (entry: LedgerEntry, payer: LedgerPayerFilter): boolean => {
  if (payer === ALL_FILTER) return true;
  if (payer === UNCLASSIFIED_PAYER_FILTER) return entry.incomeType === null;
  return entry.incomeType === payer;
};

export function filterLedger(entries: readonly LedgerEntry[], filters: LedgerFilters): LedgerEntry[] {
  return entries.filter((entry) => {
    if (filters.month !== ALL_FILTER && entry.month !== filters.month) return false;
    if (filters.centerId === HOME_FILTER) {
      // Mismo criterio que el seguimiento de domicilios de Finanzas
      // (`isHomeLikeCenter`): si aquí se mirase sólo el tipo, el enlace «ver
      // detalle» mostraría menos visitas que el recuento que lo enlaza.
      if (!isHomeLikeCenter(entry.center)) return false;
    } else if (filters.centerId !== ALL_FILTER && entry.center.id !== filters.centerId) {
      return false;
    }
    if (!matchesPayer(entry, filters.payer)) return false;
    return matchesState(entry, filters.state);
  });
}

// ── Totales y agrupaciones ───────────────────────────────────────────────────

export interface LedgerTotals {
  visits: number;
  patients: number;
  /**
   * Importe de las visitas **no canceladas**: una visita anulada no es dinero.
   * Se sigue listando en la tabla, con su etiqueta, para que se vea por qué no
   * suma.
   */
  gross: number;
  settled: number;
  waived: number;
  pending: number;
  /** Visitas trabajadas todavía sin importe. */
  unbilled: number;
  /** Visitas canceladas dentro del filtro (no suman dinero). */
  cancelled: number;
  centers: number;
}

export const EMPTY_TOTALS: Readonly<LedgerTotals> = Object.freeze({
  visits: 0,
  patients: 0,
  gross: 0,
  settled: 0,
  waived: 0,
  pending: 0,
  unbilled: 0,
  cancelled: 0,
  centers: 0,
});

export function ledgerTotals(entries: readonly LedgerEntry[]): LedgerTotals {
  const centers = new Set<string>();
  const totals = { ...EMPTY_TOTALS } as LedgerTotals;
  for (const entry of entries) {
    totals.visits += 1;
    if (entry.unbilled) totals.unbilled += 1;
    centers.add(entry.center.id ?? "");
    if (entry.cancelled) {
      totals.cancelled += 1;
      continue;
    }
    totals.patients += entry.patients;
    totals.gross += entry.gross;
    totals.settled += entry.settled;
    totals.waived += entry.waived;
    totals.pending += entry.pending;
  }
  totals.gross = roundCents(totals.gross);
  totals.settled = roundCents(totals.settled);
  totals.waived = roundCents(totals.waived);
  totals.pending = roundCents(totals.pending);
  totals.centers = centers.size;
  return totals;
}

export interface LedgerMonthGroup {
  month: string;
  label: string;
  entries: LedgerEntry[];
  totals: LedgerTotals;
}

/** Agrupa por mes conservando el orden (más reciente primero). */
export function groupByMonth(entries: readonly LedgerEntry[]): LedgerMonthGroup[] {
  const groups: LedgerMonthGroup[] = [];
  let current: LedgerMonthGroup | null = null;
  for (const entry of entries) {
    if (!current || current.month !== entry.month) {
      current = { month: entry.month, label: monthLabel(entry.month), entries: [], totals: { ...EMPTY_TOTALS } };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  for (const group of groups) group.totals = ledgerTotals(group.entries);
  return groups;
}

export interface MonthOption {
  value: string;
  label: string;
}

/** Meses con movimientos, del más reciente al más antiguo. */
export function monthOptions(entries: readonly LedgerEntry[]): MonthOption[] {
  const months = new Set<string>();
  for (const entry of entries) months.add(entry.month);
  return Array.from(months)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: monthLabel(value) }));
}

export interface CenterOption {
  value: string;
  label: string;
  isHome: boolean;
}

/** Centros con movimientos, ordenados por nombre (residencias y domicilios juntos). */
export function centerOptions(entries: readonly LedgerEntry[]): CenterOption[] {
  const byId = new Map<string, CenterOption>();
  for (const entry of entries) {
    const value = entry.center.id ?? "";
    if (!value || byId.has(value)) continue;
    byId.set(value, { value, label: entry.center.name, isHome: entry.center.isHome });
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
}
