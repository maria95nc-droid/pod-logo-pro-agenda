import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Loader2, Check, X, AlertCircle, Sparkles } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { VoiceIntent, VoiceInterpretation } from "@/types/voice";

interface VoiceDictateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pista para la IA sobre qué tipo de dato esperamos por defecto */
  hintIntent?: VoiceIntent;
  /** Título del modal */
  title?: string;
  /** Texto de ayuda con un ejemplo de dictado */
  exampleHint?: string;
  /** Llamado al pulsar Confirmar con los datos interpretados */
  onConfirm: (interpretation: VoiceInterpretation, transcript: string) => void;
}

type Phase = "idle" | "listening" | "interpreting" | "review" | "error";

export function VoiceDictateModal({
  open,
  onOpenChange,
  hintIntent,
  title = "Dictado por voz",
  exampleHint,
  onConfirm,
}: VoiceDictateModalProps) {
  const speech = useSpeechRecognition("es-ES");
  const [phase, setPhase] = useState<Phase>("idle");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [interpretation, setInterpretation] = useState<VoiceInterpretation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      speech.reset();
      setEditableTranscript("");
      setInterpretation(null);
      setErrorMsg(null);
      if (speech.supported) {
        setPhase("listening");
        // pequeño delay para que el modal monte antes de pedir permiso
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

  const handleStop = async () => {
    speech.stop();
    const text = (speech.transcript + " " + speech.interim).trim();
    if (!text) {
      setErrorMsg("No he podido escuchar nada. Inténtalo de nuevo.");
      setPhase("error");
      return;
    }
    setEditableTranscript(text);
    setPhase("interpreting");
    try {
      const { data, error } = await supabase.functions.invoke("interpret-voice", {
        body: { transcript: text, hintIntent },
      });
      if (error) throw error;
      if (!data?.data) throw new Error("No he podido interpretar el dictado.");
      setInterpretation(data.data as VoiceInterpretation);
      setPhase("review");
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Error al interpretar";
      setErrorMsg(msg);
      setPhase("error");
    }
  };

  const handleReinterpret = async () => {
    if (!editableTranscript.trim()) return;
    setPhase("interpreting");
    try {
      const { data, error } = await supabase.functions.invoke("interpret-voice", {
        body: { transcript: editableTranscript, hintIntent },
      });
      if (error) throw error;
      setInterpretation(data.data as VoiceInterpretation);
      setPhase("review");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-0 overflow-hidden">
        <DialogHeader className="space-y-1 px-5 pt-5">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {exampleHint ?? "Habla con naturalidad. La IA entenderá los datos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          {/* FASE: ESCUCHANDO */}
          {phase === "listening" && (
            <div className="space-y-3">
              <div className="flex flex-col items-center justify-center rounded-xl bg-primary-soft py-6">
                <div className="relative">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-primary">
                    <Mic className="h-7 w-7" />
                  </div>
                </div>
                <p className="mt-3 text-sm font-medium text-primary">Escuchando…</p>
              </div>
              <div className="min-h-[60px] rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="text-foreground">{speech.transcript}</p>
                <p className="text-muted-foreground italic">{speech.interim}</p>
                {!speech.transcript && !speech.interim && (
                  <p className="text-muted-foreground">Empieza a hablar…</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" /> Cancelar
                </Button>
                <Button className="flex-1" onClick={handleStop}>
                  <MicOff className="h-4 w-4" /> Parar
                </Button>
              </div>
            </div>
          )}

          {/* FASE: INTERPRETANDO */}
          {phase === "interpreting" && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Interpretando lo que has dicho…</p>
            </div>
          )}

          {/* FASE: REVISIÓN */}
          {phase === "review" && interpretation && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Texto detectado
                </p>
                <Textarea
                  value={editableTranscript}
                  onChange={(e) => setEditableTranscript(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Datos interpretados ({interpretation.intent})
                </p>
                <InterpretedFields interpretation={interpretation} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" /> Cancelar
                </Button>
                <Button variant="secondary" size="sm" onClick={handleReinterpret}>
                  Reinterpretar
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
        No he detectado datos claros. Edita el texto y pulsa Reinterpretar.
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
          <span className="text-right">{Array.isArray(value) ? value.join(", ") : String(value)}</span>
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
