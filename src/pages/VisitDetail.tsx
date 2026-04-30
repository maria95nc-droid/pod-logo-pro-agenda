import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR } from "@/lib/format";
import { visits, centers, patients } from "@/data/mock";
import { ArrowLeft, CheckCircle2, Clock, MapPin, Package, Euro } from "lucide-react";

export default function VisitDetail() {
  const { id } = useParams();
  const visit = visits.find((v) => v.id === id);
  if (!visit) return <p>Visita no encontrada.</p>;
  const center = centers.find((c) => c.id === visit.centerId);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild><Link to="/agenda"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-bold flex-1 truncate">{center?.name}</h1>
        <StatusBadge status={visit.status} />
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> <span>{new Date(visit.visitDate).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</span></div>
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> <span>{visit.startTime} – {visit.endTime}</span></div>
          {center?.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> <span>{center.address}, {center.city}</span></div>}
        </CardContent>
      </Card>

      <Card className="bg-gradient-primary text-primary-foreground shadow-primary">
        <CardContent className="p-4 grid grid-cols-3 gap-2 text-sm">
          <div><p className="text-[11px] opacity-80">Bruto</p><p className="text-lg font-bold">{formatEUR(visit.grossAmount)}</p></div>
          <div><p className="text-[11px] opacity-80">Neto est.</p><p className="text-lg font-bold">{formatEUR(visit.estimatedNetAmount)}</p></div>
          <div><p className="text-[11px] opacity-80">Pacientes</p><p className="text-lg font-bold">{visit.patientsCount}</p></div>
        </CardContent>
      </Card>

      {visit.patients.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Pacientes</h2>
          <div className="space-y-2">
            {visit.patients.map((vp) => {
              const p = patients.find((x) => x.id === vp.patientId);
              return (
                <Card key={vp.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {p?.fullName.split(" ").map(n=>n[0]).slice(0,2).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{p?.fullName}</p>
                      <p className="text-xs text-muted-foreground">{p?.usualTreatment}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold inline-flex items-center gap-0.5"><Euro className="h-3 w-3" />{vp.priceCharged}</p>
                      <StatusBadge status={vp.paymentStatus} className="mt-0.5 text-[10px]" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {visit.generalNotes && (
        <Card>
          <CardContent className="p-3.5 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Notas</p>
            <p>{visit.generalNotes}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline"><Package className="h-4 w-4" /> Material</Button>
        <Button><CheckCircle2 className="h-4 w-4" /> Marcar realizada</Button>
      </div>
    </div>
  );
}
