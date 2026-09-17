import { describe, it, expect } from "vitest";
import {
  attendedPatientsCount,
  distributeLines,
  isVisitSettled,
  linesTotal,
  normalizeLines,
  parsePaymentBreakdown,
  roundCents,
  statusAfterDone,
  visitTotal,
} from "@/lib/payments";

describe("visitTotal", () => {
  it("suma el detalle por paciente cuando existe", () => {
    expect(visitTotal({ gross_amount: 999, visit_patients: [{ price_charged: 18 }, { price_charged: 17 }] })).toBe(35);
  });

  it("usa el bruto agregado si no hay detalle", () => {
    expect(visitTotal({ gross_amount: "90.00", visit_patients: [] })).toBe(90);
    expect(visitTotal({ gross_amount: 90 })).toBe(90);
  });

  it("tolera importes nulos o corruptos", () => {
    expect(visitTotal({ gross_amount: null })).toBe(0);
    expect(visitTotal({ visit_patients: [{ price_charged: "x" }] })).toBe(0);
  });
});

describe("statusAfterDone", () => {
  it("deja la visita pendiente de cobro si queda dinero por cobrar", () => {
    expect(statusAfterDone({ status: "Programada", gross_amount: 90 })).toBe("Pendiente de cobro");
    expect(
      statusAfterDone({
        status: "Programada",
        visit_patients: [{ price_charged: 18, payment_status: "Pendiente" }],
      }),
    ).toBe("Pendiente de cobro");
  });

  it("la cierra como cobrada si todos los pacientes ya están saldados", () => {
    expect(
      statusAfterDone({
        status: "Programada",
        visit_patients: [
          { price_charged: 18, payment_status: "Cobrado" },
          { price_charged: 18, payment_status: "Incluido en factura" },
        ],
      }),
    ).toBe("Cobrada");
  });

  it("es sólo Realizada cuando no hay importe que cobrar", () => {
    expect(statusAfterDone({ status: "Programada", gross_amount: 0 })).toBe("Realizada");
  });

  it("no degrada una visita ya cobrada o facturada", () => {
    expect(statusAfterDone({ status: "Cobrada", gross_amount: 90 })).toBe("Cobrada");
    expect(statusAfterDone({ status: "Facturada", gross_amount: 90 })).toBe("Facturada");
  });
});

describe("isVisitSettled", () => {
  it("distingue lo cobrado de lo pendiente", () => {
    expect(isVisitSettled({ status: "Cobrada", gross_amount: 90 })).toBe(true);
    expect(isVisitSettled({ status: "Pendiente de cobro", gross_amount: 90 })).toBe(false);
    expect(isVisitSettled({ status: "Realizada", gross_amount: 0 })).toBe(true);
    expect(
      isVisitSettled({ status: "Realizada", visit_patients: [{ price_charged: 18, payment_status: "No cobra" }] }),
    ).toBe(true);
  });
});

describe("attendedPatientsCount", () => {
  it("usa patients_count en los registros rápidos (una sola fila agregada)", () => {
    expect(
      attendedPatientsCount({
        patients_count: 6,
        visit_patients: [{ patient_id: null, price_charged: 108, attended: true }],
      }),
    ).toBe(6);
  });

  it("cuenta las filas reales cuando hay detalle por paciente", () => {
    expect(
      attendedPatientsCount({
        patients_count: 3,
        visit_patients: [
          { patient_id: "a", attended: true },
          { patient_id: "b", attended: true },
          { patient_id: "c", attended: false },
        ],
      }),
    ).toBe(2);
  });

  it("cae en patients_count si no hay filas", () => {
    expect(attendedPatientsCount({ patients_count: 4 })).toBe(4);
  });
});

describe("normalizeLines / linesTotal", () => {
  it("descarta líneas sin método o sin importe", () => {
    expect(
      normalizeLines([
        { method: "Efectivo", amount: 20 },
        { method: "  ", amount: 10 },
        { method: "Bizum", amount: 0 },
      ]),
    ).toEqual([{ method: "Efectivo", amount: 20 }]);
  });

  it("suma con precisión de céntimos", () => {
    expect(linesTotal([{ method: "a", amount: 0.1 }, { method: "b", amount: 0.2 }])).toBe(0.3);
  });
});

describe("distributeLines", () => {
  it("con un solo paciente entrega el desglose íntegro", () => {
    const out = distributeLines([{ method: "Efectivo", amount: 20 }, { method: "Bizum", amount: 15 }], [35]);
    expect(out).toEqual([[{ method: "Efectivo", amount: 20 }, { method: "Bizum", amount: 15 }]]);
  });

  it("reparte proporcionalmente y cuadra el total", () => {
    const amounts = [20, 10, 5];
    const out = distributeLines([{ method: "Efectivo", amount: 21 }, { method: "Bizum", amount: 14 }], amounts);
    const perPatient = out.map((lines) => linesTotal(lines));
    expect(roundCents(perPatient.reduce((s, n) => s + n, 0))).toBe(35);
    expect(perPatient[0]).toBeCloseTo(20, 2);
    expect(perPatient[1]).toBeCloseTo(10, 2);
    expect(perPatient[2]).toBeCloseTo(5, 2);
  });

  it("no pierde céntimos con importes que no dividen exacto", () => {
    const out = distributeLines([{ method: "Efectivo", amount: 10 }], [1, 1, 1]);
    expect(roundCents(out.reduce((s, lines) => s + linesTotal(lines), 0))).toBe(10);
  });

  it("reparte a partes iguales si no hay importes de referencia", () => {
    const out = distributeLines([{ method: "Efectivo", amount: 10 }], [0, 0]);
    expect(out.map((lines) => linesTotal(lines))).toEqual([5, 5]);
  });

  it("devuelve listas vacías si no hay líneas válidas", () => {
    expect(distributeLines([], [10, 10])).toEqual([[], []]);
  });
});

describe("parsePaymentBreakdown", () => {
  it("lee un desglose válido", () => {
    expect(parsePaymentBreakdown([{ method: "Efectivo", amount: 20 }, { method: "Bizum", amount: "15" }])).toEqual([
      { method: "Efectivo", amount: 20 },
      { method: "Bizum", amount: 15 },
    ]);
  });

  it("ignora basura", () => {
    expect(parsePaymentBreakdown(null)).toBeNull();
    expect(parsePaymentBreakdown("Efectivo")).toBeNull();
    expect(parsePaymentBreakdown([{ method: "", amount: 5 }, { amount: 5 }, null])).toBeNull();
  });
});
