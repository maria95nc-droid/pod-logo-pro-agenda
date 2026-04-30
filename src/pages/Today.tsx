import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR, formatDateLong, capitalize } from "@/lib/format";
import { visits, centers, materials } from "@/data/mock";
import { Clock, MapPin, Users, Plus, AlertTriangle, Package, ArrowRight, Euro } from "lucide-react";

export default function Today() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const todays = visits.filter((v) => v.visitDate === todayIso).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const grossToday = todays.reduce((s, v) => s + v.grossAmount, 0);
  const netToday = todays.reduce((s, v) => s + v.estimatedNetAmount, 0);
  const patientsToday = todays.reduce((s, v) => s + v.patientsCount, 0);
  const lowStock = materials.filter((m) => m.currentStock <= m.minimumStock);
  const pendingPayments = visits.filter((v) => v.status === "Pendiente de cobro");

  return (
    <div className="space-y-5">
      {/* Saludo */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          {capitalize(formatDateLong(new Date()))}
        </p>
        <h1 className="mt-1 text-2xl font-bold">Buenos días 👋</h1>
        <p className="text-sm text-muted-foreground">
          {todays.length > 0 ? `Hoy tienes ${todays.length} visita${todays.length > 1 ? "s" : ""}.` : "Sin visitas hoy."}
        </p>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Pacientes</p>
            <p className="mt-1 text-xl font-bold">{patientsToday}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Bruto</p>
            <p className="mt-1 text-xl font-bold">{formatEUR(grossToday)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card bg-primary-soft border-primary/20">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-primary">Neto est.</p>
            <p className="mt-1 text-xl font-bold text-primary">{formatEUR(netToday)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-2 gap-2.5">
        <Button asChild size="lg" className="h-12 shadow-primary">
          <Link to="/visita/nueva">
            <Plus className="h-4 w-4" /> Añadir visita
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12">
          <Link to="/pacientes/nuevo">
            <Users className="h-4 w-4" /> Añadir paciente
          </Link>
        </Button>
      </div>

      {/* Visitas de hoy */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Visitas de hoy</h2>
          <Link to="/agenda" className="text-xs font-medium text-primary inline-flex items-center gap-1">
            Ver agenda <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="space-y-2.5">
          {todays.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No hay visitas programadas hoy.
              </CardContent>
            </Card>
          )}
          {todays.map((v) => {
            const center = centers.find((c) => c.id === v.centerId);
            return (
              <Link key={v.id} to={`/visita/${v.id}`}>
                <Card className="shadow-card transition-smooth hover:shadow-elevated hover:-translate-y-0.5">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="font-medium text-foreground">{v.startTime}–{v.endTime}</span>
                        </div>
                        <h3 className="mt-1 truncate font-semibold">{center?.name}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{center?.city ?? "—"}</span>
                          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{v.patientsCount} pac.</span>
                          <span className="inline-flex items-center gap-1"><Euro className="h-3 w-3" />{formatEUR(v.grossAmount)}</span>
                        </div>
                      </div>
                      <StatusBadge status={v.status} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Avisos */}
      {(lowStock.length > 0 || pendingPayments.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Avisos</h2>
          {pendingPayments.length > 0 && (
            <Card className="border-status-pending-payment/30 bg-status-pending-payment-bg">
              <CardContent className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-pending-payment/15 text-status-pending-payment">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium text-foreground">{pendingPayments.length} visita{pendingPayments.length > 1 ? "s" : ""} pendientes de cobro</p>
                  <p className="text-xs text-muted-foreground">Revísalos en Finanzas.</p>
                </div>
                <Button asChild variant="ghost" size="sm"><Link to="/finanzas">Ver</Link></Button>
              </CardContent>
            </Card>
          )}
          {lowStock.length > 0 && (
            <Card className="border-destructive/20 bg-status-cancelled-bg">
              <CardContent className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Package className="h-4 w-4" />
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium text-foreground">{lowStock.length} material{lowStock.length > 1 ? "es" : ""} con stock bajo</p>
                  <p className="text-xs text-muted-foreground">{lowStock.map((m) => m.name).slice(0, 2).join(", ")}{lowStock.length > 2 ? "…" : ""}</p>
                </div>
                <Button asChild variant="ghost" size="sm"><Link to="/material">Ver</Link></Button>
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
