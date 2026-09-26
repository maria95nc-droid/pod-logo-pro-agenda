import { dayKey, monthKey } from "@/lib/agendaStats";
import { roundCents, visitTotal, type PaymentVisit } from "@/lib/payments";
import { isCompletedVisit } from "@/lib/streak";

/**
 * Récords de facturación: el día y el mes en los que David más ha facturado.
 *
 * Es una cifra **motivacional**, no fiscal: sirve para picarse consigo mismo
 * («hoy vas por 180 €, tu récord son 320 €»). Aun así se calcula con los mismos
 * criterios que el dinero de verdad, porque si el récord no coincidiera con lo
 * que enseñan Agenda y Finanzas la app perdería credibilidad.
 *
 * Decisiones que importan:
 *
 * - **El importe es `visitTotal()`**: la suma de `visit_patients` cuando hay
 *   detalle y el bruto agregado cuando no. Es el criterio único de la app
 *   (Finanzas, libro de movimientos y módulo fiscal), así que el récord de un
 *   día cuadra con lo que se ve al abrir ese día.
 * - **Sólo cuentan las visitas ya hechas** (`isCompletedVisit`: Realizada,
 *   Pendiente de cobro, Cobrada o Facturada), igual que la racha. Una visita
 *   `Programada` todavía no ha generado nada: si contase, un día del futuro con
 *   varias visitas apuntadas se convertiría en «récord» sin haber trabajado. Una
 *   `Cancelada` no va a generar nada.
 * - **Los importes negativos (devoluciones) restan** dentro de su día y de su
 *   mes, pero un periodo que acaba en cero o en negativo no puede ser récord.
 * - **El récord con el que se compara el periodo en curso excluye ese periodo**:
 *   comparar hoy contra sí mismo diría siempre «récord igualado».
 */

/** Forma mínima de una visita para estos cálculos (las filas de Supabase encajan). */
export interface RevenueVisit extends PaymentVisit {
  visit_date?: string | null;
}

/** Resolución del periodo: día civil (`yyyy-mm-dd`) o mes (`yyyy-mm`). */
export type RevenueResolution = "day" | "month";

export interface RevenueRecord {
  /** `yyyy-mm-dd` si es un día, `yyyy-mm` si es un mes. Nunca un `Date`. */
  key: string;
  amount: number;
  /** Visitas ya hechas que suman en ese periodo. */
  visits: number;
}

/** Clave del periodo al que pertenece una fecha civil. */
export const periodKeyOf = (iso: string, resolution: RevenueResolution): string =>
  resolution === "month" ? monthKey(dayKey(iso)) : dayKey(iso);

/**
 * Facturación por periodo, en una sola pasada. Devuelve **todos** los periodos
 * con al menos una visita hecha, incluidos los que suman 0 € (trabajo aún sin
 * importe): quien decide si eso puede ser récord es `bestRevenuePeriod`.
 */
export function revenueByPeriod(
  visits: readonly RevenueVisit[],
  resolution: RevenueResolution,
): Map<string, RevenueRecord> {
  const byPeriod = new Map<string, RevenueRecord>();

  for (const visit of visits) {
    if (!visit?.visit_date || !isCompletedVisit(visit)) continue;
    const key = periodKeyOf(visit.visit_date, resolution);
    const entry = byPeriod.get(key);
    if (entry) {
      entry.amount += visitTotal(visit);
      entry.visits += 1;
    } else {
      byPeriod.set(key, { key, amount: visitTotal(visit), visits: 1 });
    }
  }

  for (const entry of byPeriod.values()) entry.amount = roundCents(entry.amount);
  return byPeriod;
}

/**
 * Periodo con más facturación, o `null` si no hay ninguno con dinero.
 *
 * Un empate lo gana el periodo **más reciente**: si hoy iguala el mejor día de
 * la historia, el récord pasa a ser hoy, que es lo que el usuario espera leer.
 */
