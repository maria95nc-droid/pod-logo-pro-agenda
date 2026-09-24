import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatEUR, fromIsoDate, toIsoDate } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Users, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCenters, usePatients, useInvalidateAll } from "@/hooks/useData";
import { QuickVisitSheet } from "@/components/quick/QuickVisitSheet";

const IRPF = 7;
const DEFAULT_TRAVEL = 8;

/**
 * Fecha `yyyy-mm-dd` **real**: el valor llega de la URL. No basta el formato
 * (`2026-99-99` lo cumple); se comprueba que el calendario la acepte tal cual.
 */
const isValidIsoDate = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && toIsoDate(fromIsoDate(value)) === value;

export default function NewVisit() {
  const navigate = useNavigate();
  // El aviso de «toca llamar» enlaza aquí con el centro y la fecha ya puestos
  // (`/visita/nueva?centro=…&fecha=…`); sin parámetros no cambia nada.
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { data: centers = [] } = useCenters();
  const { data: patients = [] } = usePatients();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [centerId, setCenterId] = useState(() => searchParams.get("centro") ?? "");
  const [date, setDate] = useState(() => {
    const requested = searchParams.get("fecha");
    return isValidIsoDate(requested) ? requested : toIsoDate();
  });
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [selectedPatients, setSelectedPatients] = useState<Record<string, number>>({});
  const [travel, setTravel] = useState(DEFAULT_TRAVEL);
  const [materialCost, setMaterialCost] = useState(0);
  const [notes, setNotes] = useState("");

  const centerPatients = patients.filter((p) => p.center_id === centerId);

  const { gross, irpf, net } = useMemo(() => {
    const gross = Object.values(selectedPatients).reduce((a, b) => a + (b || 0), 0);
    const irpf = (gross * IRPF) / 100;
    const net = gross - irpf - travel - materialCost;
    return { gross, irpf, net };
  }, [selectedPatients, travel, materialCost]);

  const togglePatient = (id: string, price: number) => {
    setSelectedPatients((s) => {
      const c = { ...s };
      if (c[id] !== undefined) delete c[id];
      else c[id] = price;
      return c;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    if (!centerId) return toast.error("Selecciona un centro");
    // El centro puede venir de la URL: si ya no existe, mejor avisar aquí que
    // dejar que falle la clave ajena con un mensaje de base de datos.
    if (centers.length > 0 && !centers.some((c) => c.id === centerId)) {
      return toast.error("Ese centro ya no existe: selecciona otro");
    }
    setBusy(true);
    const ids = Object.keys(selectedPatients);
    const { data: visit, error } = await supabase.from("visits").insert({
      user_id: user.id,
      center_id: centerId,
      visit_date: date,
      start_time: start,
      end_time: end,
      status: "Programada",
      gross_amount: gross,
      irpf_percentage: IRPF,
      travel_cost: travel,
      material_cost: materialCost,
      estimated_net_amount: net,
      patients_count: ids.length,
      general_notes: notes || null,
    }).select("id").single();
    if (error || !visit) {
      setBusy(false);
      return toast.error(error?.message ?? "Error");
    }
    if (ids.length > 0) {
      const rows = ids.map((id) => {
        const p = patients.find((x) => x.id === id);
        return {
          visit_id: visit.id,
          patient_id: id,
          patient_name: p?.full_name ?? null,
          price_charged: selectedPatients[id],
          payment_status: "Pendiente",
          attended: true,
        };
      });
      await supabase.from("visit_patients").insert(rows);
    }
    setBusy(false);
    toast.success("Visita creada");
    invalidate();
    navigate("/agenda");
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild><Link to="/"><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Volver a Hoy</span></Link></Button>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">Nueva visita</h1>
      </div>

      {/* Atajo al modo rápido: para residencias basta con precio × nº de pacientes. */}
      <Card className="border-primary/20 bg-primary-soft shadow-card">
        <CardContent className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">¿Solo necesitas cuántos pacientes?</p>
            <p className="text-xs text-muted-foreground">Precio por paciente × nº de pacientes, sin marcarlos uno a uno.</p>
          </div>
          <Button type="button" size="sm" className="h-10 shrink-0" onClick={() => setQuickOpen(true)}>
            <Zap className="h-4 w-4" aria-hidden="true" /> Modo rápido
          </Button>
        </CardContent>
      </Card>

      <QuickVisitSheet
        open={quickOpen}
        onOpenChange={setQuickOpen}
        initialCenterId={centerId || null}
        onCreated={() => {
          invalidate();
          navigate("/agenda");
        }}
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Centro</Label>
            <Select value={centerId} onValueChange={setCenterId}>
              <SelectTrigger><SelectValue placeholder="Selecciona centro o domicilio" /></SelectTrigger>
              <SelectContent>
                {centers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} · {c.type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5 col-span-3">
              <Label htmlFor="d">Fecha</Label>
              <Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-1">
              <Label htmlFor="s">Inicio</Label>
              <Input id="s" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="e">Fin</Label>
              <Input id="e" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {centerId && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Pacientes ({Object.keys(selectedPatients).length})</h2>
            </div>
            {centerPatients.length === 0 && <p className="text-sm text-muted-foreground">Este centro aún no tiene pacientes.</p>}
            <div className="space-y-1.5">
              {centerPatients.map((p) => {
                const checked = selectedPatients[p.id] !== undefined;
                const defaultPrice = Number(p.default_price ?? 18);
                return (
                  <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-smooth hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={() => togglePatient(p.id, defaultPrice)} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.usual_treatment}</p>
                    </div>
                    {checked && (
                      <Input
                        type="number"
                        className="h-8 w-20"
                        value={selectedPatients[p.id]}
                        onChange={(e) => setSelectedPatients({ ...selectedPatients, [p.id]: +e.target.value })}
                        onClick={(e) => e.preventDefault()}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-base font-semibold">Gastos</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr">Desplazamiento</Label>
              <Input id="tr" type="number" value={travel} onChange={(e) => setTravel(+e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc">Material</Label>
              <Input id="mc" type="number" value={materialCost} onChange={(e) => setMaterialCost(+e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n">Notas</Label>
            <Textarea id="n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-primary-soft border-primary/20">
        <CardContent className="p-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span>Bruto</span><span className="font-semibold">{formatEUR(gross)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>IRPF ({IRPF}%)</span><span>−{formatEUR(irpf)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Desplazamiento + material</span><span>−{formatEUR(travel + materialCost)}</span></div>
          <div className="flex justify-between border-t border-primary/20 pt-2 text-base font-bold text-primary"><span>Neto estimado</span><span>{formatEUR(net)}</span></div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar visita
      </Button>
    </div>
  );
}
