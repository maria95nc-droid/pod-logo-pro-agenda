import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { MicButton } from "@/components/voice/MicButton";
import { useMaterials, useVisits, useCenters } from "@/hooks/useData";
import { toIsoDate } from "@/lib/format";

export default function MaterialPage() {
  const { data: materials = [] } = useMaterials();
  const { data: visits = [] } = useVisits();
  const { data: centers = [] } = useCenters();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toIsoDate(tomorrow);
  const tomorrowVisits = visits.filter((v) => v.visit_date === tomorrowIso);
  const lowStock = materials.filter((m) => Number(m.current_stock) <= Number(m.minimum_stock));
  const ok = materials.filter((m) => Number(m.current_stock) > Number(m.minimum_stock));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Material</h1>
        <div className="flex items-center gap-2">
          <MicButton
            hintIntent="material"
            title="Dictar material"
            exampleHint='Ej.: "Añadir material guantes nitrilo, stock 50, mínimo 10, categoría protección."'
          />
          <Button size="sm" asChild>
            <Link to="/material/nuevo"><Plus className="h-4 w-4" /> Añadir</Link>
          </Button>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">Para mañana</h2>
        {tomorrowVisits.length === 0 ? (
          <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">Sin visitas mañana.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {tomorrowVisits.map((v) => {
              const c = centers.find((x) => x.id === v.center_id);
              return (
                <Card key={v.id} className="shadow-card border-primary/20 bg-primary-soft/30">
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <Package className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{c?.name ?? "Sin centro"}</p>
                      <p className="text-xs text-muted-foreground">{v.start_time} · {v.patients_count} pacientes</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {lowStock.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Stock bajo ({lowStock.length})
          </h2>
          <div className="space-y-2">
            {lowStock.map((m) => <MaterialRow key={m.id} m={m} low />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Inventario ({ok.length})
        </h2>
        {materials.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Aún no hay material registrado.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {ok.map((m) => <MaterialRow key={m.id} m={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function MaterialRow({ m, low = false }: { m: any; low?: boolean }) {
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${low ? "bg-status-cancelled-bg text-destructive" : "bg-muted text-muted-foreground"}`}>
          <Package className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{m.name}</p>
          <p className="text-xs text-muted-foreground">{m.category} · mín. {m.minimum_stock} {m.unit}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${low ? "text-destructive" : "text-foreground"}`}>{m.current_stock} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></p>
          <StatusBadge status={low ? "Stock bajo" : "Stock OK"} className="mt-0.5 text-[10px]" />
        </div>
      </CardContent>
    </Card>
  );
}
