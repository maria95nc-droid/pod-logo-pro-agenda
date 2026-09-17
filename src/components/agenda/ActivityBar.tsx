import { cn } from "@/lib/utils";
import { barPercent } from "@/lib/agendaStats";

interface ActivityBarProps {
  /** Importe bruto del día/mes. */
  value: number;
  /** Mejor valor del periodo visible: marca el 100 % de la barra. */
  max: number;
  /** Hay trabajo registrado pero sin importe (pendiente de facturar). */
  unbilled?: boolean;
  className?: string;
}

/**
 * Barra comparativa ligera (sin librería de gráficos) para ver de un vistazo
 * qué día o mes fue mejor dentro del periodo visible.
 *
 * Es puramente decorativa: la cifra exacta siempre se muestra como texto al
 * lado, así que se marca `aria-hidden` para no duplicar el anuncio.
 * La transición de anchura la desactiva el bloque `prefers-reduced-motion`
 * global de `src/index.css`.
 */
export function ActivityBar({ value, max, unbilled = false, className }: ActivityBarProps) {
  if (unbilled) {
    return (
      <div
        aria-hidden="true"
        className={cn("h-1.5 w-full rounded-full border border-dashed border-streak/60 bg-streak-bg", className)}
      />
    );
  }

  const percent = barPercent(value, max);
  if (percent === 0) {
    return <div aria-hidden="true" className={cn("h-1.5 w-full rounded-full bg-muted", className)} />;
  }

  return (
    <div aria-hidden="true" className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-gradient-primary transition-[width] duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
