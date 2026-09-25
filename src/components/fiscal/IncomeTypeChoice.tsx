import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  INCOME_TYPES,
  INCOME_TYPE_HINT,
  INCOME_TYPE_LABEL,
  INCOME_TYPE_QUESTION,
  type IncomeType,
} from "@/lib/fiscalCalculations";

/**
 * «¿Quién paga esta visita?»: la entidad (con retención de IRPF) o el paciente
 * y su familia (sin retención).
 *
 * Se pregunta siempre y **nunca se contesta sola**: de esta respuesta salen la
 * retención, el neto declarado y el semáforo del Modelo 130, así que un valor
 * por defecto silencioso falsearía las cifras con las que David decide cuánto
 * dinero aparta.
 *
 * Dos botones grandes en vez de un desplegable: se registra de pie, con una
 * mano, entre residencias.
 */
export interface IncomeTypeChoiceProps {
  value: IncomeType | null;
  onChange: (value: IncomeType) => void;
  /** Lo habitual en ese centro (`centers.default_income_type`), sólo informativo. */
  suggestion?: IncomeType | null;
  /** `true` para marcar que falta contestar. */
  invalid?: boolean;
  /**
   * `false` cuando el aviso está desde el principio (una visita antigua sin
   * clasificar): un `role="alert"` al abrir la pantalla interrumpe al lector de
   * pantalla sin que el usuario haya hecho nada.
   */
  announceInvalid?: boolean;
  /** Prefijo de `id` para enlazar la pregunta con los botones. */
  idPrefix: string;
  className?: string;
}

export function IncomeTypeChoice({
  value,
  onChange,
  suggestion,
  invalid = false,
  announceInvalid = true,
  idPrefix,
  className,
}: IncomeTypeChoiceProps) {
  const questionId = `${idPrefix}-quien-paga`;
  const errorId = `${idPrefix}-quien-paga-error`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p id={questionId} className="text-sm font-medium leading-none">
        {INCOME_TYPE_QUESTION}
      </p>
      <div role="group" aria-labelledby={questionId} className="grid gap-2 sm:grid-cols-2">
        {INCOME_TYPES.map((type) => {
          const selected = value === type;
          return (
            <Button
              key={type}
              type="button"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              aria-describedby={invalid ? errorId : undefined}
              onClick={() => onChange(type)}
              className={cn(
                "h-auto min-h-12 flex-col items-start justify-center gap-0.5 whitespace-normal px-3 py-2 text-left",
                invalid && !selected && "border-alert/60",
              )}
            >
              <span className="text-sm font-semibold">{INCOME_TYPE_LABEL[type]}</span>
              <span className={cn("text-[11px] font-normal leading-snug", selected ? "opacity-90" : "text-muted-foreground")}>
                {INCOME_TYPE_HINT[type]}
              </span>
            </Button>
          );
        })}
      </div>

      {invalid ? (
        <p id={errorId} role={announceInvalid ? "alert" : undefined} className="text-xs font-semibold text-alert">
          Dinos quién paga antes de guardar: de aquí sale el IRPF.
        </p>
      ) : (
        suggestion && (
          <p className="text-xs text-muted-foreground">
            En este centro suele pagar: {INCOME_TYPE_LABEL[suggestion].toLowerCase()}. Puedes cambiarlo.
          </p>
        )
      )}
    </div>
  );
}
