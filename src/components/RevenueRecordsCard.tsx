import { Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { monthLabel } from "@/lib/calendar";
import { capitalize, formatDateLong, formatEUR, fromIsoDate } from "@/lib/format";
import type { RevenueProgress, RevenueRecord, RevenueRecords } from "@/lib/revenueRecords";
import { cn } from "@/lib/utils";

/**
 * Récords de facturación: el mejor día y el mejor mes de la historia, con lo
 * que llevas hoy y este mes para poder superarte.
 *
 * Reutiliza el lenguaje visual de la racha (`StreakBadge`): llama + acento
 * ámbar sobre superficie ámbar clara, que es el par de tokens ya comprobado
 * para contraste AA. Aquí **no** se usa `text-muted-foreground` sobre
 * `bg-streak-bg` (se queda en 4,4:1): la jerarquía se hace con peso y tamaño.
 *
 * Todo el cálculo vive en `src/lib/revenueRecords.ts` (con tests); esta tarjeta
 * sólo pinta lo que recibe.
 *
 * No lleva confeti a propósito: la ráfaga de `Celebration` responde a una acción
 * concreta del usuario («he cobrado esto»), mientras que este récord se
 * mantiene batido durante días. Dispararla al abrir Finanzas la convertiría en
 * ruido y rompería la asociación acción → celebración.
 */

export interface RevenueRecordsCardProps {
  records: RevenueRecords;
  /** Progreso del día de hoy contra el récord de los **demás** días. */
  day: RevenueProgress;
  /** Progreso del mes en curso contra el récord de los **demás** meses. */
  month: RevenueProgress;
  className?: string;
}

export function RevenueRecordsCard({ records, day, month, className }: RevenueRecordsCardProps) {
  const hasRecords = records.bestDay !== null || records.bestMonth !== null;

  return (
    <Card className={cn("shadow-card", className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 shrink-0 text-streak" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Tus récords de facturación</h2>
        </div>
        {/* Finanzas tiene un selector de mes arriba: hay que decir que estas dos
            cifras no lo siguen, o parecerá que se contradicen con el resto. */}
        <p className="mt-0.5 text-xs text-muted-foreground">
          De todo tu histórico, no del mes elegido arriba.
        </p>

        {hasRecords ? (
          <ul className="mt-3 space-y-2">
            <RecordItem
              label="Mejor día"
              record={records.bestDay}
              when={records.bestDay ? dayWhen(records.bestDay.key) : ""}
              progress={day}
              progressLabel="Hoy"
              progressName="día"
            />
            <RecordItem
              label="Mejor mes"
              record={records.bestMonth}
              when={records.bestMonth ? monthLabel(records.bestMonth.key) : ""}
              progress={month}
              progressLabel="Este mes"
              progressName="mes"
            />
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            Todavía no hay récord. En cuanto registres una visita hecha con su importe aparecerá aquí tu mejor día y tu
            mejor mes, para poder superarlos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * «Lunes, 24 de agosto», con el año sólo cuando no es el de hoy: el récord
 * puede ser de hace años y sin año no se sabría de cuándo habla.
 */
function dayWhen(iso: string): string {
  const date = fromIsoDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const long = capitalize(formatDateLong(date));
  const year = date.getFullYear();
  return year === new Date().getFullYear() ? long : `${long} de ${year}`;
}

const visitsText = (count: number): string => `${count} visita${count === 1 ? "" : "s"}`;

function RecordItem({
  label,
  record,
  when,
  progress,
  progressLabel,
  progressName,
}: {
  label: string;
  record: RevenueRecord | null;
  when: string;
  progress: RevenueProgress;
  /** «Hoy» / «Este mes». */
  progressLabel: string;
  /** «día» / «mes», para el texto accesible de la barra. */
  progressName: string;
}) {
  if (!record) {
    return (
      <li className="rounded-xl border border-dashed border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-foreground">Aún sin récord.</p>
      </li>
    );
  }

  const beaten = progress.standing === "superado" || progress.standing === "igualado";

  return (
    <li className="rounded-xl border border-streak/25 bg-streak-bg p-3 text-foreground">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold leading-none tabular-nums text-streak">{formatEUR(record.amount)}</p>
      </div>
      <p className="mt-1 text-xs">
        {when} · {visitsText(record.visits)}
      </p>

      {beaten ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-streak px-2.5 py-1 text-[11px] font-semibold text-white">
          <Flame className="flame-pulse h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {progress.standing === "superado"
            ? `¡Récord nuevo! ${progressLabel} llevas ${formatEUR(progress.current)}`
            : `¡Récord igualado con ${formatEUR(progress.current)}!`}
        </p>
      ) : (
        progress.standing !== "sin-record" && (
          <>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-valuetext={`${progress.percent} % de tu mejor ${progressName}`}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-streak/20"
            >
              <span
                className="block h-full rounded-full bg-streak transition-[width] duration-700 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            {/* `current !== 0` en vez de `> 0`: una devolución deja el periodo
                en negativo y decir «no has facturado nada» sería falso. */}
            <p className="mt-1.5 text-xs">
              {progress.current !== 0 ? (
                <>
                  {progressLabel} vas por{" "}
                  <strong className="font-semibold tabular-nums">{formatEUR(progress.current)}</strong>
                </>
              ) : (
                <>{progressLabel} todavía no has facturado nada</>
              )}
              : te faltan <strong className="font-semibold tabular-nums">{formatEUR(progress.remaining)}</strong> para
              igualarlo.
            </p>
          </>
        )
      )}
    </li>
  );
}
