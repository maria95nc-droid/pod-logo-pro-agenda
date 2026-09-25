import { dayKey } from "@/lib/agendaStats";
import type { CenterInfo } from "@/lib/centers";
import { isHomeLikeCenter } from "@/lib/centers";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import { roundCents, toAmount, visitTotal, type PaymentVisitPatient } from "@/lib/payments";
import { isCompletedVisit } from "@/lib/streak";

/**
 * Cálculos fiscales del dinero **declarado**.
 *
 * Todo lo de aquí es puro (sin React ni Supabase) porque es la parte de la app
 * que no puede fallar: de estas cifras salen el IRPF que David aparta y la
 * decisión de presentar o no el Modelo 130.
 *
 * Reglas del negocio (David, podólogo autónomo, exento de IVA):
 *
 * - Cada visita tiene un **pagador**: `Empresa` (la residencia/entidad paga con
 *   su CIF y le retiene IRPF) o `Particular` (el paciente o su familia paga
 *   directamente, sin retención). `income_type = null` significa **sin
 *   clasificar**: no se asume nada, se cuenta aparte y se pide clasificarla.
 * - Sólo entra el dinero declarado. No existe aquí ningún concepto de caja ni
 *   de dinero no declarado: queda deliberadamente fuera del alcance.
 * - El importe de una visita es `visitTotal()`, el mismo criterio que Finanzas y
 *   el libro de movimientos (suma de `visit_patients` si hay detalle, bruto
 *   agregado si no), para que las pantallas no se contradigan.
 * - Sólo cuentan las visitas **ya hechas** (`isCompletedVisit`: Realizada,
 *   Pendiente de cobro, Cobrada o Facturada). Una visita `Programada` todavía no
 *   ha generado ingreso y una `Cancelada` no lo va a generar.
 */

// ── Dominio ──────────────────────────────────────────────────────────────────

export type IncomeType = "Empresa" | "Particular";

export const INCOME_TYPES: readonly IncomeType[] = ["Empresa", "Particular"];

/** Cómo se le pregunta a David, en su idioma, no en jerga contable. */
export const INCOME_TYPE_QUESTION = "¿Quién paga esta visita?";

export const INCOME_TYPE_LABEL: Readonly<Record<IncomeType, string>> = Object.freeze({
  Empresa: "La entidad",
  Particular: "El paciente",
});

export const INCOME_TYPE_HINT: Readonly<Record<IncomeType, string>> = Object.freeze({
  Empresa: "Factura a la residencia o entidad · te retienen IRPF",
  Particular: "Paga el paciente o su familia · sin retención",
});

/** Retención por defecto de una factura a entidad. Editable visita a visita. */
export const DEFAULT_EMPRESA_IRPF = 15;

/** Estimación conservadora: se guarda el 20 % de todo el bruto declarado. */
export const CONSERVATIVE_IRPF_RATE = 20;

/** Umbrales del Modelo 130, en puntos porcentuales de ingresos sin retención. */
export const MODELO_130_WATCH_PERCENT = 25;
export const MODELO_130_LIMIT_PERCENT = 30;

/** Forma mínima de una visita para estos cálculos (las filas de Supabase encajan). */
export interface FiscalVisit {
  id: string;
  visit_date: string;
  status?: string | null;
  gross_amount?: number | string | null;
  patients_count?: number | string | null;
  center_id?: string | null;
  income_type?: string | null;
  invoice_number?: string | null;
  irpf_percentage?: number | string | null;
  visit_patients?: FiscalVisitPatient[] | null;
}

export interface FiscalVisitPatient extends PaymentVisitPatient {
  payment_breakdown?: unknown;
}

/** `Empresa` / `Particular`; cualquier otra cosa (incluido `null`) es «sin clasificar». */
export function normalizeIncomeType(value: unknown): IncomeType | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return (INCOME_TYPES as readonly string[]).includes(text) ? (text as IncomeType) : null;
}

/**
 * Retención aplicada a una visita a entidad.
 *
 * Se respeta el porcentaje guardado en la visita cuando es un número válido
 * (David puede cambiarlo caso a caso: hay facturas con retención distinta), y
 * sólo se cae al 15 % por defecto si la visita no tiene un valor usable.
 */
export function empresaIrpfPercentage(visit: FiscalVisit): number {
  const raw = visit?.irpf_percentage;
  if (raw === null || raw === undefined || raw === "") return DEFAULT_EMPRESA_IRPF;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) return DEFAULT_EMPRESA_IRPF;
  return value;
}

