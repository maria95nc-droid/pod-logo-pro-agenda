import * as React from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * `true` si el sistema pide reducir el movimiento. Permite no montar siquiera
 * las animaciones decorativas (el CSS también las desactiva, esto evita además
 * el trabajo de render).
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setPrefersReduced(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  return prefersReduced;
}
