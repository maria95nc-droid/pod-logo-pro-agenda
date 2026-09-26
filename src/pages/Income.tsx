import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Filter, Loader2, ReceiptText, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { CenterLabel } from "@/components/CenterLabel";
import { VisitAmount } from "@/components/VisitAmount";
import { useCenters, useVisits } from "@/hooks/useData";
import { buildCenterIndex } from "@/lib/centers";
import { MONTHS_SHORT, WEEKDAYS, monthLabel, weekdayIndex } from "@/lib/calendar";
import { formatDate, formatEUR, fromIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ALL_FILTER,
  HOME_FILTER,
  UNCLASSIFIED_PAYER_FILTER,
  buildLedgerEntries,
  centerOptions,
  describePaymentSource,
  filterLedger,
  groupByMonth,
  ledgerTotals,
  monthOptions,
  type LedgerEntry,
  type LedgerPatientLine,
  type LedgerFilters,
  type LedgerPayerFilter,
  type LedgerStateFilter,
  type LedgerVisit,
  type LedgerTotals,
} from "@/lib/incomeLedger";
import { INCOME_TYPE_LABEL } from "@/lib/fiscalCalculations";
import type { VisitStatus } from "@/types";

/**
 * Detalle de ingresos: el libro de movimientos de la app.
 *
 * Responde a «¿de dónde sale esta cifra?» sin salir de la pantalla: una fila
 * por visita con fecha, centro o domicilio, pacientes, precio por paciente,
 * importe, forma de cobro y estado. Todo el cálculo vive en
 * `src/lib/incomeLedger.ts`; aquí sólo se pinta y se leen los filtros de la URL
 * (para poder enlazar «ver agosto» desde la agenda o desde finanzas).
 */

const STATE_OPTIONS: { value: LedgerStateFilter; label: string }[] = [
  { value: "all", label: "Todos los movimientos" },
  { value: "pending", label: "Pendiente de cobro" },
  { value: "unbilled", label: "Sin importe aún" },
  { value: "settled", label: "Ya cobrado" },
];

const STATE_VALUES = new Set(STATE_OPTIONS.map((option) => option.value));

/** Quién paga: mismo vocabulario que la pregunta de la visita. */
const PAYER_OPTIONS: { value: LedgerPayerFilter; label: string }[] = [
  { value: "all", label: "Pague quien pague" },
  { value: "Empresa", label: INCOME_TYPE_LABEL.Empresa },
  { value: "Particular", label: INCOME_TYPE_LABEL.Particular },
  { value: UNCLASSIFIED_PAYER_FILTER, label: "Sin clasificar" },
];

