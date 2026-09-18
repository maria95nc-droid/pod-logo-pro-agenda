/**
 * Índice de centros para las vistas que necesitan saber **de dónde sale** cada
 * visita: nombre, si es un domicilio particular o una residencia/centro, y la
 * forma de cobro habitual.
 *
 * Existe porque Agenda, Finanzas y el detalle de ingresos resolvían el centro
 * con `centers.find((c) => c.id === visit.center_id)` dentro del render: O(n·m)
 * y, sobre todo, tres criterios distintos para el caso «sin centro».
 */

/** Forma mínima de una fila de `centers` (las filas de Supabase encajan). */
export interface CenterRow {
  id: string;
  name?: string | null;
  type?: string | null;
  city?: string | null;
  payment_method?: string | null;
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
}

export const HOME_CENTER_TYPE = "Domicilio";
export const UNKNOWN_CENTER_NAME = "Sin centro";

/** Un domicilio es un `center` de tipo `Domicilio` cuyo nombre es el del paciente. */
export const isHomeType = (type?: string | null): boolean => (type ?? "").trim() === HOME_CENTER_TYPE;

/** Centro de reserva para visitas sin `center_id` o con un centro ya borrado. */
export const UNKNOWN_CENTER: Readonly<CenterInfo> = Object.freeze({
  id: null,
  name: UNKNOWN_CENTER_NAME,
  type: "",
  isHome: false,
  city: null,
  paymentMethod: null,
});

const clean = (value?: string | null): string | null => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

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
