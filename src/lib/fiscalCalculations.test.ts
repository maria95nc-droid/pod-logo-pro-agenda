import { describe, it, expect } from "vitest";
import { buildCenterIndex } from "@/lib/centers";
import { fromIsoDate } from "@/lib/format";
import {
  CONSERVATIVE_IRPF_RATE,
  DEFAULT_EMPRESA_IRPF,
  RENTA_BUFFER_RATE,
  buildModelo130Reminders,
  cashInHand,
  centerPriceHistory,
  collectInvoiceNumbers,
  currentQuarter,
  dominantInvoiceSeries,
  empresaInvoiceState,
  empresaIrpfPercentage,
  filingWindow,
  firstDeclaredVisitIso,
  fiscalTotals,
  formatInvoiceNumber,
  homeVisitsSummary,
  isCashMethod,
  isDeclarableVisit,
  lastDayOfMonth,
  missingPreviousInvoice,
  modelo130Level,
  modelo130Snapshot,
  monthRange,
  normalizeIncomeType,
  parseInvoiceNumber,
  previousQuarter,
  priceAnomaly,
  quarterOfIso,
  quarterOfMonth,
  quarterRange,
  quarterSnapshot,
  retentionFor,
  unusualInvoiceFormat,
  visitsInRange,
  withoutRetentionPercent,
  yearToQuarterRange,
  type FiscalVisit,
  type Quarter,
} from "@/lib/fiscalCalculations";

/**
 * Estos cálculos deciden cuánto dinero aparta David para Hacienda, así que las
 * pruebas cubren a propósito los casos límite y no sólo el camino feliz: cero
 * visitas, un solo tipo de pagador, retenciones distintas del 15 %, visitas sin
 * clasificar, trimestres a caballo del inicio de actividad y los bordes exactos
 * del 25 % y del 30 %.
 */

let autoId = 0;

/** Visita declarable (ya hecha) con lo mínimo; `overrides` manda. */
const visit = (overrides: Partial<FiscalVisit> = {}): FiscalVisit => ({
  id: `v${(autoId += 1)}`,
  visit_date: "2026-08-10",
  status: "Cobrada",
  gross_amount: 100,
  patients_count: 5,
  center_id: "pravia",
  income_type: "Empresa",
  irpf_percentage: DEFAULT_EMPRESA_IRPF,
  ...overrides,
});

const centers = buildCenterIndex([
  { id: "pravia", name: "Residencia Pravia", type: "Residencia", payment_method: "Transferencia bancaria" },
  { id: "casa", name: "María Fernández", type: "Domicilio", city: "Oviedo", payment_method: "Efectivo" },
  // Cajón de la contabilidad real: no es de tipo Domicilio pero lo es.
  { id: "cajon", name: "Domicilios y consulta particular", type: "Otro", payment_method: "Efectivo" },
  { id: "efectivo-raro", name: "Centro Trubia", type: "Residencia", payment_method: "efectivo en mano" },
]);

// ── Clasificación ────────────────────────────────────────────────────────────

describe("normalizeIncomeType", () => {
  it("acepta sólo los dos valores del dominio", () => {
    expect(normalizeIncomeType("Empresa")).toBe("Empresa");
    expect(normalizeIncomeType("Particular")).toBe("Particular");
    expect(normalizeIncomeType(" Empresa ")).toBe("Empresa");
  });

  it("todo lo demás es «sin clasificar», nunca un valor por defecto", () => {
    expect(normalizeIncomeType(null)).toBeNull();
    expect(normalizeIncomeType(undefined)).toBeNull();
    expect(normalizeIncomeType("")).toBeNull();
    expect(normalizeIncomeType("empresa")).toBeNull();
    expect(normalizeIncomeType("EMPRESA")).toBeNull();
    expect(normalizeIncomeType("Caja")).toBeNull();
    expect(normalizeIncomeType(15)).toBeNull();
  });
});

describe("empresaIrpfPercentage", () => {
  it("usa el porcentaje de la propia visita cuando es válido", () => {
    expect(empresaIrpfPercentage(visit({ irpf_percentage: 7 }))).toBe(7);
    expect(empresaIrpfPercentage(visit({ irpf_percentage: 0 }))).toBe(0);
    expect(empresaIrpfPercentage(visit({ irpf_percentage: 100 }))).toBe(100);
    // `numeric` de Postgres puede llegar como cadena.
    expect(empresaIrpfPercentage(visit({ irpf_percentage: "20" }))).toBe(20);
  });

  it("cae al 15 % sólo cuando el dato no sirve", () => {
    expect(empresaIrpfPercentage(visit({ irpf_percentage: null }))).toBe(15);
    expect(empresaIrpfPercentage(visit({ irpf_percentage: undefined }))).toBe(15);
    expect(empresaIrpfPercentage(visit({ irpf_percentage: "" }))).toBe(15);
    expect(empresaIrpfPercentage(visit({ irpf_percentage: "quince" }))).toBe(15);
    expect(empresaIrpfPercentage(visit({ irpf_percentage: -5 }))).toBe(15);
    expect(empresaIrpfPercentage(visit({ irpf_percentage: 150 }))).toBe(15);
  });
});

describe("isDeclarableVisit", () => {
  it("cuenta las visitas ya hechas, aunque no estén cobradas", () => {
    for (const status of ["Realizada", "Pendiente de cobro", "Cobrada", "Facturada"]) {
      expect(isDeclarableVisit(visit({ status }))).toBe(true);
    }
  });

  it("deja fuera lo que todavía no ha pasado y lo que no va a pasar", () => {
    expect(isDeclarableVisit(visit({ status: "Programada" }))).toBe(false);
    expect(isDeclarableVisit(visit({ status: "Cancelada" }))).toBe(false);
    expect(isDeclarableVisit(visit({ status: null }))).toBe(false);
    expect(isDeclarableVisit(visit({ visit_date: "" }))).toBe(false);
  });
});

