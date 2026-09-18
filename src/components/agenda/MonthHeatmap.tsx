import { Fragment } from "react";
import { Ban, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEUR, formatEURCompact, formatDateLong, toIsoDate } from "@/lib/format";
import { WEEKDAYS } from "@/lib/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DayOrigins } from "@/components/agenda/DayOrigins";
import type { CenterInfo } from "@/lib/centers";
import {
  heatLevel,
  isFullyCancelledDay,
  isUnbilledDay,
  type AgendaVisit,
  type DayStats,
  type HeatLevel,
} from "@/lib/agendaStats";

interface MonthHeatmapProps {
  /** Rejilla de 42 días (incluye la cola del mes anterior y del siguiente). */
  days: readonly Date[];
  /** Mes visible (0-11): el resto de celdas se pintan como contexto. */
  month: number;
  dayStats: ReadonlyMap<string, DayStats>;
  /** Visitas de cada día: alimentan el desglose de origen al pasar el ratón. */
  visitsByDay: ReadonlyMap<string, AgendaVisit[]>;
  centers: ReadonlyMap<string, CenterInfo>;
  /** Mejor día del mes visible: define el nivel 4 de la escala. */
  maxGross: number;
  todayIso: string;
  onSelectDay: (day: Date) => void;
}

/**
 * Fondo + color de texto por nivel. Los pares están fijados como tokens en
 * `src/index.css` y comprobados a ≥4.5:1 en tema claro y oscuro.
 */
const HEAT_TONE: Record<HeatLevel, string> = {
  0: "bg-muted/50 text-foreground hover:bg-muted",
  1: "bg-heat-1 text-heat-1-fg",
  2: "bg-heat-2 text-heat-2-fg",
  3: "bg-heat-3 text-heat-3-fg",
  4: "bg-heat-4 text-heat-4-fg",
};

const LEGEND_SWATCHES = ["bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"];

/**
 * Mes como mapa de calor de ingresos: la intensidad del verde es el bruto del
 * día comparado con el mejor día del mes. Un día trabajado sin importe (las
 * visitas pendientes de facturar por la gestora) se marca con reloj de arena y
 * fondo ámbar punteado: nunca con verde, que daría a entender que se cobró.
 */
export function MonthHeatmap({
  days,
  month,
  dayStats,
  visitsByDay,
  centers,
  maxGross,
  todayIso,
  onSelectDay,
}: MonthHeatmapProps) {
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = toIsoDate(day);
          const stats = dayStats.get(key);
          const inMonth = day.getMonth() === month;
          const isToday = key === todayIso;
          const unbilled = isUnbilledDay(stats);
          const allCancelled = isFullyCancelledDay(stats);
          const level = heatLevel(stats?.gross ?? 0, maxGross);
          const count = stats?.visits ?? 0;
          const plural = count > 1 ? "s" : "";

          const dateLabel = formatDateLong(day);
          const label =
            count === 0
              ? `${dateLabel}: sin visitas`
              : allCancelled
                ? `${dateLabel}: ${count} visita${plural} cancelada${plural}`
                : unbilled
                  ? `${dateLabel}: ${count} visita${plural}, importe pendiente de facturar`
                  : `${dateLabel}: ${count} visita${plural}, ${formatEUR(stats!.gross)}`;

          const dayVisits = visitsByDay.get(key) ?? [];

          const cell = (
            <button
              type="button"
              onClick={() => onSelectDay(day)}
              aria-label={label}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                // Móvil: cuadrada, con 44 px mínimos de zona táctil.
                // A partir de `sm` se limita la altura: si no, en escritorio las
                // celdas se estiran y el mes ocupa toda la pantalla.
                "relative flex aspect-square min-h-[44px] flex-col items-center justify-center gap-1 rounded-md p-0.5",
                "sm:aspect-auto sm:h-[4.5rem]",
                "transition-smooth active:scale-95",
                "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                inMonth
                  ? unbilled
                    ? "border border-dashed border-streak/60 bg-streak-bg text-streak"
                    : HEAT_TONE[level]
                  : "bg-transparent text-muted-foreground hover:bg-muted/60",
                isToday && "outline outline-2 outline-offset-1 outline-primary",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("text-xs leading-none tabular-nums", isToday || inMonth ? "font-semibold" : "font-normal")}
              >
                {day.getDate()}
              </span>

              {inMonth && unbilled && <Hourglass className="h-3 w-3 shrink-0" aria-hidden="true" />}

              {inMonth && !unbilled && level > 0 && (
                <span aria-hidden="true" className="text-[9px] font-semibold leading-none tabular-nums">
                  {formatEURCompact(stats!.gross)}
                </span>
              )}

              {inMonth && allCancelled && (
                <Ban className="h-3 w-3 shrink-0 text-status-cancelled" aria-hidden="true" />
              )}

              {!inMonth && count > 0 && (
                <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              )}
            </button>
          );

          // Sin visitas no hay nada que desglosar: se evita montar 42 tooltips.
          if (dayVisits.length === 0) return <Fragment key={key}>{cell}</Fragment>;

          return (
            <Tooltip key={key} delayDuration={150}>
              <TooltipTrigger asChild>{cell}</TooltipTrigger>
              {/* El contenido sólo se monta al abrirse. En móvil el toque navega
                  al detalle del día, que es donde cabe la información completa. */}
              <TooltipContent side="top" align="center" className="px-3 py-2">
                <DayOrigins visits={dayVisits} centers={centers} title={dateLabel} />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] text-muted-foreground">
        <p className="sr-only">
          La intensidad del color de cada día indica su ingreso comparado con el mejor día del mes. Abre un día para
          ver de qué centro o domicilio sale cada importe.
        </p>
        <p className="hidden basis-full sm:block">
          Pasa el ratón por un día para ver de dónde sale el importe; púlsalo para abrir el detalle.
        </p>
        <p className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] border border-dashed border-streak/60 bg-streak-bg text-streak"
          >
            <Hourglass className="h-2.5 w-2.5" />
          </span>
          Sin importe aún
        </p>
        <p className="inline-flex items-center gap-1.5">
          Menos
          <span className="inline-flex gap-0.5" aria-hidden="true">
            {LEGEND_SWATCHES.map((tone) => (
              <span key={tone} className={cn("h-3 w-3 rounded-[3px]", tone)} />
            ))}
          </span>
          Más
        </p>
      </div>
    </div>
  );
}
