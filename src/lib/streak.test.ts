import { describe, it, expect } from "vitest";
import { calculateStreak, isCompletedVisit } from "@/lib/streak";
import { toIsoDate } from "@/lib/format";

const TODAY = new Date(2026, 8, 17); // 17 de septiembre de 2026, hora local

const dayBefore = (n: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
};

const visit = (offset: number, status: string) => ({ visit_date: dayBefore(offset), status });

describe("isCompletedVisit", () => {
  it("cuenta Realizada, Cobrada y Facturada", () => {
    expect(isCompletedVisit({ status: "Realizada" })).toBe(true);
    expect(isCompletedVisit({ status: "Cobrada" })).toBe(true);
    expect(isCompletedVisit({ status: "Facturada" })).toBe(true);
  });

  it("cuenta también las pendientes de cobro: el trabajo está hecho", () => {
    // Al marcar «Realizada» una visita sin cobrar queda en este estado, así que
    // si no contase, la racha y el progreso del día se romperían solos.
    expect(isCompletedVisit({ status: "Pendiente de cobro" })).toBe(true);
  });

  it("no cuenta las programadas ni las canceladas", () => {
    expect(isCompletedVisit({ status: "Programada" })).toBe(false);
    expect(isCompletedVisit({ status: "Cancelada" })).toBe(false);
    expect(isCompletedVisit({})).toBe(false);
  });
});

describe("calculateStreak", () => {
  it("devuelve 0 sin visitas", () => {
    expect(calculateStreak([], TODAY)).toEqual({ days: 0, countsToday: false });
  });

  it("cuenta días consecutivos terminando hoy", () => {
    const visits = [visit(0, "Realizada"), visit(1, "Cobrada"), visit(2, "Facturada")];
    expect(calculateStreak(visits, TODAY)).toEqual({ days: 3, countsToday: true });
  });

  it("no rompe la racha si hoy todavía no hay actividad", () => {
    const visits = [visit(1, "Realizada"), visit(2, "Realizada"), visit(0, "Programada")];
    expect(calculateStreak(visits, TODAY)).toEqual({ days: 2, countsToday: false });
  });

  it("se corta en el primer hueco", () => {
    const visits = [visit(0, "Realizada"), visit(1, "Realizada"), visit(3, "Realizada")];
    expect(calculateStreak(visits, TODAY).days).toBe(2);
  });

  it("no cuenta visitas canceladas o sólo programadas", () => {
    const visits = [visit(0, "Cancelada"), visit(1, "Programada")];
    expect(calculateStreak(visits, TODAY)).toEqual({ days: 0, countsToday: false });
  });

  it("varias visitas el mismo día suman un solo día", () => {
    const visits = [visit(0, "Realizada"), visit(0, "Cobrada"), visit(1, "Realizada")];
    expect(calculateStreak(visits, TODAY).days).toBe(2);
  });

  it("ignora la actividad antigua desconectada de hoy", () => {
    const visits = [visit(10, "Realizada"), visit(11, "Realizada")];
    expect(calculateStreak(visits, TODAY)).toEqual({ days: 0, countsToday: false });
  });

  it("cruza el cambio de mes", () => {
    const start = new Date(2026, 9, 1); // 1 de octubre
    const visits = [
      { visit_date: "2026-10-01", status: "Realizada" },
      { visit_date: "2026-09-30", status: "Realizada" },
      { visit_date: "2026-09-29", status: "Cobrada" },
    ];
    expect(calculateStreak(visits, start).days).toBe(3);
  });

  it("tolera fechas nulas o con marca de tiempo", () => {
    const visits = [
      { visit_date: null, status: "Realizada" },
      { visit_date: `${dayBefore(0)}T08:00:00`, status: "Realizada" },
    ];
    expect(calculateStreak(visits, TODAY)).toEqual({ days: 1, countsToday: true });
  });
});

describe("toIsoDate", () => {
  it("usa la fecha local, no UTC", () => {
    // 23:30 del 17 en España sigue siendo el 17 aunque en UTC ya sea el 18.
    expect(toIsoDate(new Date(2026, 8, 17, 23, 30))).toBe("2026-09-17");
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("no pierde el último día del mes (rangos de exportación)", () => {
    // `new Date(2026, 9, 0)` es el 30 de septiembre a medianoche local: con
    // toISOString() se convertía en "2026-09-29" y la exportación mensual
    // dejaba fuera el último día trabajado.
    expect(toIsoDate(new Date(2026, 9, 0))).toBe("2026-09-30");
    expect(toIsoDate(new Date(2026, 8, 1))).toBe("2026-09-01");
  });
});