// ── Los tres cálculos ────────────────────────────────────────────────────────

describe("fiscalTotals", () => {
  it("sin visitas deja todo a cero", () => {
    const totals = fiscalTotals([]);
    expect(totals).toEqual({
      visits: 0,
      grossEmpresa: 0,
      grossParticular: 0,
      grossDeclared: 0,
      retainedIrpf: 0,
      netDeclared: 0,
      conservativeNet: 0,
      conservativeIrpf: 0,
      rentaBuffer: 0,
      pendingModelo100: 0,
      unclassifiedVisits: 0,
      unclassifiedGross: 0,
      oddRetentionVisits: 0,
    });
  });

  it("sólo facturas a entidad: neto = bruto × 0,85", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 360 }),
      visit({ gross_amount: 380 }),
      visit({ gross_amount: 340 }),
    ]);
    expect(totals.visits).toBe(3);
    expect(totals.grossEmpresa).toBe(1080);
    expect(totals.grossParticular).toBe(0);
    expect(totals.grossDeclared).toBe(1080);
    expect(totals.retainedIrpf).toBe(162);
    expect(totals.netDeclared).toBe(918);
    expect(totals.conservativeNet).toBe(864);
    // 20 % de 1080 = 216; ya retenido 162 → faltan 54.
    expect(totals.pendingModelo100).toBe(54);
    expect(totals.oddRetentionVisits).toBe(0);
  });

  it("sólo pacientes particulares: no hay retención ninguna", () => {
    const totals = fiscalTotals([
      visit({ income_type: "Particular", irpf_percentage: 0, gross_amount: 300 }),
      visit({ income_type: "Particular", irpf_percentage: 0, gross_amount: 200 }),
    ]);
    expect(totals.grossParticular).toBe(500);
    expect(totals.retainedIrpf).toBe(0);
    expect(totals.netDeclared).toBe(500);
    expect(totals.conservativeNet).toBe(400);
    expect(totals.pendingModelo100).toBe(100);
  });

  it("ignora la retención guardada en una visita de particular", () => {
    // Dato sucio: un particular con 15 % apuntado por error no debe retener.
    const totals = fiscalTotals([visit({ income_type: "Particular", irpf_percentage: 15, gross_amount: 100 })]);
    expect(totals.retainedIrpf).toBe(0);
    expect(totals.netDeclared).toBe(100);
  });

  it("mezcla los dos pagadores", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 1000 }),
      visit({ income_type: "Particular", irpf_percentage: 0, gross_amount: 250 }),
    ]);
    expect(totals.grossDeclared).toBe(1250);
    expect(totals.retainedIrpf).toBe(150);
    expect(totals.netDeclared).toBe(1100);
    expect(totals.conservativeNet).toBe(1000);
    expect(totals.pendingModelo100).toBe(100);
  });

  it("respeta una retención distinta del 15 % y la señala", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 200, irpf_percentage: 7 }),
      visit({ gross_amount: 200 }),
    ]);
    expect(totals.retainedIrpf).toBe(14 + 30);
    expect(totals.netDeclared).toBe(400 - 44);
    expect(totals.oddRetentionVisits).toBe(1);
  });

  it("admite retención 0 en una factura a entidad", () => {
    const totals = fiscalTotals([visit({ gross_amount: 100, irpf_percentage: 0 })]);
    expect(totals.retainedIrpf).toBe(0);
    expect(totals.netDeclared).toBe(100);
    expect(totals.pendingModelo100).toBe(20);
    expect(totals.oddRetentionVisits).toBe(1);
  });

  it("deja el pendiente en negativo si ya han retenido de más", () => {
    const totals = fiscalTotals([visit({ gross_amount: 100, irpf_percentage: 25 })]);
    expect(totals.retainedIrpf).toBe(25);
    // 20 % de 100 = 20; retenido 25 → −5, y se muestra con su signo.
    expect(totals.pendingModelo100).toBe(-5);
  });

  it("cuenta aparte las visitas sin clasificar y no las mete en ningún saco", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 100 }),
      visit({ income_type: null, gross_amount: 250 }),
      visit({ income_type: "  ", gross_amount: 50 }),
    ]);
    expect(totals.visits).toBe(1);
    expect(totals.grossDeclared).toBe(100);
    expect(totals.unclassifiedVisits).toBe(2);
    expect(totals.unclassifiedGross).toBe(300);
  });

  it("deja fuera canceladas y programadas", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 100 }),
      visit({ gross_amount: 999, status: "Cancelada" }),
      visit({ gross_amount: 999, status: "Programada" }),
    ]);
    expect(totals.grossDeclared).toBe(100);
    expect(totals.unclassifiedVisits).toBe(0);
  });

  it("usa el desglose por paciente cuando existe, como el resto de la app", () => {
    const totals = fiscalTotals([
      visit({
        gross_amount: 999,
        visit_patients: [
          { id: "a", price_charged: 18, payment_status: "Cobrado" },
          { id: "b", price_charged: 22, payment_status: "Pendiente" },
        ],
      }),
    ]);
    expect(totals.grossDeclared).toBe(40);
    expect(totals.retainedIrpf).toBe(6);
  });

  it("redondea el medio céntimo hacia arriba, como una factura española", () => {
    // 14,50 € × 15 % = 2,175 € exactos en decimal → 2,18 €. Con un redondeo
    // sobre el `double` saldría 2,17 € y el neto se desviaría un céntimo por
    // factura (varios euros al cabo de un año).
    expect(retentionFor(14.5, 15)).toBe(2.18);
    expect(retentionFor(0.1, 15)).toBe(0.02);
    expect(retentionFor(20.5, 15)).toBe(3.08);
    expect(retentionFor(18, 15)).toBe(2.7);
    expect(retentionFor(0, 15)).toBe(0);
    expect(retentionFor(100, 0)).toBe(0);
    expect(retentionFor(1000, 7.125)).toBe(71.25);

    const totals = fiscalTotals([visit({ gross_amount: 14.5 }), visit({ gross_amount: 14.5 })]);
    expect(totals.retainedIrpf).toBe(4.36);
    expect(totals.netDeclared).toBe(24.64);
  });

  it("redondea la retención factura a factura, como una factura real", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 33.33 }),
      visit({ gross_amount: 33.33 }),
      visit({ gross_amount: 33.33 }),
    ]);
    expect(totals.grossDeclared).toBe(99.99);
    // 33,33 × 15 % = 4,9995 → 5,00 por factura.
    expect(totals.retainedIrpf).toBe(15);
    expect(totals.netDeclared).toBe(84.99);
    expect(totals.conservativeNet).toBe(79.99);
    expect(totals.pendingModelo100).toBe(5);
  });

  it("filtra por rango de fechas", () => {
    const visits = [
      visit({ visit_date: "2026-07-31", gross_amount: 100 }),
      visit({ visit_date: "2026-08-01", gross_amount: 200 }),
      visit({ visit_date: "2026-08-31", gross_amount: 300 }),
      visit({ visit_date: "2026-09-01", gross_amount: 400 }),
    ];
    expect(fiscalTotals(visits, monthRange("2026-08")).grossDeclared).toBe(500);
    expect(fiscalTotals(visits).grossDeclared).toBe(1000);
  });

  it("normaliza una fecha con hora antes de comparar el rango", () => {
    const totals = fiscalTotals([visit({ visit_date: "2026-08-31T23:30:00", gross_amount: 100 })], monthRange("2026-08"));
    expect(totals.grossDeclared).toBe(100);
  });
});

