import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fiscalSettings as initial } from "@/data/mock";
import { toast } from "sonner";
import { Save, AlertCircle, Mic, Sparkles } from "lucide-react";
import {
  defaultVoiceSettings,
  getAiUsage,
  loadVoiceSettings,
  saveVoiceSettings,
  type VoiceSettings,
} from "@/lib/voiceSettings";

export default function Settings() {
  const [s, setS] = useState(initial);
  const [voice, setVoice] = useState<VoiceSettings>(defaultVoiceSettings);
  const [usage, setUsage] = useState(() => getAiUsage());

  useEffect(() => {
    setVoice(loadVoiceSettings());
    setUsage(getAiUsage());
  }, []);

  const updateVoice = (patch: Partial<VoiceSettings>) => {
    const next = { ...voice, ...patch };
    setVoice(next);
    saveVoiceSettings(next);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <Card className="border-status-warning/30 bg-status-warning-bg/40">
        <CardContent className="flex gap-2 p-3.5 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-status-warning" />
          <p>Los importes netos son <strong>estimaciones internas</strong> y no sustituyen la revisión de una gestoría.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-base font-semibold">Fiscalidad</h2>

          <div className="space-y-1.5">
            <Label htmlFor="irpf">IRPF por defecto (%)</Label>
            <Input id="irpf" type="number" value={s.defaultIrpfPercentage}
              onChange={(e) => setS({ ...s, defaultIrpfPercentage: +e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Modo de IVA</Label>
            <Select value={s.defaultVatMode} onValueChange={(v) => setS({ ...s, defaultVatMode: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Exento">Exento</SelectItem>
                <SelectItem value="Con IVA">Con IVA</SelectItem>
                <SelectItem value="Configurable">Configurable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fee">Cuota mensual autónomo (€)</Label>
            <Input id="fee" type="number" value={s.monthlySelfEmployedFee}
              onChange={(e) => setS({ ...s, monthlySelfEmployedFee: +e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fx">Gastos fijos mensuales (€)</Label>
            <Input id="fx" type="number" value={s.monthlyFixedExpenses}
              onChange={(e) => setS({ ...s, monthlyFixedExpenses: +e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr">Desplazamiento por defecto (€)</Label>
            <Input id="tr" type="number" value={s.defaultTravelCost}
              onChange={(e) => setS({ ...s, defaultTravelCost: +e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-base font-semibold">Cálculo del neto</h2>

          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Aplicar desplazamiento por visita</p><p className="text-xs text-muted-foreground">Resta el gasto de viaje al neto.</p></div>
            <Switch checked={s.applyTravelPerVisit} onCheckedChange={(v) => setS({ ...s, applyTravelPerVisit: v })} />
          </div>

          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Aplicar cuota autónomo al neto</p><p className="text-xs text-muted-foreground">Reparte la cuota mensual.</p></div>
            <Switch checked={s.applySelfEmployedFee} onCheckedChange={(v) => setS({ ...s, applySelfEmployedFee: v })} />
          </div>

          <div className="space-y-1.5">
            <Label>Método de reparto de la cuota</Label>
            <Select value={s.feeDistributionMethod} onValueChange={(v) => setS({ ...s, feeDistributionMethod: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="por_dia">Entre días trabajados del mes</SelectItem>
                <SelectItem value="por_visita">Entre visitas del mes</SelectItem>
                <SelectItem value="por_ingreso">Proporcional a los ingresos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={() => toast.success("Configuración guardada")}>
        <Save className="h-4 w-4" /> Guardar cambios
      </Button>
    </div>
  );
}
