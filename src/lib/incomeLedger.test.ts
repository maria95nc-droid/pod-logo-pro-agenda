import { describe, it, expect } from "vitest";
import { buildCenterIndex } from "@/lib/centers";
import {
  EMPTY_FILTERS,
  buildLedgerEntries,
  centerOptions,
  collectPayments,
  filterLedger,
  groupByMonth,
  ledgerTotals,
  monthOptions,
  pricePerPatientOf,
  splitAmountsOf,
  type LedgerVisit,
} from "@/lib/incomeLedger";

const centers = buildCenterIndex([
  { id: "pravia", name: "Residencia Pravia", type: "Residencia", payment_method: "Transferencia bancaria" },
  { id: "grao", name: "Residencia El Grao", type: "Residencia", payment_method: "A través de empresa gestora (Eulen)" },
  { id: "casa", name: "María Fernández", type: "Domicilio", city: "Oviedo", payment_method: "Efectivo" },
]);

const visit = (overrides: Partial<LedgerVisit> & Pick<LedgerVisit, "id" | "visit_date">): LedgerVisit => ({
  status: "Cobrada",
  gross_amount: 84,
  patients_count: 6,
  center_id: "pravia",
  start_time: "09:00:00",
  ...overrides,
});

describe("buildLedgerEntries", () => {
  it("resuelve el centro de cada visita y distingue el domicilio", () => {
    const [home, residence] = buildLedgerEntries(
      [
        visit({ id: "1", visit_date: "2026-07-01" }),
        visit({ id: "2", visit_date: "2026-07-02", center_id: "casa", patients_count: 1, gross_amount: 25 }),
      ],
      centers,
    );

    expect(home.center.name).toBe("María Fernández");
    expect(home.center.isHome).toBe(true);
    expect(residence.center.name).toBe("Residencia Pravia");
    expect(residence.center.isHome).toBe(false);
  });

  it("ordena del movimiento más reciente al más antiguo", () => {
    const entries = buildLedgerEntries(
      [
        visit({ id: "a", visit_date: "2026-06-10", start_time: "09:00" }),
        visit({ id: "c", visit_date: "2026-08-03", start_time: "10:00" }),
        visit({ id: "b", visit_date: "2026-08-03", start_time: "16:00" }),
      ],
      centers,
    );
    expect(entries.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("usa un centro de reserva cuando la visita no tiene centro", () => {
    const [entry] = buildLedgerEntries([visit({ id: "1", visit_date: "2026-07-01", center_id: null })], centers);
    expect(entry.center.name).toBe("Sin centro");
    expect(entry.center.id).toBeNull();
  });

  it("marca como pendiente de facturar la visita trabajada sin importe", () => {
    const [entry] = buildLedgerEntries(
      [
        visit({
          id: "agosto",
          visit_date: "2026-08-12",
          status: "Realizada",
          gross_amount: 0,
          patients_count: 0,
          center_id: "grao",
          general_notes: "PENDIENTE: completar nº de pacientes e importe",
        }),
      ],
      centers,
    );

    expect(entry.unbilled).toBe(true);
    expect(entry.gross).toBe(0);
    // No se inventa un paciente: la gestora todavía no ha confirmado cuántos fueron.
    expect(entry.patients).toBe(0);
    expect(entry.pricePerPatient).toBeNull();
    expect(entry.note).toContain("PENDIENTE");
    expect(entry.fallbackMethod).toBe("A través de empresa gestora (Eulen)");
  });

  it("no cuenta como deuda una visita cancelada", () => {
    const [entry] = buildLedgerEntries(
      [visit({ id: "1", visit_date: "2026-07-01", status: "Cancelada", gross_amount: 84 })],
      centers,
    );
    expect(entry.cancelled).toBe(true);
    expect(entry.pending).toBe(0);
    expect(entry.unbilled).toBe(false);
  });

  it("toma el importe de visit_patients cuando hay detalle, igual que Finanzas", () => {
    const [entry] = buildLedgerEntries(
      [
        visit({
          id: "1",
          visit_date: "2026-07-01",
          gross_amount: 999,
          visit_patients: [
            { id: "a", patient_id: "p1", price_charged: 14, payment_status: "Cobrado" },
            { id: "b", patient_id: "p2", price_charged: 14, payment_status: "Pendiente" },
          ],
          status: "Pendiente de cobro",
          patients_count: 2,
        }),
      ],
      centers,
    );
    expect(entry.gross).toBe(28);
    expect(entry.settled).toBe(14);
    expect(entry.pending).toBe(14);
  });
});

describe("pricePerPatientOf", () => {
  it("usa el precio fijado cuando todos los pacientes pagan lo mismo", () => {
    expect(
      pricePerPatientOf(
        [
          { id: "a", patient_id: "p1", price_charged: 14 },
          { id: "b", patient_id: "p2", price_charged: 14 },
        ],
        28,
        2,
      ),
    ).toEqual({ price: 14, isAverage: false });
  });

  it("deduce una media cuando los precios no coinciden", () => {
    const result = pricePerPatientOf(
      [
        { id: "a", patient_id: "p1", price_charged: 14 },
        { id: "b", patient_id: "p2", price_charged: 20 },
      ],
      34,
      2,
    );
    expect(result).toEqual({ price: 17, isAverage: true });
  });

  it("deduce el precio exacto de la fila agregada de un registro rápido", () => {
    // 84 € entre 6 pacientes cuadra: el registro rápido guarda precio × nº.
    expect(pricePerPatientOf([{ id: "a", patient_id: null, price_charged: 84 }], 84, 6)).toEqual({
      price: 14,
      isAverage: false,
    });
  });

  it("marca como media el reparto de un agregado que no cuadra", () => {
    expect(pricePerPatientOf([{ id: "a", patient_id: null, price_charged: 100 }], 100, 3)).toEqual({
      price: 33.33,
      isAverage: true,
    });
  });

  it("no inventa precio sin pacientes ni importe", () => {
    expect(pricePerPatientOf([], 0, 0)).toEqual({ price: null, isAverage: false });
  });
});

describe("collectPayments", () => {
  it("agrupa por forma de pago sumando los importes de cada paciente", () => {
    expect(
      collectPayments([
        { id: "a", payment_breakdown: [{ method: "Efectivo", amount: 10 }, { method: "Bizum", amount: 4 }] },
        { id: "b", payment_breakdown: [{ method: "Efectivo", amount: 10 }] },
      ]),
    ).toEqual([
      { method: "Efectivo", amount: 20 },
      { method: "Bizum", amount: 4 },
    ]);
  });

  it("ignora desgloses corruptos", () => {
    expect(collectPayments([{ id: "a", payment_breakdown: "nada" }])).toEqual([]);
  });
});

describe("splitAmountsOf", () => {
  it("da por cobrado todo el importe de una visita cerrada", () => {
    expect(splitAmountsOf("Cobrada", [], 84)).toEqual({ collected: 84, waived: 0 });
    expect(splitAmountsOf("Facturada", [], 84)).toEqual({ collected: 84, waived: 0 });
  });

  it("separa lo cobrado de lo condonado y deja el resto pendiente", () => {
    const vps = [
      { id: "a", price_charged: 14, payment_status: "Cobrado" },
      { id: "b", price_charged: 14, payment_status: "Pendiente" },
      { id: "c", price_charged: 14, payment_status: "No cobra" },
    ];
    // «No cobra» no es dinero cobrado: si lo fuese, el total de ingresos mentiría.
    expect(splitAmountsOf("Pendiente de cobro", vps, 42)).toEqual({ collected: 14, waived: 14 });
  });

  it("cuenta «Incluido en factura» como cobrado", () => {
    expect(
      splitAmountsOf("Pendiente de cobro", [{ id: "a", price_charged: 30, payment_status: "Incluido en factura" }], 30),
    ).toEqual({ collected: 30, waived: 0 });
  });

  it("nunca supera el importe de la visita", () => {
    expect(splitAmountsOf("Pendiente de cobro", [{ id: "a", price_charged: 999, payment_status: "Cobrado" }], 42)).toEqual(
      { collected: 42, waived: 0 },
    );
  });
});

describe("importes negativos", () => {
  it("una devolución no es «pendiente de facturar»", () => {
    // Las devoluciones se apuntan con importe negativo: pintarlas como trabajo
    // sin facturar escondería el dinero que sale.
    const [entry] = buildLedgerEntries([visit({ id: "devolucion", visit_date: "2026-09-20", gross_amount: -30 })], centers);
    expect(entry.gross).toBe(-30);
    expect(entry.unbilled).toBe(false);
  });

  it("el 0 sí es trabajo todavía sin importe", () => {
    const [entry] = buildLedgerEntries(
      [visit({ id: "sin-importe", visit_date: "2026-09-20", status: "Realizada", gross_amount: 0 })],
      centers,
    );
    expect(entry.unbilled).toBe(true);
  });
});

describe("filterLedger", () => {
  const entries = buildLedgerEntries(
    [
      visit({ id: "cobrada", visit_date: "2026-07-01", status: "Cobrada", gross_amount: 84 }),
      visit({ id: "pendiente", visit_date: "2026-07-02", status: "Pendiente de cobro", gross_amount: 60 }),
      visit({ id: "sin-importe", visit_date: "2026-08-03", status: "Realizada", gross_amount: 0, center_id: "grao" }),
      visit({ id: "domicilio", visit_date: "2026-08-04", status: "Cobrada", gross_amount: 25, center_id: "casa" }),
    ],
    centers,
  );

  it("filtra por mes", () => {
    expect(filterLedger(entries, { ...EMPTY_FILTERS, month: "2026-08" }).map((e) => e.id)).toEqual([
      "domicilio",
      "sin-importe",
    ]);
  });

  it("filtra por centro y por domicilios", () => {
    expect(filterLedger(entries, { ...EMPTY_FILTERS, centerId: "grao" }).map((e) => e.id)).toEqual([
      "sin-importe",
    ]);
    expect(filterLedger(entries, { ...EMPTY_FILTERS, centerId: "home" }).map((e) => e.id)).toEqual([
      "domicilio",
    ]);
  });

  it("separa lo pendiente de cobro de lo pendiente de facturar", () => {
    expect(filterLedger(entries, { ...EMPTY_FILTERS, state: "pending" }).map((e) => e.id)).toEqual([
      "pendiente",
    ]);
    expect(filterLedger(entries, { ...EMPTY_FILTERS, state: "unbilled" }).map((e) => e.id)).toEqual([
      "sin-importe",
    ]);
    expect(filterLedger(entries, { ...EMPTY_FILTERS, state: "settled" }).map((e) => e.id)).toEqual([
      "domicilio",
      "cobrada",
    ]);
  });
});

describe("ledgerTotals / groupByMonth / opciones", () => {
  const entries = buildLedgerEntries(
    [
      visit({ id: "1", visit_date: "2026-07-01", status: "Cobrada", gross_amount: 84, patients_count: 6 }),
      visit({ id: "2", visit_date: "2026-07-02", status: "Pendiente de cobro", gross_amount: 60, patients_count: 4 }),
      visit({ id: "3", visit_date: "2026-08-03", status: "Realizada", gross_amount: 0, patients_count: 0, center_id: "grao" }),
      visit({ id: "4", visit_date: "2026-08-04", status: "Cancelada", gross_amount: 30, patients_count: 2, center_id: "casa" }),
    ],
    centers,
  );

  it("suma bruto, cobrado y pendiente dejando fuera las canceladas", () => {
    expect(ledgerTotals(entries)).toEqual({
      visits: 4,
      patients: 10,
      gross: 144,
      settled: 84,
      waived: 0,
      pending: 60,
      unbilled: 1,
      cancelled: 1,
      centers: 3,
    });
  });

  it("deja el importe condonado fuera de cobrado y de pendiente", () => {
    const withWaived = buildLedgerEntries(
      [
        visit({
          id: "w",
          visit_date: "2026-07-05",
          status: "Pendiente de cobro",
          patients_count: 2,
          visit_patients: [
            { id: "a", patient_id: "p1", price_charged: 14, payment_status: "Cobrado" },
            { id: "b", patient_id: "p2", price_charged: 14, payment_status: "No cobra" },
          ],
        }),
      ],
      centers,
    );
    const totals = ledgerTotals(withWaived);
    expect(totals.gross).toBe(28);
    expect(totals.settled).toBe(14);
    expect(totals.waived).toBe(14);
    expect(totals.pending).toBe(0);
  });

  it("agrupa por mes conservando el orden descendente", () => {
    const groups = groupByMonth(entries);
    expect(groups.map((g) => g.month)).toEqual(["2026-08", "2026-07"]);
    expect(groups[0].label).toBe("Agosto 2026");
    expect(groups[1].totals.gross).toBe(144);
  });

  it("ofrece los meses y centros con movimientos", () => {
    expect(monthOptions(entries)).toEqual([
      { value: "2026-08", label: "Agosto 2026" },
      { value: "2026-07", label: "Julio 2026" },
    ]);
    expect(centerOptions(entries).map((c) => c.label)).toEqual([
      "María Fernández",
      "Residencia El Grao",
      "Residencia Pravia",
    ]);
  });
});
