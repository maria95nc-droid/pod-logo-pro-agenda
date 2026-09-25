import { fromIsoDate, toIsoDate } from "@/lib/format";
import { addDays } from "@/lib/calendar";
import { isCompletedVisit } from "@/lib/streak";

/**
 * «Toca llamar»: avisos de que se acerca la fecha en la que hay que concertar
 * la próxima visita a un centro con cadencia fija.
 *
 * David visita cada residencia con una periodicidad conocida (`centers
 * .visit_frequency_weeks`: 4 = mensual, 6 = mes y medio, 2 = quincenal…) pero
 * es él quien tiene que llamar para concertar el día. El aviso se calcula
 * siempre a partir de la **última visita realmente hecha**, no de un calendario
 * teórico: si un mes se retrasó, la siguiente cuenta desde ahí.
 *
 * Funciones puras: no leen `Date.now()` salvo por el valor por defecto de
 * `today`, así que se pueden probar con una fecha fija.
 */

/**
 * Cadencias reales que usa David, en semanas; el desplegable permite además un
 * número libre. Él las piensa y las dice en meses («cada mes», «mes y medio»,
 * «dos meses», «tres meses»), así que la lista cubre esas cuatro más la
 * quincenal, y se etiquetan con `frequencyLabel`.
 */
export const VISIT_FREQUENCY_PRESETS = [2, 4, 6, 8, 12] as const;

/** Semanas equivalentes a un mes para este cálculo (criterio de David: 4 = 1 mes). */
const WEEKS_PER_MONTH = 4;

/** Rango admitido para la columna: de semanal a anual. */
export const MIN_FREQUENCY_WEEKS = 1;
export const MAX_FREQUENCY_WEEKS = 52;

/** Antelación máxima del aviso, en días («siete, diez días antes»). */
export const CALL_LEAD_DAYS = 10;

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

/** Forma mínima de una fila de `centers` para este cálculo. */
export interface ReminderCenter {
  id: string;
  name?: string | null;
  contact_phone?: string | null;
  is_active?: boolean | null;
  visit_frequency_weeks?: number | string | null;
}

/** Forma mínima de una fila de `visits` para este cálculo. */
export interface ReminderVisit {
  center_id?: string | null;
  visit_date?: string | null;
  status?: string | null;
}

export interface CallReminder {
  centerId: string;
  centerName: string;
  contactPhone: string | null;
  frequencyWeeks: number;
  /** Última visita completada, `yyyy-mm-dd`. */
  lastVisitIso: string;
  /** Fecha en la que tocaría la siguiente, `yyyy-mm-dd`. */
  dueIso: string;
  /** Días civiles de hoy hasta `dueIso`; negativo si ya se pasó. */
  daysUntilDue: number;
  /** `true` cuando la fecha ya pasó: el aviso es más urgente. */
  overdue: boolean;
  /** Texto corto listo para pintar: «toca en 3 días», «toca hoy», «tocaba hace 2 días». */
  timingText: string;
}

export const SCHEDULED_STATUS = "Programada";

/**
 * Convierte el valor de la columna a un número de semanas usable.
 * Postgres puede devolver `integer` como número o como cadena, y el formulario
 * puede enviar basura: cualquier valor fuera de rango se trata como «sin
 * cadencia definida» en vez de generar fechas absurdas.
 */
export function normalizeFrequencyWeeks(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const weeks = Number(value);
  if (!Number.isInteger(weeks)) return null;
  if (weeks < MIN_FREQUENCY_WEEKS || weeks > MAX_FREQUENCY_WEEKS) return null;
  return weeks;
}

/** «3 semanas», «1 semana»: la cadencia tal cual se guarda en la columna. */
export const weeksText = (weeks: number): string => `${weeks} semana${weeks === 1 ? "" : "s"}`;

