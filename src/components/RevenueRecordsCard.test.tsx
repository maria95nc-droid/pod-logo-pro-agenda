import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { RevenueRecordsCard } from "@/components/RevenueRecordsCard";
import { formatEUR } from "@/lib/format";
import { revenueProgress, revenueRecords, type RevenueVisit } from "@/lib/revenueRecords";

/**
 * Tarjeta de récords de facturación. Se prueba con el cálculo real detrás (no
 * con datos inventados a mano) para que la pantalla y `revenueRecords.ts` no
 * puedan contarse cosas distintas.
 */

/** Espacio duro del € normalizado, como en los demás tests de pantalla. */
const eur = (value: number): string => formatEUR(value).replace(/\u00A0/g, " ");

// Fecha fija: la tarjeta compara contra «hoy» y contra el mes en curso.
const TODAY = new Date(2026, 8, 26, 10, 0, 0); // 26 de septiembre de 2026

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterAll(() => vi.useRealTimers());
afterEach(cleanup);

const renderCard = (visits: readonly RevenueVisit[]) =>
  render(
    <RevenueRecordsCard
      records={revenueRecords(visits)}
      day={revenueProgress(visits, "2026-09-26")}
      month={revenueProgress(visits, "2026-09")}
    />,
  );

/** El importe del récord y el «te faltan…» pueden coincidir: se busca dentro de su propia fila. */
const recordItem = (label: string): HTMLElement => screen.getByText(label).closest("li") as HTMLElement;

const history: RevenueVisit[] = [
  // Mejor día de la historia: 320 € el lunes 24 de agosto.
  { visit_date: "2026-08-24", status: "Cobrada", gross_amount: 200 },
  { visit_date: "2026-08-24", status: "Pendiente de cobro", gross_amount: 120 },
  { visit_date: "2026-08-25", status: "Cobrada", gross_amount: 180 },
  // Mejor mes: agosto, 500 €.
];

describe("Tarjeta de récords de facturación", () => {
  it("enseña el mejor día y el mejor mes con su fecha y sus visitas", () => {
    // Con 20 € facturados hoy, el importe del récord y el «te faltan» no
    // coinciden y se puede afirmar cuál es cuál.
    renderCard([...history, { visit_date: "2026-09-26", status: "Cobrada", gross_amount: 20 }]);
    expect(screen.getByRole("heading", { level: 2, name: "Tus récords de facturación" })).toBeInTheDocument();
    // Avisa de que no siguen el selector de mes de Finanzas.
    expect(screen.getByText("De todo tu histórico, no del mes elegido arriba.")).toBeInTheDocument();

    const day = recordItem("Mejor día");
    expect(within(day).getByText(eur(320))).toBeInTheDocument();
    expect(within(day).getByText("Lunes, 24 de agosto · 2 visitas")).toBeInTheDocument();

    const month = recordItem("Mejor mes");
    expect(within(month).getByText(eur(500))).toBeInTheDocument();
    expect(within(month).getByText("Agosto 2026 · 3 visitas")).toBeInTheDocument();
  });

  it("dice cuánto falta cuando el día y el mes en curso están a cero", () => {
    renderCard(history);
    expect(screen.getByText(/Hoy todavía no has facturado nada/)).toHaveTextContent(`te faltan ${eur(320)}`);
    expect(screen.getByText(/Este mes todavía no has facturado nada/)).toHaveTextContent(`te faltan ${eur(500)}`);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    for (const bar of bars) expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("compara el progreso del día en curso con el récord", () => {
    renderCard([...history, { visit_date: "2026-09-26", status: "Pendiente de cobro", gross_amount: 180 }]);
    expect(screen.getByText(/Hoy vas por/)).toHaveTextContent(`Hoy vas por ${eur(180)}: te faltan ${eur(140)}`);
    // 180 de 320 = 56 %.
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute("aria-valuenow", "56");
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute("aria-valuetext", "56 % de tu mejor día");
  });

  it("celebra el récord nuevo del día en vez de pintar la barra", () => {
    renderCard([...history, { visit_date: "2026-09-26", status: "Cobrada", gross_amount: 400 }]);
    expect(screen.getByText(/¡Récord nuevo! Hoy llevas/)).toHaveTextContent(eur(400));
    // El mejor día pasa a ser hoy, y el del mes sigue con su barra.
    expect(screen.getByText("Sábado, 26 de septiembre · 1 visita")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("avisa también del récord igualado al céntimo", () => {
    renderCard([...history, { visit_date: "2026-09-26", status: "Cobrada", gross_amount: 320 }]);
    expect(screen.getByText(`¡Récord igualado con ${eur(320)}!`)).toBeInTheDocument();
  });

  it("con el año distinto del actual dice de qué año era el récord", () => {
    renderCard([{ visit_date: "2025-11-03", status: "Cobrada", gross_amount: 260 }]);
    expect(screen.getByText("Lunes, 3 de noviembre de 2025 · 1 visita")).toBeInTheDocument();
  });

  it("sin histórico invita a empezar en vez de enseñar ceros", () => {
    renderCard([{ visit_date: "2026-09-30", status: "Programada", gross_amount: 500 }]);
    expect(screen.getByText(/Todavía no hay récord/)).toBeInTheDocument();
    expect(screen.queryByText("Mejor día")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("no compara nada cuando el único periodo con dinero es el propio día en curso", () => {
    renderCard([{ visit_date: "2026-09-26", status: "Cobrada", gross_amount: 150 }]);
    expect(within(recordItem("Mejor día")).getByText(eur(150))).toBeInTheDocument();
    // Ni barra ni «récord nuevo»: no habría contra qué compararse.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Récord nuevo/)).not.toBeInTheDocument();
  });
});
