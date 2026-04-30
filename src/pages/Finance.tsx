import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/format";
import { visits, centers, fiscalSettings } from "@/data/mock";
import { Download, TrendingUp, FileText, AlertCircle, Clock } from "lucide-react";

export default function Finance() {
  const now = new Date();
  const monthVisits = visits.filter((v) => {
    const d = new Date(v.visitDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const gross = monthVisits.reduce((s, v) => s + v.grossAmount, 0);
  const net = monthVisits.reduce((s, v) => s + v.estimatedNetAmount, 0);
  const done = monthVisits.filter((v) => v.status === "Realizada" || v.status === "Cobrada" || v.status === "Facturada").length;
  const pending = visits.filter((v) => v.status === "Pendiente de cobro");
  const pendingAmount = pending.reduce((s, v) => s + v.grossAmount, 0);
  const toInvoice = visits.filter((v) => v.status === "Cobrada").reduce((s, v) => s + v.grossAmount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Finanzas</h1>
        <Button size="sm" variant="outline"><Download className="h-4 w-4" /> Exportar</Button>
      </div>

      <Card className="overflow-hidden bg-gradient-primary text-primary-foreground shadow-primary">
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">Este mes</p>
          <p className="mt-1 text-3xl font-bold">{formatEUR(net)}</p>
          <p className="text-xs opacity-80">neto estimado</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/20 pt-3 text-sm">
            <div>
              <p className="text-[11px] opacity-80">Bruto</p>
              <p className="font-semibold">{formatEUR(gross)}</p>
            </div>
            <div>
              <p className="text-[11px] opacity-80">Visitas</p>
              <p className="font-semibold">{done}/{monthVisits.length}</p>
            </div>
            <div>
              <p className="text-[11px] opacity-80">IRPF</p>
              <p className="font-semibold">{fiscalSettings.defaultIrpfPercentage}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="resumen">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="gestoria">Gestoría</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-2">
          <MetricRow icon={<TrendingUp className="h-4 w-4" />} label="Ganancia media por visita" value={monthVisits.length ? formatEUR(net / monthVisits.length) : "—"} />
          <MetricRow icon={<Clock className="h-4 w-4" />} label="Pendiente de cobro" value={formatEUR(pendingAmount)} accent="warning" />
          <MetricRow icon={<FileText className="h-4 w-4" />} label="Pendiente de facturar" value={formatEUR(toInvoice)} accent="info" />
          <Card className="border-status-warning/30 bg-status-warning-bg/50">
            <CardContent className="flex gap-2 p-3.5 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-status-warning" />
              <p className="text-foreground">Los importes netos son <strong>estimaciones internas</strong> y no sustituyen la revisión de una gestoría.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendientes" className="space-y-2">
          {pending.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Todo al día 🎉</CardContent></Card>}
          {pending.map((v) => {
            const c = centers.find((x) => x.id === v.centerId);
            return (
              <Card key={v.id} className="shadow-card">
                <CardContent className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <p className="text-sm font-semibold">{c?.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(v.visitDate).toLocaleDateString("es-ES")} · {v.patientsCount} pac.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatEUR(v.grossAmount)}</p>
                    <StatusBadge status={v.status} className="mt-0.5 text-[10px]" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="gestoria" className="space-y-2">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Periodo</p>
                <p className="text-sm font-semibold capitalize">{now.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Ingresos brutos</p><p className="font-bold">{formatEUR(gross)}</p></div>
                <div><p className="text-xs text-muted-foreground">IRPF retenido</p><p className="font-bold">{formatEUR(gross * fiscalSettings.defaultIrpfPercentage / 100)}</p></div>
                <div><p className="text-xs text-muted-foreground">Visitas</p><p className="font-bold">{monthVisits.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Centros</p><p className="font-bold">{new Set(monthVisits.map(v=>v.centerId)).size}</p></div>
              </div>
              <Button className="w-full"><Download className="h-4 w-4" /> Descargar resumen (CSV)</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricRow({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "warning" | "info" }) {
  const cls = accent === "warning" ? "text-status-pending-payment" : accent === "info" ? "text-status-info" : "text-foreground";
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-3 p-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
        <p className="flex-1 text-sm">{label}</p>
        <p className={`font-bold ${cls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
