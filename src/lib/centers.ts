/**
 * Índice de centros para las vistas que necesitan saber **de dónde sale** cada
 * visita: nombre, si es un domicilio particular o una residencia/centro, y la
 * forma de cobro habitual.
 *
 * Existe porque Agenda, Finanzas y el detalle de ingresos resolvían el centro
 * con `centers.find((c) => c.id === visit.center_id)` dentro del render: O(n·m)
 * y, sobre todo, tres criterios distintos para el caso «sin centro».
 */

import { isCompletedVisit } from "@/lib/streak";

/** Forma mínima de una fila de `centers` (las filas de Supabase encajan). */
export interface CenterRow {
  id: string;
  name?: string | null;
  type?: string | null;
  city?: string | null;
  payment_method?: string | null;
  default_income_type?: string | null;
}

export interface CenterInfo {
  id: string | null;
  name: string;
  /** Tipo tal cual está en la base (`Residencia`, `Domicilio`…). */
  type: string;
  /** Un domicilio particular: se distingue visualmente de una residencia. */
  isHome: boolean;
  city: string | null;
  /** Forma de cobro habitual del centro, cuando la visita no tiene desglose. */
  paymentMethod: string | null;
  /**
   * Quién paga habitualmente aquí, tal cual está en la base (`Empresa`,
   * `Particular` o `null`). Se valida con `normalizeIncomeType()` en quien lo
   * usa: este módulo no depende del cálculo fiscal para no crear un ciclo.
   * Sólo sirve para **precargar** la pregunta, nunca para decidirla.
   */
  defaultIncomeType: string | null;
}

export const HOME_CENTER_TYPE = "Domicilio";
export const UNKNOWN_CENTER_NAME = "Sin centro";

/** Un domicilio es un `center` de tipo `Domicilio` cuyo nombre es el del paciente. */
export const isHomeType = (type?: string | null): boolean => (type ?? "").trim() === HOME_CENTER_TYPE;

/**
 * Centros «cajón» que en la contabilidad de David son domicilios aunque no
 * tengan el tipo `Domicilio` (p. ej. «Domicilios y consulta particular», que
 * agrupa varias visitas a casas en una sola línea).
 */
const HOME_NAME_PATTERN = /domicilio/i;

/**
 * ¿Cuenta como domicilio para los recuentos de «visitas a casa»?
 *
 * Se mira el tipo **y** el nombre: si sólo se mirase el tipo, el cajón de la
 * contabilidad quedaría fuera del seguimiento de domicilios y el número que se
 * le muestra a David sería más bajo que el real, sin que nada lo avisase.
 * El icono de casa de `CenterLabel` sigue usando `isHome` (el tipo real).
 */
export const isHomeLikeCenter = (center: Pick<CenterInfo, "type" | "name">): boolean =>
  isHomeType(center.type) || HOME_NAME_PATTERN.test(center.name);

/** Centro de reserva para visitas sin `center_id` o con un centro ya borrado. */
export const UNKNOWN_CENTER: Readonly<CenterInfo> = Object.freeze({
  id: null,
  name: UNKNOWN_CENTER_NAME,
  type: "",
  isHome: false,
  city: null,
  paymentMethod: null,
  defaultIncomeType: null,
});

const clean = (value?: string | null): string | null => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

/** Forma mínima de una fila de `visits` para contar visitas por centro. */
export interface CenterVisitRow {
  center_id?: string | null;
  status?: string | null;
}

/**
 * Veces que David ha ido de verdad a un centro.
 *
 * Sólo cuentan las visitas en un estado de «hecha» (`isCompletedVisit`): una
 * visita programada para la semana que viene o una cancelada no es una visita
 * hecha, y el dato se le muestra como «veces que he ido».
 */
export function countCompletedVisits(
  visits: readonly CenterVisitRow[],
  centerId?: string | null,
): number {
  if (!centerId) return 0;
  let total = 0;
  for (const visit of visits) {
    if (visit?.center_id === centerId && isCompletedVisit(visit)) total += 1;
  }
  return total;
}

export function buildCenterIndex(centers: readonly CenterRow[]): Map<string, CenterInfo> {
  const index = new Map<string, CenterInfo>();
  for (const center of centers) {
    if (!center?.id) continue;
    const type = clean(center.type) ?? "";
    index.set(center.id, {
      id: center.id,
      name: clean(center.name) ?? UNKNOWN_CENTER_NAME,
      type,
      isHome: isHomeType(type),
      city: clean(center.city),
      paymentMethod: clean(center.payment_method),
      defaultIncomeType: clean(center.default_income_type),
    });
  }
  return index;
}

/** Nunca devuelve `undefined`: sin centro conocido se usa `UNKNOWN_CENTER`. */
export function centerInfo(
  index: ReadonlyMap<string, CenterInfo>,
  centerId?: string | null,
): CenterInfo {
  return (centerId && index.get(centerId)) || UNKNOWN_CENTER;
}