export function bestRevenuePeriod(
  periods: ReadonlyMap<string, RevenueRecord>,
  options: { exclude?: string } = {},
): RevenueRecord | null {
  let best: RevenueRecord | null = null;
  for (const entry of periods.values()) {
    if (options.exclude !== undefined && entry.key === options.exclude) continue;
    // Un 0 € (o una devolución) no es un récord de facturación.
    if (!(entry.amount > 0)) continue;
    if (best === null || entry.amount > best.amount || (entry.amount === best.amount && entry.key > best.key)) {
      best = entry;
    }
  }
  return best ? { ...best } : null;
}

export interface RevenueRecords {
  /** Día de toda la historia con más facturación. */
  bestDay: RevenueRecord | null;
  /** Mes de toda la historia con más facturación. */
  bestMonth: RevenueRecord | null;
}

export const EMPTY_REVENUE_RECORDS: Readonly<RevenueRecords> = Object.freeze({ bestDay: null, bestMonth: null });

/** Los dos récords del histórico completo. */
export function revenueRecords(visits: readonly RevenueVisit[]): RevenueRecords {
  return {
    bestDay: bestRevenuePeriod(revenueByPeriod(visits, "day")),
    bestMonth: bestRevenuePeriod(revenueByPeriod(visits, "month")),
  };
}

/**
 * Cómo va el periodo en curso respecto al récord anterior.
 *
 * - `sin-record`: no hay **ningún otro** periodo con dinero con el que comparar
 *   (los primeros días de uso). No se dice ni que va bien ni que va mal.
 * - `sin-empezar`: el periodo en curso todavía no ha facturado nada.
 * - `en-marcha`: por debajo del récord, con algo facturado ya.
 * - `igualado` / `superado`: hay algo que celebrar.
 */
export type RecordStanding = "sin-record" | "sin-empezar" | "en-marcha" | "igualado" | "superado";

export interface RevenueProgress {
  /** Periodo que se está midiendo (`yyyy-mm-dd` o `yyyy-mm`). */
  key: string;
  /** Facturado en ese periodo. */
  current: number;
  /** Visitas ya hechas en ese periodo. */
  visits: number;
  /** Mejor periodo **distinto** de éste, con el que se compara. */
  record: RevenueRecord | null;
  standing: RecordStanding;
  /** Euros que faltan para igualar el récord; 0 si ya está igualado o superado. */
  remaining: number;
  /** Progreso 0-100 sobre el récord; 100 al igualarlo o superarlo. */
  percent: number;
}

/**
 * Progreso del periodo indicado contra el récord de los **demás** periodos.
 *
 * `periodKey` decide la resolución: 10 caracteres (`2026-08-24`) es un día y 7
 * (`2026-08`) es un mes, de modo que quien llama no puede pedir un día y recibir
 * la comparación de un mes.
 */
export function revenueProgress(visits: readonly RevenueVisit[], periodKey: string): RevenueProgress {
  const resolution: RevenueResolution = periodKey.length <= 7 ? "month" : "day";
  const periods = revenueByPeriod(visits, resolution);
  const own = periods.get(periodKey);
  const current = own?.amount ?? 0;
  const record = bestRevenuePeriod(periods, { exclude: periodKey });

  // Sin otro periodo con el que comparar no se afirma nada: decir «récord
  // superado» el primer día de uso sería felicitar por haber empezado.
  let standing: RecordStanding;
  if (record === null) standing = "sin-record";
  else if (current > record.amount) standing = "superado";
  else if (current === record.amount) standing = "igualado";
  else if (current > 0) standing = "en-marcha";
  else standing = "sin-empezar";

  const remaining = record !== null && current < record.amount ? roundCents(record.amount - current) : 0;
  const percent =
    record === null ? 0 : Math.max(0, Math.min(100, Math.round((current / record.amount) * 100)));

  return { key: periodKey, current, visits: own?.visits ?? 0, record, standing, remaining, percent };
}
