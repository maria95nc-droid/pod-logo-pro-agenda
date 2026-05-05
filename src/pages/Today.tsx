import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDateLong, capitalize } from "@/lib/format";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useVisits, useCenters, usePatients, useMaterials, useInvalidateAll } from "@/hooks/useData";
import {
  Clock, MapPin, Users, Plus, AlertTriangle, Package, ArrowRight,
  CheckCircle2, Wallet, Navigation, Phone, ChevronRight, Loader2,
} from "lucide-react";

export default function Today() {
  const { data: visits = [], isLoading } = useVisits();
  const { data: centers = [] } = useCenters();
  const { data: patients = [] } = usePatients();
  const { data: materials = [] } = useMaterials();
  const invalidate = useInvalidateAll();

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const todays = visits
    .filter((v) => v.visit_date === todayIso)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  const nextVisit =
    todays.find((v) => {
      if (!v.end_time) return true;
      const [h, m] = v.end_time.split(":").map(Number);
      return h * 60 + m >= currentMinutes;
    }) ?? todays[0];

  const grossToday = todays.reduce((s, v) => s + Number(v.gross_amount), 0);
  const netToday = todays.reduce((s, v) => s + Number(v.estimated_net_amount), 0);
  const patientsToday = todays.reduce((s, v) => s + (v.patients_count ?? 0), 0);

  const lowStock = materials.filter((m) => Number(m.current_stock) <= Number(m.minimum_stock));
  const pendingPayments = visits.filter((v) => v.status === "Pendiente de cobro");

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          {capitalize(formatDateLong(now))}
        </p>
        <h1 className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight">Hoy</h1>
        <p className="text-sm text-muted-foreground">
          {todays.length === 0
            ? "Sin visitas programadas."
            : `${todays.length} visita${todays.length > 1 ? "s" : ""} · ${patientsToday} pacientes`}
        </p>
      </header>

      {nextVisit ? (
        <NextVisitCard
          visit={nextVisit}
          center={centers.find((c) => c.id === nextVisit.center_id)}
          patients={patients}
          onAfterAction={invalidate}
        />
      ) : (
        <EmptyStateCard />
      )}

      {todays.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="shadow-card">
            <CardContent className="p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Bruto hoy</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{formatEUR(grossToday)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-card border-primary/15 bg-primary-soft">
            <CardContent className="p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-primary/80">Neto est.</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-primary">{formatEUR(netToday)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {todays.length > 1 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Después</h2>
            <Link to="/agenda" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
              Agenda completa <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {todays.filter((v) => v.id !== nextVisit?.id).map((v) => {
              const c = centers.find((x) => x.id === v.center_id);
              return (
                <Link key={v.id} to={`/visita/${v.id}`}>
                  <Card className="shadow-card transition-smooth active:scale-[0.99] hover:shadow-elevated">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex flex-col items-center rounded-lg bg-muted px-2.5 py-1.5 text-center">
                        <span className="text-[10px] font-semibold text-muted-foreground">{v.start_time}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c?.name}</p>
                        <p className="text-xs text-muted-foreground">{v.patients_count} pac. · {formatEUR(Number(v.gross_amount))}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {(lowStock.length > 0 || pendingPayments.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Avisos</h2>
          {pendingPayments.length > 0 && (
            <Link to="/finanzas">
              <Card className="border-status-pending-payment/25 bg-status-pending-payment-bg transition-smooth active:scale-[0.99]">
                <CardContent className="flex items-center gap-3 p-3.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-pending-payment/15 text-status-pending-payment">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-foreground">
                      {pendingPayments.length} visita{pendingPayments.length > 1 ? "s" : ""} pendiente{pendingPayments.length > 1 ? "s" : ""} de cobro
                    </p>
                    <p className="text-xs text-muted-foreground">Total: {formatEUR(pendingPayments.reduce((s, v) => s + Number(v.gross_amount), 0))}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
          {lowStock.length > 0 && (
            <Link to="/material">
              <Card className="border-destructive/20 bg-status-cancelled-bg transition-smooth active:scale-[0.99]">
                <CardContent className="flex items-center gap-3 p-3.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-foreground">{lowStock.length} material{lowStock.length > 1 ? "es" : ""} con stock bajo</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lowStock.map((m) => m.name).slice(0, 2).join(", ")}{lowStock.length > 2 ? "…" : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function NextVisitCard({ visit, center, patients, onAfterAction }: any) {
  const visitPatients: any[] = (visit.visit_patients ?? [])
    .map((vp: any) => ({
      vp,
      p: patients.find((x: any) => x.id === vp.patient_id),
    }));

  const now = new Date();
  const [sh, sm] = (visit.start_time ?? "00:00").split(":").map(Number);
  const startMin = sh * 60 + sm;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diff = startMin - nowMin;
  const relative =
    visit.visit_date === now.toISOString().slice(0, 10)
      ? diff > 60 ? `En ${Math.floor(diff / 60)}h ${diff % 60}m`
      : diff > 0 ? `En ${diff} min`
      : diff > -60 ? "En curso"
      : null
      : null;

  const mapsUrl = center?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${center.address}, ${center.city ?? ""}`)}`
    : null;

  const markDone = async () => {
    const { error } = await supabase.from("visits").update({ status: "Realizada" }).eq("id", visit.id);
    if (error) return toast.error(error.message);
    toast.success("Visita marcada como realizada");
    onAfterAction();
  };
  const markPaid = async () => {
    const { error } = await supabase.from("visits").update({ status: "Cobrada" }).eq("id", visit.id);
    if (error) return toast.error(error.message);
    await supabase.from("visit_patients").update({ payment_status: "Cobrado" }).eq("visit_id", visit.id);
    toast.success("Cobro registrado");
    onAfterAction();
  };

  return (
    <Card className="overflow-hidden border-0 shadow-elevated">
      <div className="bg-gradient-primary p-5 text-primary-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90">Próxima visita</p>
            <h2 className="mt-1 truncate text-xl font-bold leading-tight">{center?.name ?? "Sin centro"}</h2>
            <p className="mt-0.5 text-xs opacity-90">{center?.type}</p>
          </div>
          {relative && (
            <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">{relative}</span>
          )}
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0 opacity-80" />
            <span className="font-semibold tabular-nums">{visit.start_time} – {visit.end_time}</span>
          </div>
          {center?.address && (
            <a href={mapsUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 group">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
              <span className="flex-1 underline-offset-2 group-hover:underline">{center.address}{center.city ? `, ${center.city}` : ""}</span>
              <Navigation className="h-3.5 w-3.5 opacity-80" />
            </a>
          )}
          {center?.contact_phone && (
            <a href={`tel:${center.contact_phone.replace(/\s/g, "")}`} className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 opacity-80" />
              <span className="underline-offset-2 hover:underline">{center.contact_phone}</span>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border bg-card">
        <div className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pacientes</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{visit.patients_count}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bruto</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{formatEUR(Number(visit.gross_amount))}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Neto est.</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-primary">{formatEUR(Number(visit.estimated_net_amount))}</p>
        </div>
      </div>

      {visitPatients.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3 w-3" /> Pacientes previstos
          </p>
          <ul className="space-y-1.5">
            {visitPatients.map(({ vp, p }) => {
              const name = p?.full_name ?? vp.patient_name ?? "Paciente";
              return (
                <li key={vp.id} className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">
                    {name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {p?.important_warnings && <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />}
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    {formatEUR(Number(vp.price_charged ?? 0))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="border-t border-border bg-card p-3">
        <div className="grid grid-cols-3 gap-2">
          <QuickAction icon={<CheckCircle2 className="h-[18px] w-[18px]" />} label="Realizada" onClick={markDone} variant="primary" />
          <QuickAction icon={<Wallet className="h-[18px] w-[18px]" />} label="Cobro" onClick={markPaid} />
          <QuickAction as={Link} to="/pacientes/nuevo" icon={<Plus className="h-[18px] w-[18px]" />} label="Paciente" />
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-2 h-9 w-full text-xs text-muted-foreground">
          <Link to={`/visita/${visit.id}`}>Ver detalle completo <ArrowRight className="h-3 w-3" /></Link>
        </Button>
      </div>
    </Card>
  );
}

function QuickAction({ icon, label, onClick, variant, as, to }: any) {
  const base = "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-smooth active:scale-[0.97]";
  const style = variant === "primary"
    ? "bg-primary text-primary-foreground shadow-primary hover:bg-primary/95"
    : "bg-secondary text-secondary-foreground hover:bg-muted";
  if (as && to) {
    return <Link to={to} className={`${base} ${style}`}>{icon}{label}</Link>;
  }
  return <button onClick={onClick} className={`${base} ${style}`}>{icon}{label}</button>;
}

function EmptyStateCard() {
  return (
    <Card className="border-dashed shadow-card">
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Clock className="h-5 w-5" />
        </div>
        <p className="font-semibold">Día libre</p>
        <p className="max-w-xs text-xs text-muted-foreground">No tienes visitas programadas. Puedes añadir una nueva o dictarla por voz.</p>
        <Button asChild size="sm" className="mt-2"><Link to="/visita/nueva"><Plus className="h-4 w-4" /> Nueva visita</Link></Button>
      </CardContent>
    </Card>
  );
}
