import { isCompletedVisit } from "@/lib/streak";

/**
 * Derivaciones puras para las vistas de la Agenda (día / semana / mes / año).
 *
 * El objetivo es recorrer `visits` **una sola vez** y consultar después por
 * clave `yyyy-mm-dd`: la agenda pintaba 42 celdas de mes + 7 días de semana +
 * 12 meses filtrando el array completo en cada una (O(n · celdas)).
 *
 * No toca el modelo de datos ni las queries: sólo agrega lo que ya viene de
 * `useVisits()`.
 */

/** Forma mínima de una visita para estas agregaciones (las filas de Supabase encajan). */
export interface AgendaVisit {
  id: string;
  visit_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: string;
  gross_amount: number;
  patients_count: number;
  center_id?: string | null;
  /** Notas de la visita: en las importadas dicen qué falta por completar. */
  general_notes?: string | null;
}

export interface DayStats {
  /** Número de visitas registradas ese día. */
  visits: number;
  /** Importe bruto sumado (mismo criterio que el resto de la app: incluye todos los estados). */
  gross: number;
  /** Pacientes atendidos/previstos. */
  patients: number;
  /** Visitas en estado Realizada / Cobrada / Facturada. */
  completed: number;
  /** Visitas canceladas: no son trabajo pendiente de facturar. */
  cancelled: number;
}

export const CANCELLED_STATUS = "Cancelada";

export interface PeriodStats extends DayStats {
  /** Días distintos con al menos una visita. */
  days: number;
}

export const EMPTY_DAY_STATS: Readonly<DayStats> = Object.freeze({
  visits: 0,
  gross: 0,
  patients: 0,
  completed: 0,
  cancelled: 0,
});

export const EMPTY_PERIOD_STATS: Readonly<PeriodStats> = Object.freeze({ ...EMPTY_DAY_STATS, days: 0 });

/** `gross_amount` llega como `numeric` de Postgres: puede ser string. */
const toAmount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Normaliza `visit_date` a `yyyy-mm-dd` (Supabase puede devolver timestamp). */
export const dayKey = (visitDate: string): string => visitDate.slice(0, 10);

/** Clave `yyyy-mm` a partir de una clave de día. */
export const monthKey = (key: string): string => key.slice(0, 7);

/**
 * Agrupa las visitas por día civil. La clave es la propia cadena `visit_date`,
 * nunca un `Date`, para no arrastrar problemas de huso horario.
 */
export function buildDayStats(visits: readonly AgendaVisit[]): Map<string, DayStats> {
  const byDay = new Map<string, DayStats>();
  for (const visit of visits) {
    if (!visit?.visit_date) continue;
    const key = dayKey(visit.visit_date);
    let stats = byDay.get(key);
    if (!stats) {
      stats = { visits: 0, gross: 0, patients: 0, completed: 0, cancelled: 0 };
      byDay.set(key, stats);
    }
    stats.visits += 1;
    stats.gross += toAmount(visit.gross_amount);
    stats.patients += toAmount(visit.patients_count);
    if (isCompletedVisit(visit)) stats.completed += 1;
    if (visit.status === CANCELLED_STATUS) stats.cancelled += 1;
  }
  return byDay;
}

/** Índice de visitas por día, ya ordenadas por hora de inicio. */
export function buildVisitsByDay<T extends AgendaVisit>(visits: readonly T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const visit of visits) {
    if (!visit?.visit_date) continue;
    const key = dayKey(visit.visit_date);
    const list = byDay.get(key);
    if (list) list.push(visit);
    else byDay.set(key, [visit]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }
  return byDay;
}

/** Agrega los días ya calculados por mes (`yyyy-mm`). */
export function buildMonthStats(dayStats: ReadonlyMap<string, DayStats>): Map<string, PeriodStats> {
  const byMonth = new Map<string, PeriodStats>();
  for (const [key, stats] of dayStats) {
    if (stats.visits === 0) continue;
    const month = monthKey(key);
    let acc = byMonth.get(month);
    if (!acc) {
      acc = { visits: 0, gross: 0, patients: 0, completed: 0, cancelled: 0, days: 0 };
      byMonth.set(month, acc);
    }
    acc.visits += stats.visits;
    acc.gross += stats.gross;
    acc.patients += stats.patients;
    acc.completed += stats.completed;
    acc.cancelled += stats.cancelled;
    acc.days += 1;
  }
  return byMonth;
}

