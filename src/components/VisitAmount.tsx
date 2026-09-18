import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

interface VisitAmountProps {
  gross: number;
  /**
   * Trabajo registrado sin importe todavía (las visitas que factura la gestora).
   * Se pinta como aviso ámbar y no como «0,00 €», que se leía como «no cobré
   * nada» o directamente como «no hay datos».
   */
  unbilled?: boolean;
  pendingLabel?: string;
  className?: string;
}

/**
 * Importe de una visita, con el estado «sin importe aún» resuelto en un solo
 * sitio: aparece en la agenda (día, semana, mes) y en el detalle de ingresos, y
 * antes cada pantalla lo resolvía de una forma distinta.
 */
export function VisitAmount({ gross, unbilled = false, pendingLabel = "Sin importe aún", className }: VisitAmountProps) {
  if (unbilled) {
    return <span className={cn("font-semibold text-streak", className)}>{pendingLabel}</span>;
  }
  return (
    <span className={cn("font-semibold tabular-nums", className)}>{formatEUR(Number.isFinite(gross) ? gross : 0)}</span>
  );
}
