import { Building2, House } from "lucide-react";
import type { CenterInfo } from "@/lib/centers";
import { cn } from "@/lib/utils";

interface CenterLabelProps {
  center: CenterInfo;
  /** Añade el tipo («Residencia», «Domicilio») debajo del nombre. */
  showType?: boolean;
  className?: string;
}

/**
 * Origen de una visita: de dónde sale el dinero. El icono distingue de un
 * vistazo un domicilio particular de una residencia o centro de día, que era
 * justo lo que no se veía en el calendario.
 */
export function CenterLabel({ center, showType = false, className }: CenterLabelProps) {
  const Icon = center.isHome ? House : Building2;
  const type = center.type || (center.id ? "Centro" : "Sin asignar");
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{center.name}</span>
        {showType && (
          <span className="block truncate text-[11px] font-normal text-muted-foreground">
            {type}
            {center.city ? ` · ${center.city}` : ""}
          </span>
        )}
      </span>
    </span>
  );
}
