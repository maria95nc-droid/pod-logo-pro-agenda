import { describe, it, expect } from "vitest";
import {
  barPercent,
  buildDayStats,
  buildMonthStats,
  buildVisitsByDay,
  heatLevel,
  isFullyCancelledDay,
  isUnbilledDay,
  maxGross,
  nearestActiveKey,
  sumDays,
  type AgendaVisit,
} from "@/lib/agendaStats";
import { monthLabel } from "@/lib/calendar";

const visit = (overrides: Partial<AgendaVisit> & Pick<AgendaVisit, "id" | "visit_date">): AgendaVisit => ({
  start_time: "09:00:00",
  end_time: "11:00:00",
  status: "Realizada",
  gross_amount: 100,
  patients_count: 5,
  center_id: "c1",
  ...overrides,
});

describe("buildDayStats", () => {
  it("agrupa visitas por día civil sumando bruto y pacientes", () => {
    const stats = buildDayStats([
      visit({ id: "1", visit_date: "2026-08-10", gross_amount: 120, patients_count: 6 }),
      visit({ id: "2", visit_date: "2026-08-10", gross_amount: 80, patients_count: 4 }),
      visit({ id: "3", visit_date: "2026-08-11", gross_amount: 50, patients_count: 2 }),
    ]);

    expect(stats.get("2026-08-10")).toEqual({ visits: 2, gross: 200, patients: 10, completed: 2, cancelled: 0 });
    expect(stats.get("2026-08-11")?.gross).toBe(50);
    expect(stats.get("2026-08-12")).toBeUndefined();
  });

  it("normaliza timestamps y tolera importes no numéricos", () => {
    const stats = buildDayStats([
      visit({ id: "1", visit_date: "2026-08-10T00:00:00+02:00" }),
      visit({ id: "2", visit_date: "2026-08-10", gross_amount: Number("no") }),
    ]);
    expect(stats.get("2026-08-10")).toEqual({ visits: 2, gross: 100, patients: 10, completed: 2, cancelled: 0 });
  });

  it("solo cuenta como completadas las visitas realizadas, cobradas o facturadas", () => {
    const stats = buildDayStats([
      visit({ id: "1", visit_date: "2026-08-10", status: "Programada" }),
      visit({ id: "2", visit_date: "2026-08-10", status: "Cobrada" }),
      visit({ id: "3", visit_date: "2026-08-10", status: "Cancelada" }),
    ]);
    expect(stats.get("2026-08-10")?.completed).toBe(1);
    expect(stats.get("2026-08-10")?.visits).toBe(3);
  });
});

describe("buildVisitsByDay", () => {
  it("ordena las visitas de cada día por hora de inicio", () => {
    const byDay = buildVisitsByDay([
      visit({ id: "tarde", visit_date: "2026-08-10", start_time: "16:30:00" }),
      visit({ id: "manana", visit_date: "2026-08-10", start_time: "08:00:00" }),
      visit({ id: "sin-hora", visit_date: "2026-08-10", start_time: null }),
    ]);
    expect(byDay.get("2026-08-10")?.map((v) => v.id)).toEqual(["sin-hora", "manana", "tarde"]);
  });
});

describe("buildMonthStats / sumDays / maxGross", () => {
  const dayStats = buildDayStats([
    visit({ id: "1", visit_date: "2026-08-10", gross_amount: 120 }),
    visit({ id: "2", visit_date: "2026-08-24", gross_amount: 300 }),
    visit({ id: "3", visit_date: "2026-09-02", gross_amount: 60 }),
  ]);

  it("agrega por mes contando días distintos", () => {
    const months = buildMonthStats(dayStats);
    expect(months.get("2026-08")).toMatchObject({ visits: 2, gross: 420, days: 2 });
    expect(months.get("2026-09")).toMatchObject({ visits: 1, gross: 60, days: 1 });
  });

  it("suma sólo los días pedidos e ignora los vacíos", () => {
    const total = sumDays(dayStats, ["2026-08-10", "2026-08-11", "2026-08-24"]);
    expect(total).toEqual({ visits: 2, gross: 420, patients: 10, completed: 2, cancelled: 0, days: 2 });
  });

  it("devuelve el mejor día del periodo", () => {
    expect(maxGross(dayStats, ["2026-08-10", "2026-08-24"])).toBe(300);
    expect(maxGross(dayStats, ["2026-01-01"])).toBe(0);
  });
});