/** Importe bruto de la visita, con el criterio único de la app. */
export const fiscalGross = (visit: FiscalVisit): number => roundCents(visitTotal(visit));

/**
 * Retención de una factura, redondeada a céntimos **al alza en el medio
 * céntimo**, que es como se redondea en una factura española.
 *
 * No se usa `roundCents()`: ese helper redondea sobre el `double` ya inexacto y
 * 14,50 € × 15 % (2,175 € en decimal) daría 2,17 € en vez de 2,18 €, porque el
 * `double` más cercano a 2,175 es algo menor. Aquí se pasa primero el bruto a
 * céntimos enteros, de modo que `1450 × 15 / 100 = 217,5` es exacto y
 * `Math.round` puede decidir bien.
 */
export function retentionFor(gross: number, percentage: number): number {
  const grossCents = Math.round(roundCents(gross) * 100);
  if (!Number.isFinite(grossCents) || !Number.isFinite(percentage)) return 0;
  return Math.round((grossCents * percentage) / 100) / 100;
}

/**
 * ¿Cuenta esta visita como ingreso del periodo?
 *
 * Sólo las ya hechas. `isCompletedVisit` deja fuera `Programada` (todavía no ha
 * pasado) y `Cancelada` (no va a pasar).
 */
export const isDeclarableVisit = (visit: FiscalVisit): boolean =>
  !!visit?.visit_date && isCompletedVisit(visit);

// ── Rangos de fechas ─────────────────────────────────────────────────────────

/** Rango de fechas civiles, **ambos extremos incluidos**. */
export interface DateRange {
  fromIso: string;
  toIso: string;
}

export type Quarter = 1 | 2 | 3 | 4;

/** Trimestre natural de un mes 1-12. */
export const quarterOfMonth = (month: number): Quarter =>
  Math.min(4, Math.max(1, Math.ceil(month / 3))) as Quarter;

/** Trimestre natural de una fecha `yyyy-mm-dd`. */
export const quarterOfIso = (iso: string): Quarter => quarterOfMonth(Number(iso.slice(5, 7)));

/** Último día del mes (1-12), sin depender de `Date` en UTC. */
export const lastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

const pad = (value: number): string => `${value}`.padStart(2, "0");

/** Rango del mes a partir de una clave `yyyy-mm`. */
export function monthRange(monthKey: string): DateRange {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return { fromIso: `${monthKey}-01`, toIso: `${monthKey}-31` };
  }
  return { fromIso: `${year}-${pad(month)}-01`, toIso: `${year}-${pad(month)}-${lastDayOfMonth(year, month)}` };
}

/** Rango del trimestre natural (T1 ene-mar, T2 abr-jun, T3 jul-sep, T4 oct-dic). */
export function quarterRange(year: number, quarter: Quarter): DateRange {
  const firstMonth = (quarter - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  return {
    fromIso: `${year}-${pad(firstMonth)}-01`,
    toIso: `${year}-${pad(lastMonth)}-${lastDayOfMonth(year, lastMonth)}`,
  };
}

/**
 * Rango **acumulado** del año hasta el final del trimestre indicado: del 1 de
 * enero al último día del trimestre. Es el que manda para el Modelo 130.
 */
export function yearToQuarterRange(year: number, quarter: Quarter): DateRange {
  return { fromIso: `${year}-01-01`, toIso: quarterRange(year, quarter).toIso };
}

export interface QuarterRef {
  year: number;
  quarter: Quarter;
}

/** Trimestre en el que cae `today`. */
export function currentQuarter(today: Date = new Date()): QuarterRef {
  const iso = toIsoDate(today);
  return { year: Number(iso.slice(0, 4)), quarter: quarterOfIso(iso) };
}

/** Trimestre anterior (T1 → T4 del año pasado). */
export function previousQuarter(ref: QuarterRef): QuarterRef {
  return ref.quarter === 1
    ? { year: ref.year - 1, quarter: 4 }
    : { year: ref.year, quarter: (ref.quarter - 1) as Quarter };
}

export const quarterLabel = (ref: QuarterRef): string => `T${ref.quarter} ${ref.year}`;

/**
 * Plazo de presentación del Modelo 130 de un trimestre ya cerrado:
 * T1 → 1-20 de abril, T2 → 1-20 de julio, T3 → 1-20 de octubre y
 * T4 → 1-30 de enero del año siguiente.
 */
export function filingWindow(ref: QuarterRef): DateRange & { deadlineLabel: string } {
  if (ref.quarter === 4) {
    return {
      fromIso: `${ref.year + 1}-01-01`,
      toIso: `${ref.year + 1}-01-30`,
      deadlineLabel: `30 de enero de ${ref.year + 1}`,
    };
  }
  const month = ref.quarter * 3 + 1; // T1 → abril, T2 → julio, T3 → octubre
  const monthName = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][month - 1];
  return {
    fromIso: `${ref.year}-${pad(month)}-01`,
    toIso: `${ref.year}-${pad(month)}-20`,
    deadlineLabel: `20 de ${monthName}`,
  };
}