const PAYER_VALUES = new Set(PAYER_OPTIONS.map((option) => option.value));
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function Income() {
  const [params, setParams] = useSearchParams();
  const { data: visits = [], isLoading } = useVisits();
  const { data: centers = [] } = useCenters();

  const centerIndex = useMemo(() => buildCenterIndex(centers), [centers]);
  const entries = useMemo(
    () => buildLedgerEntries(visits as unknown as LedgerVisit[], centerIndex),
    [visits, centerIndex],
  );

  const requestedMonth = params.get("mes") ?? "";
  const requestedState = params.get("estado") ?? "";
  const requestedPayer = params.get("paga") ?? "";

  const requestedCenter = params.get("centro") ?? "";

  // Los filtros viven en la URL para poder enlazarlos; se saneen aquí una vez
  // para no volver a validarlos en cada `useMemo` que depende de ellos.
  const filters: LedgerFilters = useMemo(
    () => ({
      month: MONTH_PATTERN.test(requestedMonth) ? requestedMonth : ALL_FILTER,
      centerId: requestedCenter || ALL_FILTER,
      state: STATE_VALUES.has(requestedState as LedgerStateFilter)
        ? (requestedState as LedgerStateFilter)
        : ALL_FILTER,
      payer: PAYER_VALUES.has(requestedPayer as LedgerPayerFilter)
        ? (requestedPayer as LedgerPayerFilter)
        : ALL_FILTER,
    }),
    [requestedMonth, requestedCenter, requestedState, requestedPayer],
  );

  // El mes enlazado se ofrece aunque esté vacío: así el usuario ve
  // «sin movimientos en septiembre» en vez de un listado que no pidió.
  const months = useMemo(() => {
    const options = monthOptions(entries);
    if (filters.month !== ALL_FILTER && !options.some((option) => option.value === filters.month)) {
      options.unshift({ value: filters.month, label: monthLabel(filters.month) });
      options.sort((a, b) => b.value.localeCompare(a.value));
    }
    return options;
  }, [entries, filters.month]);

  const centerChoices = useMemo(() => centerOptions(entries), [entries]);
  const visible = useMemo(() => filterLedger(entries, filters), [entries, filters]);
  const totals = useMemo(() => ledgerTotals(visible), [visible]);
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const hasFilters =
    filters.month !== ALL_FILTER ||
    filters.centerId !== ALL_FILTER ||
    filters.state !== ALL_FILTER ||
    filters.payer !== ALL_FILTER;
  const activeStateLabel =
    filters.state === ALL_FILTER
      ? null
      : (STATE_OPTIONS.find((option) => option.value === filters.state)?.label ?? null);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL_FILTER) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" className="shrink-0">
          <Link to="/finanzas" aria-label="Volver a Finanzas">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">Detalle de ingresos</h1>
          <p className="text-xs text-muted-foreground">De dónde sale cada euro, visita a visita.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Cargando movimientos</span>
        </div>
      ) : (
        <>
          <Card className="shadow-card">
            <CardContent className="p-4">
              <fieldset>
                <legend className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Filtros
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="filtro-mes">Mes</Label>
                    <Select value={filters.month} onValueChange={(value) => setFilter("mes", value)}>
                      <SelectTrigger id="filtro-mes" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER}>Todos los meses</SelectItem>
                        {months.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="filtro-centro">Centro o domicilio</Label>
                    <Select value={filters.centerId} onValueChange={(value) => setFilter("centro", value)}>
                      <SelectTrigger id="filtro-centro" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER}>Todos los orígenes</SelectItem>
                        <SelectItem value={HOME_FILTER}>Solo domicilios</SelectItem>
                        {centerChoices.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="filtro-paga">Quién paga</Label>
                    <Select
                      value={filters.payer}
                      onValueChange={(value) => setFilter("paga", value as LedgerPayerFilter)}
                    >
                      <SelectTrigger id="filtro-paga" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="filtro-estado">Estado</Label>
                    <Select
                      value={filters.state}
                      onValueChange={(value) => setFilter("estado", value as LedgerStateFilter)}
                    >
                      <SelectTrigger id="filtro-estado" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 h-9 w-full text-xs text-muted-foreground sm:w-auto"
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                >
                  Quitar filtros
                </Button>
              )}
            </CardContent>
          </Card>

          <TotalsCard totals={totals} />

          {visible.length === 0 ? (
            <Card className="border-dashed shadow-card">
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ReceiptText className="h-5 w-5" aria-hidden="true" />
                </div>
                {/* Se nombran los filtros activos: si sólo se dijera «sin
                    movimientos en agosto» parecería que ese mes no tiene nada,
                    que es justo la confusión que esta pantalla viene a evitar. */}
                <p className="font-semibold">
                  {filters.month !== ALL_FILTER
                    ? `Sin movimientos en ${monthLabel(filters.month).toLowerCase()}`
                    : "Sin movimientos"}
                  {activeStateLabel ? ` con el filtro «${activeStateLabel.toLowerCase()}»` : ""}
                </p>
                {hasFilters && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => setParams(new URLSearchParams(), { replace: true })}
                  >
                    Ver todos los movimientos
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            groups.map((group) => (
              <section key={group.month} aria-labelledby={`mes-${group.month}`}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 id={`mes-${group.month}`} className="text-base font-semibold">
                    {group.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {group.totals.visits} visita{group.totals.visits === 1 ? "" : "s"} ·{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatEUR(group.totals.gross)}
                    </span>
                    {group.totals.unbilled > 0 && (
                      <span className="text-streak"> · {group.totals.unbilled} sin importe</span>
                    )}
                  </p>
                </div>
                <ul className="space-y-2">
                  {group.entries.map((entry) => (
                    <li key={entry.id}>
                      <EntryRow entry={entry} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

function TotalsCard({ totals }: { totals: LedgerTotals }) {
  const stats = [
    { label: "Bruto", value: formatEUR(totals.gross), tone: "text-foreground" },
    { label: "Cobrado", value: formatEUR(totals.settled), tone: "text-status-paid" },
    { label: "Pendiente", value: formatEUR(totals.pending), tone: "text-status-pending-payment" },
    { label: "Pacientes", value: String(totals.patients), tone: "text-foreground" },
  ];
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <p className="text-sm font-semibold">
          {totals.visits} visita{totals.visits === 1 ? "" : "s"}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {totals.centers} origen{totals.centers === 1 ? "" : "es"}
            {totals.unbilled > 0 ? ` · ${totals.unbilled} sin importe aún` : ""}
          </span>
        </p>
        {/* Sin esta nota, bruto ≠ cobrado + pendiente y no se entendería por qué. */}
        {(totals.cancelled > 0 || totals.waived > 0) && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            No suman:
            {totals.cancelled > 0
              ? ` ${totals.cancelled} visita${totals.cancelled === 1 ? "" : "s"} cancelada${totals.cancelled === 1 ? "" : "s"}`
              : ""}
            {totals.cancelled > 0 && totals.waived > 0 ? " ·" : ""}
            {totals.waived > 0 ? ` ${formatEUR(totals.waived)} marcados «no cobra»` : ""}
          </p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</dt>
              <dd className={`mt-0.5 text-lg font-bold tabular-nums ${stat.tone}`}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Fecha en bloque (día de la semana · día · mes), con reserva si la fecha es ilegible. */
function DateChip({ date, iso }: { date: Date; iso: string }) {
  const valid = !Number.isNaN(date.getTime());
  return (
    <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-muted px-1 py-1.5 leading-none text-muted-foreground">
      {valid ? (
        <>
          <span className="text-[10px] font-semibold uppercase">{WEEKDAYS[weekdayIndex(date)]}</span>
          <span className="my-0.5 text-base font-bold tabular-nums text-foreground">{date.getDate()}</span>
          <span className="text-[10px] font-semibold uppercase">{MONTHS_SHORT[date.getMonth()]}</span>
        </>
      ) : (
        <span className="text-[10px] font-semibold tabular-nums text-foreground">{iso}</span>
      )}
    </span>
  );
}

/**
 * Fila del libro de movimientos, desplegable.
 *
 * El resumen sigue siendo un enlace a la visita (tocar la fila navega, como
 * antes), y el detalle se abre con su propio botón: así se ve de dónde sale el
 * dinero sin salir de la pantalla, sin perder la navegación de un toque. Nada
 * de lo que ya se veía se ha escondido dentro del desplegable; sólo se añade.
 */
function EntryRow({ entry }: { entry: LedgerEntry }) {
  const [open, setOpen] = useState(false);
  const date = fromIsoDate(entry.date);
  const source = describePaymentSource(entry, formatEUR);
  const dateLabel = Number.isNaN(date.getTime()) ? entry.date : formatDate(date);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border bg-card shadow-card transition-smooth hover:shadow-elevated"
    >
      <div className="flex items-start gap-1.5 p-3">
        <Link
          to={`/visita/${entry.id}`}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]"
        >
          <DateChip date={date} iso={entry.date} />

          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <CenterLabel center={entry.center} showType className="min-w-0 flex-1 text-sm" />
              {/* Una visita cancelada se lista, pero su importe no cuenta: se marca
                  tachado para que no se confunda con dinero que entra. */}
              <VisitAmount
                gross={entry.gross}
                unbilled={entry.unbilled}
                pendingLabel="Pendiente de facturar"
                className={cn(
                  "shrink-0",
                  entry.unbilled ? "text-right text-[11px]" : "text-sm",
                  entry.cancelled && "font-normal text-muted-foreground line-through",
                )}
              />
            </span>

            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <StatusBadge status={entry.status as VisitStatus} className="text-[10px]" />
              {entry.patients > 0 ? (
                <span className="tabular-nums">
                  {entry.patients} pac.
                  {entry.pricePerPatient !== null && (
                    <>
                      {" × "}
                      {entry.priceIsAverage && <span aria-hidden="true">≈</span>}
                      <span className="sr-only">{entry.priceIsAverage ? "precio medio " : "precio "}</span>
                      {formatEUR(entry.pricePerPatient)}
                    </>
                  )}
                </span>
              ) : (
                entry.unbilled && <span>Nº de pacientes pendiente</span>
              )}
              {entry.pending > 0 && entry.settled > 0 && (
                <span className="text-status-pending-payment">Falta {formatEUR(entry.pending)}</span>
              )}
              {/* Quién paga: es lo que decide la retención y el Modelo 130. */}
              {entry.incomeType ? (
                <span>
                  Paga: {INCOME_TYPE_LABEL[entry.incomeType].toLowerCase()}
                  {entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ""}
                </span>
              ) : (
                !entry.cancelled && <span className="font-semibold text-streak">Falta decir quién paga</span>
              )}
            </span>

            {source && (
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Wallet className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  {source.exact ? source.text : `Cobro habitual: ${source.text}`}
                </span>
              </span>
            )}

            {entry.unbilled && entry.note && (
              <span className="mt-1 line-clamp-2 text-[11px] text-streak">{entry.note}</span>
            )}
          </span>
        </Link>

        {/* Botón propio para desplegar: 40 px de lado, separado del enlace para
            no anidar un botón dentro de un `<a>`. */}
        <CollapsibleTrigger className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")}
            aria-hidden="true"
          />
          <span className="sr-only">
            {open ? "Ocultar" : "Ver"} el detalle de {entry.center.name} del {dateLabel}
          </span>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <EntryDetail entry={entry} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Detalle desplegado de una visita: pacientes, cómo entró el dinero y las notas
 * completas. Sólo se monta al abrir (Radix desmonta el contenido cerrado), así
 * que un listado de cientos de movimientos no paga nada por tenerlo.
 */
function EntryDetail({ entry }: { entry: LedgerEntry }) {
  const amounts: { label: string; value: string; tone?: string }[] = [
    { label: "Bruto", value: formatEUR(entry.gross) },
    { label: "Cobrado", value: formatEUR(entry.settled), tone: "text-status-paid" },
  ];
  if (entry.pending > 0) {
    amounts.push({ label: "Pendiente", value: formatEUR(entry.pending), tone: "text-status-pending-payment" });
  }
  if (entry.waived > 0) amounts.push({ label: "No cobra", value: formatEUR(entry.waived) });

  const showLinePayments = entry.patientLines.length > 1;

  return (
    <div className="space-y-3 border-t border-border p-3">
      {entry.cancelled && (
        <p className="text-[11px] text-muted-foreground">
          Visita cancelada: se lista para tener el histórico completo, pero su importe no suma en ningún total.
        </p>
      )}

      {/* Sin este aviso, «Cobrado: 50 €» y una línea que dice «No cobra»
          aparecerían juntos sin explicación. No cambia ninguna cifra. */}
      {entry.waivedNotDiscounted > 0 && (
        <p className="rounded-lg bg-streak-bg p-2.5 text-[11px] text-foreground">
          <strong className="font-semibold">Revisa este cobro:</strong> hay {formatEUR(entry.waivedNotDiscounted)}{" "}
          marcados «no cobra», pero como la visita está en «{entry.status}» cuentan igualmente como cobrados. Si ese
          dinero no ha entrado, cambia el estado de la visita.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        {amounts.map((amount) => (
          <div key={amount.label}>
            <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{amount.label}</dt>
            <dd className={cn("mt-0.5 text-sm font-bold tabular-nums", amount.tone ?? "text-foreground")}>
              {amount.value}
            </dd>
          </div>
        ))}
      </dl>

      {entry.patientLines.length > 0 && (
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
            {entry.patientLines.length === 1 && entry.patientLines[0].aggregate ? "Cobro de la visita" : "Pacientes"}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {entry.patientLines.map((line) => (
              <PatientLineRow key={line.key} line={line} showPayments={showLinePayments} />
            ))}
          </ul>
        </div>
      )}

      {entry.payments.length > 0 && (
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3 w-3 shrink-0" aria-hidden="true" />
            Cómo se cobró
          </h3>
          <dl className="mt-1.5 space-y-1">
            {entry.payments.map((line) => (
              <div key={line.method} className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="min-w-0 truncate">{line.method}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">{formatEUR(line.amount)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Sin desglose guardado se dice de dónde sale la referencia, para no
          hacer pasar la forma de cobro habitual del centro por un hecho. */}
      {entry.payments.length === 0 && entry.fallbackMethod && (
        <p className="text-[11px] text-muted-foreground">
          No hay desglose guardado de este cobro. La forma de cobro habitual de {entry.center.name} es{" "}
          <span className="font-medium text-foreground">{entry.fallbackMethod}</span>.
        </p>
      )}

      {entry.note && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notas</h3>
          <p className="mt-1 whitespace-pre-line text-xs text-foreground">{entry.note}</p>
        </div>
      )}
    </div>
  );
}

function PatientLineRow({ line, showPayments }: { line: LedgerPatientLine; showPayments: boolean }) {
  return (
    <li className="text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className={cn("break-words", !line.attended && "text-muted-foreground line-through")}>{line.name}</span>
          {line.status && <span className="ml-1.5 text-[11px] text-muted-foreground">· {line.status}</span>}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{formatEUR(line.amount)}</span>
      </div>
      {showPayments && line.payments.length > 0 && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {line.payments.map((payment) => `${payment.method} ${formatEUR(payment.amount)}`).join(" · ")}
        </p>
      )}
    </li>
  );
}
