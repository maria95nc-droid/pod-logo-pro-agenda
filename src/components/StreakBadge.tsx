import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreakInfo } from "@/lib/streak";

interface StreakBadgeProps extends StreakInfo {
  /** Versión en línea para cabeceras secundarias (Agenda, Finanzas). */
  compact?: boolean;
  className?: string;
}

/**
 * Racha de días trabajados seguidos.
 * Usa el acento cálido (`--streak`) sobre superficie clara, igual que
 * `StatusBadge`, para garantizar contraste AA. Con racha 0 el tono es neutro e
 * invita a empezar en lugar de penalizar.
 */
export function StreakBadge({ days, countsToday, compact = false, className }: StreakBadgeProps) {
  const active = days > 0;
  const unit = days === 1 ? "día seguido" : "días seguidos";

  const srLabel = active
    ? `Racha de ${days} ${unit} con visitas registradas.${countsToday ? "" : " Hoy todavía no suma."}`
    : "Todavía no tienes racha. Completa una visita para empezarla.";

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          active ? "bg-streak-bg text-streak" : "bg-muted text-muted-foreground",
          className,
        )}
      >
        <Flame className={cn("h-3.5 w-3.5 shrink-0", active && "flame-pulse")} aria-hidden="true" />
        <span aria-hidden="true" className="tabular-nums">
          {active ? `${days} ${days === 1 ? "día" : "días"}` : "Sin racha"}
        </span>
        <span className="sr-only">{srLabel}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex w-[88px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-2 py-2 text-center sm:w-[104px]",
        active
          ? "border-streak/25 bg-gradient-streak text-streak shadow-card"
          : "border-dashed border-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {active ? (
        <>
          <span className="flex items-center gap-1" aria-hidden="true">
            <Flame className="flame-pulse h-5 w-5 shrink-0" />
            <span className="text-2xl font-bold leading-none tabular-nums">{days}</span>
          </span>
          <span aria-hidden="true" className="text-[10px] font-semibold uppercase leading-tight tracking-wide">
            {unit}
          </span>
        </>
      ) : (
        <>
          <Flame className="h-5 w-5 shrink-0 text-streak" aria-hidden="true" />
          <span aria-hidden="true" className="text-[10px] font-semibold uppercase leading-tight tracking-wide">
            Empieza tu racha
          </span>
        </>
      )}
      <span className="sr-only">{srLabel}</span>
    </div>
  );
}
