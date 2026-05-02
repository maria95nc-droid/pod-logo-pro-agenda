import { useCallback, useEffect, useRef, useState } from "react";

// Tipos mínimos para la Web Speech API
interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean; length: number }>;
  resultIndex: number;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  // @ts-expect-error vendor-prefixed
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export const isSpeechRecognitionSupported = () => !!getRecognitionCtor();

/**
 * Limpia repeticiones consecutivas de palabras o frases cortas.
 * Ej: "crear crear paciente paciente José" -> "crear paciente José"
 * Ej: "crear paciente crear paciente José" -> "crear paciente José"
 */
export function cleanRepetitions(input: string): string {
  if (!input) return "";
  // Normalizar espacios
  let text = input.replace(/\s+/g, " ").trim();

  // 1) Quitar repeticiones consecutivas de la MISMA palabra (case-insensitive)
  text = text.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");

  // 2) Quitar repeticiones consecutivas de bloques de 2-4 palabras
  for (let n = 4; n >= 2; n--) {
    const pattern = new RegExp(
      `\\b((?:\\w+\\s+){${n - 1}}\\w+)\\s+\\1\\b`,
      "gi",
    );
    let prev = "";
    while (prev !== text) {
      prev = text;
      text = text.replace(pattern, "$1");
    }
  }

  return text.replace(/\s+/g, " ").trim();
}

interface Options {
  /** ms de silencio para auto-parar. 0 = desactivado. Default 2000 */
  silenceMs?: number;
  /** ms de duración máxima total. 0 = desactivado. Default 20000 */
  maxDurationMs?: number;
}

export function useSpeechRecognition(lang: string = "es-ES", opts: Options = {}) {
  const { silenceMs = 2000, maxDurationMs = 20_000 } = opts;

  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const supported = isSpeechRecognitionSupported();

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxTimerRef.current) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, [clearTimers]);

  const stop = useCallback(() => {
    clearTimers();
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  }, [clearTimers]);

  const armSilenceTimer = useCallback(() => {
    if (!silenceMs) return;
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      stop();
    }, silenceMs);
  }, [silenceMs, stop]);

  const start = useCallback(() => {
    setError(null);
    setFinalTranscript("");
    setInterimTranscript("");
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("not-supported");
      return;
    }
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;
    r.onstart = () => {
      setIsListening(true);
      armSilenceTimer();
      if (maxDurationMs) {
        maxTimerRef.current = window.setTimeout(() => stop(), maxDurationMs);
      }
    };
    r.onend = () => {
      setIsListening(false);
      clearTimers();
      // Vaciar interim al terminar; el final ya está limpio
      setInterimTranscript("");
    };
    r.onerror = (e) => {
      // 'no-speech' y 'aborted' no son errores reales para el usuario
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(e.error || "error");
      }
      setIsListening(false);
      clearTimers();
    };
    r.onresult = (e) => {
      let newFinal = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) newFinal += res[0].transcript + " ";
        else interim += res[0].transcript + " ";
      }
      if (newFinal) {
        setFinalTranscript((prev) => cleanRepetitions((prev + " " + newFinal).trim()));
      }
      // El interim se REEMPLAZA, no se concatena
      setInterimTranscript(cleanRepetitions(interim.trim()));
      // Reiniciar el contador de silencio en cada resultado
      armSilenceTimer();
    };
    recRef.current = r;
    try {
      r.start();
    } catch {
      setError("start-failed");
    }
  }, [lang, armSilenceTimer, clearTimers, maxDurationMs, stop]);

  const reset = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  // El "transcript" público es el texto definitivo limpio
  const transcript = finalTranscript;

  return {
    transcript,
    interim: interimTranscript,
    isListening,
    error,
    supported,
    start,
    stop,
    reset,
    setTranscript: setFinalTranscript,
  };
}
