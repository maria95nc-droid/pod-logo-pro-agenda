import { cn } from "@/lib/utils";
import type { VisitStatus, PaymentStatus } from "@/types";

type Status = VisitStatus | PaymentStatus | "Stock bajo" | "Stock OK";

const map: Record<string, string> = {
  "Programada": "bg-status-scheduled-bg text-status-scheduled",
  "Realizada": "bg-status-done-bg text-status-done",
  "Pendiente de cobro": "bg-status-pending-payment-bg text-status-pending-payment",
  "Cobrada": "bg-status-paid-bg text-status-paid",
  "Facturada": "bg-status-invoiced-bg text-status-invoiced",
  "Cancelada": "bg-status-cancelled-bg text-status-cancelled",
  "Pendiente": "bg-status-pending-payment-bg text-status-pending-payment",
  "Cobrado": "bg-status-paid-bg text-status-paid",
  "Incluido en factura": "bg-status-invoiced-bg text-status-invoiced",
  "No cobra": "bg-muted text-muted-foreground",
  "Revisar": "bg-status-warning-bg text-status-warning",
  "Stock bajo": "bg-status-cancelled-bg text-status-cancelled",
  "Stock OK": "bg-status-done-bg text-status-done",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        map[status] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