// ── Retenciones de referencia (20 % y 5 %) ───────────────────────────────────

describe("retenciones de referencia", () => {
  it("los tipos son los esperados: 15 % retenido, 20 % prudente, 5 % de colchón", () => {
    expect(DEFAULT_EMPRESA_IRPF).toBe(15);
    expect(CONSERVATIVE_IRPF_RATE).toBe(20);
    // El 5 % no se escribe a mano: es la diferencia entre los otros dos.
    expect(RENTA_BUFFER_RATE).toBe(5);
  });

  it("calcula el 20 % y el 5 % del bruto declarado total, no sólo del de entidades", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 1000 }),
      visit({ income_type: "Particular", irpf_percentage: 0, gross_amount: 250 }),
    ]);
    expect(totals.grossDeclared).toBe(1250);
    expect(totals.conservativeIrpf).toBe(250);
    expect(totals.rentaBuffer).toBe(62.5);
  });

  it("el 20 % es exactamente el complementario del 80 %: las dos cifras suman el bruto", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 33.33 }),
      visit({ gross_amount: 33.33 }),
      visit({ gross_amount: 33.33 }),
    ]);
    expect(totals.grossDeclared).toBe(99.99);
    expect(totals.conservativeNet).toBe(79.99);
    expect(totals.conservativeIrpf).toBe(20);
    expect(totals.conservativeNet + totals.conservativeIrpf).toBe(totals.grossDeclared);
    expect(totals.rentaBuffer).toBe(5);
  });

  it("en pantalla cuadra: 20 % − ya retenido = falta por apartar", () => {
    const totals = fiscalTotals([
      visit({ gross_amount: 360 }),
      visit({ gross_amount: 380 }),
      visit({ gross_amount: 340 }),
    ]);
    expect(totals.conservativeIrpf).toBe(216);
    expect(totals.retainedIrpf).toBe(162);
    expect(totals.pendingModelo100).toBe(54);
    expect(totals.conservativeIrpf - totals.retainedIrpf).toBe(totals.pendingModelo100);
    // Con todo retenido al 15 %, el colchón del 5 % coincide con el pendiente
    // real: es justo el caso que la etiqueta dice que está suponiendo.
    expect(totals.rentaBuffer).toBe(totals.pendingModelo100);
  });

  it("el colchón del 5 % es sólo una referencia: con particulares se queda corto", () => {
    // Todo de particulares: no hay retención ninguna, así que lo que falta de
    // verdad es el 20 %, no el 5 %. La etiqueta avisa de que es aproximado.
    const totals = fiscalTotals([visit({ income_type: "Particular", irpf_percentage: 0, gross_amount: 1000 })]);
    expect(totals.rentaBuffer).toBe(50);
    expect(totals.conservativeIrpf).toBe(200);
    expect(totals.pendingModelo100).toBe(200);
  });

  it("no inventa cifras de referencia si no hay bruto declarado", () => {
    const totals = fiscalTotals([visit({ income_type: null, gross_amount: 500 })]);
    expect(totals.grossDeclared).toBe(0);
    expect(totals.conservativeIrpf).toBe(0);
    expect(totals.rentaBuffer).toBe(0);
  });

  it("redondea a céntimos exactos con importes que no son redondos", () => {
    // 14,50 € × 2 = 29 €. 20 % = 5,80 €; 5 % = 1,45 €.
    const totals = fiscalTotals([visit({ gross_amount: 14.5 }), visit({ gross_amount: 14.5 })]);
    expect(totals.grossDeclared).toBe(29);
    expect(totals.conservativeIrpf).toBe(5.8);
    expect(totals.rentaBuffer).toBe(1.45);

    // 0,01 € es el caso límite: el 5 % es medio céntimo y no puede quedar en NaN.
    const cent = fiscalTotals([visit({ gross_amount: 0.01 })]);
    expect(cent.grossDeclared).toBe(0.01);
    expect(cent.conservativeIrpf).toBe(0);
    expect(cent.rentaBuffer).toBe(0);
  });

  it("las cifras de referencia no se dejan tocar por una visita sin clasificar", () => {
    const totals = fiscalTotals([visit({ gross_amount: 1000 }), visit({ income_type: null, gross_amount: 1000 })]);
    expect(totals.conservativeIrpf).toBe(200);
    expect(totals.rentaBuffer).toBe(50);
  });
});

