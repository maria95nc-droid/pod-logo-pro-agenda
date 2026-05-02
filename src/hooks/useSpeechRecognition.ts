import { useCallback, useEffect, useRef, useState } from "react";

// Tipos mínimos para la Web Speech API (no están en lib.dom estándar)
interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
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

export function useSpeechRecognition(lang: string = "es-ES") {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = isSpeechRecognitionSupported();

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  const start = useCallback(() => {
    setError(null);
    setTranscript("");
    setInterim("");
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
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onerror = (e) => {
      setError(e.error || "error");
      setIsListening(false);
    };
    r.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (finalText) setTranscript((prev) => (prev ? `${prev} ${finalText}`.trim() : finalText.trim()));
      setInterim(interimText);
    };
    recRef.current = r;
    try {
      r.start();
    } catch (err) {
      setError("start-failed");
    }
  }, [lang]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { transcript, interim, isListening, error, supported, start, stop, reset, setTranscript };
}
