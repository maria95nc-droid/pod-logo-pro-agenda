import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { StreakBadge } from "@/components/StreakBadge";
import { CenterLabel } from "@/components/CenterLabel";
import { VisitAmount } from "@/components/VisitAmount";
import { PeriodNav } from "@/components/agenda/PeriodNav";
import { MonthHeatmap } from "@/components/agenda/MonthHeatmap";
import { DayTimeline } from "@/components/agenda/DayTimeline";
import { ActivityBar } from "@/components/agenda/ActivityBar";
import { formatDate, formatEUR, formatTime, fromIsoDate, toIsoDate } from "@/lib/format";
import { useVisits, useCenters } from "@/hooks/useData";
import { calculateStreak } from "@/lib/streak";
import { buildCenterIndex, centerInfo } from "@/lib/centers";
import {
  MONTHS,
  MONTHS_SHORT,
  WEEKDAYS,
  addDays,
  isoKeys,
  monthGrid,
  monthLabel,
  startOfWeek,
  weekdayIndex,
} from "@/lib/calendar";
import {
  CANCELLED_STATUS,
  EMPTY_DAY_STATS,
  EMPTY_PERIOD_STATS,
  buildDayStats,
  buildMonthStats,
  buildVisitsByDay,
  isUnbilledDay,
  maxGross,
  nearestActiveKey,
  sumDays,
  type AgendaVisit,
  type PeriodStats,
} from "@/lib/agendaStats";
import { cn } from "@/lib/utils";
import { Plus, Clock, Users, Trophy, Loader2, CalendarCheck, CalendarSearch, ReceiptText } from "lucide-react";
import type { VisitStatus } from "@/types";

/** Resumen textual de un periodo, en una línea y sin abreviar los importes. */
function summarize(stats: PeriodStats): string {
  if (stats.visits === 0) return "Sin visitas";
  const parts = [
    `${stats.visits} visita${stats.visits > 1 ? "s" : ""}`,
    `${stats.patients} pac.`,
  ];
  // Sólo se habla de «sin importe» si hay trabajo real sin facturar: un periodo
  // en el que todo se canceló no está pendiente de cobro.
  if (stats.gross > 0) parts.push(formatEUR(stats.gross));
  else if (stats.visits > stats.cancelled) parts.push("sin importe aún");
  return parts.join(" · ");
}

