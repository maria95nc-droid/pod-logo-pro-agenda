import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StreakBadge } from "@/components/StreakBadge";

afterEach(cleanup);

describe("StreakBadge", () => {
  it("muestra el número de días y un texto accesible", () => {
    render(<StreakBadge days={7} countsToday />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("días seguidos")).toBeInTheDocument();
    expect(screen.getByText(/Racha de 7 días seguidos/)).toBeInTheDocument();
  });

  it("usa el singular con un solo día", () => {
    render(<StreakBadge days={1} countsToday />);
    expect(screen.getByText("día seguido")).toBeInTheDocument();
  });

  it("avisa en el texto accesible cuando hoy aún no suma", () => {
    render(<StreakBadge days={3} countsToday={false} />);
    expect(screen.getByText(/Hoy todavía no suma/)).toBeInTheDocument();
  });

  it("con racha 0 invita a empezar en vez de penalizar", () => {
    render(<StreakBadge days={0} countsToday={false} />);
    expect(screen.getByText("Empieza tu racha")).toBeInTheDocument();
    expect(screen.getByText(/Completa una visita para empezarla/)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("la versión compacta también expone el texto accesible", () => {
    render(<StreakBadge days={4} countsToday compact />);
    expect(screen.getByText("4 días")).toBeInTheDocument();
    expect(screen.getByText(/Racha de 4 días seguidos/)).toBeInTheDocument();
  });
});
