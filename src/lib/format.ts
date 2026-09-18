export const formatEUR = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

/**
 * Importe abreviado para espacios muy estrechos (celdas del calendario en
 * móvil, donde no caben ni los decimales ni el separador de miles).
 * Usa espacio duro antes del € para que nunca parta de línea.
 */
export const formatEURCompact = (n: number) => {
  if (!Number.isFinite(n)) return `0\u00A0€`;
  if (Math.abs(n) >= 1000) {
    const thousands = (n / 1000).toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${thousands}k\u00A0€`;
  }
  return `${Math.round(n)}\u00A0€`;
};

export const formatDate = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

export const formatDateLong = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(date);
};

export const formatTime = (t: string) => t.slice(0, 5);

/**
 * Fecha en formato ISO `yyyy-mm-dd` usando el huso horario local.
 * `Date#toISOString()` convierte a UTC y en España (UTC+1/+2) adelanta el día
 * durante las últimas horas de la tarde/noche, lo que hacía que "Hoy" mostrase
 * las visitas de mañana. Las fechas de `visits.visit_date` son fechas locales.
 */
export const toIsoDate = (d: Date = new Date()) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Inversa de `toIsoDate`: `yyyy-mm-dd` → `Date` a medianoche **local**.
 * `new Date("2026-08-24")` la interpretaría en UTC, que en España es el día
 * anterior a las 22:00, con el consiguiente salto de día.
 */
export const fromIsoDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