export default function Agenda() {
  const [cursor, setCursor] = useState(() => new Date());
  const [tab, setTab] = useState("dia");
  const { data: visits = [], isLoading } = useVisits();
  const { data: centers = [] } = useCenters();

  const now = new Date();
  const todayIso = toIsoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Una sola pasada sobre `visits`; las vistas consultan por clave `yyyy-mm-dd`.
  const dayStats = useMemo(() => buildDayStats(visits as AgendaVisit[]), [visits]);
  const visitsByDay = useMemo(() => buildVisitsByDay(visits as AgendaVisit[]), [visits]);
  const monthStats = useMemo(() => buildMonthStats(dayStats), [dayStats]);
  const centerIndex = useMemo(() => buildCenterIndex(centers), [centers]);
  const streak = useMemo(() => calculateStreak(visits), [visits]);

  const cursorIso = toIsoDate(cursor);

  // ── Día ────────────────────────────────────────────────────────────────────
  const dayVisits = visitsByDay.get(cursorIso) ?? [];
  const dayTotals = sumDays(dayStats, [cursorIso]);

  // ── Semana ─────────────────────────────────────────────────────────────────
  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekKeys = useMemo(() => isoKeys(weekDays), [weekDays]);
  const weekTotals = useMemo(() => sumDays(dayStats, weekKeys), [dayStats, weekKeys]);
  const weekMax = useMemo(() => maxGross(dayStats, weekKeys), [dayStats, weekKeys]);
  const weekEnd = weekDays[6];

  // ── Mes ────────────────────────────────────────────────────────────────────
  const monthYear = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const monthDays = useMemo(() => monthGrid(monthYear, monthIndex), [monthYear, monthIndex]);
  const monthOwnKeys = useMemo(
    () => isoKeys(monthDays.filter((d) => d.getMonth() === monthIndex)),
    [monthDays, monthIndex],
  );
  const monthTotals = useMemo(() => sumDays(dayStats, monthOwnKeys), [dayStats, monthOwnKeys]);
  const monthMax = useMemo(() => maxGross(dayStats, monthOwnKeys), [dayStats, monthOwnKeys]);
  const visibleMonthKey = `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}`;

  // ── Atajos a periodos con actividad ────────────────────────────────────────
  // La agenda abre siempre en el día de hoy: en un mes sin visitas la pantalla
  // se quedaba en blanco y había que adivinar cuántas veces pulsar la flecha
  // para llegar al último mes trabajado.
  const suggestedMonth = useMemo(
    () => (monthTotals.visits === 0 ? nearestActiveKey(monthStats, visibleMonthKey) : null),
    [monthStats, monthTotals.visits, visibleMonthKey],
  );
  const suggestedDay = useMemo(
    () => (dayVisits.length === 0 ? nearestActiveKey(dayStats, cursorIso) : null),
    [dayStats, dayVisits.length, cursorIso],
  );

  // ── Año ────────────────────────────────────────────────────────────────────
  const year = cursor.getFullYear();
  const yearMonths = useMemo(
    () =>
      MONTHS.map((name, index) => ({
        name,
        index,
        stats: monthStats.get(`${year}-${String(index + 1).padStart(2, "0")}`) ?? EMPTY_PERIOD_STATS,
      })),
    [monthStats, year],
  );
  const yearMax = useMemo(() => yearMonths.reduce((max, m) => Math.max(max, m.stats.gross), 0), [yearMonths]);
  const yearTotals = useMemo(
    () =>
      yearMonths.reduce<PeriodStats>(
        (acc, m) => ({
          visits: acc.visits + m.stats.visits,
          gross: acc.gross + m.stats.gross,
          patients: acc.patients + m.stats.patients,
          completed: acc.completed + m.stats.completed,
          cancelled: acc.cancelled + m.stats.cancelled,
          days: acc.days + m.stats.days,
        }),
        { ...EMPTY_PERIOD_STATS },
      ),
    [yearMonths],
  );

  const shift = (days: number) => setCursor((c) => addDays(c, days));
  const shiftMonth = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const shiftYear = (n: number) => setCursor((c) => new Date(c.getFullYear() + n, 0, 1));
  const goToDay = (day: Date) => {
    setCursor(day);
    setTab("dia");
  };
  const goToIsoDay = (iso: string) => goToDay(fromIsoDate(iso));
  const goToMonthKey = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    setCursor(new Date(y, m - 1, 1));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Cargando agenda</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-2xl font-bold">Agenda</h1>
          <StreakBadge days={streak.days} countsToday={streak.countsToday} compact />
        </div>
        <div className="flex items-center gap-2">
          {cursorIso !== todayIso && (
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
              <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Hoy
            </Button>
          )}
          <Button asChild size="sm">
            <Link to="/visita/nueva">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nueva
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dia">Día</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="mes">Mes</TabsTrigger>
          <TabsTrigger value="anual">Año</TabsTrigger>
        </TabsList>

        {/* ── Día: línea de tiempo ───────────────────────────────────────── */}
        <TabsContent value="dia" className="space-y-3">
          <PeriodNav
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            prevLabel="Día anterior"
            nextLabel="Día siguiente"
            title={
              <>
                <span className="sm:hidden">
                  {cursor.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className="hidden sm:inline">
                  {cursor.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
              </>
            }
            subtitle={summarize(dayTotals)}
          />

          {dayVisits.length === 0 ? (
            <EmptyDay
              suggestion={suggestedDay}
              onGoToSuggestion={suggestedDay ? () => goToIsoDay(suggestedDay) : undefined}
            />
          ) : (
            <DayTimeline
              visits={dayVisits}
              centers={centerIndex}
              nowMinutes={cursorIso === todayIso ? nowMinutes : null}
            />
          )}
        </TabsContent>

        {/* ── Semana: comparativa por día ────────────────────────────────── */}
        <TabsContent value="semana" className="space-y-3">
          <PeriodNav
            onPrev={() => shift(-7)}
            onNext={() => shift(7)}
            prevLabel="Semana anterior"
            nextLabel="Semana siguiente"
            title={`${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]} — ${weekEnd.getDate()} ${MONTHS_SHORT[weekEnd.getMonth()]}`}
            subtitle={summarize(weekTotals)}
          />

          <ul className="space-y-2">
            {weekDays.map((day) => {
              const key = toIsoDate(day);
              const stats = dayStats.get(key) ?? EMPTY_DAY_STATS;
              const list = visitsByDay.get(key) ?? [];
              const unbilled = isUnbilledDay(stats);
              const isToday = key === todayIso;
              const isBest = weekMax > 0 && stats.gross === weekMax;

              return (
                <li key={key}>
                  <Card className={cn("shadow-card", isToday && "border-primary/40 ring-1 ring-primary/30")}>
                    <CardContent className="p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="flex items-baseline gap-1.5 text-sm font-semibold">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {WEEKDAYS[weekdayIndex(day)]}
                          </span>
                          <span className="tabular-nums">
                            {day.getDate()} {MONTHS_SHORT[day.getMonth()]}
                          </span>
                          {isToday && (
                            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              Hoy
                            </span>
                          )}
                        </h2>
                        <p className="flex shrink-0 items-center gap-1.5">
                          {isBest && (
                            <>
                              <Trophy className="h-3.5 w-3.5 text-streak" aria-hidden="true" />
                              <span className="sr-only">Mejor día de la semana.</span>
                            </>
                          )}
                          {stats.visits === 0 ? (
                            <span className="text-xs text-muted-foreground">Sin visitas</span>
                          ) : unbilled ? (
                            <span className="text-xs font-semibold text-streak">Sin importe aún</span>
                          ) : (
                            <span
                              className={cn(
                                "text-sm font-bold tabular-nums",
                                stats.gross > 0 ? "text-primary" : "text-muted-foreground",
                              )}
                            >
                              {formatEUR(stats.gross)}
                            </span>
                          )}
                        </p>
                      </div>

                      {stats.visits > 0 && (
                        <>
                          <ActivityBar value={stats.gross} max={weekMax} unbilled={unbilled} className="mt-2" />
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            {stats.visits} visita{stats.visits > 1 ? "s" : ""} · {stats.patients} pacientes
                          </p>
                          {/* Cada visita muestra su origen y su importe: la cifra
                              del día deja de ser un número sin explicación. */}
                          <ul className="mt-2 space-y-1">
                            {list.map((visit) => {
                              const gross = Number(visit.gross_amount) || 0;
                              const visitCancelled = visit.status === CANCELLED_STATUS;
                              const patients = Number(visit.patients_count) || 0;
                              return (
                                <li key={visit.id}>
                                  <Link
                                    to={`/visita/${visit.id}`}
                                    className="block rounded-md bg-muted/50 px-2 py-1.5 text-xs transition-smooth hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <span className="flex items-center gap-2">
                                      <Clock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                      <span className="font-medium tabular-nums">
                                        {visit.start_time ? formatTime(visit.start_time) : "--:--"}
                                      </span>
                                      <CenterLabel
                                        center={centerInfo(centerIndex, visit.center_id)}
                                        className="min-w-0 flex-1"
                                      />
                                    </span>
                                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5">
                                      <StatusBadge
                                        status={visit.status as VisitStatus}
                                        className="shrink-0 text-[10px]"
                                      />
                                      {patients > 0 && (
                                        <span className="tabular-nums text-muted-foreground">{patients} pac.</span>
                                      )}
                                      <VisitAmount
                                        gross={gross}
                                        unbilled={!visitCancelled && gross <= 0}
                                        className="text-xs"
                                      />
                                    </span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </TabsContent>

        {/* ── Mes: mapa de calor de ingresos ─────────────────────────────── */}
        <TabsContent value="mes" className="space-y-3">
          <PeriodNav
            onPrev={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
            prevLabel="Mes anterior"
            nextLabel="Mes siguiente"
            title={`${MONTHS[monthIndex]} ${monthYear}`}
            subtitle={
              monthTotals.visits === 0
                ? "Sin visitas"
                : `${monthTotals.days} día${monthTotals.days > 1 ? "s" : ""} · ${summarize(monthTotals)}`
            }
          />
          {suggestedMonth && (
            <Card className="border-dashed border-streak/50 bg-streak-bg shadow-card">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <p className="text-xs text-foreground">
                  No hay visitas en {MONTHS[monthIndex].toLowerCase()} de {monthYear}.
                </p>
                <Button size="sm" variant="outline" className="bg-card" onClick={() => goToMonthKey(suggestedMonth)}>
                  <CalendarSearch className="h-4 w-4" aria-hidden="true" />
                  Ir a {monthLabel(suggestedMonth).toLowerCase()}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardContent className="p-3">
              <MonthHeatmap
                days={monthDays}
                month={monthIndex}
                dayStats={dayStats}
                visitsByDay={visitsByDay}
                centers={centerIndex}
                maxGross={monthMax}
                todayIso={todayIso}
                onSelectDay={goToDay}
              />
            </CardContent>
          </Card>

          <Button asChild variant="outline" className="h-11 w-full">
            <Link to={`/finanzas/movimientos?mes=${visibleMonthKey}`}>
              <ReceiptText className="h-4 w-4" aria-hidden="true" />
              Ver de dónde sale cada importe
            </Link>
          </Button>
        </TabsContent>

        {/* ── Año: comparativa por mes ───────────────────────────────────── */}
        <TabsContent value="anual" className="space-y-3">
          <PeriodNav
            onPrev={() => shiftYear(-1)}
            onNext={() => shiftYear(1)}
            prevLabel="Año anterior"
            nextLabel="Año siguiente"
            title={String(year)}
            subtitle={summarize(yearTotals)}
          />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {yearMonths.map(({ name, index, stats }) => {
              const unbilled = isUnbilledDay(stats);
              const isBest = yearMax > 0 && stats.gross === yearMax;
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => {
                      setCursor(new Date(year, index, 1));
                      setTab("mes");
                    }}
                    aria-label={`${name} de ${year}: ${summarize(stats)}${isBest ? ". Mejor mes del año." : ""}`}
                    className="flex h-full w-full flex-col rounded-xl border border-border bg-card p-3 text-left shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-0"
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold">{name}</span>
                      {isBest && <Trophy className="h-3.5 w-3.5 shrink-0 text-streak" aria-hidden="true" />}
                    </span>
                    {stats.visits === 0 ? (
                      <span aria-hidden="true" className="mt-0.5 text-xs text-muted-foreground">
                        Sin actividad
                      </span>
                    ) : (
                      <>
                        <span aria-hidden="true" className="mt-0.5 text-xs text-muted-foreground">
                          {stats.visits} visita{stats.visits !== 1 ? "s" : ""}
                        </span>
                        <ActivityBar value={stats.gross} max={yearMax} unbilled={unbilled} className="mt-3" />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1.5 text-xs font-semibold tabular-nums",
                            unbilled ? "text-streak" : "text-primary",
                          )}
                        >
                          {unbilled ? "Sin importe aún" : formatEUR(stats.gross)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyDay({
  suggestion,
  onGoToSuggestion,
}: {
  /** Día con visitas más cercano, `yyyy-mm-dd`. */
  suggestion: string | null;
  onGoToSuggestion?: () => void;
}) {
  return (
    <Card className="border-dashed shadow-card">
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Users className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="font-semibold">Sin visitas este día</p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          {suggestion && onGoToSuggestion && (
            <Button size="sm" variant="outline" onClick={onGoToSuggestion}>
              <CalendarSearch className="h-4 w-4" aria-hidden="true" />
              Ir al {formatDate(fromIsoDate(suggestion))}
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/visita/nueva">
              <Plus className="h-4 w-4" aria-hidden="true" /> Añadir visita
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
