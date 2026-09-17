import { toIsoDate } from "@/lib/format";

/**
 * Estados que cuentan como "día trabajado": David registró actividad real.
 * Se usan tanto para la racha como para el progreso del día.
 */
export const COMPLETED_VISIT_STATUSES = ["Realizada", "Cobrada", "Facturada"] as const;

const COMPLETED = new Set<string>(COMPLETED_VISIT_STATUSES);

/** Forma mínima que necesitamos de una visita (las filas de Supabase encajan). */
export interface StreakVisit {
  visit_date?: string | null;
  status?: string | null;
}

export interface StreakInfo {
  /** Días consecutivos con al menos una visita completada. */
  days: number;
  /** `true` si hoy ya suma para la racha. */
  countsToday: boolean;
}

/** Tope defensivo: evita bucles largos con datos corruptos (≈10 años). */
const MAX_STREAK_DAYS = 3650;

export function isCompletedVisit(visit: StreakVisit): boolean {
  return !!visit.status && COMPLETED.has(visit.status);
}

/**
 * Racha de días consecutivos trabajados, contando hacia atrás desde hoy.
 * Si hoy todavía no hay actividad la racha no se rompe: se empieza a contar
 * desde ayer, de modo que el badge no penaliza a primera hora de la mañana.
 */
export function calculateStreak(visits: readonly StreakVisit[], today: Date = new Date()): StreakInfo {
  const activeDays = new Set<string>();
  for (const visit of visits) {
    if (!visit?.visit_date || !isCompletedVisit(visit)) continue;
    activeDays.add(visit.visit_date.slice(0, 10));
  }

  const countsToday = activeDays.has(toIsoDate(today));
  if (activeDays.size === 0) return { days: 0, countsToday: false };

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!countsToday) cursor.setDate(cursor.getDate() - 1);

  let days = 0;
  while (days < MAX_STREAK_DAYS && activeDays.has(toIsoDate(cursor))) {
    days += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { days, countsToday };
}
