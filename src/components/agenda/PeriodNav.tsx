import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PeriodNavProps {
  title: ReactNode;
  /** Resumen del periodo (visitas, pacientes, bruto). */
  subtitle?: ReactNode;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Barra de navegación compartida por las cuatro vistas de la agenda.
 * Centraliza los `aria-label` de las flechas, que antes eran botones de icono
 * sin nombre accesible.
 */
export function PeriodNav({ title, subtitle, prevLabel, nextLabel, onPrev, onNext }: PeriodNavProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-card p-2 shadow-card">
      <Button size="icon" variant="ghost" onClick={onPrev} aria-label={prevLabel} className="shrink-0">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1 text-center">
        <p className="text-sm font-semibold leading-tight first-letter:uppercase">{title}</p>
        {subtitle && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{subtitle}</p>}
      </div>
      <Button size="icon" variant="ghost" onClick={onNext} aria-label={nextLabel} className="shrink-0">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
