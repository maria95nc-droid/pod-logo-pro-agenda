import { cn } from "@/lib/utils";

interface DayProgressProps {
  completed: number;
  total: number;
  className?: string;
}

/** Por encima de este número los segmentos se vuelven ilegibles en móvil. */
const MAX_SEGMENTS = 8;

/**
 * Progreso real del día: un segmento por visita (no una barra de carga).
 * Al completarlas todas el relleno pasa al gradiente de celebración.
 */
export function DayProgress({ completed, total, className }: DayProgressProps) {
  if (total <= 0) return null;

  const done = Math.min(Math.max(completed, 0), total);
  const isComplete = done === total;
  const percent = Math.round((done / total) * 100);
  const segmented = total <= MAX_SEGMENTS;
  // Por segmentos: color plano (repetir un gradiente en cada tramo ensucia).
  const segmentFill = isComplete ? "bg-streak" : "bg-primary";
  const barFill = isComplete ? "bg-gradient-celebrate" : "bg-gradient-primary";

  return (
    <section aria-label="Progreso del día" className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn("text-sm font-semibold", isComplete && "text-streak")}>
          {isComplete ? "¡Día completado!" : `${done} de ${total} visita${total > 1 ? "s" : ""} completada${total > 1 ? "s" : ""}`}
        </p>
        <p className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
          {done}/{total}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Visitas completadas hoy"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} de ${total} visitas completadas (${percent}%)`}
        className={cn("flex h-2.5 w-full gap-1 overflow-hidden", !segmented && "rounded-full bg-muted")}
      >
        {segmented ? (
          Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-full flex-1 rounded-full transition-colors duration-500",
                i < done ? segmentFill : "bg-muted",
              )}
            />
          ))
        ) : (
          <span
            className={cn("h-full rounded-full transition-[width] duration-700 ease-out", barFill)}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
    </section>
  );
}
