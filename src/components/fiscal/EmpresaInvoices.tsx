import { Link } from "react-router-dom";
import { ChevronRight, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { CenterLabel } from "@/components/CenterLabel";
import { centerInfo, type CenterInfo } from "@/lib/centers";
import { formatDate, formatEUR, fromIsoDate } from "@/lib/format";
import type { EmpresaInvoiceState } from "@/lib/fiscalCalculations";
import type { VisitStatus } from "@/types";

/**
 * Estado de cobro de las facturas a entidades.
 *
 * Responde a una pregunta que la vista de ingresos no responde («¿qué facturas a
 * entidad me deben todavía?») sin duplicar el libro de movimientos: el listado
 * completo, con sus filtros, sigue viviendo en `/finanzas/movimientos`, y de
 * aquí se enlaza.
 *
 * No es mensual a propósito: una factura de julio sin cobrar sigue sin cobrarse
 * en septiembre.
 */
export interface EmpresaInvoicesProps {
  state: EmpresaInvoiceState;
  centers: ReadonlyMap<string, CenterInfo>;
  /** Cuántas facturas pendientes se listan; el resto se cuenta. */
  limit?: number;
  /** Enlace al listado completo de facturas a entidad pendientes. */
  pendingTo?: string;
  /** Enlace al listado de facturas a entidad ya cobradas. */
  settledTo?: string;
}

export function EmpresaInvoices({
  state,
  centers,
  limit = 8,
  pendingTo,
  settledTo,
}: EmpresaInvoicesProps) {
  const shown = state.pending.slice(0, limit);
  const rest = state.pending.length - shown.length;
  const nothing = state.pending.length === 0 && state.settledVisits === 0;

  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Facturas a entidades
        </h2>
        <p className="text-xs text-muted-foreground">De cualquier mes, no sólo del que estás mirando.</p>

        {nothing ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay visitas marcadas como «paga la entidad».
          </p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">
                  Sin cobrar ({state.pending.length} factura{state.pending.length === 1 ? "" : "s"})
                </dt>
                {/* Ámbar `--streak` y no `--status-pending-payment`: el naranja de
                    estado se queda en 2,4:1 sobre blanco y esto es un importe. */}
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-streak">
                  {formatEUR(state.pendingTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Cobradas o facturadas ({state.settledVisits} factura{state.settledVisits === 1 ? "" : "s"})
                </dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-status-paid">
                  {formatEUR(state.settledTotal)}
                </dd>
              </div>
            </dl>

            {shown.length > 0 && (
              <ul className="mt-3 space-y-2">
                {shown.map((invoice) => {
                  const center = centerInfo(centers, invoice.centerId);
                  return (
                    <li key={invoice.visitId}>
                      <Link
                        to={`/visita/${invoice.visitId}`}
                        className="flex items-start gap-2 rounded-xl border border-border bg-card p-2.5 transition-smooth hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="min-w-0 flex-1">
                          <CenterLabel center={center} className="text-sm" />
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="tabular-nums">{formatDate(fromIsoDate(invoice.date))}</span>
                            <span className="tabular-nums">{invoice.invoiceNumber ?? "sin nº de factura"}</span>
                            <StatusBadge status={invoice.status as VisitStatus} className="text-[10px]" />
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatEUR(invoice.gross)}</span>
                        <ChevronRight className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {rest > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Y {rest} factura{rest === 1 ? "" : "s"} más sin cobrar.</p>}

            {state.withoutNumber > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {state.withoutNumber} visita{state.withoutNumber === 1 ? "" : "s"} a entidad sin número de factura
                apuntado: apúntalo en la visita para que la app detecte huecos en la numeración.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-primary">
              {pendingTo && state.pending.length > 0 && (
                <Link
                  to={pendingTo}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Ver todas las pendientes
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
              {settledTo && state.settledVisits > 0 && (
                <Link
                  to={settledTo}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Ver las cerradas
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