// ── Rangos y trimestres ──────────────────────────────────────────────────────

describe("rangos de fechas", () => {
  it("cierra el mes en su último día real", () => {
    expect(monthRange("2026-02")).toEqual({ fromIso: "2026-02-01", toIso: "2026-02-28" });
    expect(monthRange("2024-02")).toEqual({ fromIso: "2024-02-01", toIso: "2024-02-29" });
    expect(monthRange("2026-12")).toEqual({ fromIso: "2026-12-01", toIso: "2026-12-31" });
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });

  it("mapea meses a trimestres naturales", () => {
    expect([1, 2, 3].map(quarterOfMonth)).toEqual([1, 1, 1]);
    expect([4, 5, 6].map(quarterOfMonth)).toEqual([2, 2, 2]);
    expect([7, 8, 9].map(quarterOfMonth)).toEqual([3, 3, 3]);
    expect([10, 11, 12].map(quarterOfMonth)).toEqual([4, 4, 4]);
    expect(quarterOfIso("2026-09-25")).toBe(3);
  });

  it("calcula el rango de cada trimestre", () => {
    expect(quarterRange(2026, 1)).toEqual({ fromIso: "2026-01-01", toIso: "2026-03-31" });
    expect(quarterRange(2026, 2)).toEqual({ fromIso: "2026-04-01", toIso: "2026-06-30" });
    expect(quarterRange(2026, 3)).toEqual({ fromIso: "2026-07-01", toIso: "2026-09-30" });
    expect(quarterRange(2026, 4)).toEqual({ fromIso: "2026-10-01", toIso: "2026-12-31" });
  });

  it("acumula siempre desde el 1 de enero", () => {
    expect(yearToQuarterRange(2026, 1)).toEqual({ fromIso: "2026-01-01", toIso: "2026-03-31" });
    expect(yearToQuarterRange(2026, 4)).toEqual({ fromIso: "2026-01-01", toIso: "2026-12-31" });
  });

  it("sabe cuál es el trimestre anterior, incluso cruzando de año", () => {
    expect(previousQuarter({ year: 2026, quarter: 3 })).toEqual({ year: 2026, quarter: 2 });
    expect(previousQuarter({ year: 2026, quarter: 1 })).toEqual({ year: 2025, quarter: 4 });
    expect(currentQuarter(fromIsoDate("2026-09-25"))).toEqual({ year: 2026, quarter: 3 });
  });

  it("conoce los plazos de presentación del Modelo 130", () => {
    expect(filingWindow({ year: 2026, quarter: 1 })).toMatchObject({
      fromIso: "2026-04-01",
      toIso: "2026-04-20",
      deadlineLabel: "20 de abril",
    });
    expect(filingWindow({ year: 2026, quarter: 2 })).toMatchObject({ fromIso: "2026-07-01", toIso: "2026-07-20" });
    expect(filingWindow({ year: 2026, quarter: 3 })).toMatchObject({ fromIso: "2026-10-01", toIso: "2026-10-20" });
    // El del cuarto trimestre se presenta en enero del año siguiente, y hasta el 30.
    expect(filingWindow({ year: 2026, quarter: 4 })).toMatchObject({
      fromIso: "2027-01-01",
      toIso: "2027-01-30",
      deadlineLabel: "30 de enero de 2027",
    });
  });
});

// ── Semáforo ─────────────────────────────────────────────────────────────────

describe("modelo130Level", () => {
  it("sin bruto declarado no inventa un verde", () => {
    expect(modelo130Level(0, 0)).toBe("sin-datos");
    expect(modelo130Level(0, -10)).toBe("sin-datos");
  });

  it("verde por debajo del 25 %", () => {
    expect(modelo130Level(0, 1000)).toBe("verde");
    expect(modelo130Level(249, 1000)).toBe("verde");
    expect(modelo130Level(24.99, 100)).toBe("verde");
  });

  it("el 25 % exacto ya es ámbar", () => {
    expect(modelo130Level(25, 100)).toBe("ambar");
    expect(modelo130Level(250, 1000)).toBe("ambar");
    expect(modelo130Level(2.5, 10)).toBe("ambar");
    expect(modelo130Level(0.25, 1)).toBe("ambar");
    expect(modelo130Level(29.99, 100)).toBe("ambar");
  });

  it("el 30 % exacto ya es rojo", () => {
    expect(modelo130Level(30, 100)).toBe("rojo");
    expect(modelo130Level(300, 1000)).toBe("rojo");
    expect(modelo130Level(0.3, 1)).toBe("rojo");
    expect(modelo130Level(3.3, 11)).toBe("rojo");
    expect(modelo130Level(1000, 1000)).toBe("rojo");
  });

  it("borde exacto con importes de céntimos", () => {
    // 15,00 de 60,00 = 25 % justo → ámbar, no verde.
    expect(modelo130Level(15, 60)).toBe("ambar");
    // 14,99 de 60,00 se queda por debajo.
    expect(modelo130Level(14.99, 60)).toBe("verde");
    // 18,00 de 60,00 = 30 % justo → rojo.
    expect(modelo130Level(18, 60)).toBe("rojo");
    expect(modelo130Level(17.99, 60)).toBe("ambar");
  });

  it("el porcentaje es null cuando no hay nada declarado", () => {
    expect(withoutRetentionPercent(0, 0)).toBeNull();
    expect(withoutRetentionPercent(25, 100)).toBe(25);
  });
});