/** `true` si la fecha civil cae dentro del rango (extremos incluidos). */
export const inRange = (iso: string, range: DateRange): boolean =>
  iso >= range.fromIso && iso <= range.toIso;

/** Visitas declarables del rango, ya normalizadas a fecha civil. */
export function visitsInRange<T extends FiscalVisit>(visits: readonly T[], range?: DateRange): T[] {
  const result: T[] = [];
  for (const visit of visits) {
    if (!isDeclarableVisit(visit)) continue;
    if (range && !inRange(dayKey(visit.visit_date), range)) continue;
    result.push(visit);
  }
  return result;
}

/** Fecha de la primera visita ya hecha, `yyyy-mm-dd`, o `null` si no hay ninguna. */
export function firstDeclaredVisitIso(visits: readonly FiscalVisit[]): string | null {
  let first: string | null = null;
  for (const visit of visits) {
    if (!isDeclarableVisit(visit)) continue;
    const iso = dayKey(visit.visit_date);
    if (first === null || iso < first) first = iso;
  }
  return first;
}

// ── Los tres cálculos del mes ────────────────────────────────────────────────

export interface FiscalTotals {
  /** Visitas declaradas (ya clasificadas) que entran en el cálculo. */
  visits: number;
  grossEmpresa: number;
  grossParticular: number;
  /** Bruto declarado total: Empresa + Particular. */
  grossDeclared: number;
  /** IRPF que ya le han retenido las entidades. */
  retainedIrpf: number;
  /** Cálculo 1 — neto total declarado, con la retención real de cada factura. */
  netDeclared: number;
  /** Cálculo 2 — estimación conservadora: el 80 % del bruto declarado. */
  conservativeNet: number;
  /**
   * Cálculo 3 — lo que falta apartar para el Modelo 100 (la declaración anual).
   * Puede salir **negativo** si ya le han retenido más del 20 %: se muestra con
   * su signo, porque significa que tiene dinero a favor, no cero.
   */
  pendingModelo100: number;
  /** Visitas todavía sin clasificar: no suman en nada de lo anterior. */
  unclassifiedVisits: number;
  unclassifiedGross: number;
  /** Facturas a entidad con una retención distinta del 15 % habitual. */
  oddRetentionVisits: number;
}

export const EMPTY_FISCAL_TOTALS: Readonly<FiscalTotals> = Object.freeze({
  visits: 0,
  grossEmpresa: 0,
  grossParticular: 0,
  grossDeclared: 0,
  retainedIrpf: 0,
  netDeclared: 0,
  conservativeNet: 0,
  pendingModelo100: 0,
  unclassifiedVisits: 0,
  unclassifiedGross: 0,
  oddRetentionVisits: 0,
});

/**
 * Los tres cálculos del periodo, en una sola pasada.
 *
 * La retención se redondea **factura a factura** (`retentionFor`) y después se
 * suma, en vez de aplicar el porcentaje al bruto total: es así como se calcula
 * en una factura real y como lo declara la entidad que retiene, de modo que la
 * cifra cuadra con lo que efectivamente le han ingresado. La diferencia con
 * aplicar el porcentaje al total es como mucho medio céntimo por factura.
 */
