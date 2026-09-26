import { describe, it, expect } from "vitest";
import {
  bestRevenuePeriod,
  periodKeyOf,
  revenueByPeriod,
  revenueProgress,
  revenueRecords,
  type RevenueVisit,
} from "@/lib/revenueRecords";

/**
 * Récords de facturación. Es dinero real que se le enseña al usuario como
 * objetivo, así que lo que se protege aquí es sobre todo lo que **no** debe
 * contar: visitas programadas, canceladas y devoluciones.
 */

let seq = 0;
const visit = (over: Partial<RevenueVisit> = {}): RevenueVisit => ({
  visit_date: `2026-08-${String((seq++ % 28) + 1).padStart(2, "0")}`,
  status: "Cobrada",
  gross_amount: 100,
  ...over,
});

// ── Agrupación ───────────────────────────────────────────────────────────────

describe("periodKeyOf", () => {
  it("normaliza un timestamp a fecha civil y a mes", () => {
    expect(periodKeyOf("2026-08-24T23:30:00", "day")).toBe("2026-08-24");
    expect(periodKeyOf("2026-08-24T23:30:00", "month")).toBe("2026-08");
    expect(periodKeyOf("2026-08-24", "day")).toBe("2026-08-24");
    expect(periodKeyOf("2026-08-24", "month")).toBe("2026-08");
  });
});

describe("revenueByPeriod", () => {
  it("suma todas las visitas hechas del mismo día", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: "2026-08-24", gross_amount: 180 }),
        visit({ visit_date: "2026-08-24", gross_amount: 140, status: "Pendiente de cobro" }),
        visit({ visit_date: "2026-08-25", gross_amount: 90 }),
      ],
      "day",
    );
    expect(periods.get("2026-08-24")).toEqual({ key: "2026-08-24", amount: 320, visits: 2 });
    expect(periods.get("2026-08-25")).toEqual({ key: "2026-08-25", amount: 90, visits: 1 });
  });

  it("agrupa por mes con la misma pasada", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: "2026-08-01", gross_amount: 300 }),
        visit({ visit_date: "2026-08-31", gross_amount: 200 }),
        visit({ visit_date: "2026-09-01", gross_amount: 50 }),
      ],
      "month",
    );
    expect(periods.get("2026-08")).toEqual({ key: "2026-08", amount: 500, visits: 2 });
    expect(periods.get("2026-09")).toEqual({ key: "2026-09", amount: 50, visits: 1 });
  });

  it("usa el detalle por paciente cuando existe, igual que Finanzas", () => {
    const periods = revenueByPeriod(
      [
        visit({
          visit_date: "2026-08-10",
          // El agregado dice 999 € y el detalle 40 €: manda el detalle.
          gross_amount: 999,
          visit_patients: [
            { id: "a", price_charged: 18, payment_status: "Cobrado" },
            { id: "b", price_charged: 22, payment_status: "Pendiente" },
          ],
        }),
      ],
      "day",
    );
    expect(periods.get("2026-08-10")?.amount).toBe(40);
  });

  it("deja fuera las programadas y las canceladas", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: "2026-08-24", gross_amount: 100 }),
        visit({ visit_date: "2026-08-24", gross_amount: 9000, status: "Programada" }),
        visit({ visit_date: "2026-08-24", gross_amount: 9000, status: "Cancelada" }),
      ],
      "day",
    );
    expect(periods.get("2026-08-24")).toEqual({ key: "2026-08-24", amount: 100, visits: 1 });
  });

  it("ignora visitas sin fecha y trocea el timestamp de Supabase", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: null, gross_amount: 500 }),
        visit({ visit_date: "", gross_amount: 500 }),
        visit({ visit_date: "2026-08-31T23:45:00", gross_amount: 70 }),
      ],
      "day",
    );
    expect(periods.size).toBe(1);
    expect(periods.get("2026-08-31")?.amount).toBe(70);
  });

  it("redondea a céntimos una sola vez, al cerrar el periodo", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: "2026-08-24", gross_amount: 33.33 }),
        visit({ visit_date: "2026-08-24", gross_amount: 33.33 }),
        visit({ visit_date: "2026-08-24", gross_amount: 33.33 }),
      ],
      "day",
    );
    expect(periods.get("2026-08-24")?.amount).toBe(99.99);
  });
});

