import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { CollectPaymentSheet } from "@/components/payments/CollectPaymentSheet";
import { VisitFiscalCard } from "@/components/fiscal/VisitFiscalCard";
import { collectInvoiceNumbers, normalizeIncomeType, type FiscalVisit } from "@/lib/fiscalCalculations";
import { formatEUR } from "@/lib/format";
import { useVisit, useCenters, usePatients, useVisits, useInvalidateAll } from "@/hooks/useData";
import { describeLines, parsePaymentBreakdown } from "@/lib/payments";
import { isQuickAggregateRow } from "@/lib/quickEntry";
import { markVisitDone } from "@/lib/visitActions";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, MapPin, Euro, Users, Wallet } from "lucide-react";

export default function VisitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: visit, isLoading } = useVisit(id);
  const { data: centers = [] } = useCenters();
  const { data: patients = [] } = usePatients();
  const { data: visits = [] } = useVisits();
  const invalidate = useInvalidateAll();
  const [collecting, setCollecting] = useState(false);

  // Números de factura de **otras** visitas: con el de esta dentro, cambiar su
  // número por el siguiente de la serie ocultaría el hueco que deja atrás.
  const otherInvoiceNumbers = useMemo(
    () => collectInvoiceNumbers((visits as unknown as FiscalVisit[]).filter((row) => row.id !== id)),
    [visits, id],
  );

  if (isLoading) return <p className="p-6 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (!visit) return <p className="p-6 text-center">Visita no encontrada.</p>;
  const center = centers.find((c) => c.id === visit.center_id);

  // Marcar realizada no implica cobrada: si queda importe, la visita queda
  // pendiente de cobro y sigue avisando desde Hoy.
  const markDone = async () => {
    const result = await markVisitDone(visit);
    if (!result.ok) return toast.error(result.error ?? "No se pudo actualizar la visita");
    toast.success(
      result.status === "Pendiente de cobro" ? "Visita realizada · pendiente de cobro" : "Visita realizada",
    );
    invalidate();
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Volver</span>
        </Button>
        <h1 className="text-xl font-bold flex-1 truncate">{center?.name ?? "Sin centro"}</h1>
        <StatusBadge status={visit.status as any} />
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> <span>{new Date(visit.visit_date).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</span></div>
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> <span>{visit.start_time} – {visit.end_time}</span></div>
          {center?.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> <span>{center.address}{center.city ? `, ${center.city}` : ""}</span></div>}
        </CardContent>
      </Card>

      <Card className="bg-gradient-primary text-primary-foreground shadow-primary">
        <CardContent className="p-4 grid grid-cols-3 gap-2 text-sm">
          <div><p className="text-[11px] opacity-80">Bruto</p><p className="text-lg font-bold">{formatEUR(Number(visit.gross_amount))}</p></div>
          <div><p className="text-[11px] opacity-80">Neto est.</p><p className="text-lg font-bold">{formatEUR(Number(visit.estimated_net_amount))}</p></div>
          <div><p className="text-[11px] opacity-80">Pacientes</p><p className="text-lg font-bold">{visit.patients_count}</p></div>
        </CardContent>
      </Card>

      <VisitFiscalCard
        visit={visit}
        existingInvoiceNumbers={otherInvoiceNumbers}
        suggestion={normalizeIncomeType(center?.default_income_type)}
        onSaved={invalidate}
      />

      {visit.visit_patients && visit.visit_patients.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Pacientes</h2>
          <div className="space-y-2">
            {visit.visit_patients.map((vp: any) => {
              const p = patients.find((x) => x.id === vp.patient_id);
              const name = p?.full_name ?? vp.patient_name ?? "Paciente";
              const aggregate = !p && isQuickAggregateRow(vp);
              const breakdown = parsePaymentBreakdown(vp.payment_breakdown);
              return (
                <Card key={vp.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {aggregate ? (
                        <Users className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        name.split(" ").map((n: string) => n[0]).slice(0,2).join("")
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {breakdown
                          ? describeLines(breakdown, formatEUR)
                          : p?.usual_treatment ?? vp.treatment_done ?? ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold inline-flex items-center gap-0.5"><Euro className="h-3 w-3" />{vp.price_charged}</p>
                      <StatusBadge status={vp.payment_status as any} className="mt-0.5 text-[10px]" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {visit.general_notes && (
        <Card>
          <CardContent className="p-3.5 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Notas</p>
            <p>{visit.general_notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={() => setCollecting(true)}>
          <Wallet className="h-4 w-4" aria-hidden="true" /> Registrar cobro
        </Button>
        <Button className="h-11" onClick={markDone}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Marcar realizada
        </Button>
      </div>

      <CollectPaymentSheet
        open={collecting}
        onOpenChange={setCollecting}
        visit={visit}
        centerName={center?.name}
        centerPaymentMethod={(center as { payment_method?: string | null } | undefined)?.payment_method}
        onConfirmed={invalidate}
      />
    </div>
  );
}
