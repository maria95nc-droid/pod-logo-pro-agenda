import { describe, it, expect } from "vitest";
import { buildStreetAddress, clampPatientsCount, pluralPatients, quickVisitStatus } from "@/lib/quickEntry";

describe("buildStreetAddress", () => {
  it("une calle y número", () => {
    expect(buildStreetAddress("Calle Uría", "12")).toBe("Calle Uría, 12");
  });

  it("aguanta que falte una de las dos partes", () => {
    expect(buildStreetAddress("Calle Uría", "  ")).toBe("Calle Uría");
    expect(buildStreetAddress("", "12")).toBe("12");
    expect(buildStreetAddress("  ", "")).toBeNull();
  });
});

describe("clampPatientsCount", () => {
  it("nunca baja de un paciente ni se dispara", () => {
    expect(clampPatientsCount(0)).toBe(1);
    expect(clampPatientsCount(-4)).toBe(1);
    expect(clampPatientsCount(6)).toBe(6);
    expect(clampPatientsCount(5.4)).toBe(5);
    expect(clampPatientsCount(1000)).toBe(99);
    expect(clampPatientsCount(Number.NaN)).toBe(1);
  });
});

describe("quickVisitStatus", () => {
  const today = "2026-09-17";

  it("deja pendiente de cobro lo ya trabajado con importe", () => {
    expect(quickVisitStatus(today, 90, today)).toBe("Pendiente de cobro");
    expect(quickVisitStatus("2026-09-10", 90, today)).toBe("Pendiente de cobro");
  });

  it("marca como realizada si no hay importe que cobrar", () => {
    expect(quickVisitStatus(today, 0, today)).toBe("Realizada");
  });

  it("programa las visitas futuras", () => {
    expect(quickVisitStatus("2026-09-18", 90, today)).toBe("Programada");
  });
});

describe("pluralPatients", () => {
  it("concuerda en singular y plural", () => {
    expect(pluralPatients(1)).toBe("1 paciente");
    expect(pluralPatients(6)).toBe("6 pacientes");
  });
});
