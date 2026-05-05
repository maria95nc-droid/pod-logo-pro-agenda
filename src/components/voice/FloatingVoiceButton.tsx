import { useState } from "react";
import { Mic } from "lucide-react";
import { VoiceDictateModal } from "./VoiceDictateModal";

/**
 * Botón flotante "Añadir por voz".
 * El modal detecta la intención y guarda directamente en Supabase
 * tras confirmar (insert real + invalidación de queries + redirección).
 */
export function FloatingVoiceButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
      />
    </>
  );
}
