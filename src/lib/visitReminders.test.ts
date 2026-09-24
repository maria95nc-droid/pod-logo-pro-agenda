import { describe, it, expect } from "vitest";
import {
  CALL_LEAD_DAYS,
  buildCallReminders,
  daysBetweenIso,
  frequencyWeeksLabel,
  groupRemindersByDueDay,
  leadDaysFor,
  normalizeFrequencyWeeks,
  reminderSchedulePath,
  remindersInMonth,
  suggestedScheduleIso,
  timingText,
  type CallReminder,
  type ReminderCenter,
  type ReminderVisit,
} from "@/lib/visitReminders";
import { toIsoDate } from "@/lib/format";

/** Jueves 24 de septiembre de 2026, medianoche local. */
const TODAY = new Date(2026, 8, 24);

const dayOffset = (n: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

const center = (over: Partial<ReminderCenter> = {}): ReminderCenter => ({
  id: "c1",
  name: "Residencia Ave María",
  contact_phone: "958 11 22 33",
  is_active: true,
  visit_frequency_weeks: 4,
  ...over,
});

const visit = (over: Partial<ReminderVisit> = {}): ReminderVisit => ({
  center_id: "c1",
  visit_date: dayOffset(-28),
  status: "Realizada",
  ...over,
});

describe("normalizeFrequencyWeeks", () => {
  it("acepta enteros dentro de rango, vengan como número o como cadena", () => {
    expect(normalizeFrequencyWeeks(4)).toBe(4);
    expect(normalizeFrequencyWeeks("6")).toBe(6);
    expect(normalizeFrequencyWeeks(1)).toBe(1);
    expect(normalizeFrequencyWeeks(52)).toBe(52);
  });

  it("descarta vacíos, decimales y valores fuera de rango", () => {
    expect(normalizeFrequencyWeeks(null)).toBeNull();
    expect(normalizeFrequencyWeeks(undefined)).toBeNull();
    expect(normalizeFrequencyWeeks("")).toBeNull();
    expect(normalizeFrequencyWeeks("mensual")).toBeNull();
    expect(normalizeFrequencyWeeks(4.5)).toBeNull();
    expect(normalizeFrequencyWeeks(0)).toBeNull();
    expect(normalizeFrequencyWeeks(-4)).toBeNull();
    expect(normalizeFrequencyWeeks(53)).toBeNull();
  });
});

describe("frequencyWeeksLabel", () => {
  it("traduce las cadencias habituales a lenguaje de David", () => {
    expect(frequencyWeeksLabel(2)).toBe("Cada 2 semanas (quincenal)");
    expect(frequencyWeeksLabel(4)).toBe("Cada 4 semanas (mensual)");
    expect(frequencyWeeksLabel(6)).toBe("Cada 6 semanas (mes y medio)");
    expect(frequencyWeeksLabel(8)).toBe("Cada 8 semanas (cada 2 meses)");
  });

  it("para cadencias libres se queda en las semanas, en singular y plural", () => {
    expect(frequencyWeeksLabel(1)).toBe("Cada 1 semana");
    expect(frequencyWeeksLabel(5)).toBe("Cada 5 semanas");
  });
});

describe("daysBetweenIso", () => {
  it("cuenta días civiles con signo", () => {
    expect(daysBetweenIso("2026-09-24", "2026-09-27")).toBe(3);
    expect(daysBetweenIso("2026-09-27", "2026-09-24")).toBe(-3);
    expect(daysBetweenIso("2026-09-24", "2026-09-24")).toBe(0);
  });

  it("no se desvía en el cambio de hora ni al cruzar meses y años", () => {
    // Último domingo de octubre: la noche tiene 25 horas en España.
    expect(daysBetweenIso("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetweenIso("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("devuelve NaN con fechas inválidas", () => {
    expect(daysBetweenIso("", "2026-09-24")).toBeNaN();
  });
});

describe("leadDaysFor", () => {
  it("mantiene los 10 días en las cadencias largas", () => {
    expect(leadDaysFor(4)).toBe(CALL_LEAD_DAYS);
    expect(leadDaysFor(6)).toBe(CALL_LEAD_DAYS);
    expect(leadDaysFor(8)).toBe(CALL_LEAD_DAYS);
  });

  it("recorta la antelación en cadencias cortas para que el aviso no sea permanente", () => {
    expect(leadDaysFor(2)).toBe(6);
    expect(leadDaysFor(1)).toBe(3);
  });
});

describe("timingText", () => {
  it("usa futuro antes de la fecha y pasado después", () => {
    expect(timingText(3)).toBe("toca en 3 días");
    expect(timingText(1)).toBe("toca mañana");
    expect(timingText(0)).toBe("toca hoy");
    expect(timingText(-1)).toBe("tocaba ayer");
    expect(timingText(-2)).toBe("tocaba hace 2 días");
  });
});

describe("buildCallReminders", () => {
  it("avisa cuando la próxima visita entra en la ventana de 10 días", () => {
    // Última visita hace 20 días, cadencia de 4 semanas: toca dentro de 8.
    const reminders = buildCallReminders([center()], [visit({ visit_date: dayOffset(-20) })], TODAY);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      centerId: "c1",
      centerName: "Residencia Ave María",
      contactPhone: "958 11 22 33",
      frequencyWeeks: 4,
      lastVisitIso: dayOffset(-20),
      dueIso: dayOffset(8),
      daysUntilDue: 8,
      overdue: false,
      timingText: "toca en 8 días",
    });
  });

  it("no avisa si aún falta más que la antelación", () => {
    // Toca dentro de 11 días: un día antes de que empiece a avisar.
    expect(buildCallReminders([center()], [visit({ visit_date: dayOffset(-17) })], TODAY)).toEqual([]);
  });

  it("avisa justo en el límite de la ventana", () => {
    const reminders = buildCallReminders([center()], [visit({ visit_date: dayOffset(-18) })], TODAY);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].daysUntilDue).toBe(CALL_LEAD_DAYS);
  });

  it("sigue avisando, marcado como pasado, cuando la fecha ya venció", () => {
    const reminders = buildCallReminders([center()], [visit({ visit_date: dayOffset(-32) })], TODAY);
    expect(reminders[0]).toMatchObject({ daysUntilDue: -4, overdue: true, timingText: "tocaba hace 4 días" });
  });

  it("no avisa si el centro no tiene cadencia definida", () => {
    const centers = [center({ visit_frequency_weeks: null })];
    expect(buildCallReminders(centers, [visit({ visit_date: dayOffset(-40) })], TODAY)).toEqual([]);
  });

  it("no confunde el texto libre `visit_frequency` con la cadencia numérica", () => {
    const centers = [center({ visit_frequency_weeks: "2 veces al mes" as unknown as number })];
    expect(buildCallReminders(centers, [visit({ visit_date: dayOffset(-40) })], TODAY)).toEqual([]);
  });

  it("no avisa si el centro nunca ha tenido una visita completada", () => {
    const visits = [
      visit({ visit_date: dayOffset(-40), status: "Cancelada" }),
      visit({ visit_date: dayOffset(-30), status: "Programada" }),
    ];
    expect(buildCallReminders([center()], visits, TODAY)).toEqual([]);
  });

  it("cuenta desde la última visita realmente hecha, no desde la primera", () => {
    const visits = [
      visit({ visit_date: dayOffset(-60) }),
      visit({ visit_date: dayOffset(-25), status: "Cobrada" }),
      visit({ visit_date: dayOffset(-40), status: "Facturada" }),
    ];
    const reminders = buildCallReminders([center()], visits, TODAY);
    expect(reminders[0]).toMatchObject({ lastVisitIso: dayOffset(-25), daysUntilDue: 3 });
  });

  it("acepta «Pendiente de cobro» como visita hecha, igual que la racha", () => {
    const visits = [visit({ visit_date: dayOffset(-25), status: "Pendiente de cobro" })];
    expect(buildCallReminders([center()], visits, TODAY)).toHaveLength(1);
  });

  it("se apaga si ya hay una visita programada por delante", () => {
    const visits = [
      visit({ visit_date: dayOffset(-25) }),
      visit({ visit_date: dayOffset(5), status: "Programada" }),
    ];
    expect(buildCallReminders([center()], visits, TODAY)).toEqual([]);
  });

  it("una visita programada hoy también lo apaga: la llamada ya está hecha", () => {
    const visits = [
      visit({ visit_date: dayOffset(-25) }),
      visit({ visit_date: dayOffset(0), status: "Programada" }),
    ];
    expect(buildCallReminders([center()], visits, TODAY)).toEqual([]);
  });

  it("una visita programada que ya pasó no lo apaga: se quedó sin hacer", () => {
    const visits = [
      visit({ visit_date: dayOffset(-25) }),
      visit({ visit_date: dayOffset(-2), status: "Programada" }),
    ];
    expect(buildCallReminders([center()], visits, TODAY)).toHaveLength(1);
  });

  it("ignora los centros desactivados", () => {
    const centers = [center({ is_active: false })];
    expect(buildCallReminders(centers, [visit({ visit_date: dayOffset(-30) })], TODAY)).toEqual([]);
  });

  it("no mezcla centros: cada aviso mira sólo sus propias visitas", () => {
    const centers = [center(), center({ id: "c2", name: "Residencia Sur", contact_phone: null })];
    const visits = [
      visit({ visit_date: dayOffset(-25) }),
      visit({ center_id: "c2", visit_date: dayOffset(-2) }),
    ];
    const reminders = buildCallReminders(centers, visits, TODAY);
    expect(reminders.map((r) => r.centerId)).toEqual(["c1"]);
    expect(reminders[0].lastVisitIso).toBe(dayOffset(-25));
  });

  it("tolera visitas sin centro y fechas con hora", () => {
    const visits = [
      { center_id: null, visit_date: dayOffset(-1), status: "Realizada" },
      visit({ visit_date: `${dayOffset(-25)}T00:00:00+02:00` }),
    ];
    const reminders = buildCallReminders([center()], visits, TODAY);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].lastVisitIso).toBe(dayOffset(-25));
  });

  it("deja el teléfono a null cuando el centro no lo tiene", () => {
    const centers = [center({ contact_phone: "   " })];
    const reminders = buildCallReminders(centers, [visit({ visit_date: dayOffset(-25) })], TODAY);
    expect(reminders[0].contactPhone).toBeNull();
  });

  it("ordena por urgencia y, a igualdad, por nombre", () => {
    const centers = [
      center({ id: "c1", name: "Zafiro" }),
      center({ id: "c2", name: "Ave María" }),
      center({ id: "c3", name: "Bermejales" }),
    ];
    const visits = [
      visit({ center_id: "c1", visit_date: dayOffset(-25) }), // toca en 3
      visit({ center_id: "c2", visit_date: dayOffset(-35) }), // tocaba hace 7
      visit({ center_id: "c3", visit_date: dayOffset(-35) }), // tocaba hace 7
    ];
    const reminders = buildCallReminders(centers, visits, TODAY);
    expect(reminders.map((r) => r.centerName)).toEqual(["Ave María", "Bermejales", "Zafiro"]);
  });

  it("respeta el huso local a última hora de la tarde (no adelanta el día)", () => {
    // 23:30 local: con `toISOString()` «hoy» sería el día siguiente y la
    // cuenta de días saldría desplazada.
    const lateToday = new Date(2026, 8, 24, 23, 30);
    const reminders = buildCallReminders([center()], [visit({ visit_date: dayOffset(-18) })], lateToday);
    expect(reminders[0].daysUntilDue).toBe(CALL_LEAD_DAYS);
  });
});

