import { useEffect, useId, useState } from "react";
import { ArrowLeft, Building2, CalendarPlus, Check, Home, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { createCenter, createHome } from "@/lib/quickEntry";

type Step = "choose" | "home" | "center" | "done";

export interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se ejecuta tras crear algo (refrescar datos). */
  onCreated?: () => void;
  /** Permite encadenar con el registro rápido de visita del sitio recién creado. */
  onRegisterVisit?: (centerId: string) => void;
}

/**
 * Alta «sobre la marcha» en dos pasos: qué es y cuatro datos.
 *
 * El caso principal es el **domicilio** (un paciente nuevo en su casa), así que
 * va primero y destacado. Una residencia o centro sólo pide nombre y precio por
 * paciente; el resto de la ficha se completa luego en Pacientes si hace falta.
 */
export function QuickAddSheet({ open, onOpenChange, onCreated, onRegisterVisit }: QuickAddSheetProps) {
  const fieldId = useId();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);

  // Domicilio
  const [fullName, setFullName] = useState("");
  const [street, setStreet] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [city, setCity] = useState("");

  // Residencia / centro
  const [centerName, setCenterName] = useState("");
  const [price, setPrice] = useState("");

  // Resultado
  const [createdCenterId, setCreatedCenterId] = useState<string | null>(null);
  const [createdLabel, setCreatedLabel] = useState("");

  useEffect(() => {
    if (open) return;
    // Al cerrar se limpia todo: la hoja siempre abre en el paso 1.
    setStep("choose");
    setBusy(false);
    setFullName("");
    setStreet("");
    setStreetNumber("");
    setCity("");
    setCenterName("");
    setPrice("");
    setCreatedCenterId(null);
    setCreatedLabel("");
  }, [open]);

  const saveHome = async () => {
    if (!user || busy) return;
    if (!fullName.trim()) {
      toast.error("Escribe al menos el nombre y apellidos");
      return;
    }
    setBusy(true);
    const result = await createHome({ userId: user.id, fullName, street, streetNumber, city });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar el domicilio");
      return;
    }
    toast.success("Domicilio y paciente creados");
    setCreatedCenterId(result.centerId ?? null);
    setCreatedLabel(fullName.trim());
    setStep("done");
    onCreated?.();
  };

  const saveCenter = async () => {
    if (!user || busy) return;
    if (!centerName.trim()) {
      toast.error("Escribe al menos el nombre del centro");
      return;
    }
    setBusy(true);
    const parsedPrice = Number(price.replace(",", ".").trim());
    const result = await createCenter({
      userId: user.id,
      name: centerName,
      pricePerPatient: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar el centro");
      return;
    }
    toast.success("Centro creado");
    setCreatedCenterId(result.centerId ?? null);
    setCreatedLabel(centerName.trim());
    setStep("done");
    onCreated?.();
  };

  const title =
    step === "home" ? "Nuevo domicilio" : step === "center" ? "Nueva residencia o centro" : step === "done" ? "Listo" : "Añadir sobre la marcha";
  const description =
    step === "home"
      ? "Sólo lo imprescindible para poder volver: quién y dónde."
      : step === "center"
        ? "Nombre y precio por paciente. Lo demás puede esperar."
        : step === "done"
          ? "Ya puedes registrar la visita cuando quieras."
          : "¿Qué acabas de conseguir?";

  return (
    <Sheet open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-md sm:rounded-2xl"
      >
        <SheetHeader className="pr-8 text-left">
          <div className="flex items-center gap-2">
            {(step === "home" || step === "center") && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="-ml-2 h-9 w-9 shrink-0"
                onClick={() => setStep("choose")}
                aria-label="Volver a elegir el tipo"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            <SheetTitle className="text-lg">{title}</SheetTitle>
          </div>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        {step === "choose" && (
          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => setStep("home")}
              className="flex w-full items-center gap-3 rounded-xl border border-primary/25 bg-primary-soft p-4 text-left transition-smooth active:scale-[0.99] hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Home className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">Domicilio</span>
                <span className="block text-xs text-muted-foreground">Nombre, calle, número y ciudad</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStep("center")}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-smooth active:scale-[0.99] hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">Residencia o centro</span>
                <span className="block text-xs text-muted-foreground">Nombre y precio por paciente</span>
              </span>
            </button>
          </div>
        )}

        {step === "home" && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveHome();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-name`}>Nombre y apellidos</Label>
              <Input
                id={`${fieldId}-name`}
                className="h-11"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor={`${fieldId}-street`}>Calle</Label>
                <Input
                  id={`${fieldId}-street`}
                  className="h-11"
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                  autoComplete="address-line1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${fieldId}-number`}>Número</Label>
                <Input
                  id={`${fieldId}-number`}
                  className="h-11"
                  value={streetNumber}
                  onChange={(event) => setStreetNumber(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-city`}>Ciudad</Label>
              <Input
                id={`${fieldId}-city`}
                className="h-11"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                autoComplete="address-level2"
                enterKeyHint="done"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Guardar domicilio
            </Button>
          </form>
        )}

        {step === "center" && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveCenter();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-center`}>Nombre del centro</Label>
              <Input
                id={`${fieldId}-center`}
                className="h-11"
                value={centerName}
                onChange={(event) => setCenterName(event.target.value)}
                autoCapitalize="words"
                enterKeyHint="next"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-price`}>Precio por paciente (€)</Label>
              <Input
                id={`${fieldId}-price`}
                className="h-11"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="18"
              />
              <p className="text-xs text-muted-foreground">
                Se usará solo para calcular el importe de cada visita. Puedes cambiarlo después.
              </p>
            </div>
            <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Guardar centro
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary-soft p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="min-w-0 text-sm">
                <strong className="block truncate text-base font-semibold">{createdLabel}</strong>
                <span className="text-muted-foreground">Guardado y listo para usar.</span>
              </p>
            </div>
            {createdCenterId && onRegisterVisit && (
              <Button
                type="button"
                size="lg"
                className="h-12 w-full"
                onClick={() => {
                  const centerId = createdCenterId;
                  onOpenChange(false);
                  onRegisterVisit(centerId);
                }}
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Registrar visita ahora
              </Button>
            )}
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => onOpenChange(false)}>
              Ahora no, gracias
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