describe("nearestActiveKey", () => {
  const dayStats = buildDayStats([
    visit({ id: "1", visit_date: "2026-06-10" }),
    visit({ id: "2", visit_date: "2026-08-24" }),
  ]);
  const months = buildMonthStats(dayStats);

  it("propone el último mes trabajado cuando el mes visible está vacío", () => {
    expect(nearestActiveKey(months, "2026-09")).toBe("2026-08");
  });

  it("incluye el propio periodo si tiene actividad", () => {
    expect(nearestActiveKey(months, "2026-08")).toBe("2026-08");
  });

  it("mira hacia adelante sólo si no hay nada en el pasado", () => {
    expect(nearestActiveKey(months, "2026-01")).toBe("2026-06");
  });

  it("funciona igual con claves de día", () => {
    expect(nearestActiveKey(dayStats, "2026-09-18")).toBe("2026-08-24");
    expect(nearestActiveKey(new Map(), "2026-09-18")).toBeNull();
  });
});

describe("monthLabel", () => {
  it("convierte la clave de mes en texto legible sin pasar por Date", () => {
    expect(monthLabel("2026-08")).toBe("Agosto 2026");
    expect(monthLabel("2026-01")).toBe("Enero 2026");
  });

  it("devuelve la clave tal cual si no es válida", () => {
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(monthLabel("")).toBe("");
  });
});

describe("heatLevel", () => {
  it("reserva el nivel 0 para los días sin ingreso", () => {
    expect(heatLevel(0, 400)).toBe(0);
    expect(heatLevel(120, 0)).toBe(0);
    expect(heatLevel(-10, 400)).toBe(0);
  });

  it("reparte los ingresos en cuatro niveles relativos al mejor día", () => {
    expect(heatLevel(1, 400)).toBe(1);
    expect(heatLevel(100, 400)).toBe(1);
    expect(heatLevel(200, 400)).toBe(2);
    expect(heatLevel(300, 400)).toBe(3);
    expect(heatLevel(400, 400)).toBe(4);
  });

  it("acota valores por encima del máximo", () => {
    expect(heatLevel(900, 400)).toBe(4);
  });
});

describe("isUnbilledDay / isFullyCancelledDay", () => {
  it("distingue el día trabajado sin importe del día libre", () => {
    expect(isUnbilledDay({ visits: 2, gross: 0, patients: 9, completed: 2, cancelled: 0 })).toBe(true);
    expect(isUnbilledDay({ visits: 0, gross: 0, patients: 0, completed: 0, cancelled: 0 })).toBe(false);
    expect(isUnbilledDay({ visits: 2, gross: 120, patients: 9, completed: 2, cancelled: 0 })).toBe(false);
    expect(isUnbilledDay(undefined)).toBe(false);
  });

  it("no marca como pendiente de facturar un día que sólo tiene cancelaciones", () => {
    const cancelledOnly = { visits: 1, gross: 0, patients: 0, completed: 0, cancelled: 1 };
    expect(isUnbilledDay(cancelledOnly)).toBe(false);
    expect(isFullyCancelledDay(cancelledOnly)).toBe(true);
  });

  it("sigue marcando pendiente el día con una cancelación y trabajo real sin importe", () => {
    const mixed = { visits: 2, gross: 0, patients: 8, completed: 1, cancelled: 1 };
    expect(isUnbilledDay(mixed)).toBe(true);
    expect(isFullyCancelledDay(mixed)).toBe(false);
  });
});

describe("barPercent", () => {
  it("garantiza un mínimo visible y nunca pasa del 100 %", () => {
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(1, 1000)).toBe(6);
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(500, 100)).toBe(100);
  });
});