// ── Mejor periodo ────────────────────────────────────────────────────────────

describe("bestRevenuePeriod", () => {
  it("elige el periodo con más dinero", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: "2026-07-10", gross_amount: 250 }),
        visit({ visit_date: "2026-08-24", gross_amount: 320 }),
        visit({ visit_date: "2026-08-25", gross_amount: 300 }),
      ],
      "day",
    );
    expect(bestRevenuePeriod(periods)).toEqual({ key: "2026-08-24", amount: 320, visits: 1 });
  });

  it("en un empate gana el más reciente", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: "2026-07-10", gross_amount: 300 }),
        visit({ visit_date: "2026-08-24", gross_amount: 300 }),
      ],
      "day",
    );
    expect(bestRevenuePeriod(periods)?.key).toBe("2026-08-24");
  });

  it("no da por récord un día sin importe ni una devolución", () => {
    const periods = revenueByPeriod(
      [
        // Trabajo registrado sin importe todavía (lo factura la gestora).
        visit({ visit_date: "2026-08-24", gross_amount: 0, status: "Realizada" }),
        // Devolución: el día cierra en negativo.
        visit({ visit_date: "2026-08-25", gross_amount: -40 }),
      ],
      "day",
    );
    expect(periods.size).toBe(2);
    expect(bestRevenuePeriod(periods)).toBeNull();
  });

  it("excluye el periodo indicado", () => {
    const periods = revenueByPeriod(
      [
        visit({ visit_date: "2026-08-24", gross_amount: 320 }),
        visit({ visit_date: "2026-08-25", gross_amount: 200 }),
      ],
      "day",
    );
    expect(bestRevenuePeriod(periods, { exclude: "2026-08-24" })?.key).toBe("2026-08-25");
  });

  it("devuelve una copia: quien la reciba no puede alterar el mapa", () => {
    const periods = revenueByPeriod([visit({ visit_date: "2026-08-24", gross_amount: 320 })], "day");
    const best = bestRevenuePeriod(periods)!;
    best.amount = 9999;
    expect(periods.get("2026-08-24")?.amount).toBe(320);
  });

  it("sin visitas no hay récord", () => {
    expect(bestRevenuePeriod(revenueByPeriod([], "day"))).toBeNull();
  });
});

// ── Los dos récords ──────────────────────────────────────────────────────────

describe("revenueRecords", () => {
  it("da el mejor día y el mejor mes del histórico completo", () => {
    const records = revenueRecords([
      // Julio: 250 + 250 = 500 € en dos días.
      visit({ visit_date: "2026-07-10", gross_amount: 250 }),
      visit({ visit_date: "2026-07-24", gross_amount: 250 }),
      // Agosto: 320 + 180 = 500 €… empate de mes, y el mejor día de siempre.
      visit({ visit_date: "2026-08-24", gross_amount: 320 }),
      visit({ visit_date: "2026-08-25", gross_amount: 180 }),
    ]);
    expect(records.bestDay).toEqual({ key: "2026-08-24", amount: 320, visits: 1 });
    // Empate a 500 € entre julio y agosto: gana el más reciente.
    expect(records.bestMonth).toEqual({ key: "2026-08", amount: 500, visits: 2 });
  });

  it("el mejor mes puede no contener el mejor día", () => {
    const records = revenueRecords([
      // Un único día enorme en julio.
      visit({ visit_date: "2026-07-10", gross_amount: 400 }),
      // Agosto factura más en total, repartido en tres días más flojos.
      visit({ visit_date: "2026-08-01", gross_amount: 200 }),
      visit({ visit_date: "2026-08-02", gross_amount: 200 }),
      visit({ visit_date: "2026-08-03", gross_amount: 200 }),
    ]);
    expect(records.bestDay?.key).toBe("2026-07-10");
    expect(records.bestMonth).toEqual({ key: "2026-08", amount: 600, visits: 3 });
  });

  it("sin histórico no hay récords que enseñar", () => {
    expect(revenueRecords([])).toEqual({ bestDay: null, bestMonth: null });
    expect(revenueRecords([visit({ status: "Programada", gross_amount: 500 })])).toEqual({
      bestDay: null,
      bestMonth: null,
    });
  });
});