/**
 * Etiqueta humana de una cadencia, **en meses**: «Cada mes», «Cada mes y
 * medio», «Cada 2 meses»… David razona en meses aunque la columna guarde
 * semanas (4 = un mes), así que es lo que se pinta en la ficha del centro y en
 * el desplegable del formulario.
 *
 * Sólo se traduce a meses cuando la equivalencia es exacta (semanas pares: 6 =
 * mes y medio, 10 = dos meses y medio). Una cadencia impar se queda en semanas
 * en vez de redondearse, porque el número que se ve en la ficha tiene que ser
 * el mismo con el que se calcula el aviso de «toca llamar»: si 5 y 6 semanas se
 * leyeran igual, la ficha estaría mintiendo. Por debajo del mes también se
 * habla en semanas, que es como se dice de verdad.
 */
export function frequencyLabel(weeks: number): string {
  if (weeks < WEEKS_PER_MONTH || weeks % 2 !== 0) return `Cada ${weeks === 1 ? "semana" : weeksText(weeks)}`;
  // Se cuenta en medios meses (2 semanas) y luego se separa en enteros + medio.
  const halfMonths = weeks / (WEEKS_PER_MONTH / 2);
  const months = Math.floor(halfMonths / 2);
  const andAHalf = halfMonths % 2 === 1 ? " y medio" : "";
  return months === 1 ? `Cada mes${andAHalf}` : `Cada ${months} meses${andAHalf}`;
}

/** Días civiles entre dos fechas `yyyy-mm-dd` (positivo si `toIso` es posterior). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = fromIsoDate(fromIso);
  const to = fromIsoDate(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return NaN;
  // `Math.round` absorbe la hora que sobra o falta en los cambios de hora.
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Antelación efectiva del aviso para una cadencia concreta.
 *
 * Con 10 días fijos, un centro quincenal (14 días de ciclo) tendría el aviso
 * encendido dos tercios del tiempo y dejaría de llamar la atención, que es
 * justo lo que se pide de él. Para ciclos cortos la antelación se recorta a
 * poco menos de medio ciclo; en las cadencias habituales (4, 6 u 8 semanas) no
 * cambia nada.
 */
export function leadDaysFor(frequencyWeeks: number, maxLeadDays: number = CALL_LEAD_DAYS): number {
  const cycleDays = frequencyWeeks * DAYS_PER_WEEK;
  return Math.max(1, Math.min(maxLeadDays, Math.ceil(cycleDays / 2) - 1));
}

/** «toca en 3 días» / «toca mañana» / «toca hoy» / «tocaba ayer» / «tocaba hace 4 días». */
export function timingText(daysUntilDue: number): string {
  if (daysUntilDue > 1) return `toca en ${daysUntilDue} días`;
  if (daysUntilDue === 1) return "toca mañana";
  if (daysUntilDue === 0) return "toca hoy";
  if (daysUntilDue === -1) return "tocaba ayer";
  return `tocaba hace ${Math.abs(daysUntilDue)} días`;
}

interface CenterVisitState {
  /** Fecha de la última visita completada, `yyyy-mm-dd`. */
  lastCompletedIso: string | null;
  /** Hay una visita «Programada» de hoy en adelante: la llamada ya está hecha. */
  hasUpcomingScheduled: boolean;
}

/**
 * Una sola pasada por `visits` para saber, de cada centro, cuándo fue la última
 * visita hecha y si ya hay otra programada por delante.
 */
function buildCenterVisitState(
  visits: readonly ReminderVisit[],
  todayIso: string,
): Map<string, CenterVisitState> {
  const byCenter = new Map<string, CenterVisitState>();
  for (const visit of visits) {
    const centerId = visit?.center_id;
    if (!centerId || !visit.visit_date) continue;
    const dateIso = visit.visit_date.slice(0, 10);
    let state = byCenter.get(centerId);
    if (!state) {
      state = { lastCompletedIso: null, hasUpcomingScheduled: false };
      byCenter.set(centerId, state);
    }
    if (isCompletedVisit(visit)) {
      // Las claves `yyyy-mm-dd` se ordenan alfabéticamente igual que en el tiempo.
      if (state.lastCompletedIso === null || dateIso > state.lastCompletedIso) {
        state.lastCompletedIso = dateIso;
      }
    } else if (visit.status === SCHEDULED_STATUS && dateIso >= todayIso) {
      state.hasUpcomingScheduled = true;
    }
  }
  return byCenter;
}

