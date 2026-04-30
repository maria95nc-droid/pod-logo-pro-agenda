import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR, formatDateLong, capitalize } from "@/lib/format";
import { visits, centers, patients, materials } from "@/data/mock";
import { toast } from "sonner";
import {
  Clock, MapPin, Users, Plus, AlertTriangle, Package, ArrowRight, Euro,
  CheckCircle2, Wallet, Navigation, Phone, ChevronRight,
} from "lucide-react";

export default function Today() {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const todays = visits
    .filter((v) => v.visitDate === todayIso)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Próxima visita = la primera que no ha terminado aún
  const nextVisit =
    todays.find((v) => {
      const [h, m] = v.endTime.split(":").map(Number);
      return h * 60 + m >= currentMinutes;
    }) ?? todays[0];

  const grossToday = todays.reduce((s, v) => s + v.grossAmount, 0);
  const netToday = todays.reduce((s, v) => s + v.estimatedNetAmount, 0);
  const patientsToday = todays.reduce((s, v) => s + v.patientsCount, 0);

  const lowStock = materials.filter((m) => m.currentStock <= m.minimumStock);
  const pendingPayments = visits.filter((v) => v.status === "Pendiente de cobro");

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Encabezado minimal */}
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

      {/* TARJETA PRINCIPAL — Próxima visita */}
      {nextVisit ? <NextVisitCard visit={nextVisit} /> : <EmptyStateCard />}

      {/* Resumen económico del día */}
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

      {/* Siguientes visitas del día (si hay más de una) */}
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
              const c = centers.find((x) => x.id === v.centerId);
              return (
                <Link key={v.id} to={`/visita/${v.id}`}>
                  <Card className="shadow-card transition-smooth active:scale-[0.99] hover:shadow-elevated">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex flex-col items-center rounded-lg bg-muted px-2.5 py-1.5 text-center">
                        <span className="text-[10px] font-semibold text-muted-foreground">{v.startTime}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c?.name}</p>
                        <p className="text-xs text-muted-foreground">{v.patientsCount} pac. · {formatEUR(v.grossAmount)}</p>
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

      {/* Avisos secundarios */}
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
                    <p className="text-xs text-muted-foreground">Total: {formatEUR(pendingPayments.reduce((s, v) => s + v.grossAmount, 0))}</p>
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

/* ============================================================
   Próxima visita — tarjeta hero con toda la info crítica
   ============================================================ */
function NextVisitCard({ visit }: { visit: (typeof visits)[number] }) {
  const center = centers.find((c) => c.id === visit.centerId);
  const visitPatients = visit.patients
    .map((vp) => patients.find((p) => p.id === vp.patientId))
    .filter(Boolean) as typeof patients;

  const now = new Date();
  const [sh, sm] = visit.startTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const diff = startMin - nowMin;
  const relative =
    visit.visitDate === now.toISOString().slice(0, 10)
      ? diff > 60
        ? `En ${Math.floor(diff / 60)}h ${diff % 60}m`
        : diff > 0
        ? `En ${diff} min`
        : diff > -60
        ? "En curso"
        : null
      : null;

  const mapsUrl = center?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${center.address}, ${center.city ?? ""}`)}`
    : null;

  return (
    <Card className="overflow-hidden border-0 shadow-elevated">
      <div className="bg-gradient-primary p-5 text-primary-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90">Próxima visita</p>
            <h2 className="mt-1 truncate text-xl font-bold leading-tight">{center?.name}</h2>
            <p className="mt-0.5 text-xs opacity-90">{center?.type}</p>
          </div>
          {relative && (
            <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
              {relative}
            </span>
          )}
        </div>

        {/* Horario + dirección */}
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0 opacity-80" />
            <span className="font-semibold tabular-nums">{visit.startTime} – {visit.endTime}</span>
          </div>
          {center?.address && (
            <a
              href={mapsUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 group"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
              <span className="flex-1 underline-offset-2 group-hover:underline">
                {center.address}{center.city ? `, ${center.city}` : ""}
              </span>
              <Navigation className="h-3.5 w-3.5 opacity-80" />
            </a>
          )}
          {center?.contactPhone && (
            <a href={`tel:${center.contactPhone.replace(/\s/g, "")}`} className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 opacity-80" />
              <span className="underline-offset-2 hover:underline">{center.contactPhone}</span>
            </a>
          )}
        </div>
      </div>

      {/* Métricas — bruto, neto, pacientes */}
      <div className="grid grid-cols-3 divide-x divide-border bg-card">
        <div className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pacientes</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{visit.patientsCount}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bruto</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{formatEUR(visit.grossAmount)}</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Neto est.</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-primary">{formatEUR(visit.estimatedNetAmount)}</p>
        </div>
      </div>

      {/* Pacientes previstos */}
      {visitPatients.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3 w-3" /> Pacientes previstos
            </p>
          </div>
          <ul className="space-y-1.5">
            {visitPatients.map((p, i) => {
              const vp = visit.patients[i];
              return (
                <li key={p.id} className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">
                    {p.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                  {p.importantWarnings && (
                    <AlertTriangle className="h-3.5 w-3.5 text-status-warning" aria-label={p.importantWarnings} />
                  )}
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    {formatEUR(vp?.priceCharged ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Material necesario */}
      {visit.materialNotes && (
        <div className="border-t border-border bg-muted/40 px-4 py-3">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Package className="h-3 w-3" /> Material necesario
          </p>
          <p className="mt-1.5 text-sm leading-snug">{visit.materialNotes}</p>
        </div>
      )}

      {/* Acciones rápidas — accesibles al pulgar */}
      <div className="border-t border-border bg-card p-3">
        <div className="grid grid-cols-3 gap-2">
          <QuickAction
            icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
            label="Realizada"
            onClick={() => toast.success("Visita marcada como realizada")}
            variant="primary"
          />
          <QuickAction
            icon={<Wallet className="h-[18px] w-[18px]" />}
            label="Cobro"
            onClick={() => toast.success("Cobro registrado")}
          />
          <QuickAction
            as={Link}
            to="/pacientes/nuevo"
            icon={<Plus className="h-[18px] w-[18px]" />}
            label="Paciente"
          />
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-2 h-9 w-full text-xs text-muted-foreground">
          <Link to={`/visita/${visit.id}`}>
            Ver detalle completo <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/* ============================================================ */
function QuickAction({
  icon, label, onClick, variant, as, to,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant?: "primary";
  as?: typeof Link;
  to?: string;
}) {
  const base =
    "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-smooth active:scale-[0.97]";
  const style =
    variant === "primary"
      ? "bg-primary text-primary-foreground shadow-primary hover:bg-primary/95"
      : "bg-secondary text-secondary-foreground hover:bg-muted";

  if (as && to) {
    return (
      <Link to={to} className={`${base} ${style}`}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`${base} ${style}`}>
      {icon}
      {label}
    </button>
  );
}

function EmptyStateCard() {
  return (
    <Card className="border-dashed shadow-card">
      <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Clock className="h-5 w-5" />
        </div>
        <p className="font-semibold">Día libre</p>
        <p className="max-w-xs text-xs text-muted-foreground">No tienes visitas programadas. Puedes añadir una nueva cuando quieras.</p>
        <Button asChild size="sm" className="mt-2"><Link to="/visita/nueva"><Plus className="h-4 w-4" /> Nueva visita</Link></Button>
      </CardContent>
    </Card>
  );
}