/** Suma un conjunto concreto de días (semana visible, mes visible…). */
export function sumDays(dayStats: ReadonlyMap<string, DayStats>, keys: readonly string[]): PeriodStats {
  const total: PeriodStats = { visits: 0, gross: 0, patients: 0, completed: 0, cancelled: 0, days: 0 };
  for (const key of keys) {
    const stats = dayStats.get(key);
    if (!stats || stats.visits === 0) continue;
    total.visits += stats.visits;
    total.gross += stats.gross;
    total.patients += stats.patients;
    total.completed += stats.completed;
    total.cancelled += stats.cancelled;
    total.days += 1;
  }
  return total;
}

/**
 * Clave con actividad más cercana a `fromKey`, **prefiriendo el pasado**.
 *
 * Sirve para el caso real que dejaba la agenda «vacía»: la app abre siempre en
 * el periodo de hoy, así que en un mes sin visitas no se veía nada y había que
 * adivinar cuántas veces pulsar la flecha para llegar al último mes trabajado.
 *
 * Funciona igual con claves de día (`yyyy-mm-dd`) y de mes (`yyyy-mm`) porque
 * ambas se ordenan alfabéticamente igual que cronológicamente.
 */
export function nearestActiveKey(
  stats: ReadonlyMap<string, { visits: number }>,
  fromKey: string,
): string | null {
  let past: string | null = null;
  let future: string | null = null;
  for (const [key, value] of stats) {
    if (!value || value.visits === 0) continue;
    if (key <= fromKey) {
      if (past === null || key > past) past = key;
    } else if (future === null || key < future) {
      future = key;
    }
  }
  return past ?? future;
}

/** Mayor importe bruto diario del conjunto de días indicado (referencia del mapa de calor). */
export function maxGross(dayStats: ReadonlyMap<string, DayStats>, keys: readonly string[]): number {
  let max = 0;
  for (const key of keys) {
    const gross = dayStats.get(key)?.gross ?? 0;
    if (gross > max) max = gross;
  }
  return max;
}

/** 0 = sin ingreso; 1–4 = intensidad creciente, relativa al mejor día del periodo. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Intensidad relativa: el mejor día del periodo visible marca el nivel 4.
 * Es una comparación *dentro* del mes, no una escala absoluta en euros, que es
 * lo que responde a la pregunta «¿qué día trabajé más?».
 */
export function heatLevel(gross: number, max: number): HeatLevel {
  if (!(gross > 0) || !(max > 0)) return 0;
  const ratio = Math.min(gross / max, 1);
  const level = Math.ceil(ratio * 4);
  return Math.min(4, Math.max(1, level)) as HeatLevel;
}

/**
 * Día con trabajo registrado pero sin importe: las visitas importadas de agosto
 * pendientes de facturar por Eulen. No debe pintarse como «cobró 0 €» ni como
 * «día libre».
 */
export const isUnbilledDay = (stats: DayStats | undefined): boolean =>
  !!stats && stats.visits - stats.cancelled > 0 && stats.gross <= 0;

/**
 * Día cuyas visitas se cancelaron todas: no está pendiente de cobro, pero
 * tampoco es un día libre, así que tampoco debe pintarse como celda vacía.
 */
export const isFullyCancelledDay = (stats: DayStats | undefined): boolean =>
  !!stats && stats.visits > 0 && stats.cancelled === stats.visits;

/** Porcentaje de una barra comparativa, con mínimo visible para valores muy pequeños. */
export function barPercent(value: number, max: number, minPercent = 6): number {
  if (!(value > 0) || !(max > 0)) return 0;
  const percent = (value / max) * 100;
  return Math.min(100, Math.max(minPercent, percent));
}
