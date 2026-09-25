import { useState } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CenterLabel } from "@/components/CenterLabel";
import { centerInfo, type CenterInfo } from "@/lib/centers";
import { formatDate, formatEUR, fromIsoDate } from "@/lib/format";
import { updateVisitFiscalData } from "@/lib/visitActions";
import {
  INCOME_TYPES,
  INCOME_TYPE_LABEL,
  empresaIrpfPercentage,
  fiscalGross,
  normalizeIncomeType,
  type FiscalVisit,
  type IncomeType,
} from "@/lib/fiscalCalculations";

/**
 * Visitas a las que todavía les falta decir quién paga.
 *
 * Es la pieza que hace posible la regla «nunca asumir»: las visitas sin
 * clasificar no entran en ninguna cuenta fiscal, así que hace falta una forma de
 * clasificarlas de dos toques, sin abrir cada visita. Al elegir «la entidad» se
 * guarda la retención por defecto del 15 %, editable después en la visita.
 */

/** Visita con lo que hace falta para recalcular su neto al clasificarla. */
export interface ClassifiableVisit extends FiscalVisit {
  travel_cost?: number | string | null;
  material_cost?: number | string | null;
  other_expenses?: number | string | null;
}

export interface UnclassifiedVisitsProps {
  visits: readonly ClassifiableVisit[];
  centers: ReadonlyMap<string, CenterInfo>;
  /** Refresco de datos tras guardar. */
  onSaved: () => void;
  /** Cuántas se listan como máximo; el resto se cuenta y se enlaza. */
  limit?: number;
  /** Enlace al listado completo filtrado por «sin clasificar». */
  allTo?: string;
}

export function UnclassifiedVisits({
  visits,
  centers,
  onSaved,
  limit = 6,
  allTo,
}: UnclassifiedVisitsProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (visits.length === 0) return null;

  const shown = visits.slice(0, limit);
  const rest = visits.length - shown.length;

  const classify = async (visit: ClassifiableVisit, incomeType: IncomeType) => {
    if (busyId) return;
    setBusyId(visit.id);
    // Se respeta la retención que ya tuviera la visita (hay facturas al 7 %);
    // `empresaIrpfPercentage` sólo cae al 15 % si no hay un valor usable.
    const percentage = incomeType === "Empresa" ? empresaIrpfPercentage(visit) : 0;
    const result = await updateVisitFiscalData(visit, {
      incomeType,
      irpfPercentage: percentage,
      // No se toca el número de factura: aquí sólo se contesta quién paga.
      invoiceNumber: visit.invoice_number ?? null,
    });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar quién paga");
      return;
    }
    toast.success(
      incomeType === "Empresa"
        ? `Guardado: paga la entidad · IRPF ${percentage} %`
        : "Guardado: paga el paciente · sin retención",
    );
    onSaved();
  };

  return (
    <Card className="border-streak/30 bg-streak-bg shadow-card">
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-streak"
          >
            <HelpCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              {visits.length} visita{visits.length === 1 ? "" : "s"} sin clasificar
            </h2>
            <p className="mt-0.5 text-xs text-foreground">
              Falta decir quién paga. Hasta entonces no cuentan en las cuentas de impuestos.
            </p>
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {shown.map((visit) => {
            const center = centerInfo(centers, visit.center_id);
            const suggestion = normalizeIncomeType(center.defaultIncomeType);
            const busy = busyId === visit.id;
            return (
              <li key={visit.id} className="rounded-xl bg-card p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/visita/${visit.id}`}
                    className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CenterLabel center={center} className="text-sm" />
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {formatDate(fromIsoDate(visit.visit_date))}
                      {suggestion ? ` · suele pagar: ${INCOME_TYPE_LABEL[suggestion].toLowerCase()}` : ""}
                    </span>
                  </Link>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatEUR(fiscalGross(visit))}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {INCOME_TYPES.map((type) => (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-10 min-w-0"
                      disabled={busy || busyId !== null}
                      onClick={() => void classify(visit, type)}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <span className="truncate">{INCOME_TYPE_LABEL[type]}</span>
                      )}
                      <span className="sr-only">
                        {" "}
                        paga la visita de {center.name} del {formatDate(fromIsoDate(visit.visit_date))}
                      </span>
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        {rest > 0 && (
          <p className="mt-2 text-[11px] text-foreground">
            Y {rest} más.
            {allTo && (
              <>
                {" "}
                <Link to={allTo} className="font-semibold text-streak underline underline-offset-2">
                  Ver todas
                </Link>
                .
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
