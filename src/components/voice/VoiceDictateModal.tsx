import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Loader2, Check, X, AlertCircle, Sparkles, Pencil } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseVoiceLocal } from "@/lib/voiceParser";
import {
  canUseAi,
  incrementAiUsage,
  loadVoiceSettings,
} from "@/lib/voiceSettings";
import type { VoiceIntent, VoiceInterpretation } from "@/types/voice";

interface VoiceDictateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hintIntent?: VoiceIntent;
  title?: string;
  exampleHint?: string;
  onConfirm: (interpretation: VoiceInterpretation, transcript: string) => void;
}

type Phase = "listening" | "review" | "interpreting" | "error";

export function VoiceDictateModal({
  open,
  onOpenChange,
  hintIntent,
  title = "Dictado por voz",
  exampleHint,
  onConfirm,
}: VoiceDictateModalProps) {
  const settings = useRef(loadVoiceSettings());
  const speech = useSpeechRecognition("es-ES", {
    silenceMs: settings.current.silenceMs,
    maxDurationMs: settings.current.maxDurationMs,
  });
  const [phase, setPhase] = useState<Phase>("listening");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [interpretation, setInterpretation] = useState<VoiceInterpretation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [askAi, setAskAi] = useState(false);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      settings.current = loadVoiceSettings();
      speech.reset();
      setEditableTranscript("");
      setInterpretation(null);
      setErrorMsg(null);
      setAskAi(false);
      if (speech.supported) {
        setPhase("listening");
        setTimeout(() => speech.start(), 150);
      } else {
        setPhase("error");
        setErrorMsg(
          "El dictado por voz no está disponible en este dispositivo. Puedes escribirlo manualmente.",
        );
      }
    } else {
      speech.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cuando para de escuchar, pasar automáticamente a revisión local (sin IA)
  useEffect(() => {
    if (phase !== "listening") return;
    if (speech.isListening) return;
    // Solo si ya hay transcripción final
    const text = speech.transcript.trim();
    if (!text) return;
    setEditableTranscript(text);
    setInterpretation(parseVoiceLocal(text));
    setPhase("review");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.isListening, speech.transcript]);

  const handleStop = () => speech.stop();

  const handleManualText = () => {
    // Si el usuario decide pasar a revisión sin haber dictado nada
    speech.stop();
    setEditableTranscript("");
    setInterpretation({ intent: "desconocido", confidence: 0 });
    setPhase("review");
  };

  const handleReparseLocal = () => {
    if (!editableTranscript.trim()) {
      toast.message("Escribe o dicta algo primero.");
      return;
    }
    setInterpretation(parseVoiceLocal(editableTranscript));
    toast.success("Re-detectado con reglas locales");
  };

  const requestAi = () => {
    if (!editableTranscript.trim()) {
      toast.message("No hay texto que interpretar.");
      return;
    }
    const check = canUseAi(settings.current);
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
    if (!interpretation) return;
    onConfirm(interpretation, editableTranscript);
    onOpenChange(false);
  };

  const liveText = (speech.transcript + (speech.interim ? " " + speech.interim : "")).trim();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-3 p-0 overflow-hidden">
          <DialogHeader className="space-y-1 px-5 pt-5">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Mic className="h-4 w-4 text-primary" />
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {exampleHint ?? "Habla con naturalidad. Modo gratis sin IA por defecto."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5">
            {/* FASE: ESCUCHANDO */}
            {phase === "listening" && (
              <div className="space-y-3">
                <div className="flex flex-col items-center justify-center rounded-xl bg-primary-soft py-6">
                  <div className="relative">
                    {speech.isListening && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
                    )}
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-primary">
                      <Mic className="h-7 w-7" />
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium text-primary">
                    {speech.isListening ? "Escuchando…" : "Preparado"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Para sola tras 2s de silencio · máx. 20s
                  </p>
                </div>
                <div className="min-h-[72px] rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  {liveText ? (
                    <p className="text-foreground">{liveText}</p>
                  ) : (
                    <p className="text-muted-foreground">Empieza a hablar…</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                  {speech.isListening ? (
                    <Button className="flex-1" onClick={handleStop}>
                      <MicOff className="h-4 w-4" /> Parar
                    </Button>
                  ) : (
                    <Button className="flex-1" onClick={handleManualText}>
                      <Pencil className="h-4 w-4" /> Escribir
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* FASE: INTERPRETANDO (IA) */}
            {phase === "interpreting" && (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Interpretando con IA…</p>
              </div>
            )}

            {/* FASE: REVISIÓN */}
            {phase === "review" && interpretation && (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Texto detectado (editable)
                  </p>
                  <Textarea
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    rows={3}
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
                  <InterpretedFields interpretation={interpretation} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={handleReparseLocal}>
                    Re-detectar
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
                  <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                    <X className="h-4 w-4" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={handleConfirm}>
                    <Check className="h-4 w-4" /> Confirmar
                  </Button>
                </div>
              </div>
            )}

            {/* FASE: ERROR */}
            {phase === "error" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-status-cancelled-bg p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p>{errorMsg}</p>
                </div>
                <Button className="w-full" variant="outline" onClick={() => onOpenChange(false)}>
                  Cerrar
                </Button>
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

function InterpretedFields({ interpretation }: { interpretation: VoiceInterpretation }) {
  const obj =
    interpretation.center ??
    interpretation.patient ??
    interpretation.visit ??
    interpretation.material ??
    interpretation.treatment ??
    interpretation.payment ??
    {};
  const entries = Object.entries(obj as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        No se han detectado datos claros. Edita el texto, pulsa Re-detectar o usa Interpretar con IA.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-muted/30">
      {entries.map(([key, value]) => (
        <li key={key} className="flex items-start justify-between gap-3 px-3 py-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {labelize(key)}
          </span>
          <span className="text-right">
            {Array.isArray(value) ? value.join(", ") : String(value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function labelize(key: string) {
  const map: Record<string, string> = {
    name: "Nombre",
    fullName: "Nombre",
    type: "Tipo",
    address: "Dirección",
    city: "Ciudad",
    contactName: "Contacto",
    contactPhone: "Teléfono",
    defaultPricePerPatient: "Precio/paciente",
    defaultPrice: "Precio",
    notes: "Notas",
    centerName: "Centro",
    usualTreatment: "Tratamiento habitual",
    nextVisitDate: "Próxima visita",
    warnings: "Avisos",
    date: "Fecha",
    startTime: "Inicio",
    endTime: "Fin",
    patientNames: "Pacientes",
    pricePerPatient: "Precio/paciente",
    travelCost: "Desplazamiento",
    materialCost: "Material",
    currentStock: "Stock",
    minimumStock: "Mínimo",
    category: "Categoría",
    unit: "Unidad",
    unitCost: "Coste unidad",
    patientName: "Paciente",
    treatmentDone: "Tratamiento",
    amountCharged: "Cobrado",
    paymentStatus: "Estado",
    target: "Objetivo",
    newStatus: "Nuevo estado",
    when: "Cuándo",
  };
  return map[key] ?? key;
}
