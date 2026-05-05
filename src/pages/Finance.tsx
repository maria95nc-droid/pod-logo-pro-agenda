import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/format";
import { useVisits, useCenters, useInvalidateAll } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, TrendingUp, FileText, AlertCircle, Clock, Wallet } from "lucide-react";

const IRPF = 7;

export default function Finance() {
  const { data: visits = [] } = useVisits();
  const { data: centers = [] } = useCenters();
  const invalidate = useInvalidateAll();
  const now = new Date();

  const monthVisits = visits.filter((v) => {
    const d = new Date(v.visit_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const gross = monthVisits.reduce((s, v) => s + Number(v.gross_amount), 0);
  const net = monthVisits.reduce((s, v) => s + Number(v.estimated_net_amount), 0);
  const done = monthVisits.filter((v) => ["Realizada","Cobrada","Facturada"].includes(v.status)).length;
  const pending = visits.filter((v) => v.status === "Pendiente de cobro" || v.status === "Realizada");
  const pendingAmount = pending.reduce((s, v) => s + Number(v.gross_amount), 0);
  const toInvoice = visits.filter((v) => v.status === "Cobrada").reduce((s, v) => s + Number(v.gross_amount), 0);

  const markPaid = async (id: string) => {
    const { error } = await supabase.from("visits").update({ status: "Cobrada" }).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("visit_patients").update({ payment_status: "Cobrado" }).eq("visit_id", id);
    toast.success("Cobro registrado");
    invalidate();
  };

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
            <div><p className="text-[11px] opacity-80">Bruto</p><p className="font-semibold">{formatEUR(gross)}</p></div>
            <div><p className="text-[11px] opacity-80">Visitas</p><p className="font-semibold">{done}/{monthVisits.length}</p></div>
            <div><p className="text-[11px] opacity-80">IRPF</p><p className="font-semibold">{IRPF}%</p></div>
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
            const c = centers.find((x) => x.id === v.center_id);
            return (
              <Card key={v.id} className="shadow-card">
                <CardContent className="flex items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c?.name ?? "Sin centro"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(v.visit_date).toLocaleDateString("es-ES")} · {v.patients_count} pac.</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatEUR(Number(v.gross_amount))}</p>
                    <StatusBadge status={v.status as any} className="mt-0.5 text-[10px]" />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => markPaid(v.id)}>
                    <Wallet className="h-3.5 w-3.5" /> Cobrar
                  </Button>
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
                <div><p className="text-xs text-muted-foreground">IRPF retenido</p><p className="font-bold">{formatEUR(gross * IRPF / 100)}</p></div>
                <div><p className="text-xs text-muted-foreground">Visitas</p><p className="font-bold">{monthVisits.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Centros</p><p className="font-bold">{new Set(monthVisits.map(v=>v.center_id)).size}</p></div>
              </div>
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
