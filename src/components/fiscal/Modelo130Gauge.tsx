import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate, formatEUR, fromIsoDate } from "@/lib/format";
import {
  MODELO_130_LIMIT_PERCENT,
  MODELO_130_WATCH_PERCENT,
  type Modelo130Level,
  type Modelo130Snapshot,
  type QuarterRef,
} from "@/lib/fiscalCalculations";

/**
 * Semáforo del Modelo 130 (el pago fraccionado trimestral).
 *
 * La regla que importa: si **menos del 70 %** de lo que factura lleva retención
 * de IRPF, hay que presentar el modelo. Aquí se mira por el otro lado, que es
 * como lo cuenta la norma: el porcentaje de ingresos **sin** retención (los que
 * paga el paciente directamente) sobre el total declarado.
 *
 * Se pintan dos cosas distintas y se dice cuál manda:
 * - el acumulado del año hasta el cierre del trimestre → **es el que decide**;
 * - el porcentaje del mes que se está mirando → sólo para ver la tendencia.
 *
 * Los colores salen de los tokens del proyecto (`--primary`, `--streak`,
 * `--alert`), con el patrón de `StatusBadge`: color saturado sobre tinte claro.
 */

/** Tope de la escala: por encima de aquí el marcador se queda en el extremo. */
const SCALE_MAX = 40;

/* `--status-paid` (verde oscuro) y no `--status-done`: este último se queda en
   3,0:1 sobre su propio tinte claro y aquí el texto es pequeño. */
const LEVEL_CHIP: Record<Modelo130Level, string> = {
  verde: "bg-status-done-bg text-status-paid",
  ambar: "bg-streak-bg text-streak",
  rojo: "bg-alert-bg text-alert",
  "sin-datos": "bg-muted text-muted-foreground",
};

const LEVEL_TEXT: Record<Modelo130Level, string> = {
  verde: "text-status-paid",
  ambar: "text-streak",
  rojo: "text-alert",
  "sin-datos": "text-muted-foreground",
};

const LEVEL_HEADLINE: Record<Modelo130Level, string> = {
  verde: "No te toca presentarlo",
  ambar: "Cerca del límite: vigílalo",
  rojo: "Toca presentar el Modelo 130",
  "sin-datos": "Todavía sin datos",
};

const LEVEL_EXPLANATION: Record<Modelo130Level, string> = {
  verde: `Menos del ${MODELO_130_WATCH_PERCENT} % de tus ingresos declarados viene sin retención: estás exento con margen.`,
  ambar: `Entre el ${MODELO_130_WATCH_PERCENT} % y el ${MODELO_130_LIMIT_PERCENT} % viene sin retención. Si pasa del ${MODELO_130_LIMIT_PERCENT} % habrá que presentarlo.`,
  rojo: `El ${MODELO_130_LIMIT_PERCENT} % o más de tus ingresos declarados viene sin retención: hay que presentar el pago fraccionado trimestral.`,
  "sin-datos": "Cuando haya visitas declaradas y clasificadas, aquí saldrá si te toca presentarlo o no.",
};

/** Espacio duro antes del %: a 320 px el signo se quedaba solo en otra línea. */
const formatPercent = (percent: number): string =>
  `${percent.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}\u00A0%`;

export interface Modelo130GaugeProps {
  /** Acumulado del año hasta el cierre del trimestre en curso: el que decide. */
  quarter: Modelo130Snapshot;
  quarterRef: QuarterRef;
  /** Mes que se está mirando en Finanzas, sólo informativo. */
  month: Modelo130Snapshot;
  monthLabel: string;
  /** Primera visita registrada, para decir desde cuándo se acumula. */
  sinceIso?: string | null;
  /** Enlace al detalle de las visitas que forman el porcentaje. */
  detailTo?: string;
}

export function Modelo130Gauge({
  quarter,
  quarterRef,
  month,
  monthLabel,
  sinceIso,
  detailTo,
}: Modelo130GaugeProps) {
  const { level, percent } = quarter;
  const markerPercent = percent === null ? null : Math.min(100, (percent / SCALE_MAX) * 100);
  const since = sinceIso && sinceIso > `${quarterRef.year}-01-01` ? sinceIso : null;

  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Modelo 130 · {`T${quarterRef.quarter} ${quarterRef.year}`}</h2>
            <p className="text-xs text-muted-foreground">
              Acumulado del año hasta el cierre del trimestre. Es el dato que decide.
            </p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", LEVEL_CHIP[level])}>
            {LEVEL_HEADLINE[level]}
          </span>
        </div>

        <p className="mt-3 flex items-baseline gap-2">
          <span className={cn("text-3xl font-bold tabular-nums", LEVEL_TEXT[level])}>
            {percent === null ? "—" : formatPercent(percent)}
          </span>
          <span className="text-xs text-muted-foreground">de tus ingresos declarados no lleva retención</span>
        </p>

        {/* Escala decorativa: la cifra y su explicación ya van en texto. */}
        <div aria-hidden="true" className="mt-3">
          <div className="flex h-2.5 overflow-hidden rounded-full">
            <span className="h-full bg-status-done" style={{ width: "62.5%" }} />
            <span className="h-full bg-streak" style={{ width: "12.5%" }} />
            <span className="h-full bg-alert" style={{ width: "25%" }} />
          </div>
          {markerPercent !== null && (
            <div className="relative h-3">
              <span
                className="absolute top-0 -ml-1.5 h-3 w-3 rounded-full border-2 border-card bg-foreground shadow-card"
                style={{ left: `${markerPercent}%` }}
              />
            </div>
          )}
        </div>
        {/* Leyenda en texto: colocar los números bajo el punto exacto de la
            escala obliga a posicionarlos a mano y a 320 px se solapan. */}
        <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">
          Verde hasta {MODELO_130_WATCH_PERCENT} % · ámbar entre {MODELO_130_WATCH_PERCENT} % y{" "}
          {MODELO_130_LIMIT_PERCENT} % · rojo desde {MODELO_130_LIMIT_PERCENT} % (escala hasta {SCALE_MAX} %)
        </p>

        <p className="mt-2 text-xs text-foreground">{LEVEL_EXPLANATION[level]}</p>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Cobra el paciente (sin retención)</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{formatEUR(quarter.grossParticular)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Factura a entidades (con retención)</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{formatEUR(quarter.grossEmpresa)}</dd>
          </div>
        </dl>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Se cuenta desde el{" "}
          {since ? `${formatDate(fromIsoDate(since))} (tu primera visita)` : `1 de enero de ${quarterRef.year}`} hasta el
          último día del trimestre.
          {quarter.unclassifiedVisits > 0 && (
            <>
              {" "}
              <span className="font-semibold text-streak">
                Faltan {quarter.unclassifiedVisits} visita{quarter.unclassifiedVisits === 1 ? "" : "s"} por clasificar: el
                porcentaje puede cambiar.
              </span>
            </>
          )}
        </p>

        {/* El mes, aparte y dicho como lo que es: tendencia, no la regla. */}
        <div className="mt-3 rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-semibold">Sólo {monthLabel.toLowerCase()}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {month.percent === null ? (
              "Sin ingresos declarados clasificados este mes."
            ) : (
              <>
                <span className="font-semibold tabular-nums text-foreground">{formatPercent(month.percent)}</span> sin
                retención ({formatEUR(month.grossParticular)} de {formatEUR(month.grossDeclared)}). Es sólo para ver la
                tendencia: el trimestre es el que manda.
              </>
            )}
          </p>
        </div>

        {detailTo && (
          <Link
            to={detailTo}
            className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Ver los movimientos de {monthLabel.toLowerCase()}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
