import { AlertCircle, PiggyBank } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CONSERVATIVE_IRPF_RATE,
  DEFAULT_EMPRESA_IRPF,
  RENTA_BUFFER_RATE,
  type FiscalTotals,
} from "@/lib/fiscalCalculations";

/**
 * Los tres números del mes, explicados en castellano llano (David no es
 * contable y estas cifras deciden cuánto dinero aparta):
 *
 * 1. **Neto declarado**: lo que le queda una vez descontada la retención que las
 *    entidades ya le practican.
 * 2. **Estimación prudente**: lo que le quedaría si apartase el 20 % de todo lo
 *    declarado, retención incluida.
 * 3. **Falta por apartar**: la diferencia entre ese 20 % y lo que ya le han
 *    retenido. Puede ser negativa, y entonces se dice que tiene dinero a favor.
 *
 * El cálculo vive en `src/lib/fiscalCalculations.ts` (con tests); aquí sólo se
 * pinta.
 */
export interface FiscalTotalsCardProps {
  totals: FiscalTotals;
  periodLabel: string;
}

export function FiscalTotalsCard({ totals, periodLabel }: FiscalTotalsCardProps) {
  const owes = totals.pendingModelo100 >= 0;
  // El colchón del 5 % sólo vale si todo viene retenido al 15 %. Se compara con
  // lo que falta de verdad, con medio céntimo de tolerancia: por debajo de eso
  // la diferencia no se ve en pantalla y avisar sería ruido.
  const bufferIsShort = totals.pendingModelo100 - totals.rentaBuffer > 0.005;

  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold">Cuentas de {periodLabel.toLowerCase()}</h2>
        <p className="text-xs text-muted-foreground">
          Sólo dinero declarado: {formatEUR(totals.grossDeclared)} de bruto en {totals.visits} visita
          {totals.visits === 1 ? "" : "s"} clasificada{totals.visits === 1 ? "" : "s"}.
        </p>

        <dl className="mt-3 space-y-3">
          <Figure
            label="Neto declarado"
            help={`Lo que te queda después del IRPF que ya te retienen las entidades (${formatEUR(totals.retainedIrpf)} este periodo).`}
            value={formatEUR(totals.netDeclared)}
          />
          <Figure
            label={`Estimación prudente (apartando el ${CONSERVATIVE_IRPF_RATE} %)`}
            help={`Lo que te quedaría si guardases el ${CONSERVATIVE_IRPF_RATE} % de todo el bruto declarado para impuestos, en vez del ${DEFAULT_EMPRESA_IRPF} % que te retienen.`}
            value={formatEUR(totals.conservativeNet)}
          />
          <Figure
            label={owes ? "Falta por apartar (Modelo 100)" : "Te han retenido de más (Modelo 100)"}
            help={
              owes
                ? `Para llegar a ese ${CONSERVATIVE_IRPF_RATE} %, contando lo que ya te han retenido. El Modelo 100 es la declaración de la renta anual.`
                : `Ya te han retenido más del ${CONSERVATIVE_IRPF_RATE} %: esta cantidad juega a tu favor en la declaración de la renta.`
            }
            value={`${owes ? "" : "−"}${formatEUR(Math.abs(totals.pendingModelo100))}`}
            tone={owes ? "warm" : "good"}
            icon={<PiggyBank className="h-4 w-4" aria-hidden="true" />}
          />
        </dl>

        {/* Retenciones de referencia, las tres una al lado de la otra: el dueño
            quería ver el 20 % junto a lo que ya le retienen, y el 5 % que le
            queda por guardar. «Ya retenido» NO lleva el 15 % en la etiqueta: es
            la retención real factura a factura y hay facturas al 7 %.

            El 5 % sólo coincide con lo que falta de verdad si todo el bruto
            viene retenido al 15 %. Con ingresos de particulares (sin retención)
            se queda corto —y ahí es donde se pierde dinero—, así que en cuanto
            se separa de `pendingModelo100` el aviso lo dice con su cifra. */}
        <section className="mt-4 border-t border-border pt-3" aria-labelledby="retenciones-ref">
          <h3 id="retenciones-ref" className="text-xs font-semibold">
            Retenciones sobre {formatEUR(totals.grossDeclared)} de bruto
          </h3>
          <dl className="mt-2 grid grid-cols-3 gap-2">
            <Reference label="Ya retenido" value={formatEUR(totals.retainedIrpf)} />
            <Reference
              label={`Si fuera el ${CONSERVATIVE_IRPF_RATE} %`}
              value={formatEUR(totals.conservativeIrpf)}
            />
            <Reference
              label={`Aparta el ${RENTA_BUFFER_RATE} %`}
              value={formatEUR(totals.rentaBuffer)}
              tone={bufferIsShort ? "muted" : "warm"}
            />
          </dl>

          {bufferIsShort ? (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-streak-bg p-2.5 text-[11px] leading-snug text-foreground">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-streak" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Este periodo el {RENTA_BUFFER_RATE} % se queda corto.</strong> Supone
                que todo te lo retienen al {DEFAULT_EMPRESA_IRPF} %, y no es tu caso
                {totals.grossParticular > 0 ? " (parte la cobras de particulares, sin retención)" : ""}. Lo que falta
                apartar de verdad son <strong className="font-semibold">{formatEUR(totals.pendingModelo100)}</strong>.
              </span>
            </p>
          ) : (
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              El {RENTA_BUFFER_RATE} % es una{" "}
              <strong className="font-semibold text-foreground">estimación aproximada</strong> de la diferencia entre el{" "}
              {DEFAULT_EMPRESA_IRPF} % que te retienen y el {CONSERVATIVE_IRPF_RATE} % que probablemente te toque
              pagar: es lo que conviene guardar aparte. La cifra exacta con tus retenciones reales es «
              {owes ? "falta por apartar" : "te han retenido de más"}».
            </p>
          )}
        </section>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Facturado a entidades</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{formatEUR(totals.grossEmpresa)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cobrado a pacientes</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{formatEUR(totals.grossParticular)}</dd>
          </div>
        </dl>

        {totals.unclassifiedVisits > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-streak-bg p-2.5 text-[11px] text-foreground">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-streak" aria-hidden="true" />
            <span>
              <strong className="font-semibold">
                {totals.unclassifiedVisits} visita{totals.unclassifiedVisits === 1 ? "" : "s"} sin clasificar
              </strong>{" "}
              ({formatEUR(totals.unclassifiedGross)}) no entran en estas cuentas: falta decir quién paga. Están arriba,
              con sus dos botones.
            </span>
          </p>
        )}

        {totals.oddRetentionVisits > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {totals.oddRetentionVisits} factura{totals.oddRetentionVisits === 1 ? "" : "s"} a entidad con una retención
            distinta del {DEFAULT_EMPRESA_IRPF} %: se ha usado la de cada factura, no el {DEFAULT_EMPRESA_IRPF} % general.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const TONE_CLASS = {
  neutral: "text-foreground",
  warm: "text-streak",
  good: "text-status-paid",
  /** Para una cifra de referencia que este periodo no es la buena. */
  muted: "text-muted-foreground",
} as const;

/**
 * Cifra de referencia en una celda estrecha: a 320 px caben tres, así que la
 * etiqueta va arriba en dos líneas y el importe debajo, sin truncar.
 */
function Reference({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONE_CLASS;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <dt className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-sm font-bold tabular-nums", TONE_CLASS[tone])}>{value}</dd>
    </div>
  );
}

function Figure({
  label,
  help,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  help: string;
  value: string;
  tone?: keyof typeof TONE_CLASS;
  icon?: React.ReactNode;
}) {
  // Rejilla en vez de flex anidado: dentro de un `<dl>`, un `<div>` sólo puede
  // contener `<dt>`/`<dd>`, así que el texto de ayuda no puede ir envuelto.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
      <dt className="col-start-1 row-start-1 flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
      </dt>
      <dd className={cn("col-start-2 row-start-1 text-right text-base font-bold tabular-nums", TONE_CLASS[tone])}>
        {value}
      </dd>
      <dd className="col-start-1 row-start-2 mt-0.5 text-[11px] leading-snug text-muted-foreground">{help}</dd>
    </div>
  );
}