export function fiscalTotals(visits: readonly FiscalVisit[], range?: DateRange): FiscalTotals {
  let grossEmpresa = 0;
  let grossParticular = 0;
  let retainedIrpf = 0;
  let counted = 0;
  let unclassifiedVisits = 0;
  let unclassifiedGross = 0;
  let oddRetentionVisits = 0;

  for (const visit of visitsInRange(visits, range)) {
    const gross = fiscalGross(visit);
    const type = normalizeIncomeType(visit.income_type);

    if (type === null) {
      unclassifiedVisits += 1;
      unclassifiedGross += gross;
      continue;
    }

    counted += 1;
    if (type === "Empresa") {
      const percentage = empresaIrpfPercentage(visit);
      if (percentage !== DEFAULT_EMPRESA_IRPF) oddRetentionVisits += 1;
      grossEmpresa += gross;
      retainedIrpf += retentionFor(gross, percentage);
    } else {
      grossParticular += gross;
    }
  }

  grossEmpresa = roundCents(grossEmpresa);
  grossParticular = roundCents(grossParticular);
  retainedIrpf = roundCents(retainedIrpf);
  const grossDeclared = roundCents(grossEmpresa + grossParticular);

  return {
    visits: counted,
    grossEmpresa,
    grossParticular,
    grossDeclared,
    retainedIrpf,
    netDeclared: roundCents(grossDeclared - retainedIrpf),
    conservativeNet: roundCents((grossDeclared * (100 - CONSERVATIVE_IRPF_RATE)) / 100),
    pendingModelo100: roundCents((grossDeclared * CONSERVATIVE_IRPF_RATE) / 100 - retainedIrpf),
    unclassifiedVisits,
    unclassifiedGross: roundCents(unclassifiedGross),
    oddRetentionVisits,
  };
}

// ── Semáforo del Modelo 130 ──────────────────────────────────────────────────

/**
 * `sin-datos` cuando todavía no hay bruto declarado: 0 de 0 no es «exento con
 * margen», es que no se sabe, y pintarlo en verde sería tranquilizar sin motivo.
 */
export type Modelo130Level = "sin-datos" | "verde" | "ambar" | "rojo";

export interface Modelo130Snapshot {
  level: Modelo130Level;
  /** Porcentaje de ingresos sin retención, 0-100, o `null` si no hay datos. */
  percent: number | null;
  grossEmpresa: number;
  grossParticular: number;
  grossDeclared: number;
  /** Visitas clasificadas que entran en el porcentaje. */
  visits: number;
  /** Visitas del periodo sin clasificar: el porcentaje podría cambiar. */
  unclassifiedVisits: number;
  range: DateRange;
}

/**
 * Nivel del semáforo a partir de los dos brutos.
 *
 * La comparación se hace en **céntimos enteros** y con multiplicación cruzada
 * (`particular × 100 ≥ 30 × total`) en vez de comparar un cociente en coma
 * flotante: un caso justo en el 25 % o en el 30 % tiene que caer siempre del
 * mismo lado, y aquí eso decide si hay que presentar un modelo o no.
 */
export function modelo130Level(grossParticular: number, grossDeclared: number): Modelo130Level {
  const totalCents = Math.round(roundCents(grossDeclared) * 100);
  const particularCents = Math.round(roundCents(grossParticular) * 100);
  if (totalCents <= 0) return "sin-datos";
  if (particularCents * 100 >= MODELO_130_LIMIT_PERCENT * totalCents) return "rojo";
  if (particularCents * 100 >= MODELO_130_WATCH_PERCENT * totalCents) return "ambar";
  return "verde";
}

/** Porcentaje de ingresos sin retención (0-100), o `null` si no hay bruto declarado. */
export function withoutRetentionPercent(grossParticular: number, grossDeclared: number): number | null {
  const total = roundCents(grossDeclared);
  if (!(total > 0)) return null;
  return (roundCents(grossParticular) / total) * 100;
}

export function modelo130Snapshot(visits: readonly FiscalVisit[], range: DateRange): Modelo130Snapshot {
  const totals = fiscalTotals(visits, range);
  return {
    level: modelo130Level(totals.grossParticular, totals.grossDeclared),
    percent: withoutRetentionPercent(totals.grossParticular, totals.grossDeclared),
    grossEmpresa: totals.grossEmpresa,
    grossParticular: totals.grossParticular,
    grossDeclared: totals.grossDeclared,
    visits: totals.visits,
    unclassifiedVisits: totals.unclassifiedVisits,
    range,
  };
}

/** Acumulado del año hasta el cierre del trimestre: el dato que de verdad manda. */
export function quarterSnapshot(visits: readonly FiscalVisit[], ref: QuarterRef): Modelo130Snapshot {
  return modelo130Snapshot(visits, yearToQuarterRange(ref.year, ref.quarter));
}

// ── Avisos del Modelo 130 ────────────────────────────────────────────────────

/** Días antes de que abra el plazo en los que ya se avisa. */
export const MODELO_130_LEAD_DAYS = 7;

