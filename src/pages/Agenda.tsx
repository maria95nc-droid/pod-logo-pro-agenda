import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { StreakBadge } from "@/components/StreakBadge";
import { formatEUR, toIsoDate } from "@/lib/format";
import { useVisits, useCenters } from "@/hooks/useData";
import { calculateStreak, isCompletedVisit } from "@/lib/streak";
import { ChevronLeft, ChevronRight, Plus, Clock, Users } from "lucide-react";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const iso = (d: Date) => toIsoDate(d);
const startOfWeek = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export default function Agenda() {
  const [cursor, setCursor] = useState(new Date());
  const [tab, setTab] = useState("dia");
  const { data: visits = [] } = useVisits();
  const { data: centers = [] } = useCenters();

  const dayVisits = useMemo(
    () => visits.filter((v) => v.visit_date === iso(cursor)).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "")),
    [cursor, visits]
  );

  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const shift = (days: number) => setCursor((c) => addDays(c, days));
  const shiftMonth = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  const streak = useMemo(() => calculateStreak(visits), [visits]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-2xl font-bold">Agenda</h1>
          <StreakBadge days={streak.days} countsToday={streak.countsToday} compact />
        </div>
        <Button asChild size="sm"><Link to="/visita/nueva"><Plus className="h-4 w-4" /> Nueva</Link></Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dia">Día</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="mes">Mes</TabsTrigger>
          <TabsTrigger value="anual">Año</TabsTrigger>
        </TabsList>

        <TabsContent value="dia" className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-card p-2 shadow-card">
            <Button size="icon" variant="ghost" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <p className="text-sm font-semibold capitalize">
              {cursor.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <Button size="icon" variant="ghost" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {dayVisits.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Sin visitas este día.</CardContent></Card>}
          {dayVisits.map((v) => {
            const c = centers.find((x) => x.id === v.center_id);
            return (
              <Link key={v.id} to={`/visita/${v.id}`}>
                <Card className="shadow-card transition-smooth hover:shadow-elevated">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex flex-col items-center rounded-lg bg-primary-soft px-3 py-2 text-primary">
                      <span className="text-[10px] font-medium uppercase">{v.start_time}</span>
                      <span className="text-[10px]">{v.end_time}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c?.name ?? "Sin centro"}</p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{v.patients_count}</span>
                        <span>{formatEUR(Number(v.gross_amount))}</span>
                      </div>
                    </div>
                    <StatusBadge status={v.status as any} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </TabsContent>

        <TabsContent value="semana" className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-card p-2 shadow-card">
            <Button size="icon" variant="ghost" onClick={() => shift(-7)}><ChevronLeft className="h-4 w-4" /></Button>
            <p className="text-sm font-semibold">
              {weekStart.getDate()} {MONTHS[weekStart.getMonth()].slice(0,3)} — {addDays(weekStart,6).getDate()} {MONTHS[addDays(weekStart,6).getMonth()].slice(0,3)}
            </p>
            <Button size="icon" variant="ghost" onClick={() => shift(7)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2">
            {weekDays.map((d) => {
              const list = visits.filter((v) => v.visit_date === iso(d));
              const gross = list.reduce((s, v) => s + Number(v.gross_amount), 0);
              return (
                <Card key={iso(d)} className="shadow-card">
                  <CardContent className="p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">{WEEKDAYS[(d.getDay()+6)%7]}</p>
                        <p className="text-sm font-semibold">{d.getDate()} {MONTHS[d.getMonth()].slice(0,3)}</p>
                      </div>
                      {list.length > 0 && <span className="text-xs font-semibold text-primary">{formatEUR(gross)}</span>}
                    </div>
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin visitas</p>
                    ) : (
                      <div className="space-y-1">
                        {list.map((v) => {
                          const c = centers.find((x) => x.id === v.center_id);
                          return (
                            <Link key={v.id} to={`/visita/${v.id}`} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs transition-smooth hover:bg-muted">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{v.start_time}</span>
                              <span className="truncate flex-1">{c?.name}</span>
                              <StatusBadge status={v.status as any} className="text-[10px]" />
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="mes" className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-card p-2 shadow-card">
            <Button size="icon" variant="ghost" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <p className="text-sm font-semibold capitalize">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</p>
            <Button size="icon" variant="ghost" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Card className="shadow-card">
            <CardContent className="p-3">
              <div className="mb-2 grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((w) => <div key={w} className="text-[10px] font-semibold text-muted-foreground">{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((d) => {
                  const list = visits.filter((v) => v.visit_date === iso(d));
                  const isCurrent = d.getMonth() === cursor.getMonth();
                  const isToday = iso(d) === iso(new Date());
                  return (
                    <button
                      key={iso(d)}
                      type="button"
                      onClick={() => { setCursor(d); setTab("dia"); }}
                      aria-label={`${d.getDate()} de ${MONTHS[d.getMonth()]}: ${list.length === 0 ? "sin visitas" : `${list.length} visita${list.length > 1 ? "s" : ""}`}`}
                      className={`relative aspect-square rounded-md p-1 text-xs transition-smooth hover:bg-muted ${isCurrent ? "text-foreground" : "text-muted-foreground/40"} ${isToday ? "bg-primary-soft font-bold text-primary" : ""}`}
                    >
                      <span aria-hidden="true" className="absolute left-1 top-1">{d.getDate()}</span>
                      {list.length > 0 && (
                        <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                          {list.slice(0, 3).map((v) => (
                            <span
                              key={v.id}
                              className={`h-1 w-1 rounded-full ${isCompletedVisit(v) ? "bg-streak" : "bg-primary"}`}
                            />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anual" className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-card p-2 shadow-card">
            <Button size="icon" variant="ghost" onClick={() => setCursor(new Date(cursor.getFullYear() - 1, 0, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <p className="text-sm font-semibold">{cursor.getFullYear()}</p>
            <Button size="icon" variant="ghost" onClick={() => setCursor(new Date(cursor.getFullYear() + 1, 0, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MONTHS.map((m, i) => {
              const list = visits.filter((v) => {
                const d = new Date(v.visit_date);
                return d.getFullYear() === cursor.getFullYear() && d.getMonth() === i;
              });
              const gross = list.reduce((s, v) => s + Number(v.gross_amount), 0);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setCursor(new Date(cursor.getFullYear(), i, 1)); setTab("mes"); }}
                  className="rounded-xl border border-border bg-card p-3 text-left shadow-card transition-smooth hover:shadow-elevated hover:-translate-y-0.5"
                >
                  <p className="text-sm font-semibold">{m}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{list.length} visita{list.length !== 1 ? "s" : ""}</p>
                  <p className="mt-0.5 text-xs font-semibold text-primary">{formatEUR(gross)}</p>
                </button>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