// ── Progreso del periodo en curso ────────────────────────────────────────────

describe("revenueProgress", () => {
  const history: RevenueVisit[] = [
    visit({ visit_date: "2026-07-10", gross_amount: 320 }),
    visit({ visit_date: "2026-07-11", gross_amount: 180 }),
  ];

  it("la longitud de la clave decide si se mide un día o un mes", () => {
    expect(revenueProgress(history, "2026-07-10").record?.key).toBe("2026-07-11");
    expect(revenueProgress(history, "2026-07").record).toBeNull();
    expect(revenueProgress(history, "2026-08").record?.key).toBe("2026-07");
  });

  it("compara el día en curso contra el récord de los demás días", () => {
    const progress = revenueProgress([...history, visit({ visit_date: "2026-08-24", gross_amount: 180 })], "2026-08-24");
    expect(progress.current).toBe(180);
    expect(progress.visits).toBe(1);
    expect(progress.record?.key).toBe("2026-07-10");
    expect(progress.record?.amount).toBe(320);
    expect(progress.standing).toBe("en-marcha");
    expect(progress.remaining).toBe(140);
    expect(progress.percent).toBe(56);
  });

  it("nunca compara el periodo consigo mismo", () => {
    // Si el día en curso es el mejor de la historia, el récord con el que se
    // compara es el segundo mejor, no él mismo.
    const progress = revenueProgress([...history, visit({ visit_date: "2026-08-24", gross_amount: 900 })], "2026-08-24");
    expect(progress.record?.key).toBe("2026-07-10");
    expect(progress.standing).toBe("superado");
    expect(progress.remaining).toBe(0);
    expect(progress.percent).toBe(100);
  });

  it("detecta el récord igualado al céntimo", () => {
    const progress = revenueProgress([...history, visit({ visit_date: "2026-08-24", gross_amount: 320 })], "2026-08-24");
    expect(progress.standing).toBe("igualado");
    expect(progress.remaining).toBe(0);
    expect(progress.percent).toBe(100);

    const almost = revenueProgress(
      [...history, visit({ visit_date: "2026-08-24", gross_amount: 319.99 })],
      "2026-08-24",
    );
    expect(almost.standing).toBe("en-marcha");
    expect(almost.remaining).toBe(0.01);
  });

  it("un periodo todavía a cero está «sin empezar», no por debajo", () => {
    const progress = revenueProgress(history, "2026-08-24");
    expect(progress.current).toBe(0);
    expect(progress.visits).toBe(0);
    expect(progress.standing).toBe("sin-empezar");
    expect(progress.remaining).toBe(320);
    expect(progress.percent).toBe(0);
  });

  it("sin otro periodo con el que comparar no afirma nada", () => {
    const progress = revenueProgress([visit({ visit_date: "2026-08-24", gross_amount: 320 })], "2026-08-24");
    expect(progress.current).toBe(320);
    expect(progress.record).toBeNull();
    expect(progress.standing).toBe("sin-record");
    expect(progress.remaining).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it("un día cerrado en negativo no queda por encima del récord", () => {
    const progress = revenueProgress([...history, visit({ visit_date: "2026-08-24", gross_amount: -40 })], "2026-08-24");
    expect(progress.current).toBe(-40);
    expect(progress.standing).toBe("sin-empezar");
    expect(progress.remaining).toBe(360);
    // El porcentaje nunca baja de 0 aunque el periodo esté en negativo.
    expect(progress.percent).toBe(0);
  });

  it("compara el mes en curso contra el récord de los demás meses", () => {
    const progress = revenueProgress(
      [
        visit({ visit_date: "2026-07-10", gross_amount: 1000 }),
        visit({ visit_date: "2026-08-01", gross_amount: 400 }),
        visit({ visit_date: "2026-08-20", gross_amount: 350 }),
      ],
      "2026-08",
    );
    expect(progress.current).toBe(750);
    expect(progress.visits).toBe(2);
    expect(progress.record).toEqual({ key: "2026-07", amount: 1000, visits: 1 });
    expect(progress.remaining).toBe(250);
    expect(progress.percent).toBe(75);
  });
});
