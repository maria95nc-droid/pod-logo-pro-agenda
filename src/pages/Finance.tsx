import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { StreakBadge } from "@/components/StreakBadge";
import { CenterLabel } from "@/components/CenterLabel";
import { VisitAmount } from "@/components/VisitAmount";
import { CollectPaymentSheet } from "@/components/payments/CollectPaymentSheet";
import { calculateStreak, isCompletedVisit } from "@/lib/streak";
import { formatEUR, formatDate, fromIsoDate, toIsoDate } from "@/lib/format";
import type { VisitStatus } from "@/types";
import { monthLabel } from "@/lib/calendar";
import { monthKey } from "@/lib/agendaStats";
import { buildCenterIndex, centerInfo } from "@/lib/centers";
import {
  useVisits,
  useCenters,
  useExpenses,
  useUserSettings,
  useInvalidateAll,
  defaultUserSettings,
} from "@/hooks/useData";
import { toast } from "sonner";
import {
  Download, TrendingUp, FileText, AlertCircle, Clock, Wallet, RefreshCw, ReceiptText, ChevronRight,
} from "lucide-react";

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

  // ── Mes visible ────────────────────────────────────────────────────────────
  // Finanzas estaba fijada al mes en curso: al abrirla en un mes todavía sin
  // visitas mostraba todo a cero y los meses ya trabajados eran invisibles.
  const currentMonth = monthKey(toIsoDate());
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const centerIndex = useMemo(() => buildCenterIndex(centers), [centers]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const v of visits) if (v.visit_date) months.add(monthKey(v.visit_date));
    months.add(currentMonth);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [visits, currentMonth]);

  // Sin datos en el mes en curso se cae al último mes con visitas, que es lo
  // que el usuario quiere ver; el título dice siempre qué mes se está mirando.
  const autoMonth = useMemo(() => {
    const worked = new Set(visits.map((v) => (v.visit_date ? monthKey(v.visit_date) : "")));
    if (worked.has(currentMonth)) return currentMonth;
    return availableMonths.find((m) => m < currentMonth) ?? currentMonth;
  }, [visits, availableMonths, currentMonth]);

  const selectedMonth = chosenMonth ?? autoMonth;

  const calc = useMemo(() => {
    const monthVisits = visits.filter((v) => v.visit_date && monthKey(v.visit_date) === selectedMonth);
    const monthExpenses = expenses.filter((e) => e.expense_date && monthKey(e.expense_date) === selectedMonth);

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

    const done = monthVisits.filter(isCompletedVisit).length;
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
  }, [visits, expenses, settings, selectedMonth]);

  // El cobro se confirma en la hoja de desglose (permite partirlo entre varias
  // formas de pago); aquí sólo se guarda qué visita se está cobrando.
  const [payingVisitId, setPayingVisitId] = useState<string | null>(null);
  const payingVisit = payingVisitId ? visits.find((v) => v.id === payingVisitId) ?? null : null;
  const payingCenter = payingVisit ? centers.find((c) => c.id === payingVisit.center_id) : undefined;

  const streak = useMemo(() => calculateStreak(visits), [visits]);
  const monthProgress = calc.monthVisits.length > 0 ? Math.round((calc.done / calc.monthVisits.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <StreakBadge days={streak.days} countsToday={streak.countsToday} compact />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { invalidate(); toast.success("Finanzas recalculadas"); }}>
            <RefreshCw className="h-4 w-4" /> Recalcular
          </Button>
          <Button asChild size="sm" variant="outline"><Link to="/exportar"><Download className="h-4 w-4" /> Exportar</Link></Button>
        </div>
      </div>

      {/* Selector de mes: sin él, en un mes todavía sin visitas la pantalla
          entera mostraba ceros y los meses ya trabajados no se veían. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <Label htmlFor="finanzas-mes">Mes</Label>
          <Select value={selectedMonth} onValueChange={setChosenMonth}>
            <SelectTrigger id="finanzas-mes" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((month) => (
                <SelectItem key={month} value={month}>
                  {monthLabel(month)}
                  {month === currentMonth ? " (actual)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button asChild variant="outline" className="h-11">
          <Link to={`/finanzas/movimientos?mes=${selectedMonth}`}>
            <ReceiptText className="h-4 w-4" aria-hidden="true" /> Ver detalle
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden bg-gradient-primary text-primary-foreground shadow-primary">
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">{monthLabel(selectedMonth)}</p>
          <p className="mt-1 text-3xl font-bold">{formatEUR(calc.net)}</p>
          <p className="text-xs opacity-80">neto estimado</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/20 pt-3 text-sm">
            <div><p className="text-[11px] opacity-80">Bruto</p><p className="font-semibold">{formatEUR(calc.gross)}</p></div>
            <div><p className="text-[11px] opacity-80">Visitas</p><p className="font-semibold">{calc.done}/{calc.monthVisits.length}</p></div>
            <div><p className="text-[11px] opacity-80">IRPF</p><p className="font-semibold">{calc.irpfPct}%</p></div>
          </div>
          {calc.monthVisits.length > 0 && (
            <div
              role="progressbar"
              aria-label={`Visitas completadas en ${monthLabel(selectedMonth)}`}
              aria-valuemin={0}
              aria-valuemax={calc.monthVisits.length}
              aria-valuenow={calc.done}
              aria-valuetext={`${calc.done} de ${calc.monthVisits.length} visitas completadas`}
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25"
            >
              <span
                className="block h-full rounded-full bg-streak-glow transition-[width] duration-700 ease-out"
                style={{ width: `${monthProgress}%` }}
              />
            </div>
          )}
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

          {/* Cada cifra enlaza con el movimiento que la genera. */}
          <MetricRow
            icon={<Wallet className="h-4 w-4" />}
            label={`Cobrado en ${monthLabel(selectedMonth).toLowerCase()}`}
            value={formatEUR(calc.paid)}
            accent="info"
            to={`/finanzas/movimientos?mes=${selectedMonth}&estado=settled`}
            hint="Ver las visitas ya cobradas"
          />
          <MetricRow icon={<TrendingUp className="h-4 w-4" />} label="Ganancia media por visita" value={calc.monthVisits.length ? formatEUR(calc.net / calc.monthVisits.length) : "—"} />
          <MetricRow
            icon={<Clock className="h-4 w-4" />}
            label="Pendiente de cobro"
            value={formatEUR(calc.pendingAmount)}
            accent="warning"
            to={`/finanzas/movimientos?mes=${selectedMonth}&estado=pending`}
            hint="Ver de quién está pendiente"
          />
          {/* Único dato no mensual de la pantalla: se dice explícitamente. */}
          <MetricRow
            icon={<FileText className="h-4 w-4" />}
            label="Pendiente de facturar"
            hint="Total acumulado, no sólo de este mes"
            value={formatEUR(calc.toInvoice)}
            accent="info"
          />

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
          <p className="px-1 text-xs text-muted-foreground">
            Todo lo que queda por cobrar, de cualquier mes.
          </p>
          {calc.pending.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Todo al día 🎉</CardContent></Card>}
          {calc.pending.map((v) => {
            const gross = Number(v.gross_amount) || 0;
            const patients = Number(v.patients_count) || 0;
            const center = centerInfo(centerIndex, v.center_id);
            return (
              <Card key={v.id} className="shadow-card">
                {/* En móvil el botón baja a su propia línea: con tres columnas
                    el nombre del centro se quedaba en dos letras a 320 px. */}
                <CardContent className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/visita/${v.id}`}
                      className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CenterLabel center={center} showType className="text-sm" />
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatDate(fromIsoDate(v.visit_date))}
                        {patients > 0 ? ` · ${patients} pac.` : ""}
                      </span>
                    </Link>
                    <div className="shrink-0 text-right">
                      <VisitAmount gross={gross} unbilled={gross <= 0} className="text-sm" />
                      <StatusBadge status={v.status as VisitStatus} className="mt-0.5 text-[10px]" />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2.5 h-10 w-full sm:h-9 sm:w-auto"
                    onClick={() => setPayingVisitId(v.id)}
                  >
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Cobrar
                    <span className="sr-only"> {center.name}</span>
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
                <p className="text-sm font-semibold">{monthLabel(selectedMonth)}</p>
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

      <CollectPaymentSheet
        open={!!payingVisit}
        onOpenChange={(next) => !next && setPayingVisitId(null)}
        visit={payingVisit}
        centerName={payingCenter?.name}
        centerPaymentMethod={payingCenter?.payment_method}
        onConfirmed={() => {
          setPayingVisitId(null);
          invalidate();
        }}
      />
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

function MetricRow({
  icon,
  label,
  value,
  accent,
  to,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "warning" | "info";
  /** Destino del desglose que explica la cifra. */
  to?: string;
  hint?: string;
}) {
  const cls = accent === "warning" ? "text-status-pending-payment" : accent === "info" ? "text-status-info" : "text-foreground";
  const body = (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <p className={`shrink-0 font-bold tabular-nums ${cls}`}>{value}</p>
      {to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </div>
  );

  if (!to) return <Card className="shadow-card"><CardContent className="p-0">{body}</CardContent></Card>;

  return (
    <Card className="shadow-card transition-smooth hover:shadow-elevated">
      <Link
        to={to}
        className="block rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {body}
      </Link>
    </Card>
  );
}
