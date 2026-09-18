import { toIsoDate } from "@/lib/format";

/** Semana española: empieza en lunes. */
export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/**
 * «2026-08» → «Agosto 2026». Trabaja sobre la cadena, nunca sobre un `Date`:
 * `new Date("2026-08")` se interpreta en UTC y podría cambiar de mes.
 */
export const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-");
  const index = Number(month) - 1;
  if (!year || !Number.isInteger(index) || index < 0 || index > 11) return monthKey;
  return `${MONTHS[index]} ${year}`;
};

/** Índice 0-6 con el lunes en 0. */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - weekdayIndex(x));
  return x;
};

/** Rejilla fija de 6×7 celdas que contiene el mes indicado. */
export const monthGrid = (year: number, month: number) => {
  const start = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};

/** Claves `yyyy-mm-dd` locales de una lista de fechas (nunca `toISOString`). */
export const isoKeys = (days: readonly Date[]) => days.map((d) => toIsoDate(d));

/** Minutos desde medianoche de una hora `HH:mm[:ss]`; `null` si no es válida. */
export const minutesOfTime = (time?: string | null): number | null => {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};