export interface Modelo130Reminder {
  quarter: QuarterRef;
  /** `T3 2026`. */
  label: string;
  /** Porcentaje acumulado con el que cerró (o va a cerrar) el trimestre. */
  percent: number;
  /** `false` mientras el trimestre no ha terminado: la cifra aún puede moverse. */
  quarterClosed: boolean;
  /** Último día para presentar, `yyyy-mm-dd`. */
  deadlineIso: string;
  /** «20 de octubre». */
  deadlineLabel: string;
  /** Día en que abre el plazo, `yyyy-mm-dd`. */
  opensIso: string;
  snapshot: Modelo130Snapshot;
}

const shiftIso = (iso: string, days: number): string => {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

/**
 * Avisos de «toca presentar el Modelo 130».
 *
 * Mismo patrón que los avisos de «toca llamar» (`src/lib/visitReminders.ts`):
 * función pura, se enciende solo y se apaga solo cuando pasa el plazo.
 *
 * Se revisan el trimestre en curso y el anterior, porque el aviso arranca unos
 * días **antes** de que abra el plazo y en ese momento el trimestre a veces
 * todavía no ha cerrado (25 de marzo → plazo del T1, que cierra el día 31).
 */
export function buildModelo130Reminders(
  visits: readonly FiscalVisit[],
  today: Date = new Date(),
  leadDays: number = MODELO_130_LEAD_DAYS,
): Modelo130Reminder[] {
  const todayIso = toIsoDate(today);
  const current = currentQuarter(today);
  const candidates: QuarterRef[] = [current, previousQuarter(current)];
  const reminders: Modelo130Reminder[] = [];

  for (const ref of candidates) {
    const window = filingWindow(ref);
    const opensIso = window.fromIso;
    const alertFromIso = shiftIso(opensIso, -Math.max(0, leadDays));
    if (todayIso < alertFromIso || todayIso > window.toIso) continue;

    const snapshot = quarterSnapshot(visits, ref);
    if (snapshot.level !== "rojo" || snapshot.percent === null) continue;

    reminders.push({
      quarter: ref,
      label: quarterLabel(ref),
      percent: snapshot.percent,
      quarterClosed: todayIso > quarterRange(ref.year, ref.quarter).toIso,
      deadlineIso: window.toIso,
      deadlineLabel: window.deadlineLabel,
      opensIso,
      snapshot,
    });
  }

  // El plazo más cercano primero.
  return reminders.sort((a, b) => a.deadlineIso.localeCompare(b.deadlineIso));
}

// ── Numeración de facturas ───────────────────────────────────────────────────

export interface InvoiceRef {
  /** Todo lo que va antes del número: `F-2026-`. */
  prefix: string;
  /** Número de la secuencia: 66. */
  number: number;
  /** Dígitos con los que estaba escrito, para reconstruir `F-2026-065`. */
  digits: number;
}

/** Separa «F-2026-066» en prefijo + número, sin exigir un formato concreto. */
export function parseInvoiceNumber(raw?: string | null): InvoiceRef | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const match = /^(.*?)(\d+)$/.exec(text);
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number)) return null;
  return { prefix: match[1], number, digits: match[2].length };
}

/** Reconstruye un número de la misma serie, con los mismos dígitos. */
export const formatInvoiceNumber = (ref: InvoiceRef, number: number): string =>
  `${ref.prefix}${`${number}`.padStart(ref.digits, "0")}`;

/**
 * Hueco en la numeración: el número anterior de la serie no aparece en ninguna
 * visita. Es **sólo un aviso**; nunca debe impedir guardar. Devuelve el número
 * que falta o `null` si no hay nada que avisar.
 */
export function missingPreviousInvoice(
  raw: string | null | undefined,
  existing: readonly (string | null | undefined)[],
): string | null {
  const ref = parseInvoiceNumber(raw);
  if (!ref || ref.number <= 1) return null;

  const previous = ref.number - 1;
  for (const candidate of existing) {
    const other = parseInvoiceNumber(candidate);
    if (!other) continue;
    if (other.prefix === ref.prefix && other.number === previous) return null;
  }
  return formatInvoiceNumber(ref, previous);
}

/** Todos los `invoice_number` ya guardados, sin repetir ni vacíos. */
export function collectInvoiceNumbers(visits: readonly FiscalVisit[]): string[] {
  const numbers = new Set<string>();
  for (const visit of visits) {
    const text = (visit?.invoice_number ?? "").trim();
    if (text !== "") numbers.add(text);
  }
  return Array.from(numbers);
}

/** Serie de facturación: el prefijo y con cuántos dígitos se escribe el número. */
export interface InvoiceSeries {
  prefix: string;
  digits: number;
}

