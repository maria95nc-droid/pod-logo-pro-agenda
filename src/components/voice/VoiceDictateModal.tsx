import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2, Mic, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseVoiceLocal } from "@/lib/voiceParser";
import { canUseAi, incrementAiUsage, loadVoiceSettings } from "@/lib/voiceSettings";
import type { VoiceIntent, VoiceInterpretation } from "@/types/voice";

interface VoiceDictateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hintIntent?: VoiceIntent;
  title?: string;
  exampleHint?: string;
  onConfirm: (interpretation: VoiceInterpretation, transcript: string) => void;
}

type Phase = "draft" | "review" | "interpreting";

export function VoiceDictateModal({
  open,
  onOpenChange,
  hintIntent,
  title = "Dictado por voz",
  exampleHint,
  onConfirm,
}: VoiceDictateModalProps) {
  const [phase, setPhase] = useState<Phase>("draft");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [interpretation, setInterpretation] = useState<VoiceInterpretation | null>(null);
  const [askAi, setAskAi] = useState(false);
  const settings = useMemo(() => loadVoiceSettings(), [open]);

  useEffect(() => {
    if (open) {
      setPhase("draft");
      setEditableTranscript("");
      setInterpretation(null);
      setAskAi(false);
    }
  }, [open]);

  const handleDetectLocal = () => {
    if (!editableTranscript.trim()) {
      toast.message("Escribe o dicta algo primero.");
      return;
    }
    const parsed = withHintIntent(parseVoiceLocal(editableTranscript), hintIntent);
    setInterpretation(parsed);
    setPhase("review");
    toast.success("Datos detectados en modo gratis");
  };

  const requestAi = () => {
    if (!editableTranscript.trim()) {
      toast.message("No hay texto que interpretar.");
      return;
    }
    const check = canUseAi(settings);
    if (!check.ok) {
      toast.error(check.reason ?? "IA no disponible");
      return;
    }
    setAskAi(true);
  };

  const runAi = async () => {
    setAskAi(false);
    setPhase("interpreting");
    try {
      const { data, error } = await supabase.functions.invoke("interpret-voice", {
        body: { transcript: editableTranscript, hintIntent },
      });
      if (error) throw error;
      if (!data?.data) throw new Error("No he podido interpretar el dictado.");
      incrementAiUsage();
      setInterpretation(data.data as VoiceInterpretation);
      setPhase("review");
      toast.success("Interpretado con IA");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al interpretar";
      toast.error(msg);
      setPhase("review");
    }
  };

  const handleConfirm = () => {
    if (!interpretation) {
      toast.message("Pulsa Detectar datos antes de confirmar.");
      return;
    }
    onConfirm(interpretation, editableTranscript);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-3 overflow-hidden p-0">
          <DialogHeader className="space-y-1 px-5 pt-5">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Mic className="h-4 w-4 text-primary" />
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {exampleHint ?? "Usa el micrófono nativo del teclado del móvil o escribe manualmente."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            {phase === "draft" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-primary-soft/50 p-3 text-xs text-muted-foreground">
                  Modo gratis por defecto. La app no escucha automáticamente, no guarda audios y solo
                  procesa el texto cuando pulsas <strong className="text-foreground">Detectar datos</strong>.
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dicta o escribe aquí
                  </p>
                  <Textarea
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    rows={7}
                    className="resize-none text-sm"
                    placeholder="Ej.: Crear paciente José Luis Martínez Oliveros en la residencia Ave María"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                  <Button onClick={handleDetectLocal}>
                    Detectar datos
                  </Button>
                </div>
              </div>
            )}

            {phase === "interpreting" && (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Interpretando con IA…</p>
              </div>
            )}

            {phase === "review" && interpretation && (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dicta o escribe aquí
                  </p>
                  <Textarea
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    rows={4}
                    className="text-sm"
                    placeholder="Escribe o corrige el texto…"
                  />
                </div>
                <div>
                  <p className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Datos detectados ({interpretation.intent})</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] normal-case tracking-normal">
                      modo gratis
                    </span>
                  </p>
                  <EditableFields interpretation={interpretation} onChange={setInterpretation} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={handleDetectLocal}>
                    Detectar datos
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={requestAi}
                    className="border border-primary/20"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Interpretar con IA
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPhase("draft")}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={handleConfirm}>
                    <Check className="h-4 w-4" /> Confirmar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={askAi} onOpenChange={setAskAi}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Interpretar con IA</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción puede consumir créditos de IA. ¿Quieres continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runAi}>Sí, usar IA</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function withHintIntent(interpretation: VoiceInterpretation, hintIntent?: VoiceIntent): VoiceInterpretation {
  if (interpretation.intent !== "desconocido" || !hintIntent) return interpretation;

  const next: VoiceInterpretation = {
    ...interpretation,
    intent: hintIntent,
    confidence: 0.25,
  };

  if (hintIntent === "centro") next.center = next.center ?? {};
  if (hintIntent === "paciente") next.patient = next.patient ?? {};
  if (hintIntent === "visita") next.visit = next.visit ?? {};
  if (hintIntent === "material") next.material = next.material ?? {};
  if (hintIntent === "tratamiento") next.treatment = next.treatment ?? {};
  if (hintIntent === "cobro") next.payment = next.payment ?? {};

  return next;
}

function EditableFields({
  interpretation,
  onChange,
}: {
  interpretation: VoiceInterpretation;
  onChange: (next: VoiceInterpretation) => void;
}) {
  switch (interpretation.intent) {
    case "paciente":
      return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Field label="Nombre">
            <Input
              value={interpretation.patient?.fullName ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                patient: { ...interpretation.patient, fullName: e.target.value },
              })}
            />
          </Field>
          <Field label="Centro">
            <Input
              value={interpretation.patient?.centerName ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                patient: { ...interpretation.patient, centerName: e.target.value },
              })}
            />
          </Field>
          <Field label="Precio">
            <Input
              type="number"
              value={interpretation.patient?.defaultPrice ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                patient: {
                  ...interpretation.patient,
                  defaultPrice: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })}
            />
          </Field>
          <Field label="Tratamiento">
            <Input
              value={interpretation.patient?.usualTreatment ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                patient: { ...interpretation.patient, usualTreatment: e.target.value },
              })}
            />
          </Field>
        </div>
      );
    case "centro":
      return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Field label="Nombre">
            <Input
              value={interpretation.center?.name ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                center: { ...interpretation.center, name: e.target.value },
              })}
            />
          </Field>
          <Field label="Dirección">
            <Input
              value={interpretation.center?.address ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                center: { ...interpretation.center, address: e.target.value },
              })}
            />
          </Field>
          <Field label="Precio por paciente">
            <Input
              type="number"
              value={interpretation.center?.defaultPricePerPatient ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                center: {
                  ...interpretation.center,
                  defaultPricePerPatient: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })}
            />
          </Field>
        </div>
      );
    case "visita":
      return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Field label="Centro">
            <Input
              value={interpretation.visit?.centerName ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                visit: { ...interpretation.visit, centerName: e.target.value },
              })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fecha">
              <Input
                type="date"
                value={interpretation.visit?.date ?? ""}
                onChange={(e) => onChange({
                  ...interpretation,
                  visit: { ...interpretation.visit, date: e.target.value },
                })}
              />
            </Field>
            <Field label="Hora">
              <Input
                type="time"
                value={interpretation.visit?.startTime ?? ""}
                onChange={(e) => onChange({
                  ...interpretation,
                  visit: { ...interpretation.visit, startTime: e.target.value },
                })}
              />
            </Field>
          </div>
          <Field label="Pacientes (separados por coma)">
            <Input
              value={interpretation.visit?.patientNames?.join(", ") ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                visit: {
                  ...interpretation.visit,
                  patientNames: e.target.value
                    .split(",")
                    .map((name) => name.trim())
                    .filter(Boolean),
                },
              })}
            />
          </Field>
          <Field label="Precio por paciente">
            <Input
              type="number"
              value={interpretation.visit?.pricePerPatient ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                visit: {
                  ...interpretation.visit,
                  pricePerPatient: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })}
            />
          </Field>
        </div>
      );
    case "material":
      return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Field label="Nombre">
            <Input
              value={interpretation.material?.name ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                material: { ...interpretation.material, name: e.target.value },
              })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Stock">
              <Input
                type="number"
                value={interpretation.material?.currentStock ?? ""}
                onChange={(e) => onChange({
                  ...interpretation,
                  material: {
                    ...interpretation.material,
                    currentStock: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })}
              />
            </Field>
            <Field label="Mínimo">
              <Input
                type="number"
                value={interpretation.material?.minimumStock ?? ""}
                onChange={(e) => onChange({
                  ...interpretation,
                  material: {
                    ...interpretation.material,
                    minimumStock: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })}
              />
            </Field>
          </div>
          <Field label="Coste unitario">
            <Input
              type="number"
              value={interpretation.material?.unitCost ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                material: {
                  ...interpretation.material,
                  unitCost: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })}
            />
          </Field>
        </div>
      );
    case "tratamiento":
      return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Field label="Paciente">
            <Input
              value={interpretation.treatment?.patientName ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                treatment: { ...interpretation.treatment, patientName: e.target.value },
              })}
            />
          </Field>
          <Field label="Tratamiento realizado">
            <Textarea
              rows={3}
              value={interpretation.treatment?.treatmentDone ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                treatment: { ...interpretation.treatment, treatmentDone: e.target.value },
              })}
            />
          </Field>
        </div>
      );
    case "cobro":
      return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Field label="Objetivo">
            <Input
              value={interpretation.payment?.target ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                payment: { ...interpretation.payment, target: e.target.value },
              })}
            />
          </Field>
          <Field label="Estado">
            <Input
              value={interpretation.payment?.newStatus ?? ""}
              onChange={(e) => onChange({
                ...interpretation,
                payment: { ...interpretation.payment, newStatus: e.target.value as never },
              })}
            />
          </Field>
        </div>
      );
    default:
      return (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          No se han detectado datos claros. Edita el texto y pulsa Detectar datos o usa Interpretar con IA.
        </p>
      );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
