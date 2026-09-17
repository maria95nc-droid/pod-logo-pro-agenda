import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { defaultUserSettings, useCenters, useUserSettings } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import { formatEUR, toIsoDate } from "@/lib/format";
import { roundCents } from "@/lib/payments";
import { MAX_PATIENTS_PER_VISIT, clampPatientsCount, createQuickVisit, quickVisitStatus } from "@/lib/quickEntry";

const parseNumber = (value: string): number => {
  const n = Number(value.replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

export interface QuickVisitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Centro preseleccionado (p. ej. el que se acaba de dar de alta). */
  initialCenterId?: string | null;
  /** Se ejecuta tras crear la visita (refrescar datos, celebrar…). */
  onCreated?: () => void;
}

/**
 * Registro rápido de visita para residencias y centros.
 *
 * No se marcan pacientes uno a uno: se elige el centro, el precio por paciente
 * se autorrellena con el del centro y sólo hay que decir cuántos se atendieron.
 * El formulario detallado (`/visita/nueva`) sigue existiendo para cuando hace
 * falta el desglose por paciente.
 */
export function QuickVisitSheet({ open, onOpenChange, initialCenterId, onCreated }: QuickVisitSheetProps) {
  const fieldId = useId();
  const { user } = useAuth();
  const { data: centers = [] } = useCenters();
  const { data: settings = defaultUserSettings } = useUserSettings();

  const [centerId, setCenterId] = useState("");
  const [price, setPrice] = useState("");
  const [patients, setPatients] = useState(1);
  const [date, setDate] = useState(() => toIsoDate());
  const [busy, setBusy] = useState(false);

  const activeCenters = useMemo(() => centers.filter((center) => center.is_active !== false), [centers]);

  const applyCenter = useCallback(
    (id: string) => {
      setCenterId(id);
      const center = centers.find((c) => c.id === id);
      const defaultPrice = center?.default_price_per_patient;
      setPrice(defaultPrice != null ? String(Number(defaultPrice)).replace(".", ",") : "");
    },
    [centers],
  );

  // Cada apertura empieza limpia, con el centro preseleccionado si lo hay.
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setPatients(1);
    setDate(toIsoDate());
    if (initialCenterId) applyCenter(initialCenterId);
    else {
      setCenterId("");
      setPrice("");
    }
  }, [open, initialCenterId, applyCenter]);

  const pricePerPatient = Math.max(0, parseNumber(price));
  const gross = roundCents(pricePerPatient * patients);
  const status = quickVisitStatus(date, gross);
  const canSubmit = !busy && !!user && !!centerId && !!date;

  const changePatients = (delta: number) => setPatients((current) => clampPatientsCount(current + delta));

  const handleSave = async () => {
    if (!user || !canSubmit) return;
    setBusy(true);
    // Una visita registrada hoy se apunta a la hora actual: sin hora acabaría
    // colándose como «Próxima visita» por delante de las que faltan por hacer.
    const now = new Date();
    const nowTime = date === toIsoDate(now) ? now.toTimeString().slice(0, 5) : null;
    const result = await createQuickVisit({
      userId: user.id,
      centerId,
      date,
      startTime: nowTime,
      endTime: nowTime,
      pricePerPatient,
      patientsCount: patients,
      irpfPercentage: Number(settings.default_irpf_percentage) || 0,
      travelCost: settings.apply_travel_per_visit ? Number(settings.default_travel_cost) || 0 : 0,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar la visita");
      return;
    }
    toast.success(
      result.status === "Programada"
        ? "Visita programada"
        : `Visita registrada · ${formatEUR(gross)} pendiente de cobro`,
    );
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-md sm:rounded-2xl"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle className="text-lg">Registro rápido de visita</SheetTitle>
          <SheetDescription>Centro, precio y cuántos pacientes has atendido. Nada más.</SheetDescription>
        </SheetHeader>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-center`}>Centro o domicilio</Label>
            <Select value={centerId} onValueChange={applyCenter}>
              <SelectTrigger id={`${fieldId}-center`} className="h-11">
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {activeCenters.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Todavía no tienes centros.</div>
                )}
                {activeCenters.map((center) => (
                  <SelectItem key={center.id} value={center.id}>
                    {center.name} · {center.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Se reparten en dos columnas salvo en pantallas muy estrechas, donde
              el selector de fecha nativo no cabe en media anchura. */}
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label htmlFor={`${fieldId}-price`}>Precio por paciente (€)</Label>
              <Input
                id={`${fieldId}-price`}
                className="h-11 tabular-nums"
                inputMode="decimal"
                autoComplete="off"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="18"
              />
            </div>
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label htmlFor={`${fieldId}-date`}>Fecha</Label>
              <Input
                id={`${fieldId}-date`}
                type="date"
                className="h-11"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-patients`}>Pacientes atendidos</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0"
                onClick={() => changePatients(-1)}
                disabled={patients <= 1}
                aria-label="Un paciente menos"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Input
                id={`${fieldId}-patients`}
                className="h-12 flex-1 text-center text-lg font-semibold tabular-nums"
                inputMode="numeric"
                autoComplete="off"
                value={patients}
                onChange={(event) => setPatients(clampPatientsCount(parseNumber(event.target.value)))}
                max={MAX_PATIENTS_PER_VISIT}
                min={1}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0"
                onClick={() => changePatients(1)}
                disabled={patients >= MAX_PATIENTS_PER_VISIT}
                aria-label="Un paciente más"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex items-baseline justify-between rounded-xl border border-primary/20 bg-primary-soft px-4 py-3">
            <span className="text-sm font-medium text-foreground">Importe bruto</span>
            <output
              htmlFor={`${fieldId}-price ${fieldId}-patients`}
              className="text-xl font-bold tabular-nums text-primary"
            >
              {formatEUR(gross)}
            </output>
          </div>

          <p className="text-xs text-muted-foreground">
            {status === "Programada"
              ? "Fecha futura: se guardará como visita programada."
              : status === "Realizada"
                ? "Sin importe: se guardará como realizada, sin cobro pendiente."
                : "Se guardará como realizada y pendiente de cobro hasta que confirmes el pago."}
          </p>

          <Button type="submit" size="lg" className="h-12 w-full" disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-4 w-4" aria-hidden="true" />
            )}
            Guardar visita
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
