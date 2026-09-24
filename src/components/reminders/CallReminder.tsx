import { Link } from "react-router-dom";
import { Phone, PhoneCall } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { capitalize, formatDate, fromIsoDate } from "@/lib/format";
import { reminderSchedulePath, type CallReminder } from "@/lib/visitReminders";

/**
 * Aviso de «toca llamar a la residencia» (ver `src/lib/visitReminders.ts`).
 *
 * Es el único aviso de la app en rojo: los demás (stock bajo, pendientes de
 * cobro) informan, éste pide una acción inmediata de David. El texto va en
 * `--alert` sobre `--alert-bg`, ambos tokens comprobados a ≥7:1.
 */

/** `tel:` no admite espacios ni separadores. */
const telHref = (phone: string) => `tel:${phone.replace(/[\s.()-]/g, "")}`;

/** Descripción completa para lectores de pantalla y `title`. */
const describe = (reminder: CallReminder) =>
  `Llamar a ${reminder.centerName}: ${reminder.timingText} (${formatDate(fromIsoDate(reminder.dueIso))}).`;

/** Versión completa, para la sección «Avisos» de Hoy. */
export function CallReminderCard({ reminder }: { reminder: CallReminder }) {
  return (
    <Card className="border-alert/30 bg-alert-bg shadow-card">
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alert text-alert-fg"
          >
            <PhoneCall className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Llamar a <span className="break-words">{reminder.centerName}</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-alert">
              {capitalize(reminder.timingText)} · {formatDate(fromIsoDate(reminder.dueIso))}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {reminder.contactPhone ? (
            <Button
              asChild
              size="sm"
              className="h-10 min-w-0 flex-1 basis-28 bg-alert text-alert-fg hover:bg-alert/90 sm:flex-none sm:basis-auto sm:px-6"
            >
              <a
                href={telHref(reminder.contactPhone)}
                aria-label={`Llamar a ${reminder.centerName}, teléfono ${reminder.contactPhone}`}
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Llamar</span>
              </a>
            </Button>
          ) : (
            /* Sin icono y abreviado: a 320 px comparte fila con «Programar». */
            <Button asChild size="sm" variant="outline" className="h-10 min-w-0 flex-1 basis-28 bg-card sm:flex-none sm:basis-auto sm:px-6">
              <Link
                to={`/centros/${reminder.centerId}/editar`}
                aria-label={`Añadir el teléfono de ${reminder.centerName}`}
              >
                <span className="truncate">Añadir tel.</span>
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="h-10 min-w-0 flex-1 basis-28 bg-card sm:flex-none sm:basis-auto sm:px-6">
            <Link
              to={reminderSchedulePath(reminder)}
              aria-label={`Programar la próxima visita a ${reminder.centerName}`}
            >
              <span className="truncate">Programar</span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Versión de una línea, para la vista de Mes de la Agenda. */
export function CallReminderRow({ reminder }: { reminder: CallReminder }) {
  return (
    <Link
      to={reminderSchedulePath(reminder)}
      aria-label={`${describe(reminder)} Programar la próxima visita.`}
      className="flex items-center gap-2 rounded-md bg-card px-2 py-2 text-xs transition-smooth hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <PhoneCall className="h-3.5 w-3.5 shrink-0 text-alert" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{reminder.centerName}</span>
      <span aria-hidden="true" className="shrink-0 font-semibold text-alert">
        {reminder.timingText}
      </span>
    </Link>
  );
}