/**
 * Serie que David usa de verdad (la más repetida), para poder avisar de un
 * número escrito «raro» sin imponer ninguna validación que bloquee.
 */
export function dominantInvoiceSeries(existing: readonly (string | null | undefined)[]): InvoiceSeries | null {
  const counts = new Map<string, { series: InvoiceSeries; count: number }>();
  for (const candidate of existing) {
    const ref = parseInvoiceNumber(candidate);
    if (!ref) continue;
    const key = `${ref.prefix}|${ref.digits}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { series: { prefix: ref.prefix, digits: ref.digits }, count: 1 });
  }

  let best: InvoiceSeries | null = null;
  let bestCount = 0;
  for (const { series, count } of counts.values()) {
    // A igualdad, la serie alfabéticamente menor: el resultado no puede depender
    // del orden en que lleguen las visitas.
    if (count > bestCount || (count === bestCount && best !== null && series.prefix < best.prefix)) {
      best = series;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Aviso blando de formato: el número no lleva cifras o no pertenece a la serie
 * habitual. Devuelve cómo se escribiría en la serie habitual, o `null` si no hay
 * nada raro que comentar. Nunca bloquea: hay facturas reales fuera de serie.
 */
export function unusualInvoiceFormat(
  raw: string | null | undefined,
  existing: readonly (string | null | undefined)[],
): string | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const series = dominantInvoiceSeries(existing);
  if (!series) return null;

  const ref = parseInvoiceNumber(text);
  if (!ref) return formatInvoiceNumber({ ...series, number: 1 }, 1);
  if (ref.prefix === series.prefix) return null;
  return formatInvoiceNumber({ ...series, number: ref.number }, ref.number);
}

// ── Facturas a entidad: qué está cobrado y qué no ────────────────────────────

/** Estados en los que una visita ya se da por cobrada o facturada. */
const CLOSED_VISIT_STATUSES = new Set<string>(["Cobrada", "Facturada"]);

export interface EmpresaInvoice {
  visitId: string;
  date: string;
  centerId: string | null;
  invoiceNumber: string | null;
  gross: number;
  status: string;
}

export interface EmpresaInvoiceState {
  /** Facturas a entidad que todavía no están cobradas ni facturadas. */
  pending: EmpresaInvoice[];
  pendingTotal: number;
  settledVisits: number;
  settledTotal: number;
  /** Facturas a entidad sin número de factura apuntado. */
  withoutNumber: number;
}

export const EMPTY_EMPRESA_INVOICE_STATE: Readonly<EmpresaInvoiceState> = Object.freeze({
  pending: [],
  pendingTotal: 0,
  settledVisits: 0,
  settledTotal: 0,
  withoutNumber: 0,
});

/**
 * Estado de cobro de las facturas a entidad, de **cualquier mes**: lo que se
 * pregunta aquí es «¿quién me debe dinero?», y eso no se reinicia con el mes.
 *
 * El criterio de «cobrada» es el estado de la visita (`Cobrada`/`Facturada`),
 * el mismo que usa el aviso de pendientes de cobro de Hoy.
 */
export function empresaInvoiceState(visits: readonly FiscalVisit[]): EmpresaInvoiceState {
  const pending: EmpresaInvoice[] = [];
  let pendingTotal = 0;
  let settledVisits = 0;
  let settledTotal = 0;
  let withoutNumber = 0;

  for (const visit of visits) {
    if (!isDeclarableVisit(visit)) continue;
    if (normalizeIncomeType(visit.income_type) !== "Empresa") continue;

    const gross = fiscalGross(visit);
    const status = (visit.status ?? "").trim();
    const invoiceNumber = (visit.invoice_number ?? "").trim() || null;
    if (invoiceNumber === null) withoutNumber += 1;

    if (CLOSED_VISIT_STATUSES.has(status)) {
      settledVisits += 1;
      settledTotal += gross;
      continue;
    }
    pending.push({
      visitId: visit.id,
      date: dayKey(visit.visit_date),
      centerId: visit.center_id ?? null,
      invoiceNumber,
      gross,
      status: status || "Realizada",
    });
    pendingTotal += gross;
  }

  // Lo más antiguo primero: es lo que lleva más tiempo sin cobrarse.
  pending.sort((a, b) => a.date.localeCompare(b.date) || a.visitId.localeCompare(b.visitId));

  return {
    pending,
    pendingTotal: roundCents(pendingTotal),
    settledVisits,
    settledTotal: roundCents(settledTotal),
    withoutNumber,
  };
}

// ── Domicilios ───────────────────────────────────────────────────────────────

export interface HomeVisitsSummary {
  visits: number;
  patients: number;
  gross: number;
  /** Neto con el mismo criterio del cálculo 1 (sólo de las visitas clasificadas). */
  netDeclared: number;
  /** Visitas a domicilio sin clasificar: su neto todavía no se puede calcular. */
  unclassifiedVisits: number;
}

export const EMPTY_HOME_SUMMARY: Readonly<HomeVisitsSummary> = Object.freeze({
  visits: 0,
  patients: 0,
  gross: 0,
  netDeclared: 0,
  unclassifiedVisits: 0,
});

/**
 * Visitas a domicilio del periodo y lo que dejan.
 *
 * Cuenta como domicilio lo que `isHomeLikeCenter` considera domicilio: el tipo
 * `Domicilio` y también los centros «cajón» que David usa en su contabilidad
 * con «domicilio» en el nombre («Domicilios y consulta particular»).
 */
export function homeVisitsSummary(
  visits: readonly FiscalVisit[],
  centers: ReadonlyMap<string, CenterInfo>,
  range?: DateRange,
): HomeVisitsSummary {
  let count = 0;
  let patients = 0;
  let gross = 0;
  let netDeclared = 0;
  let unclassifiedVisits = 0;

  for (const visit of visitsInRange(visits, range)) {
    const center = visit.center_id ? centers.get(visit.center_id) : undefined;
    if (!center || !isHomeLikeCenter(center)) continue;

    const amount = fiscalGross(visit);
    count += 1;
    patients += Math.max(0, Math.round(toAmount(visit.patients_count)));
    gross += amount;

    const type = normalizeIncomeType(visit.income_type);
    if (type === null) {
      unclassifiedVisits += 1;
    } else if (type === "Empresa") {
      netDeclared += amount - retentionFor(amount, empresaIrpfPercentage(visit));
    } else {
      netDeclared += amount;
    }
  }

  return {
    visits: count,
    patients,
    gross: roundCents(gross),
    netDeclared: roundCents(netDeclared),
    unclassifiedVisits,
  };
}

// ── Precio anómalo ───────────────────────────────────────────────────────────

/** Desviación a partir de la cual se pregunta si el precio es correcto. */
export const PRICE_ANOMALY_TOLERANCE = 0.12;

/** Visitas históricas mínimas para que la media signifique algo. */
export const PRICE_HISTORY_MINIMUM = 2;

export interface CenterPriceHistory {
  /** Precio medio por paciente, ponderado por pacientes atendidos. */
  average: number;
  /** Visitas con importe y pacientes que han entrado en la media. */
  visits: number;
}

/**
 * Precio medio por paciente de un centro, **ponderado**: bruto total ÷
 * pacientes totales. Una media de medias daría el mismo peso a una visita de un
 * paciente que a una de veinte.
 */
export function centerPriceHistory(
  visits: readonly FiscalVisit[],
  centerId: string | null | undefined,
  options: { excludeVisitId?: string } = {},
): CenterPriceHistory | null {
  if (!centerId) return null;
  let gross = 0;
  let patients = 0;
  let counted = 0;

  for (const visit of visits) {
    if (!visit || visit.center_id !== centerId) continue;
    if (options.excludeVisitId && visit.id === options.excludeVisitId) continue;
    if (!isDeclarableVisit(visit)) continue;
    const amount = fiscalGross(visit);
    const count = Math.max(0, Math.round(toAmount(visit.patients_count)));
    if (!(amount > 0) || count <= 0) continue;
    gross += amount;
    patients += count;
    counted += 1;
  }

  if (counted < PRICE_HISTORY_MINIMUM || patients <= 0) return null;
  return { average: roundCents(gross / patients), visits: counted };
}

export interface PriceAnomaly {
  /** Precio por paciente que se está a punto de guardar. */
  price: number;
  /** Precio medio histórico de ese centro. */
  average: number;
  /** Visitas en las que se basa la media. */
  visits: number;
  /** `true` si el precio nuevo es más alto de lo habitual. */
  higher: boolean;
}

/**
 * ¿Se desvía el precio por paciente de lo habitual en ese centro?
 *
 * Nunca corrige nada: sólo devuelve el dato para poder preguntar «¿es
 * correcto?». Si no hay histórico suficiente devuelve `null` y no se avisa.
 */
export function priceAnomaly(
  history: CenterPriceHistory | null,
  pricePerPatient: number,
  tolerance: number = PRICE_ANOMALY_TOLERANCE,
): PriceAnomaly | null {
  if (!history || !(history.average > 0)) return null;
  const price = roundCents(pricePerPatient);
  if (!(price > 0)) return null;
  const deviation = Math.abs(price - history.average) / history.average;
  if (deviation <= tolerance) return null;
  return { price, average: history.average, visits: history.visits, higher: price > history.average };
}

// ── Efectivo en mano ─────────────────────────────────────────────────────────

/**
 * Formas de pago que son dinero físico. El desplegable ofrece «Efectivo», pero
 * la forma de cobro del centro es texto libre y hay centros escritos a mano.
 */
const CASH_METHOD = /efectivo|met[áa]lico|en mano/i;

export const isCashMethod = (method?: string | null): boolean => CASH_METHOD.test((method ?? "").trim());

/** Estados de cobro en los que el dinero ya ha entrado. */
const COLLECTED_PAYMENT_STATUSES = new Set<string>(["Cobrado", "Incluido en factura"]);

/** Único estado de visita que significa «el dinero ya está cobrado». */
const PAID_VISIT_STATUS = "Cobrada";

export interface CashInHand {
  /** Saldo del periodo: cobros en efectivo menos devoluciones en efectivo. */
  total: number;
  /** Visitas que han aportado (o restado) efectivo. */
  visits: number;
  /** `true` si alguna cifra es una devolución (importe negativo). */
  hasRefunds: boolean;
}

export const EMPTY_CASH_IN_HAND: Readonly<CashInHand> = Object.freeze({ total: 0, visits: 0, hasRefunds: false });

/**
 * Efectivo en mano del periodo: control de caja física, **sin ninguna relación
 * con los cálculos fiscales** (no distingue declarado de no declarado).
 *
 * De dónde sale cada euro:
 * - si el cobro se partió entre varias formas de pago, de las líneas de
 *   `payment_breakdown` que sean en efectivo;
 * - si no hay desglose, del importe cobrado cuando la forma de cobro habitual
 *   del centro es en efectivo.
 *
 * Los importes negativos **restan**: así es como se apunta una devolución.
 * El periodo se mide por fecha de visita, igual que el resto de Finanzas.
 */
export function cashInHand(
  visits: readonly FiscalVisit[],
  centers: ReadonlyMap<string, CenterInfo>,
  range?: DateRange,
): CashInHand {
  let total = 0;
  let touched = 0;
  let hasRefunds = false;

  for (const visit of visitsInRange(visits, range)) {
    const center = visit.center_id ? centers.get(visit.center_id) : undefined;
    const centerIsCash = isCashMethod(center?.paymentMethod);
    const rows = visit.visit_patients ?? [];
    let visitCash = 0;

    // «Facturada» no vale aquí: una factura emitida y todavía sin pagar no ha
    // metido dinero en el bolsillo, y esto es caja física.
    const visitIsPaid = (visit.status ?? "").trim() === PAID_VISIT_STATUS;

    if (rows.length === 0) {
      // Visita antigua sin detalle por paciente: sólo se sabe por el centro.
      if (centerIsCash && visitIsPaid) visitCash += fiscalGross(visit);
    } else {
      for (const row of rows) {
        const lines = parseCashLines(row.payment_breakdown);
        if (lines !== null) {
          visitCash += lines;
          continue;
        }
        const collected = COLLECTED_PAYMENT_STATUSES.has((row.payment_status ?? "").trim()) || visitIsPaid;
        if (centerIsCash && collected) visitCash += toAmount(row.price_charged);
      }
    }

    visitCash = roundCents(visitCash);
    if (visitCash === 0) continue;
    if (visitCash < 0) hasRefunds = true;
    total += visitCash;
    touched += 1;
  }

  return { total: roundCents(total), visits: touched, hasRefunds };
}

/**
 * Suma de las líneas en efectivo de un `payment_breakdown`, o `null` si esa fila
 * no tiene desglose (hay que mirar la forma de cobro del centro).
 *
 * No se reutiliza `parsePaymentBreakdown()` de `payments.ts` porque allí se
 * descartan los importes que no son positivos, y aquí una línea negativa es
 * justo lo que hay que contar: una devolución en efectivo.
 */
function parseCashLines(value: unknown): number | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  let total = 0;
  let usable = false;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const method = (entry as { method?: unknown }).method;
    if (typeof method !== "string" || method.trim() === "") continue;
    usable = true;
    if (isCashMethod(method)) total += toAmount((entry as { amount?: unknown }).amount);
  }
  return usable ? roundCents(total) : null;
}