describe("modelo130Snapshot / quarterSnapshot", () => {
  const visits = [
    // T1: todo de particulares → el trimestre cerraría en rojo.
    visit({ visit_date: "2026-02-10", income_type: "Particular", irpf_percentage: 0, gross_amount: 400 }),
    // T2: entidades, que diluyen el acumulado.
    visit({ visit_date: "2026-05-10", gross_amount: 1600 }),
    // T3 sin clasificar: no cuenta, pero se avisa.
    visit({ visit_date: "2026-08-10", income_type: null, gross_amount: 900 }),
  ];

  it("el acumulado del trimestre arrastra los meses anteriores del año", () => {
    const t1 = quarterSnapshot(visits, { year: 2026, quarter: 1 });
    expect(t1.grossParticular).toBe(400);
    expect(t1.grossDeclared).toBe(400);
    expect(t1.percent).toBe(100);
    expect(t1.level).toBe("rojo");

    const t2 = quarterSnapshot(visits, { year: 2026, quarter: 2 });
    expect(t2.grossDeclared).toBe(2000);
    expect(t2.percent).toBe(20);
    expect(t2.level).toBe("verde");
  });

  it("el mes es un dato aparte del trimestre", () => {
    const month = modelo130Snapshot(visits, monthRange("2026-05"));
    expect(month.grossParticular).toBe(0);
    expect(month.percent).toBe(0);
    expect(month.level).toBe("verde");
  });

  it("avisa de las visitas sin clasificar del periodo", () => {
    const t3 = quarterSnapshot(visits, { year: 2026, quarter: 3 });
    expect(t3.unclassifiedVisits).toBe(1);
    expect(t3.grossDeclared).toBe(2000);
  });

  it("primer año de actividad: el acumulado empieza en la primera visita", () => {
    // Sin visitas antes de junio, el acumulado de T2 es sólo lo de junio.
    const primerAnio = [visit({ visit_date: "2026-06-15", income_type: "Particular", irpf_percentage: 0, gross_amount: 535 })];
    const t2 = quarterSnapshot(primerAnio, { year: 2026, quarter: 2 });
    expect(t2.grossDeclared).toBe(535);
    expect(t2.level).toBe("rojo");
    expect(firstDeclaredVisitIso(primerAnio)).toBe("2026-06-15");
    // Y el trimestre anterior, sin actividad, no dice nada.
    expect(quarterSnapshot(primerAnio, { year: 2026, quarter: 1 }).level).toBe("sin-datos");
  });
});

// ── Avisos ───────────────────────────────────────────────────────────────────

describe("buildModelo130Reminders", () => {
  /** Trimestre en rojo: todo de particulares dentro del trimestre indicado. */
  const redQuarter = (year: number, quarter: Quarter): FiscalVisit[] => [
    visit({
      visit_date: quarterRange(year, quarter).fromIso,
      income_type: "Particular",
      irpf_percentage: 0,
      gross_amount: 500,
    }),
  ];

  it("avisa durante el plazo de presentación del trimestre cerrado", () => {
    const [reminder] = buildModelo130Reminders(redQuarter(2026, 3), fromIsoDate("2026-10-05"));
    expect(reminder).toMatchObject({
      label: "T3 2026",
      percent: 100,
      quarterClosed: true,
      deadlineIso: "2026-10-20",
      deadlineLabel: "20 de octubre",
      opensIso: "2026-10-01",
    });
  });

  it("empieza a avisar unos días antes de que abra el plazo, con el trimestre aún vivo", () => {
    const visits = redQuarter(2026, 3);
    expect(buildModelo130Reminders(visits, fromIsoDate("2026-09-23"))).toHaveLength(0);
    const [reminder] = buildModelo130Reminders(visits, fromIsoDate("2026-09-24"));
    expect(reminder.quarterClosed).toBe(false);
    expect(reminder.label).toBe("T3 2026");
  });

  it("deja de avisar cuando se pasa el plazo", () => {
    const visits = redQuarter(2026, 3);
    expect(buildModelo130Reminders(visits, fromIsoDate("2026-10-20"))).toHaveLength(1);
    expect(buildModelo130Reminders(visits, fromIsoDate("2026-10-21"))).toHaveLength(0);
  });

  it("el cuarto trimestre se presenta en enero y hasta el día 30", () => {
    const visits = redQuarter(2026, 4);
    const [enDiciembre] = buildModelo130Reminders(visits, fromIsoDate("2026-12-28"));
    expect(enDiciembre).toMatchObject({ label: "T4 2026", quarterClosed: false, deadlineIso: "2027-01-30" });
    const [enEnero] = buildModelo130Reminders(visits, fromIsoDate("2027-01-20"));
    expect(enEnero).toMatchObject({ label: "T4 2026", quarterClosed: true });
    expect(buildModelo130Reminders(visits, fromIsoDate("2027-01-31"))).toHaveLength(0);
  });

  it("no avisa si el trimestre no cerró en rojo", () => {
    const verde = [visit({ visit_date: "2026-08-10", gross_amount: 1000 })];
    expect(buildModelo130Reminders(verde, fromIsoDate("2026-10-05"))).toHaveLength(0);
    const ambar = [
      visit({ visit_date: "2026-08-10", gross_amount: 730 }),
      visit({ visit_date: "2026-08-11", income_type: "Particular", irpf_percentage: 0, gross_amount: 270 }),
    ];
    expect(modelo130Level(270, 1000)).toBe("ambar");
    expect(buildModelo130Reminders(ambar, fromIsoDate("2026-10-05"))).toHaveLength(0);
  });

  it("mira el acumulado, no el trimestre suelto", () => {
    // T3 sólo tiene particulares, pero el año acumulado se queda en el 20 %.
    const visits = [
      visit({ visit_date: "2026-02-10", gross_amount: 1600 }),
      visit({ visit_date: "2026-08-10", income_type: "Particular", irpf_percentage: 0, gross_amount: 400 }),
    ];
    expect(buildModelo130Reminders(visits, fromIsoDate("2026-10-05"))).toHaveLength(0);
  });

  it("no avisa sin visitas ni con visitas sin clasificar", () => {
    expect(buildModelo130Reminders([], fromIsoDate("2026-10-05"))).toHaveLength(0);
    const sinClasificar = [visit({ visit_date: "2026-08-10", income_type: null, gross_amount: 900 })];
    expect(buildModelo130Reminders(sinClasificar, fromIsoDate("2026-10-05"))).toHaveLength(0);
  });

  it("nunca duplica el aviso de un trimestre", () => {
    const visits = [...redQuarter(2026, 3), ...redQuarter(2026, 4)];
    for (const day of ["2026-09-25", "2026-10-10", "2026-12-28", "2027-01-05"]) {
      const reminders = buildModelo130Reminders(visits, fromIsoDate(day));
      const labels = reminders.map((r) => r.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels.length).toBeLessThanOrEqual(1);
    }
  });
});

