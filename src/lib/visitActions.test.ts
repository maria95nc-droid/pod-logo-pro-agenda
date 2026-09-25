import { describe, it, expect } from "vitest";
import { effectiveIrpf } from "@/lib/visitActions";

/**
 * La retención que se **guarda** en la visita al clasificarla. Es la otra mitad
 * del cálculo fiscal: si aquí se guardase un 0 % silencioso o se redondease un
 * porcentaje real, las cuentas de `fiscalCalculations` partirían de un dato malo.
 */
describe("effectiveIrpf", () => {
  it("quien paga decide: el particular nunca lleva retención", () => {
    expect(effectiveIrpf({ incomeType: "Particular", irpfPercentage: 15 })).toBe(0);
    expect(effectiveIrpf({ incomeType: null, irpfPercentage: 15 })).toBe(0);
  });

  it("la entidad retiene lo que se indique", () => {
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: 15 })).toBe(15);
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: 7 })).toBe(7);
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: 0 })).toBe(0);
    // No se redondea: 7,125 % es un porcentaje legítimo.
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: 7.125 })).toBe(7.125);
  });

  it("sin porcentaje utilizable aplica el 15 %, nunca un 0 % silencioso", () => {
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: null })).toBe(15);
    expect(effectiveIrpf({ incomeType: "Empresa" })).toBe(15);
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: Number.NaN })).toBe(15);
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: -1 })).toBe(15);
    expect(effectiveIrpf({ incomeType: "Empresa", irpfPercentage: 120 })).toBe(15);
  });
});
