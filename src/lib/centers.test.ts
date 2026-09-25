import { describe, it, expect } from "vitest";
import {
  buildCenterIndex,
  centerInfo,
  countCompletedVisits,
  isHomeLikeCenter,
  type CenterVisitRow,
} from "@/lib/centers";

const visit = (center_id: string | null, status: string): CenterVisitRow => ({ center_id, status });

describe("countCompletedVisits", () => {
  const visits: CenterVisitRow[] = [
    visit("c1", "Realizada"),
    visit("c1", "Pendiente de cobro"),
    visit("c1", "Cobrada"),
    visit("c1", "Facturada"),
    // Ni programadas ni canceladas: a esas no ha ido.
    visit("c1", "Programada"),
    visit("c1", "Cancelada"),
    visit("c2", "Realizada"),
    visit(null, "Realizada"),
  ];

  it("cuenta sólo las visitas ya hechas de ese centro", () => {
    expect(countCompletedVisits(visits, "c1")).toBe(4);
    expect(countCompletedVisits(visits, "c2")).toBe(1);
  });

  it("devuelve 0 en un centro nuevo, sin id o desconocido", () => {
    expect(countCompletedVisits(visits, undefined)).toBe(0);
    expect(countCompletedVisits(visits, null)).toBe(0);
    expect(countCompletedVisits(visits, "")).toBe(0);
    expect(countCompletedVisits(visits, "c-nuevo")).toBe(0);
    expect(countCompletedVisits([], "c1")).toBe(0);
  });

  it("no se rompe con filas incompletas", () => {
    const sucias = [undefined, null, {}, { center_id: "c1" }, { status: "Realizada" }] as CenterVisitRow[];
    expect(countCompletedVisits(sucias, "c1")).toBe(0);
  });
});

describe("isHomeLikeCenter", () => {
  it("cuenta como domicilio el tipo Domicilio", () => {
    expect(isHomeLikeCenter({ type: "Domicilio", name: "María Fernández" })).toBe(true);
  });

  it("cuenta también el cajón de la contabilidad, que no tiene ese tipo", () => {
    expect(isHomeLikeCenter({ type: "Otro", name: "Domicilios y consulta particular" })).toBe(true);
    expect(isHomeLikeCenter({ type: "Residencia", name: "domicilios varios" })).toBe(true);
  });

  it("no cuenta una residencia ni el centro de reserva", () => {
    expect(isHomeLikeCenter({ type: "Residencia", name: "Residencia Pravia" })).toBe(false);
    expect(isHomeLikeCenter({ type: "", name: "Sin centro" })).toBe(false);
  });
});

describe("buildCenterIndex", () => {
  const index = buildCenterIndex([
    { id: "c1", name: " Residencia Pravia ", type: "Residencia", default_income_type: "Empresa" },
    { id: "c2", name: "María", type: "Domicilio", default_income_type: "" },
  ]);

  it("guarda quién paga habitualmente tal cual, sin interpretarlo", () => {
    expect(index.get("c1")?.defaultIncomeType).toBe("Empresa");
    // Cadena vacía = no hay respuesta habitual, no un valor por defecto.
    expect(index.get("c2")?.defaultIncomeType).toBeNull();
  });

  it("el centro de reserva nunca trae un pagador por defecto", () => {
    expect(centerInfo(index, "no-existe").defaultIncomeType).toBeNull();
    expect(centerInfo(index, null).defaultIncomeType).toBeNull();
  });
});
