import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IncomeTypeChoice } from "@/components/fiscal/IncomeTypeChoice";
import { formatEUR } from "@/lib/format";
import { updateVisitFiscalData } from "@/lib/visitActions";
import { roundCents, visitTotal } from "@/lib/payments";
import {
  DEFAULT_EMPRESA_IRPF,
  empresaIrpfPercentage,
  missingPreviousInvoice,
  retentionFor,
  normalizeIncomeType,
  unusualInvoiceFormat,
  type IncomeType,
} from "@/lib/fiscalCalculations";
import type { ClassifiableVisit } from "@/components/fiscal/UnclassifiedVisits";

/**
 * Datos fiscales de una visita: quién paga, la retención y el número de factura.
 *
 * Aquí es donde se contesta la pregunta si la visita se guardó sin contestarla
 * (por ejemplo dictada por voz mientras conduce) y donde se corrige una
 * retención distinta del 15 % en una factura concreta.
 *
 * Los avisos de numeración **nunca bloquean**: hay facturas reales fuera de
 * serie y rectificativas, y un formulario que no deja guardar la verdad hace más
 * daño que un aviso.
 */
export interface VisitFiscalCardProps {
  visit: ClassifiableVisit;
  /** Números de factura ya guardados en otras visitas, para detectar huecos. */
  existingInvoiceNumbers: readonly string[];
  /** Lo habitual en el centro de la visita, sólo para precargar. */
  suggestion?: IncomeType | null;
  onSaved: () => void;
}

/** El porcentaje se guarda tal cual se escribe: redondearlo a dos decimales
 *  cambiaría una retención real (7,125 % → 7,13 %). Sólo se valida. */
const parsePercentage = (value: string): number | null => {
  const text = value.replace(",", ".").trim();
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
};

