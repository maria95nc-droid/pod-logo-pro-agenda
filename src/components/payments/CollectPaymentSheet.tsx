import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatEUR } from "@/lib/format";
import { linesTotal, roundCents, sameAmount, visitTotal, type PaymentLine, type PaymentVisit } from "@/lib/payments";
import { registerVisitPayment } from "@/lib/visitActions";
import { PAYMENT_METHODS } from "@/types";

/** Línea en edición: el importe se guarda como texto para admitir la coma decimal. */
interface DraftLine {
  key: number;
  method: string;
  amount: string;
}

/** Acepta «17,5» y «17.5»; devuelve 0 si no hay número. */
const parseAmount = (value: string): number => {
  const n = Number(value.replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

const formatAmountInput = (value: number): string => (value > 0 ? String(roundCents(value)).replace(".", ",") : "");

/** Al partir el pago, la segunda línea suele ser en mano: propone otra forma distinta. */
const suggestSecondMethod = (used: readonly string[]): string => {
  const candidates = ["Efectivo", "Bizum", "Transferencia bancaria"];
  return candidates.find((method) => !used.includes(method)) ?? "Otro";
};

export interface CollectPaymentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: (PaymentVisit & { id: string }) | null;
  centerName?: string | null;
  /** Forma de cobro habitual del centro: la línea por defecto. */
  centerPaymentMethod?: string | null;
  /** Se ejecuta tras guardar (refrescar datos, celebrar…). */
  onConfirmed?: () => void;
}

/**
 * Confirmación de cobro con soporte para pagos fraccionados.
 *
 * El caso normal es **un solo toque**: la hoja abre con una única línea, ya
 * rellena con la forma de cobro habitual del centro y el importe completo.
 * Sólo si el centro paga una parte en efectivo y otra por Bizum/transferencia
 * hace falta añadir una segunda línea.
 */
export function CollectPaymentSheet({
  open,
  onOpenChange,
  visit,
  centerName,
  centerPaymentMethod,
  onConfirmed,
}: CollectPaymentSheetProps) {
  const fieldId = useId();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);

  const total = visit ? visitTotal(visit) : 0;

  const methodOptions = useMemo(() => {
    const custom = centerPaymentMethod?.trim();
    const base = [...PAYMENT_METHODS] as string[];
    return custom && !base.includes(custom) ? [custom, ...base] : base;
  }, [centerPaymentMethod]);

  const defaultMethod = centerPaymentMethod?.trim() || PAYMENT_METHODS[0];

  // Cada apertura parte de cero: una línea con el método habitual y el total.
  useEffect(() => {
    if (!open) return;
    setLines([{ key: 0, method: defaultMethod, amount: formatAmountInput(total) }]);
    setBusy(false);
  }, [open, defaultMethod, total]);

  const assigned = roundCents(lines.reduce((sum, line) => sum + parseAmount(line.amount), 0));
  const remaining = roundCents(total - assigned);
  const balanced = sameAmount(assigned, total);
  const hasEmptyLine = lines.some((line) => parseAmount(line.amount) <= 0 || !line.method);
  // Una visita sin importe (pendiente de facturar por la gestora) también debe
  // poder darse por cobrada, aunque no haya ninguna línea que cuadrar.
  const canSubmit = !busy && !!visit && (total <= 0 || (lines.length > 0 && !hasEmptyLine && balanced));

  const updateLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const addLine = () =>
    setLines((current) => {
      const used = current.map((line) => line.method);
      const pending = roundCents(total - current.reduce((sum, line) => sum + parseAmount(line.amount), 0));
      return [
        ...current,
        {
          key: (current.at(-1)?.key ?? 0) + 1,
          method: suggestSecondMethod(used),
          amount: formatAmountInput(Math.max(0, pending)),
        },
      ];
    });

  const removeLine = (key: number) => setLines((current) => current.filter((line) => line.key !== key));

  const handleConfirm = async () => {
    if (!visit || !canSubmit) return;
    setBusy(true);
    const payload: PaymentLine[] = lines.map((line) => ({ method: line.method, amount: parseAmount(line.amount) }));
    const result = await registerVisitPayment(visit, payload);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo registrar el cobro");
      return;
    }
    const detail = payload.length > 1 ? ` (${payload.map((l) => l.method).join(" + ")})` : "";
    toast.success(
      total > 0 ? `Cobro registrado: ${formatEUR(linesTotal(payload))}${detail}` : "Visita marcada como cobrada",
    );
    onOpenChange(false);
    onConfirmed?.();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-md sm:rounded-2xl"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="text-lg">Confirmar cobro</SheetTitle>
          <SheetDescription>
            {centerName ? `${centerName} · ` : ""}Total de la visita: <strong className="text-foreground">{formatEUR(total)}</strong>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {lines.map((line, index) => (
            <div key={line.key} className="rounded-xl border border-border bg-card p-3">
              {/* En pantallas muy estrechas el importe y la papelera bajan a una
                  segunda línea: si no, el nombre de la forma de pago se corta. */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[9rem] flex-1 space-y-1.5">
                  <Label htmlFor={`${fieldId}-method-${line.key}`} className="text-xs">
                    Forma de pago {lines.length > 1 ? index + 1 : ""}
                  </Label>
                  <Select value={line.method} onValueChange={(value) => updateLine(line.key, { method: value })}>
                    <SelectTrigger id={`${fieldId}-method-${line.key}`} className="h-11">
                      <SelectValue placeholder="Selecciona…" />
                    </SelectTrigger>
                    <SelectContent>
                      {methodOptions.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="ml-auto flex items-end gap-2">
                  <div className="w-24 shrink-0 space-y-1.5">
                    <Label htmlFor={`${fieldId}-amount-${line.key}`} className="text-xs">
                      Importe (€)
                    </Label>
                    <Input
                      id={`${fieldId}-amount-${line.key}`}
                      className="h-11 text-right tabular-nums"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={line.amount}
                      onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                    />
                  </div>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-11 w-11 shrink-0 text-muted-foreground"
                      onClick={() => removeLine(line.key)}
                      aria-label={`Quitar la forma de pago ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" className="h-11 w-full" onClick={addLine}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Dividir en otra forma de pago
          </Button>

          <p aria-live="polite" className="min-h-[1.25rem] text-center text-xs font-medium">
            {hasEmptyLine ? (
              <span className="text-streak">Escribe el importe de cada forma de pago.</span>
            ) : total <= 0 || balanced ? (
              <span className="text-muted-foreground">
                {lines.length > 1 ? "El desglose cuadra con el total." : "Todo con la misma forma de pago."}
              </span>
            ) : remaining > 0 ? (
              <span className="text-streak">Falta por asignar {formatEUR(remaining)}</span>
            ) : (
              // Ámbar y no rojo: el rojo del sistema (`--destructive`) no llega a
              // 4.5:1 sobre el fondo claro en texto pequeño.
              <span className="text-streak">Te has pasado en {formatEUR(Math.abs(remaining))}</span>
            )}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <Button type="button" size="lg" className="h-12" onClick={handleConfirm} disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wallet className="h-4 w-4" aria-hidden="true" />
            )}
            {total > 0 ? `Confirmar cobro de ${formatEUR(total)}` : "Marcar como cobrada"}
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)} disabled={busy}>
            Todavía no me han pagado
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