describe("suggestedScheduleIso", () => {
  it("propone la fecha en la que toca si está por venir", () => {
    const [reminder] = buildCallReminders([center()], [visit({ visit_date: dayOffset(-25) })], TODAY);
    expect(suggestedScheduleIso(reminder, TODAY)).toBe(dayOffset(3));
  });

  it("propone hoy si la fecha ya se pasó", () => {
    const [reminder] = buildCallReminders([center()], [visit({ visit_date: dayOffset(-35) })], TODAY);
    expect(suggestedScheduleIso(reminder, TODAY)).toBe(dayOffset(0));
  });

  it("construye la ruta del formulario con el centro y la fecha", () => {
    const [reminder] = buildCallReminders([center()], [visit({ visit_date: dayOffset(-25) })], TODAY);
    expect(reminderSchedulePath(reminder, TODAY)).toBe(`/visita/nueva?centro=c1&fecha=${dayOffset(3)}`);
  });
});

describe("remindersInMonth", () => {
  const reminder = (over: Partial<CallReminder>): CallReminder => ({
    centerId: "c1", centerName: "A", contactPhone: null, frequencyWeeks: 4,
    lastVisitIso: "2026-08-01", dueIso: "2026-09-27", daysUntilDue: 3,
    overdue: false, timingText: "toca en 3 días", ...over,
  });
  const septiembre = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
  const octubre = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

  it("incluye los avisos cuya fecha cae en el mes visible", () => {
    const list = [reminder({}), reminder({ centerId: "c2", dueIso: "2026-10-05" })];
    expect(remindersInMonth(list, septiembre, "2026-09-24").map((r) => r.centerId)).toEqual(["c1"]);
  });

  it("arrastra los atrasados al mes en curso aunque su fecha sea de otro mes", () => {
    const late = reminder({ centerId: "c9", dueIso: "2026-08-30", daysUntilDue: -25, overdue: true });
    expect(remindersInMonth([late], septiembre, "2026-09-24").map((r) => r.centerId)).toEqual(["c9"]);
  });

  it("no arrastra los atrasados a un mes que no contiene hoy", () => {
    const late = reminder({ dueIso: "2026-08-30", overdue: true });
    expect(remindersInMonth([late], octubre, "2026-09-24")).toEqual([]);
  });

  it("no duplica un aviso atrasado cuya fecha ya está en el mes visible", () => {
    const late = reminder({ dueIso: "2026-09-21", daysUntilDue: -3, overdue: true });
    expect(remindersInMonth([late], septiembre, "2026-09-24")).toHaveLength(1);
  });
});

describe("groupRemindersByDueDay", () => {
  it("agrupa por la fecha en la que toca", () => {
    const centers = [center({ id: "c1", name: "A" }), center({ id: "c2", name: "B" })];
    const visits = [
      visit({ center_id: "c1", visit_date: dayOffset(-25) }),
      visit({ center_id: "c2", visit_date: dayOffset(-25) }),
    ];
    const grouped = groupRemindersByDueDay(buildCallReminders(centers, visits, TODAY));
    expect([...grouped.keys()]).toEqual([dayOffset(3)]);
    expect(grouped.get(dayOffset(3))?.map((r) => r.centerName)).toEqual(["A", "B"]);
  });

  it("devuelve un mapa vacío sin avisos", () => {
    expect(groupRemindersByDueDay([]).size).toBe(0);
  });
});
