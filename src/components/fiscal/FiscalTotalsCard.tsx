import { AlertCircle, PiggyBank } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONSERVATIVE_IRPF_RATE, DEFAULT_EMPRESA_IRPF, type FiscalTotals } from "@/lib/fiscalCalculations";

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
} as const;

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
