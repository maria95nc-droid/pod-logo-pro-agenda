import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/format";
import { useVisit, useCenters, usePatients, useInvalidateAll } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, MapPin, Euro, Wallet } from "lucide-react";

export default function VisitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: visit, isLoading } = useVisit(id);
  const { data: centers = [] } = useCenters();
  const { data: patients = [] } = usePatients();
  const invalidate = useInvalidateAll();

  if (isLoading) return <p className="p-6 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (!visit) return <p className="p-6 text-center">Visita no encontrada.</p>;
  const center = centers.find((c) => c.id === visit.center_id);

  const markDone = async () => {
    const { error } = await supabase.from("visits").update({ status: "Realizada" }).eq("id", visit.id);
    if (error) return toast.error(error.message);
    toast.success("Visita realizada");
    invalidate();
  };
  const markPaid = async () => {
    const { error } = await supabase.from("visits").update({ status: "Cobrada" }).eq("id", visit.id);
    if (error) return toast.error(error.message);
    await supabase.from("visit_patients")
      .update({ payment_status: "Cobrado", paid_at: new Date().toISOString() })
      .eq("visit_id", visit.id);
    toast.success("Cobro registrado");
    invalidate();
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
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

      {visit.visit_patients && visit.visit_patients.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Pacientes</h2>
          <div className="space-y-2">
            {visit.visit_patients.map((vp: any) => {
              const p = patients.find((x) => x.id === vp.patient_id);
              const name = p?.full_name ?? vp.patient_name ?? "Paciente";
              return (
                <Card key={vp.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {name.split(" ").map((n: string) => n[0]).slice(0,2).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{p?.usual_treatment ?? vp.treatment_done ?? ""}</p>
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
        <Button variant="outline" onClick={markPaid}><Wallet className="h-4 w-4" /> Marcar cobrada</Button>
        <Button onClick={markDone}><CheckCircle2 className="h-4 w-4" /> Marcar realizada</Button>
      </div>
    </div>
  );
}