/**
 * Avisos activos de «toca llamar», ordenados por urgencia (lo más pasado de
 * fecha primero) y, a igualdad, por nombre.
 *
 * Reglas:
 * - Sólo centros activos y con `visit_frequency_weeks` válido.
 * - Sin ninguna visita completada no hay aviso: no hay desde cuándo contar.
 * - El aviso se enciende cuando faltan `leadDaysFor(...)` días o menos, y sigue
 *   encendido mientras la fecha esté pasada.
 * - Una visita «Programada» de hoy en adelante en ese centro apaga el aviso:
 *   es la forma natural de descartarlo, sin tabla nueva de avisos descartados.
 */
export function buildCallReminders(
  centers: readonly ReminderCenter[],
  visits: readonly ReminderVisit[],
  today: Date = new Date(),
  maxLeadDays: number = CALL_LEAD_DAYS,
): CallReminder[] {
  const todayIso = toIsoDate(today);
  const state = buildCenterVisitState(visits, todayIso);
  const reminders: CallReminder[] = [];

  for (const center of centers) {
    if (!center?.id) continue;
    if (center.is_active === false) continue;

    const frequencyWeeks = normalizeFrequencyWeeks(center.visit_frequency_weeks);
    if (frequencyWeeks === null) continue;

    const centerState = state.get(center.id);
    if (!centerState?.lastCompletedIso || centerState.hasUpcomingScheduled) continue;

    const lastVisitIso = centerState.lastCompletedIso;
    const dueIso = toIsoDate(addDays(fromIsoDate(lastVisitIso), frequencyWeeks * DAYS_PER_WEEK));
    const daysUntilDue = daysBetweenIso(todayIso, dueIso);
    if (!Number.isFinite(daysUntilDue)) continue;
    if (daysUntilDue > leadDaysFor(frequencyWeeks, maxLeadDays)) continue;

    const name = (center.name ?? "").trim();
    const phone = (center.contact_phone ?? "").trim();
    reminders.push({
      centerId: center.id,
      centerName: name === "" ? "Centro sin nombre" : name,
      contactPhone: phone === "" ? null : phone,
      frequencyWeeks,
      lastVisitIso,
      dueIso,
      daysUntilDue,
      overdue: daysUntilDue < 0,
      timingText: timingText(daysUntilDue),
    });
  }

  return reminders.sort(
    (a, b) => a.daysUntilDue - b.daysUntilDue || a.centerName.localeCompare(b.centerName, "es"),
  );
}

/**
 * Fecha con la que conviene precargar el formulario de nueva visita: la fecha
 * en la que toca, o hoy si ya se pasó (no tiene sentido programar en el pasado).
 */
export const suggestedScheduleIso = (reminder: CallReminder, today: Date = new Date()): string =>
  reminder.overdue ? toIsoDate(today) : reminder.dueIso;

/** Ruta al formulario de nueva visita con el centro y la fecha ya puestos. */
export const reminderSchedulePath = (reminder: CallReminder, today?: Date): string =>
  `/visita/nueva?centro=${encodeURIComponent(reminder.centerId)}&fecha=${suggestedScheduleIso(reminder, today)}`;

/**
 * Avisos que deben listarse en un mes del calendario.
 *
 * Los que caen dentro del mes, más —sólo si el mes visible es el que contiene
 * hoy— los que ya se pasaron: su fecha pertenece a un mes anterior y, sin esta
 * excepción, una llamada atrasada desaparecía justo del mes que se está
 * mirando.
 */
export function remindersInMonth(
  reminders: readonly CallReminder[],
  monthDayKeys: readonly string[],
  todayIso: string,
): CallReminder[] {
  const keys = new Set(monthDayKeys);
  const showsToday = keys.has(todayIso);
  return reminders.filter((reminder) => keys.has(reminder.dueIso) || (showsToday && reminder.overdue));
}

/** Índice por fecha `yyyy-mm-dd` en la que toca, para marcar el calendario. */
export function groupRemindersByDueDay(
  reminders: readonly CallReminder[],
): Map<string, CallReminder[]> {
  const byDay = new Map<string, CallReminder[]>();
  for (const reminder of reminders) {
    const list = byDay.get(reminder.dueIso);
    if (list) list.push(reminder);
    else byDay.set(reminder.dueIso, [reminder]);
  }
  return byDay;
}
