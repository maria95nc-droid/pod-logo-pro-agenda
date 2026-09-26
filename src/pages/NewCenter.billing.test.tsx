import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Datos de facturación del centro.
 *
 * Lo que se protege aquí es que la razón social, el NIF, la dirección y el
 * correo **lleguen tal cual a la base de datos**: son los que acaban impresos
 * en una factura, así que un espacio de más o una minúscula no son un detalle
 * estético. El cálculo no tiene nada que ver; esto es cableado formulario →
 * payload, que es justo donde se pierden los campos al reordenar una pantalla.
 */

const center = {
  id: "c-1",
  name: "Residencia Ave María",
  type: "Residencia",
  legal_name: "YADINSA, S.A.",
  tax_id: "A33112233",
  address: "La Barganiza, s/n · 33429 Siero (Asturias)",
  email: "administracion@yadinsa.example",
  contact_person: "Marta",
  contact_phone: "985112233",
  usual_schedule: "9:00",
  visit_frequency_weeks: 6,
  default_price_per_patient: 18,
  default_income_type: "Empresa",
  payment_method: "Transferencia bancaria",
  billing_notes: null,
  material_notes: null,
  notes: null,
  is_active: true,
};

const updates: Record<string, unknown>[] = [];
const inserts: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: center, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return { eq: async () => ({ error: null }) };
      },
      insert: async (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return { error: null };
      },
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useData", () => ({
  useVisits: () => ({ data: [], isLoading: false, isError: false }),
  useInvalidateAll: () => () => {},
}));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { default: NewCenter } = await import("@/pages/NewCenter");

const renderEdit = () =>
  render(
    <MemoryRouter initialEntries={["/centros/c-1/editar"]}>
      <Routes>
        <Route path="/centros/:id/editar" element={<NewCenter />} />
        <Route path="/pacientes" element={<p>Pacientes</p>} />
      </Routes>
    </MemoryRouter>,
  );

/** React sólo reconoce los cambios hechos con el setter nativo del input. */
const typeInto = (field: HTMLElement, value: string) => {
  fireEvent.change(field, { target: { value } });
};

beforeEach(() => {
  updates.length = 0;
  inserts.length = 0;
});
afterEach(cleanup);

describe("Ficha de centro · datos de facturación", () => {
  it("carga los datos guardados y abre el apartado solo si los hay", async () => {
    renderEdit();
    // El apartado se despliega solo: esconder datos ya guardados haría pensar
    // que se han perdido al simplificar el formulario.
    expect(await screen.findByLabelText("Razón social")).toHaveValue("YADINSA, S.A.");
    expect(screen.getByLabelText("NIF/CIF")).toHaveValue("A33112233");
    expect(screen.getByLabelText("Dirección")).toHaveValue("La Barganiza, s/n · 33429 Siero (Asturias)");
    expect(screen.getByLabelText("Email")).toHaveValue("administracion@yadinsa.example");
    expect(screen.getByRole("button", { name: /Datos de facturación/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("guarda los cuatro campos, en mayúsculas el NIF y sin espacios sobrantes", async () => {
    renderEdit();
    typeInto(await screen.findByLabelText("Razón social"), "  Yadinsa, S.A.  ");
    // Escrito en minúsculas: tiene que guardarse en mayúsculas, no sólo verse así.
    typeInto(screen.getByLabelText("NIF/CIF"), " b33456789 ");
    typeInto(screen.getByLabelText("Dirección"), "  C/ Uría 44 · 33003 Oviedo  ");
    typeInto(screen.getByLabelText("Email"), "  facturas@centro.example  ");

    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({
      legal_name: "Yadinsa, S.A.",
      tax_id: "B33456789",
      address: "C/ Uría 44 · 33003 Oviedo",
      email: "facturas@centro.example",
    });
  });

  it("guarda null, no cadena vacía, cuando un dato de facturación se borra", async () => {
    renderEdit();
    typeInto(await screen.findByLabelText("Razón social"), "");
    typeInto(screen.getByLabelText("NIF/CIF"), "   ");
    typeInto(screen.getByLabelText("Dirección"), "");
    typeInto(screen.getByLabelText("Email"), "");

    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({ legal_name: null, tax_id: null, address: null, email: null });
  });

  it("no toca ciudad ni código postal: no se piden aquí y no deben borrarse", async () => {
    renderEdit();
    fireEvent.click(await screen.findByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).not.toHaveProperty("city");
    expect(updates[0]).not.toHaveProperty("postal_code");
  });
});
