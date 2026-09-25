import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Modelo130Reminder } from "@/lib/fiscalCalculations";

/**
 * Aviso de «toca presentar el Modelo 130».
 *
 * Mismo lenguaje visual que el aviso de «toca llamar a la residencia»
 * (`src/components/reminders/CallReminder.tsx`): tokens `--alert` sobre
 * `--alert-bg`, comprobados a ≥7:1. Son los dos únicos avisos de la app que
 * piden una acción con fecha límite de David.
 */

const formatPercent = (percent: number): string =>
  `${percent.toLocaleString("es-ES", { maximumFractionDigits: 1 })}\u00A0%`;

export function Modelo130ReminderCard({ reminder }: { reminder: Modelo130Reminder }) {
  const headline = reminder.quarterClosed
    ? `El trimestre ${reminder.label} cerró en rojo`
    : `El trimestre ${reminder.label} va a cerrar en rojo`;

  return (
    <Card className="border-alert/30 bg-alert-bg shadow-card">
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alert text-alert-fg"
          >
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{headline}</p>
            <p className="mt-0.5 text-xs font-semibold text-alert">
              {formatPercent(reminder.percent)} de tus ingresos sin retención · presentar el Modelo 130 antes del{" "}
              {reminder.deadlineLabel}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {reminder.quarterClosed
                ? "Es el pago fraccionado del IRPF del trimestre. Avísale a tu gestoría."
                : "Aún puede cambiar hasta el último día del trimestre. Avisa a tu gestoría por si acaso."}
            </p>
          </div>
        </div>

        <Button asChild size="sm" variant="outline" className="mt-2.5 h-10 w-full bg-card sm:w-auto sm:px-6">
          <Link to="/finanzas?vista=impuestos">
            Ver el cálculo
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
