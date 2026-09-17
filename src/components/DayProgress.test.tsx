import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DayProgress } from "@/components/DayProgress";

afterEach(cleanup);

describe("DayProgress", () => {
  it("no renderiza nada sin visitas", () => {
    const { container } = render(<DayProgress completed={0} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("expone el avance como progressbar accesible", () => {
    render(<DayProgress completed={2} total={4} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
    expect(bar).toHaveAttribute("aria-valuetext", "2 de 4 visitas completadas (50%)");
    expect(screen.getByText("2 de 4 visitas completadas")).toBeInTheDocument();
  });

  it("celebra el día completo", () => {
    render(<DayProgress completed={3} total={3} />);
    expect(screen.getByText("¡Día completado!")).toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("usa el singular con una sola visita", () => {
    render(<DayProgress completed={0} total={1} />);
    expect(screen.getByText("0 de 1 visita completada")).toBeInTheDocument();
  });

  it("acota valores fuera de rango", () => {
    render(<DayProgress completed={9} total={2} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  });
});
