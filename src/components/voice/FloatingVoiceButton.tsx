import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";
import { VoiceDictateModal } from "./VoiceDictateModal";
import { toast } from "sonner";
import type { VoiceInterpretation } from "@/types/voice";

const STORAGE_KEY = "voicePrefill";

export function setVoicePrefill(data: VoiceInterpretation) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* noop */
  }
}

export function consumeVoicePrefill(): VoiceInterpretation | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw);
    // Solo válido durante 60 segundos
    if (Date.now() - parsed.at > 60_000) return null;
    return parsed.data as VoiceInterpretation;
  } catch {
    return null;
  }
}

/**
 * Botón flotante "Añadir por voz".
 * Detecta la intención y navega a la pantalla adecuada con datos pre-rellenados.
 */
export function FloatingVoiceButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const handleClick = () => setOpen(true);

  const handleConfirm = (interpretation: VoiceInterpretation) => {
    setVoicePrefill(interpretation);
    switch (interpretation.intent) {
      case "centro":
        navigate("/centros/nuevo");
        break;
      case "paciente":
        navigate("/pacientes/nuevo");
        break;
      case "visita":
        navigate("/visita/nueva");
        break;
      case "material":
        navigate("/material?nuevo=1");
        break;
      case "tratamiento":
        toast.success("Tratamiento dictado registrado.");
        break;
      case "cobro":
        toast.success(
          `Marcando ${interpretation.payment?.target ?? ""} como ${interpretation.payment?.newStatus ?? "actualizado"}.`,
        );
        navigate("/finanzas");
        break;
      default:
        toast.message("No he reconocido la intención. Inténtalo de nuevo siendo más concreto.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Añadir por voz"
        className="fixed bottom-[88px] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-gradient-primary px-5 text-sm font-semibold text-primary-foreground shadow-elevated transition-smooth active:scale-95 hover:shadow-primary safe-bottom"
      >
        <Mic className="h-5 w-5" />
        Añadir por voz
      </button>

      <VoiceDictateModal
        open={open}
        onOpenChange={setOpen}
        title="Añadir por voz"
        exampleHint='Ejemplos: "Crear paciente María García en Los Olivos…", "Añadir visita mañana a las 9:30…", "Marcar Antonio Pérez como cobrado".'
        onConfirm={handleConfirm}
      />
    </>
  );
}