// ── Numeración de facturas ───────────────────────────────────────────────────

describe("numeración de facturas", () => {
  it("separa prefijo y número sin exigir formato", () => {
    expect(parseInvoiceNumber("F-2026-066")).toEqual({ prefix: "F-2026-", number: 66, digits: 3 });
    expect(parseInvoiceNumber("  F-2026-066  ")).toEqual({ prefix: "F-2026-", number: 66, digits: 3 });
    expect(parseInvoiceNumber("F-2026-0066")).toEqual({ prefix: "F-2026-", number: 66, digits: 4 });
    expect(parseInvoiceNumber("66")).toEqual({ prefix: "", number: 66, digits: 2 });
    expect(parseInvoiceNumber("2026/7")).toEqual({ prefix: "2026/", number: 7, digits: 1 });
  });

  it("devuelve null cuando no hay número que seguir", () => {
    expect(parseInvoiceNumber("")).toBeNull();
    expect(parseInvoiceNumber("   ")).toBeNull();
    expect(parseInvoiceNumber(null)).toBeNull();
    expect(parseInvoiceNumber(undefined)).toBeNull();
    expect(parseInvoiceNumber("rectificativa")).toBeNull();
  });

  it("reconstruye el anterior con los mismos dígitos", () => {
    expect(formatInvoiceNumber({ prefix: "F-2026-", number: 66, digits: 3 }, 65)).toBe("F-2026-065");
    expect(formatInvoiceNumber({ prefix: "F-2026-", number: 100, digits: 3 }, 99)).toBe("F-2026-099");
    expect(formatInvoiceNumber({ prefix: "", number: 2, digits: 1 }, 1)).toBe("1");
  });

  it("avisa del hueco cuando falta el número anterior", () => {
    expect(missingPreviousInvoice("F-2026-066", ["F-2026-064", "F-2026-067"])).toBe("F-2026-065");
    expect(missingPreviousInvoice("F-2026-066", ["F-2026-065"])).toBeNull();
    // «F-2026-65» y «F-2026-065» son la misma factura escrita de dos formas: el
    // relleno con ceros no debe hacer aparecer un hueco que no existe.
    expect(missingPreviousInvoice("F-2026-066", ["F-2026-65"])).toBeNull();
    expect(missingPreviousInvoice("F-2026-094", [])).toBe("F-2026-093");
  });

  it("no avisa en la primera factura ni sin número", () => {
    expect(missingPreviousInvoice("F-2026-001", [])).toBeNull();
    expect(missingPreviousInvoice("F-2026-000", [])).toBeNull();
    expect(missingPreviousInvoice("", ["F-2026-001"])).toBeNull();
    expect(missingPreviousInvoice(null, ["F-2026-001"])).toBeNull();
    expect(missingPreviousInvoice("rectificativa", [])).toBeNull();
  });

  it("compara sólo dentro de la misma serie", () => {
    // Una factura de otra serie con el número anterior no tapa el hueco.
    expect(missingPreviousInvoice("F-2026-066", ["A-2025-065"])).toBe("F-2026-065");
    expect(missingPreviousInvoice("F-2027-001", ["F-2026-120"])).toBeNull();
  });

  it("recoge los números ya guardados sin repetir ni vacíos", () => {
    const numbers = collectInvoiceNumbers([
      visit({ invoice_number: "F-2026-066" }),
      visit({ invoice_number: " F-2026-066 " }),
      visit({ invoice_number: "" }),
      visit({ invoice_number: null }),
      visit({ invoice_number: "F-2026-067" }),
    ]);
    expect(numbers.sort()).toEqual(["F-2026-066", "F-2026-067"]);
  });

  it("detecta la serie habitual", () => {
    expect(dominantInvoiceSeries(["F-2026-066", "F-2026-067", "A-1"])).toEqual({ prefix: "F-2026-", digits: 3 });
    expect(dominantInvoiceSeries([])).toBeNull();
    expect(dominantInvoiceSeries(["sin numero"])).toBeNull();
  });

  it("sugiere la serie habitual sin bloquear nada", () => {
    expect(unusualInvoiceFormat("F-2026-068", ["F-2026-066", "F-2026-067"])).toBeNull();
    expect(unusualInvoiceFormat("2026-68", ["F-2026-066", "F-2026-067"])).toBe("F-2026-068");
    expect(unusualInvoiceFormat("rectificativa", ["F-2026-066", "F-2026-067"])).toBe("F-2026-001");
    // Sin histórico no hay serie «habitual» de la que hablar.
    expect(unusualInvoiceFormat("lo-que-sea", [])).toBeNull();
    expect(unusualInvoiceFormat("", ["F-2026-066"])).toBeNull();
  });
});

// ── Facturas a entidad ───────────────────────────────────────────────────────

