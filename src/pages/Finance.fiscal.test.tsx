import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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
    // Los 90 € salen dos veces (la cifra y el aviso del 5 %): se lee el `dd`
    // que acompaña a esta etiqueta, no el primer texto que coincida.
    const label = screen.getByText("Falta por apartar (Modelo 100)");
    expect(label.parentElement?.querySelector("dd")?.textContent).toBe(formatEUR(90));
  });

  it("enseña el 15 %, el 20 % y el 5 % uno al lado del otro, y cuadran entre sí", () => {
    renderFiscalTab();
    // Ojo: el nombre accesible de un encabezado **no** normaliza el espacio
    // duro (al contrario que `getByText`), así que aquí va `formatEUR` tal cual.
    const block = screen.getByRole("heading", { name: `Retenciones sobre ${formatEUR(1200)} de bruto` }).closest("section")!;
    const pairs = Array.from(block.querySelectorAll("dl > div")).map((row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("dd")?.textContent,
    ]);
    // 1.200 € declarados: 150 € ya retenidos al 15 %, 240 € si fuese el 20 %,
    // 60 € de colchón del 5 %. Y 240 − 150 = 90 €, la cifra de «falta por
    // apartar» de arriba: las tres se leen juntas y tienen que cuadrar.
    expect(pairs).toEqual([
      // «Ya retenido» sin «(15 %)»: es la retención real y hay facturas al 7 %.
      ["Ya retenido", formatEUR(150)],
      ["Si fuera el 20 %", formatEUR(240)],
      ["Aparta el 5 %", formatEUR(60)],
    ]);
  });

  it("avisa de que el 5 % se queda corto cuando hay ingresos sin retención", () => {
    renderFiscalTab();
    // 1.200 € de bruto con sólo 150 € retenidos (200 € los paga un particular,
    // sin retención): el colchón del 5 % son 60 €, pero faltan 90 € de verdad.
    // Sin este aviso, apartar 60 € dejaría a David 30 € corto con Hacienda.
    const warning = screen.getByText(/se queda corto/);
    expect(warning).toHaveTextContent("Este periodo el 5 % se queda corto.");
    expect(warning.parentElement).toHaveTextContent("parte la cobras de particulares, sin retención");
    expect(warning.parentElement).toHaveTextContent(eur(90));
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

describe("Finanzas · récords de facturación", () => {
  it("los calcula sobre todo el histórico, incluidas las visitas sin clasificar", () => {
    render(
      <MemoryRouter initialEntries={["/finanzas"]}>
        <Finance />
      </MemoryRouter>,
    );
    // Los récords son de dinero cobrado, no de dinero declarado: las tres
    // visitas de agosto cuentan, también la que falta por clasificar.
    const amountOf = (label: string): string | undefined =>
      screen.getByText(label).parentElement?.querySelector("p + p")?.textContent ?? undefined;
    expect(amountOf("Mejor día")).toBe(formatEUR(1000));
    expect(amountOf("Mejor mes")).toBe(formatEUR(1500));
    const month = screen.getByText("Mejor mes").closest("li")!;
    expect(within(month).getByText("Agosto 2026 · 3 visitas")).toBeInTheDocument();
  });
});
