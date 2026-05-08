import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/format";
import {
  useVisits,
  useCenters,
  useExpenses,
  useUserSettings,
  useInvalidateAll,
  defaultUserSettings,
} from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, TrendingUp, FileText, AlertCircle, Clock, Wallet, RefreshCw } from "lucide-react";

const FEE_METHOD_LABEL: Record<string, string> = {
  por_dia: "entre días trabajados",
  por_visita: "entre visitas",
  por_ingreso: "proporcional a ingresos",
};

export default function Finance() {
  const { data: visits = [] } = useVisits();
  const { data: centers = [] } = useCenters();
  const { data: expenses = [] } = useExpenses();
  const { data: settings = defaultUserSettings } = useUserSettings();
  const invalidate = useInvalidateAll();
  const now = new Date();

  const calc = useMemo(() => {
    const monthVisits = visits.filter((v) => {
      const d = new Date(v.visit_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthExpenses = expenses.filter((e) => {
      const d = new Date(e.expense_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    // Bruto / cobrado / pendiente desde visit_patients del mes
    let gross = 0, paid = 0, pendingAmount = 0;
    for (const v of monthVisits) {
      const vps = (v as any).visit_patients ?? [];
      if (vps.length === 0) {
        // fallback al campo agregado de la visita
        gross += Number(v.gross_amount || 0);
        if (v.status === "Cobrada") paid += Number(v.gross_amount || 0);
        else pendingAmount += Number(v.gross_amount || 0);
      } else {
        for (const vp of vps) {
          const p = Number(vp.price_charged || 0);
          gross += p;
          if (vp.payment_status === "Cobrado") paid += p;
          else pendingAmount += p;
        }
      }
    }

    const irpfPct = Number(settings.default_irpf_percentage) || 0;
    const irpf = gross * irpfPct / 100;

    const materialCost = monthVisits.reduce((s, v) => s + Number(v.material_cost || 0), 0);
    const otherExpenses =
      monthVisits.reduce((s, v) => s + Number(v.other_expenses || 0), 0) +
      monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    const travelCost = monthVisits.reduce((s, v) => {
      const own = Number(v.travel_cost || 0);
      if (own > 0) return s + own;
      if (settings.apply_travel_per_visit) return s + Number(settings.default_travel_cost || 0);
      return s;
    }, 0);

    const fee = settings.apply_self_employed_fee ? Number(settings.monthly_self_employed_fee || 0) : 0;
    const feeImputed = fee;
    const fixed = Number(settings.monthly_fixed_expenses || 0);
    const fixedImputed = fixed;

    const net = gross - irpf - travelCost - materialCost - otherExpenses - feeImputed - fixedImputed;

    const done = monthVisits.filter((v) => ["Realizada", "Cobrada", "Facturada"].includes(v.status)).length;
    const pending = visits.filter((v) => {
      const vps = (v as any).visit_patients ?? [];
      if (vps.length === 0) return v.status === "Pendiente de cobro" || v.status === "Realizada";
      return vps.some((vp: any) => vp.payment_status === "Pendiente");
    });
    const toInvoice = visits
      .filter((v) => v.status === "Cobrada")
      .reduce((s, v) => s + Number(v.gross_amount || 0), 0);

    return {
      monthVisits, gross, paid, irpfPct, irpf, materialCost, otherExpenses,
      travelCost, feeImputed, fixedImputed, net, done, pending, pendingAmount, toInvoice,
    };
  }, [visits, expenses, settings, now]);

  const markPaid = async (id: string) => {
    const { error } = await supabase.from("visits").update({ status: "Cobrada" }).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("visit_patients")
      .update({ payment_status: "Cobrado", paid_at: new Date().toISOString() })
      .eq("visit_id", id);
    toast.success("Cobro registrado");
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Finanzas</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { invalidate(); toast.success("Finanzas recalculadas"); }}>
            <RefreshCw className="h-4 w-4" /> Recalcular
          </Button>
          <Button size="sm" variant="outline"><Download className="h-4 w-4" /> Exportar</Button>
        </div>
      </div>

      <Card className="overflow-hidden bg-gradient-primary text-primary-foreground shadow-primary">
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">Este mes</p>
          <p className="mt-1 text-3xl font-bold">{formatEUR(calc.net)}</p>
          <p className="text-xs opacity-80">neto estimado</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/20 pt-3 text-sm">
            <div><p className="text-[11px] opacity-80">Bruto</p><p className="font-semibold">{formatEUR(calc.gross)}</p></div>
            <div><p className="text-[11px] opacity-80">Visitas</p><p className="font-semibold">{calc.done}/{calc.monthVisits.length}</p></div>
            <div><p className="text-[11px] opacity-80">IRPF</p><p className="font-semibold">{calc.irpfPct}%</p></div>
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
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <Row label={`IRPF (${calc.irpfPct}%)`} value={`- ${formatEUR(calc.irpf)}`} />
              <Row label="Desplazamientos" value={`- ${formatEUR(calc.travelCost)}`} />
              <Row label="Material" value={`- ${formatEUR(calc.materialCost)}`} />
              <Row label="Otros gastos" value={`- ${formatEUR(calc.otherExpenses)}`} />
              <Row
                label={settings.apply_self_employed_fee ? `Cuota autónomo (${FEE_METHOD_LABEL[settings.fee_distribution_method] ?? ""})` : "Cuota autónomo (no aplicada)"}
                value={`- ${formatEUR(calc.feeImputed)}`}
              />
              <Row label="Gastos fijos mensuales" value={`- ${formatEUR(calc.fixedImputed)}`} />
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Neto estimado</span>
                <span>{formatEUR(calc.net)}</span>
              </div>
            </CardContent>
          </Card>

          <MetricRow icon={<Wallet className="h-4 w-4" />} label="Cobrado este mes" value={formatEUR(calc.paid)} accent="info" />
          <MetricRow icon={<TrendingUp className="h-4 w-4" />} label="Ganancia media por visita" value={calc.monthVisits.length ? formatEUR(calc.net / calc.monthVisits.length) : "—"} />
          <MetricRow icon={<Clock className="h-4 w-4" />} label="Pendiente de cobro" value={formatEUR(calc.pendingAmount)} accent="warning" />
          <MetricRow icon={<FileText className="h-4 w-4" />} label="Pendiente de facturar" value={formatEUR(calc.toInvoice)} accent="info" />

          <Card className="bg-muted/30">
            <CardContent className="p-3.5 text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">Configuración usada:</strong></p>
              <p>IRPF: {calc.irpfPct}% · IVA: {settings.default_vat_mode}</p>
              <p>Cuota autónomo: {settings.apply_self_employed_fee ? `aplicada ${FEE_METHOD_LABEL[settings.fee_distribution_method]}` : "no aplicada"}</p>
              <p>Desplazamiento por defecto: {settings.apply_travel_per_visit ? formatEUR(settings.default_travel_cost) : "no aplicado"}</p>
            </CardContent>
          </Card>

          <Card className="border-status-warning/30 bg-status-warning-bg/50">
            <CardContent className="flex gap-2 p-3.5 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-status-warning" />
              <p className="text-foreground">Los importes netos son <strong>estimaciones internas</strong> y no sustituyen la revisión de una gestoría.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendientes" className="space-y-2">
          {calc.pending.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Todo al día 🎉</CardContent></Card>}
          {calc.pending.map((v) => {
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
                <div><p className="text-xs text-muted-foreground">Ingresos brutos</p><p className="font-bold">{formatEUR(calc.gross)}</p></div>
                <div><p className="text-xs text-muted-foreground">IRPF retenido ({calc.irpfPct}%)</p><p className="font-bold">{formatEUR(calc.irpf)}</p></div>
                <div><p className="text-xs text-muted-foreground">Visitas</p><p className="font-bold">{calc.monthVisits.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Centros</p><p className="font-bold">{new Set(calc.monthVisits.map(v=>v.center_id)).size}</p></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
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