describe("empresaInvoiceState", () => {
  it("separa lo cobrado de lo que sigue pendiente", () => {
    const state = empresaInvoiceState([
      visit({ id: "cobrada", visit_date: "2026-08-01", status: "Cobrada", gross_amount: 300, invoice_number: "F-2026-060" }),
      visit({ id: "facturada", visit_date: "2026-08-02", status: "Facturada", gross_amount: 200, invoice_number: "F-2026-061" }),
      visit({ id: "pendiente", visit_date: "2026-08-03", status: "Pendiente de cobro", gross_amount: 150, invoice_number: "F-2026-062" }),
      visit({ id: "realizada", visit_date: "2026-07-20", status: "Realizada", gross_amount: 50, invoice_number: null }),
    ]);
    expect(state.settledVisits).toBe(2);
    expect(state.settledTotal).toBe(500);
    expect(state.pendingTotal).toBe(200);
    // Lo más antiguo primero: es lo que lleva más tiempo sin cobrarse.
    expect(state.pending.map((p) => p.visitId)).toEqual(["realizada", "pendiente"]);
    expect(state.withoutNumber).toBe(1);
  });

  it("sólo mira las facturas a entidad", () => {
    const state = empresaInvoiceState([
      visit({ income_type: "Particular", irpf_percentage: 0, status: "Realizada", gross_amount: 40 }),
      visit({ income_type: null, status: "Realizada", gross_amount: 40 }),
      visit({ status: "Cancelada", gross_amount: 40 }),
      visit({ status: "Programada", gross_amount: 40 }),
    ]);
    expect(state.pending).toHaveLength(0);
    expect(state.pendingTotal).toBe(0);
    expect(state.settledVisits).toBe(0);
  });

  it("sin datos devuelve ceros", () => {
    const state = empresaInvoiceState([]);
    expect(state).toMatchObject({ pending: [], pendingTotal: 0, settledVisits: 0, settledTotal: 0, withoutNumber: 0 });
  });
});

// ── Domicilios ───────────────────────────────────────────────────────────────

describe("homeVisitsSummary", () => {
  it("cuenta los domicilios y el cajón de la contabilidad, no las residencias", () => {
    const summary = homeVisitsSummary(
      [
        visit({ center_id: "casa", income_type: "Particular", irpf_percentage: 0, gross_amount: 25, patients_count: 1 }),
        visit({ center_id: "cajon", income_type: "Particular", irpf_percentage: 0, gross_amount: 230, patients_count: 8 }),
        visit({ center_id: "pravia", gross_amount: 300, patients_count: 10 }),
      ],
      centers,
      monthRange("2026-08"),
    );
    expect(summary.visits).toBe(2);
    expect(summary.patients).toBe(9);
    expect(summary.gross).toBe(255);
    expect(summary.netDeclared).toBe(255);
    expect(summary.unclassifiedVisits).toBe(0);
  });

  it("aplica la retención cuando el domicilio lo paga una entidad", () => {
    const summary = homeVisitsSummary([visit({ center_id: "casa", gross_amount: 100 })], centers);
    expect(summary.netDeclared).toBe(85);
  });

  it("no inventa el neto de una visita sin clasificar", () => {
    const summary = homeVisitsSummary([visit({ center_id: "casa", income_type: null, gross_amount: 100 })], centers);
    expect(summary.visits).toBe(1);
    expect(summary.gross).toBe(100);
    expect(summary.netDeclared).toBe(0);
    expect(summary.unclassifiedVisits).toBe(1);
  });

  it("sin domicilios devuelve ceros", () => {
    expect(homeVisitsSummary([visit({ center_id: "pravia" })], centers)).toMatchObject({ visits: 0, gross: 0 });
    expect(homeVisitsSummary([visit({ center_id: null })], centers)).toMatchObject({ visits: 0 });
  });
});

// ── Precio anómalo ───────────────────────────────────────────────────────────

describe("precio anómalo", () => {
  const history = [
    visit({ center_id: "pravia", gross_amount: 90, patients_count: 6 }),
    visit({ center_id: "pravia", gross_amount: 75, patients_count: 5 }),
  ];

  it("la media es ponderada por pacientes", () => {
    const stats = centerPriceHistory(history, "pravia");
    expect(stats).toEqual({ average: 15, visits: 2 });
  });

  it("no opina con menos de dos visitas con importe", () => {
    expect(centerPriceHistory([history[0]], "pravia")).toBeNull();
    expect(centerPriceHistory(history, "otro")).toBeNull();
    expect(centerPriceHistory(history, null)).toBeNull();
    expect(centerPriceHistory([], "pravia")).toBeNull();
    // Visitas sin importe o sin pacientes no sirven de referencia.
    expect(
      centerPriceHistory(
        [visit({ center_id: "pravia", gross_amount: 0, patients_count: 4 }), visit({ center_id: "pravia", gross_amount: 90, patients_count: 0 })],
        "pravia",
      ),
    ).toBeNull();
  });

  it("puede excluir la visita que se está editando", () => {
    const stats = centerPriceHistory([...history, visit({ id: "nueva", center_id: "pravia", gross_amount: 300, patients_count: 1 })], "pravia", {
      excludeVisitId: "nueva",
    });
    expect(stats?.average).toBe(15);
  });

  it("avisa sólo cuando la desviación es notable", () => {
    const stats = centerPriceHistory(history, "pravia");
    expect(priceAnomaly(stats, 15)).toBeNull();
    expect(priceAnomaly(stats, 16.5)).toBeNull(); // +10 %, dentro de tolerancia
    expect(priceAnomaly(stats, 18)).toMatchObject({ price: 18, average: 15, visits: 2, higher: true });
    expect(priceAnomaly(stats, 12)).toMatchObject({ price: 12, higher: false });
    expect(priceAnomaly(stats, 0)).toBeNull();
    expect(priceAnomaly(null, 50)).toBeNull();
    expect(priceAnomaly({ average: 0, visits: 3 }, 50)).toBeNull();
  });
});

// ── Efectivo en mano ─────────────────────────────────────────────────────────

