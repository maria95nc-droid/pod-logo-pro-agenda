import { CenterLabel } from "@/components/CenterLabel";
import { VisitAmount } from "@/components/VisitAmount";
import { formatEUR, formatTime } from "@/lib/format";
import { centerInfo, type CenterInfo } from "@/lib/centers";
import { CANCELLED_STATUS, type AgendaVisit } from "@/lib/agendaStats";

interface DayOriginsProps {
  visits: readonly AgendaVisit[];
  centers: ReadonlyMap<string, CenterInfo>;
  /** Título del bloque: la fecha larga del día. */
  title: string;
}

/**
 * Desglose de un día: de qué centro o domicilio sale cada cifra. Se muestra
 * dentro del tooltip del mapa de calor, donde la celda es demasiado pequeña
 * (44-72 px) para escribir nombres completos sin que queden ilegibles.
 */
export function DayOrigins({ visits, centers, title }: DayOriginsProps) {
  const total = visits.reduce((sum, visit) => sum + (Number(visit.gross_amount) || 0), 0);
  const billable = visits.filter((visit) => visit.status !== CANCELLED_STATUS);

  return (
    <div className="max-w-[16rem] space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {visits.map((visit) => {
          const gross = Number(visit.gross_amount) || 0;
          const cancelled = visit.status === CANCELLED_STATUS;
          const patients = Number(visit.patients_count) || 0;
          return (
            <li key={visit.id} className="text-xs">
              <CenterLabel center={centerInfo(centers, visit.center_id)} />
              <span className="mt-0.5 flex items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
                {visit.start_time && <span className="tabular-nums">{formatTime(visit.start_time)}</span>}
                {patients > 0 && <span className="tabular-nums">{patients} pac.</span>}
                {cancelled ? (
                  <span className="font-semibold text-status-cancelled">Cancelada</span>
                ) : (
                  <VisitAmount gross={gross} unbilled={gross <= 0} className="text-[11px] text-foreground" />
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {visits.length > 1 && billable.length > 0 && (
        <p className="border-t border-border pt-1.5 text-xs font-semibold">
          Total del día:{" "}
          {total > 0 ? (
            <span className="tabular-nums">{formatEUR(total)}</span>
          ) : (
            <span className="text-streak">sin importe aún</span>
          )}
        </p>
      )}
    </div>
  );
}
