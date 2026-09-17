import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Wallet } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export type CelebrationTone = "done" | "paid";

const TONES: Record<CelebrationTone, { colors: string[]; surface: string; Icon: typeof CheckCircle2 }> = {
  done: {
    colors: ["bg-primary", "bg-primary-glow", "bg-streak-glow", "bg-status-info"],
    surface: "bg-primary text-primary-foreground",
    Icon: CheckCircle2,
  },
  paid: {
    colors: ["bg-streak-glow", "bg-streak", "bg-primary", "bg-status-warning"],
    surface: "bg-streak text-white",
    Icon: Wallet,
  },
};

const PIECE_COUNT = 16;
/** Debe cubrir la animación más larga de index.css (950 ms + retardo máximo). */
const DURATION_MS = 1150;

/** Pseudoaleatorio determinista: misma ráfaga = mismas trayectorias entre renders. */
const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

function buildPieces(seed: number) {
  return Array.from({ length: PIECE_COUNT }, (_, i) => {
    const angle = (i / PIECE_COUNT) * Math.PI * 2 + pseudoRandom(seed + i) * 0.4;
    const distance = 62 + pseudoRandom(seed + i * 7.3) * 58;
    return {
      key: i,
      style: {
        "--cx": `${Math.cos(angle) * distance}px`,
        "--cy": `${Math.sin(angle) * distance - 26}px`,
        "--cr": `${Math.round((pseudoRandom(seed + i * 3.1) - 0.5) * 540)}deg`,
        "--cd": `${Math.round(pseudoRandom(seed + i * 11.7) * 120)}ms`,
      } as React.CSSProperties,
      round: i % 3 === 0,
      size: i % 4 === 0 ? "h-2.5 w-1.5" : "h-2 w-2",
    };
  });
}

export interface CelebrationProps {
  /** Identificador de la ráfaga; cambia en cada celebración. `null` = nada. */
  burstId: number | null;
  tone?: CelebrationTone;
  /** Se llama cuando la animación termina, para desmontar. */
  onDone: () => void;
}

/**
 * Ráfaga breve de confeti + sello de confirmación.
 * Va en un portal sobre `document.body` (las tarjetas usan `overflow-hidden`),
 * no captura eventos y se oculta a los lectores de pantalla: el aviso accesible
 * lo da el toast de la acción.
 */
export function Celebration({ burstId, tone = "done", onDone }: CelebrationProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const active = burstId !== null && !prefersReducedMotion;
  const pieces = useMemo(() => buildPieces(burstId ?? 0), [burstId]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(onDone, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [active, burstId, onDone]);

  // Sin animación: avisamos igualmente al padre para que limpie su estado.
  useEffect(() => {
    if (burstId !== null && prefersReducedMotion) onDone();
  }, [burstId, prefersReducedMotion, onDone]);

  if (!active || typeof document === "undefined") return null;

  const { colors, surface, Icon } = TONES[tone];

  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        <span className={`celebrate-pop flex h-16 w-16 items-center justify-center rounded-full shadow-elevated ${surface}`}>
          <Icon className="h-8 w-8" />
        </span>
        {pieces.map(({ key, style, round, size }) => (
          <span
            key={`${burstId}-${key}`}
            style={style}
            className={`confetti-piece absolute left-1/2 top-1/2 ${size} ${round ? "rounded-full" : "rounded-[2px]"} ${
              colors[key % colors.length]
            }`}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
