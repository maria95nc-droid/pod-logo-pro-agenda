import { Link } from "react-router-dom";
import { ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { CenterLabel } from "@/components/CenterLabel";
import { VisitAmount } from "@/components/VisitAmount";
import { formatTime } from "@/lib/format";
import { minutesOfTime } from "@/lib/calendar";
import { isCompletedVisit } from "@/lib/streak";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { centerInfo, type CenterInfo } from "@/lib/centers";
import { CANCELLED_STATUS, dayKey, type AgendaVisit } from "@/lib/agendaStats";
import type { VisitStatus } from "@/types";

interface DayTimelineProps {
  /** Visitas del día, ya ordenadas por hora de inicio. */
  visits: readonly AgendaVisit[];
  centers: ReadonlyMap<string, CenterInfo>;
  /** Minutos desde medianoche, o `null` si el día visible no es hoy. */
  nowMinutes: number | null;
}

/** Rejilla compartida por las filas: hora · raíl · contenido. */
const ROW = "relative grid grid-cols-[2.75rem_0.875rem_minmax(0,1fr)] gap-x-2";
/** El raíl baja hasta el centro exacto del nodo siguiente (12 px de hueco + 16 px). */
const RAIL = "absolute left-1/2 top-4 -bottom-7 w-px -translate-x-1/2 bg-border";
const MAX_STAGGER_MS = 240;

function dotTone(visit: AgendaVisit): string {
  if (visit.status === "Cancelada") return "bg-status-cancelled";
  if (isCompletedVisit(visit)) return "bg-primary";
  return "border-2 border-primary bg-card";
}

/**
 * Línea de tiempo del día: un raíl vertical continuo une las visitas en su hora
 * real, con la hora de inicio como ancla tipográfica a la izquierda. En el día
 * de hoy se intercala un marcador «Ahora» en su posición cronológica.
 */
export function DayTimeline({ visits, centers, nowMinutes }: DayTimelineProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // Posición del marcador «Ahora»: primera visita que todavía no ha empezado.
  const nowIndex =
    nowMinutes === null
      ? -1
      : visits.findIndex((v) => {
          const start = minutesOfTime(v.start_time);
          return start !== null && start > nowMinutes;
        });
  const showNow = nowMinutes !== null && visits.length > 0;
  const nowPosition = showNow ? (nowIndex === -1 ? visits.length : nowIndex) : -1;
  const nowLabel =
    nowMinutes === null
      ? ""
      : `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`;

  const rows: JSX.Element[] = [];

  visits.forEach((visit, index) => {
    if (index === nowPosition) {
      rows.push(<NowRow key="now-marker" time={nowLabel} hasNext />);
    }

    const center = centerInfo(centers, visit.center_id);
    const gross = Number(visit.gross_amount) || 0;
    const cancelled = visit.status === CANCELLED_STATUS;
    const unbilled = !cancelled && gross <= 0;
    const patients = Number(visit.patients_count) || 0;
    const isLast = index === visits.length - 1 && nowPosition !== visits.length;
    const delay = prefersReducedMotion ? 0 : Math.min(index * 40, MAX_STAGGER_MS);

    rows.push(
      <li key={visit.id} className={cn(ROW, "pb-3")}>
        <div className="flex flex-col items-end pt-2.5 text-right">
          <time
            dateTime={visit.start_time ? `${dayKey(visit.visit_date)}T${formatTime(visit.start_time)}` : undefined}
            className="text-sm font-bold leading-none tabular-nums"
          >
            {visit.start_time ? formatTime(visit.start_time) : "--:--"}
          </time>
          {visit.end_time && (
            <span className="mt-1 text-[10px] leading-none tabular-nums text-muted-foreground">
              {formatTime(visit.end_time)}
            </span>
          )}
        </div>

        <div className="relative" aria-hidden="true">
          {!isLast && <span className={RAIL} />}
          <span
            className={cn(
              "absolute left-1/2 top-2.5 h-3 w-3 -translate-x-1/2 rounded-full ring-4 ring-background",
              dotTone(visit),
            )}
          />
        </div>

        <Link
          to={`/visita/${visit.id}`}
          className={cn(
            "group block rounded-xl border border-border bg-card shadow-card",
            "transition-smooth hover:shadow-elevated active:scale-[0.99]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "animate-fade-in [animation-fill-mode:backwards]",
          )}
          style={delay ? { animationDelay: `${delay}ms` } : undefined}
        >
          <div className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <CenterLabel center={center} showType className="text-sm" />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <StatusBadge status={visit.status as VisitStatus} className="text-[10px]" />
                {patients > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">{patients}</span>
                    <span className="sr-only">pacientes</span>
                  </span>
                )}
                <VisitAmount gross={gross} unbilled={unbilled} className="text-xs" />
              </div>
              {unbilled && visit.general_notes && (
                <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{visit.general_notes}</p>
              )}
            </div>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground transition-smooth group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
        </Link>
      </li>,
    );
  });

  if (nowPosition === visits.length && visits.length > 0) {
    rows.push(<NowRow key="now-marker" time={nowLabel} hasNext={false} />);
  }

  return (
    <ol className="relative" aria-label="Visitas del día en orden cronológico">
      {rows}
    </ol>
  );
}

function NowRow({ time, hasNext }: { time: string; hasNext: boolean }) {
  return (
    // 44 px − 12 px de `pb-3` = 32 px de contenido: el nodo cae a 16 px del
    // borde superior, igual que en las filas de visita, y el raíl encaja.
    <li className={cn(ROW, "min-h-[2.75rem] items-center pb-3")}>
      <span className="text-right text-[11px] font-bold leading-none tabular-nums text-streak">{time}</span>
      <div className="relative" aria-hidden="true">
        {hasNext && <span className="absolute left-1/2 top-1/2 -bottom-7 w-px -translate-x-1/2 bg-border" />}
        <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-streak ring-4 ring-background" />
      </div>
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-streak">
        Ahora
        <span className="h-px flex-1 bg-streak/40" aria-hidden="true" />
      </span>
    </li>
  );
}