describe("cashInHand", () => {
  it("reconoce las formas de pago en efectivo", () => {
    expect(isCashMethod("Efectivo")).toBe(true);
    expect(isCashMethod("efectivo en mano")).toBe(true);
    expect(isCashMethod("Metálico")).toBe(true);
    expect(isCashMethod("Bizum")).toBe(false);
    expect(isCashMethod(null)).toBe(false);
  });

  it("suma sólo la parte en efectivo de un pago partido", () => {
    const cash = cashInHand(
      [
        visit({
          center_id: "pravia",
          visit_patients: [
            {
              id: "vp",
              price_charged: 105,
              payment_status: "Cobrado",
              payment_breakdown: [
                { method: "Efectivo", amount: 55 },
                { method: "Bizum", amount: 50 },
              ],
            },
          ],
        }),
      ],
      centers,
      monthRange("2026-08"),
    );
    expect(cash).toEqual({ total: 55, visits: 1, hasRefunds: false });
  });

  it("sin desglose usa la forma de cobro habitual del centro", () => {
    const enEfectivo = visit({
      center_id: "casa",
      status: "Cobrada",
      visit_patients: [{ id: "vp", price_charged: 25, payment_status: "Cobrado" }],
    });
    expect(cashInHand([enEfectivo], centers).total).toBe(25);

    const porTransferencia = visit({
      center_id: "pravia",
      status: "Cobrada",
      visit_patients: [{ id: "vp", price_charged: 25, payment_status: "Cobrado" }],
    });
    expect(cashInHand([porTransferencia], centers).total).toBe(0);
  });

  it("no cuenta lo que todavía no se ha cobrado", () => {
    const pendiente = visit({
      center_id: "casa",
      status: "Pendiente de cobro",
      visit_patients: [{ id: "vp", price_charged: 25, payment_status: "Pendiente" }],
    });
    expect(cashInHand([pendiente], centers).total).toBe(0);
  });

  it("una devolución en efectivo resta", () => {
    const devolucion = cashInHand(
      [
        visit({
          center_id: "casa",
          visit_patients: [
            {
              id: "vp",
              price_charged: -30,
              payment_status: "Cobrado",
              payment_breakdown: [{ method: "Efectivo", amount: -30 }],
            },
          ],
        }),
      ],
      centers,
    );
    expect(devolucion).toEqual({ total: -30, visits: 1, hasRefunds: true });
  });

  it("un desglose sin línea de efectivo no cae al método del centro", () => {
    const bizum = visit({
      center_id: "casa",
      visit_patients: [
        { id: "vp", price_charged: 25, payment_status: "Cobrado", payment_breakdown: [{ method: "Bizum", amount: 25 }] },
      ],
    });
    expect(cashInHand([bizum], centers).total).toBe(0);
  });

  it("acepta una forma de cobro escrita a mano", () => {
    const aMano = visit({
      center_id: "efectivo-raro",
      status: "Cobrada",
      visit_patients: [{ id: "vp", price_charged: 40, payment_status: "Cobrado" }],
    });
    expect(cashInHand([aMano], centers).total).toBe(40);
  });

  it("visitas antiguas sin filas de pacientes: sólo si el centro cobra en efectivo y está cobrada", () => {
    expect(cashInHand([visit({ center_id: "casa", status: "Cobrada", gross_amount: 25, visit_patients: [] })], centers).total).toBe(25);
    expect(cashInHand([visit({ center_id: "casa", status: "Realizada", gross_amount: 25, visit_patients: [] })], centers).total).toBe(0);
  });

  it("«Facturada» no es dinero en el bolsillo", () => {
    // Una factura emitida y todavía sin pagar no puede engordar la caja física.
    const facturada = visit({ center_id: "casa", status: "Facturada", gross_amount: 25, visit_patients: [] });
    expect(cashInHand([facturada], centers).total).toBe(0);
    const conFila = visit({
      center_id: "casa",
      status: "Facturada",
      visit_patients: [{ id: "vp", price_charged: 25, payment_status: "Pendiente" }],
    });
    expect(cashInHand([conFila], centers).total).toBe(0);
  });

  it("se reinicia cada mes y deja fuera las canceladas", () => {
    const visits = [
      visit({ visit_date: "2026-07-31", center_id: "casa", status: "Cobrada", gross_amount: 10, visit_patients: [] }),
      visit({ visit_date: "2026-08-02", center_id: "casa", status: "Cobrada", gross_amount: 20, visit_patients: [] }),
      visit({ visit_date: "2026-08-03", center_id: "casa", status: "Cancelada", gross_amount: 99, visit_patients: [] }),
    ];
    expect(cashInHand(visits, centers, monthRange("2026-08")).total).toBe(20);
    expect(cashInHand(visits, centers, monthRange("2026-07")).total).toBe(10);
  });

  it("no cuenta el efectivo de una visita sin clasificar como algo fiscal (es sólo caja)", () => {
    // Sin `income_type` el efectivo se sigue contando: la caja física no depende
    // de la clasificación fiscal.
    const sinClasificar = visit({
      center_id: "casa",
      income_type: null,
      status: "Cobrada",
      gross_amount: 30,
      visit_patients: [],
    });
    expect(cashInHand([sinClasificar], centers).total).toBe(30);
  });
});

// ── Utilidades de rango ──────────────────────────────────────────────────────

describe("visitsInRange / firstDeclaredVisitIso", () => {
  const visits = [
    visit({ visit_date: "2026-06-01" }),
    visit({ visit_date: "2026-08-15", status: "Cancelada" }),
    visit({ visit_date: "2026-08-20" }),
  ];

  it("filtra por rango dejando fuera lo no declarable", () => {
    expect(visitsInRange(visits, monthRange("2026-08")).map((v) => v.visit_date)).toEqual(["2026-08-20"]);
    expect(visitsInRange(visits)).toHaveLength(2);
  });

  it("la primera visita ignora canceladas y programadas", () => {
    expect(firstDeclaredVisitIso(visits)).toBe("2026-06-01");
    expect(firstDeclaredVisitIso([visit({ visit_date: "2026-01-01", status: "Programada" })])).toBeNull();
    expect(firstDeclaredVisitIso([])).toBeNull();
  });
});
