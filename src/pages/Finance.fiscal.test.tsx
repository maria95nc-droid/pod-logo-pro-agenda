import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { formatEUR } from "@/lib/format";

/**
 * Prueba de humo de la pestaña «Impuestos» de Finanzas: comprueba que los tres
 * cálculos y el semáforo del Modelo 130 se pintan con las cifras del mes
 * seleccionado, y que una visita sin clasificar no se cuela en ninguna cuenta.
 *
 * El cálculo se prueba a fondo en `src/lib/fiscalCalculations.test.ts`; aquí lo
 * que se protege es el cableado (periodo → cálculo → pantalla).
 */

const visits = [
  // Agosto: 1.000 € a entidad (15 %) + 200 € de particular = 1.200 € declarados.
  {
    id: "v-empresa",
    visit_date: "2026-08-10",
    status: "Cobrada",
    gross_amount: 1000,
    patients_count: 10,
    center_id: "c-pravia",
    income_type: "Empresa",
    irpf_percentage: 15,
    invoice_number: "F-2026-066",
    visit_patients: [],
  },
  {
    id: "v-particular",
    visit_date: "2026-08-12",
    status: "Cobrada",
    gross_amount: 200,
    patients_count: 10,
    center_id: "c-casa",
    income_type: "Particular",
    irpf_percentage: 0,
    invoice_number: null,
    visit_patients: [],
  },
  // Sin clasificar: no entra en ninguna cuenta y hay que preguntarlo.
  {
    id: "v-sin-clasificar",
    visit_date: "2026-08-20",
    status: "Pendiente de cobro",
    gross_amount: 300,
    patients_count: 3,
    center_id: "c-pravia",
    income_type: null,
    irpf_percentage: 15,
    invoice_number: null,
    visit_patients: [],
  },
];

const centers = [
  { id: "c-pravia", name: "Residencia Pravia", type: "Residencia", payment_method: "Transferencia bancaria" },
  { id: "c-casa", name: "María Fernández", type: "Domicilio", city: "Oviedo", payment_method: "Efectivo" },
];

vi.mock("@/hooks/useData", () => ({
  useVisits: () => ({ data: visits, isLoading: false }),
  useCenters: () => ({ data: centers, isLoading: false }),
  useExpenses: () => ({ data: [], isLoading: false }),
  useUserSettings: () => ({ data: undefined, isLoading: false }),
  useInvalidateAll: () => () => {},
  defaultUserSettings: {
    default_irpf_percentage: 15,
    default_vat_mode: "Exento",
    monthly_self_employed_fee: 0,
    monthly_fixed_expenses: 0,
    default_travel_cost: 0,
    apply_travel_per_visit: false,
    apply_self_employed_fee: false,
    apply_fixed_expenses: false,
    fee_distribution_method: "por_dia",
  },
}));

/**
 * `formatEUR` separa el importe del € con un espacio duro; Testing Library
 * normaliza los espacios del DOM, así que el importe esperado hay que
 * normalizarlo igual en vez de fijar el carácter invisible en el test.
 */
const eur = (value: number): string => formatEUR(value).replace(/\u00A0/g, " ");

const { default: Finance } = await import("@/pages/Finance");

const renderFiscalTab = () =>
  render(
    <MemoryRouter initialEntries={["/finanzas?vista=impuestos"]}>
      <Finance />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("Finanzas · pestaña de impuestos", () => {
  it("muestra los tres cálculos del mes con dinero declarado", () => {
    renderFiscalTab();
    // 1.200 € declarados, 150 € retenidos. Se compara con el propio formateador
    // porque `Intl` agrupa los miles a partir de 10.000 en es-ES.
    expect(screen.getByText(`Sólo dinero declarado: ${eur(1200)} de bruto en 2 visitas clasificadas.`)).toBeInTheDocument();
    expect(screen.getByText("Neto declarado")).toBeInTheDocument();
    expect(screen.getByText(eur(1050))).toBeInTheDocument(); // neto declarado
    expect(screen.getByText(eur(960))).toBeInTheDocument(); // estimación prudente
    expect(screen.getByText("Falta por apartar (Modelo 100)")).toBeInTheDocument();
    expect(screen.getByText(eur(90))).toBeInTheDocument(); // 20 % − retenido
  });

  it("deja la visita sin clasificar fuera de las cuentas y la pone a la vista", () => {
    renderFiscalTab();
    expect(screen.getByRole("heading", { name: /1 visita sin clasificar/ })).toBeInTheDocument();
    expect(screen.getByText(/no entran en estas cuentas/)).toBeInTheDocument();
  });

  it("pinta el semáforo del Modelo 130 con el acumulado del trimestre", () => {
    renderFiscalTab();
    // 200 de 1.200 = 16,7 % sin retención → verde.
    const gauge = screen.getByRole("heading", { name: "Modelo 130 · T3 2026" }).closest("div")!;
    expect(screen.getByText("No te toca presentarlo")).toBeInTheDocument();
    // El 20 % sale dos veces: el acumulado del trimestre y el del mes, que aquí
    // coinciden porque toda la actividad del trimestre es de agosto.
    expect(screen.getAllByText("16,7 %")).toHaveLength(2);
    expect(gauge).toBeInTheDocument();
  });

  it("separa el porcentaje del mes del acumulado del trimestre", () => {
    renderFiscalTab();
    expect(screen.getByText("Sólo agosto 2026")).toBeInTheDocument();
  });

  it("resume las facturas a entidades pendientes de cobro", () => {
    renderFiscalTab();
    expect(screen.getByRole("heading", { name: "Facturas a entidades" })).toBeInTheDocument();
    expect(screen.getByText(/Cobradas o facturadas \(1 factura\)/)).toBeInTheDocument();
  });

  it("cuenta las visitas a domicilio y el efectivo en mano del mes", () => {
    renderFiscalTab();
    expect(screen.getByText("Domicilios en agosto 2026 (neto)")).toBeInTheDocument();
    expect(screen.getByText(/1 visita · 10 pac\. · bruto/)).toBeInTheDocument();
    expect(screen.getByText("Cobrado en efectivo en agosto 2026")).toBeInTheDocument();
  });
});
