import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { centers, patients, fiscalSettings } from "@/data/mock";
import { formatEUR } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Save, Users } from "lucide-react";

export default function NewVisit() {
  const navigate = useNavigate();
  const [centerId, setCenterId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [selectedPatients, setSelectedPatients] = useState<Record<string, number>>({});
  const [travel, setTravel] = useState(fiscalSettings.defaultTravelCost);
  const [materialCost, setMaterialCost] = useState(0);
  const [notes, setNotes] = useState("");

  const centerPatients = patients.filter((p) => p.centerId === centerId);

  const { gross, irpf, net } = useMemo(() => {
    const gross = Object.values(selectedPatients).reduce((a, b) => a + (b || 0), 0);
    const irpf = (gross * fiscalSettings.defaultIrpfPercentage) / 100;
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

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild><Link to="/"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Nueva visita</h1>
      </div>

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
                return (
                  <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-smooth hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={() => togglePatient(p.id, p.defaultPrice ?? 18)} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">{p.usualTreatment}</p>
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
          <div className="flex justify-between text-muted-foreground"><span>IRPF ({fiscalSettings.defaultIrpfPercentage}%)</span><span>−{formatEUR(irpf)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Desplazamiento + material</span><span>−{formatEUR(travel + materialCost)}</span></div>
          <div className="flex justify-between border-t border-primary/20 pt-2 text-base font-bold text-primary"><span>Neto estimado</span><span>{formatEUR(net)}</span></div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={() => { toast.success("Visita creada"); navigate("/"); }}>
        <Save className="h-4 w-4" /> Guardar visita
      </Button>
    </div>
  );
}
