import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { formatEUR } from "@/lib/format";

/**
 * Prueba de humo del detalle de ingresos: comprueba que una visita **sin
 * importe todavía** (las que factura la gestora) sigue diciendo de qué centro
 * sale, que es justo lo que el dueño echaba en falta, y que los filtros de la
 * URL se aplican al listado.
 */

const visits = [
  {
    id: "v1",
    visit_date: "2026-08-25",
    start_time: "10:00:00",
    status: "Realizada",
    gross_amount: 0,
    patients_count: 0,
    center_id: "c-riano",
    general_notes: "PENDIENTE: completar nº de pacientes e importe.",
    visit_patients: [],
  },
  {
    id: "v2",
    visit_date: "2026-07-28",
    start_time: "09:30:00",
    status: "Cobrada",
    gross_amount: 105,
    patients_count: 7,
    center_id: "c-sbarbara",
    general_notes: null,
    visit_patients: [
      {
        id: "vp2",
        patient_id: null,
        patient_name: "7 pacientes",
        price_charged: 105,
        payment_status: "Cobrado",
        attended: true,
        payment_breakdown: [
          { method: "Efectivo", amount: 55 },
          { method: "Bizum", amount: 50 },
        ],
      },
    ],
  },
];

const centers = [
  { id: "c-riano", name: "CPR Riaño", type: "Centro de día", city: "Langreo", payment_method: "A través de empresa gestora (Eulen)" },
  { id: "c-sbarbara", name: "Residencia Santa Bárbara", type: "Residencia", city: "Mieres", payment_method: "Transferencia bancaria" },
];

vi.mock("@/hooks/useData", () => ({
  useVisits: () => ({ data: visits, isLoading: false }),
  useCenters: () => ({ data: centers, isLoading: false }),
}));

const { default: Income } = await import("@/pages/Income");

const renderAt = (search = "") =>
  render(
    <MemoryRouter initialEntries={[`/finanzas/movimientos${search}`]}>
      <Income />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("Detalle de ingresos", () => {
  it("muestra el origen de una visita aunque no tenga importe todavía", () => {
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: "Detalle de ingresos" })).toBeInTheDocument();
    expect(screen.getByText("CPR Riaño")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de facturar")).toBeInTheDocument();
    expect(screen.getByText(/PENDIENTE: completar/)).toBeInTheDocument();
    expect(screen.getByText(/Cobro habitual: A través de empresa gestora/)).toBeInTheDocument();
  });

  it("detalla pacientes, precio y formas de pago de una visita cobrada", () => {
    renderAt();
    expect(screen.getByText("Residencia Santa Bárbara")).toBeInTheDocument();
    expect(screen.getByText(/7 pac\./)).toHaveTextContent("15,00 €");
    expect(screen.getByText(/Efectivo 55,00 € · Bizum 50,00 €/)).toBeInTheDocument();
  });

  it("agrupa por mes, del más reciente al más antiguo", () => {
    renderAt();
    const months = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(months).toEqual(["Agosto 2026", "Julio 2026"]);
  });

  it("aplica los filtros que vienen en la URL", () => {
    renderAt("?mes=2026-08");
    expect(screen.getByText("CPR Riaño")).toBeInTheDocument();
    expect(screen.queryByText("Residencia Santa Bárbara")).not.toBeInTheDocument();
  });

  it("explica que el mes está vacío por culpa del filtro de estado", () => {
    renderAt("?mes=2026-08&estado=pending");
    expect(screen.getByText(/Sin movimientos en agosto 2026 con el filtro/)).toBeInTheDocument();
  });

  it("resume bruto, cobrado, pendiente y pacientes del conjunto filtrado", () => {
    renderAt();
    const list = screen.getByText(/2 visitas/).closest("div")!.querySelector("dl")!;
    const pairs = Array.from(list.querySelectorAll("div")).map((row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("dd")?.textContent,
    ]);
    // `formatEUR` usa espacio duro antes del €: se compara con el propio
    // formateador para no fijar el carácter invisible en el test.
    expect(pairs).toEqual([
      ["Bruto", formatEUR(105)],
      ["Cobrado", formatEUR(105)],
      ["Pendiente", formatEUR(0)],
      ["Pacientes", "7"],
    ]);
  });
});
