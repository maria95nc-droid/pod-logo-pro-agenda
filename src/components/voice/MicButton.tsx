import { useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VoiceDictateModal } from "./VoiceDictateModal";
import { isSpeechRecognitionSupported } from "@/hooks/useSpeechRecognition";
import { toast } from "sonner";
import type { VoiceIntent, VoiceInterpretation } from "@/types/voice";

interface MicButtonProps {
  hintIntent?: VoiceIntent;
  title?: string;
  exampleHint?: string;
  onConfirm: (data: VoiceInterpretation, transcript: string) => void;
  /** Estilo: chip pequeño dentro de un formulario, o botón normal */
  variant?: "chip" | "button";
  label?: string;
  className?: string;
}

export function MicButton({
  hintIntent,
  title,
  exampleHint,
  onConfirm,
  variant = "chip",
  label = "Dictar",
  className,
}: MicButtonProps) {
  const [open, setOpen] = useState(false);
  const supported = isSpeechRecognitionSupported();

  const handleClick = () => {
    if (!supported) {
      toast.error("El dictado por voz no está disponible en este dispositivo.");
      return;
    }
    setOpen(true);
  };

  if (variant === "chip") {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary transition-smooth active:scale-95 hover:bg-primary/15",
            className,
          )}
        >
          <Mic className="h-3.5 w-3.5" />
          {label}
        </button>
        <VoiceDictateModal
          open={open}
          onOpenChange={setOpen}
          hintIntent={hintIntent}
          title={title}
          exampleHint={exampleHint}
          onConfirm={onConfirm}
        />
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={handleClick} className={className}>
        <Mic className="h-4 w-4" /> {label}
      </Button>
      <VoiceDictateModal
        open={open}
        onOpenChange={setOpen}
        hintIntent={hintIntent}
        title={title}
        exampleHint={exampleHint}
        onConfirm={onConfirm}
      />
    </>
  );
}