export function VisitFiscalCard({ visit, existingInvoiceNumbers, suggestion, onSaved }: VisitFiscalCardProps) {
  const fieldId = useId();
  const savedIncomeType = normalizeIncomeType(visit.income_type);
  const savedInvoice = (visit.invoice_number ?? "").trim();
  const savedIrpf = savedIncomeType === "Empresa" ? empresaIrpfPercentage(visit) : 0;
  /**
   * Retención que se propone al clasificar como factura a entidad: la que ya
   * tuviera apuntada la visita si es usable (hay facturas al 7 %), y sólo el
   * 15 % si no hay ninguna. Nunca se sobrescribe un porcentaje real en silencio.
   */
  const proposedIrpf = empresaIrpfPercentage(visit);

  const [incomeType, setIncomeType] = useState<IncomeType | null>(savedIncomeType);
  const [irpf, setIrpf] = useState(() => String(savedIncomeType === "Empresa" ? savedIrpf : proposedIrpf));
  const [invoice, setInvoice] = useState(savedInvoice);
  const [busy, setBusy] = useState(false);

  // La ficha se recarga sola tras guardar (react-query): el formulario tiene que
  // partir otra vez de lo que hay en la base, no quedarse con lo que se escribió.
  useEffect(() => {
    setIncomeType(savedIncomeType);
    setIrpf(String(savedIncomeType === "Empresa" ? savedIrpf : proposedIrpf));
    setInvoice(savedInvoice);
  }, [visit.id, savedIncomeType, savedIrpf, savedInvoice, proposedIrpf]);

  // Lo habitual del centro sólo **precarga** la respuesta, y sólo mientras no
  // haya ninguna: los centros se cargan después que la visita, y sin esta
  // condición la sugerencia podía pisar lo que el usuario acabase de elegir.
  useEffect(() => {
    if (!suggestion) return;
    setIncomeType((current) => current ?? suggestion);
  }, [suggestion]);

  const gross = roundCents(visitTotal(visit));
  const percentage = incomeType === "Empresa" ? parsePercentage(irpf) : 0;
  const irpfInvalid = incomeType === "Empresa" && percentage === null;
  const retention = percentage === null ? 0 : retentionFor(gross, percentage);

  const trimmedInvoice = invoice.trim();
  const gap = useMemo(
    () => missingPreviousInvoice(trimmedInvoice, existingInvoiceNumbers),
    [trimmedInvoice, existingInvoiceNumbers],
  );
  const oddFormat = useMemo(
    () => unusualInvoiceFormat(trimmedInvoice, existingInvoiceNumbers),
    [trimmedInvoice, existingInvoiceNumbers],
  );

  const dirty =
    incomeType !== savedIncomeType ||
    trimmedInvoice !== savedInvoice ||
    (incomeType === "Empresa" && percentage !== null && percentage !== savedIrpf);
  const canSave = !busy && !irpfInvalid && incomeType !== null && dirty;

  const handleSave = async () => {
    if (!canSave || incomeType === null) return;
    setBusy(true);
    const result = await updateVisitFiscalData(visit, {
      incomeType,
      irpfPercentage: incomeType === "Empresa" ? percentage ?? DEFAULT_EMPRESA_IRPF : 0,
      invoiceNumber: trimmedInvoice === "" ? null : trimmedInvoice,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudieron guardar los datos fiscales");
      return;
    }
    toast.success("Datos fiscales guardados");
    onSaved();
  };

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-3 p-4">
        <div>
          <h2 className="text-base font-semibold">Datos para Hacienda</h2>
          <p className="text-xs text-muted-foreground">
            De aquí salen el IRPF de esta visita y el aviso del Modelo 130.
          </p>
        </div>

        <IncomeTypeChoice
          idPrefix={fieldId}
          value={incomeType}
          onChange={(next) => {
            setIncomeType(next);
            // Al clasificarla como factura a entidad se propone la retención que
            // ya tuviera apuntada (15 % si no hay ninguna), nunca un 15 % fijo
            // que borre una retención real distinta.
            if (next === "Empresa" && savedIncomeType !== "Empresa") setIrpf(String(proposedIrpf));
          }}
          suggestion={savedIncomeType === null ? suggestion ?? null : null}
          invalid={incomeType === null}
          announceInvalid={false}
        />

        {incomeType === "Empresa" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-irpf`}>Retención de IRPF (%)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${fieldId}-irpf`}
                className="h-11 w-24 tabular-nums"
                inputMode="decimal"
                autoComplete="off"
                value={irpf}
                onChange={(event) => setIrpf(event.target.value)}
                aria-invalid={irpfInvalid || undefined}
                aria-describedby={`${fieldId}-irpf-help`}
              />
              <p id={`${fieldId}-irpf-help`} className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
                {irpfInvalid ? (
                  <span className="font-semibold text-alert">Escribe un porcentaje entre 0 y 100.</span>
                ) : (
                  <>
                    Lo normal es el {DEFAULT_EMPRESA_IRPF} %. Te retienen{" "}
                    <strong className="text-foreground">{formatEUR(retention)}</strong> de {formatEUR(gross)}.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-invoice`}>Número de factura</Label>
          <Input
            id={`${fieldId}-invoice`}
            className="h-11"
            autoComplete="off"
            placeholder="Ej.: F-2026-066"
            value={invoice}
            onChange={(event) => setInvoice(event.target.value)}
            aria-describedby={`${fieldId}-invoice-help`}
          />
          <div id={`${fieldId}-invoice-help`} className="space-y-1">
            {gap && (
              /* Aviso, no error: puede que esa factura sea de otro año o que
                 todavía no esté apuntada en la app. */
              <p className="flex items-start gap-1.5 text-xs font-medium text-streak">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Puede faltar la factura {gap} en la numeración. Revísalo, pero puedes guardar igual.</span>
              </p>
            )}
            {oddFormat && (
              <p className="text-xs text-muted-foreground">
                Tus facturas suelen escribirse como {oddFormat}. Si esta es distinta, no pasa nada.
              </p>
            )}
            {!gap && !oddFormat && (
              <p className="text-xs text-muted-foreground">
                Sirve para avisarte si te falta alguna factura de la serie.
              </p>
            )}
          </div>
        </div>

        <Button type="button" className="h-11 w-full" onClick={() => void handleSave()} disabled={!canSave}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Guardar datos fiscales
        </Button>
      </CardContent>
    </Card>
  );
}
