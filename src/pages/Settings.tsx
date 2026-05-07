import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, AlertCircle, Mic, Sparkles, Loader2 } from "lucide-react";
import {
  defaultVoiceSettings,
  getAiUsage,
  loadVoiceSettings,
  saveVoiceSettings,
  type VoiceSettings,
} from "@/lib/voiceSettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type VatMode = "Exento" | "Con IVA" | "Configurable";
type FeeMethod = "por_dia" | "por_visita" | "por_ingreso";

interface SettingsForm {
  defaultIrpfPercentage: string;
  defaultVatMode: VatMode;
  monthlySelfEmployedFee: string;
  monthlyFixedExpenses: string;
  defaultTravelCost: string;
  applyTravelPerVisit: boolean;
  applySelfEmployedFee: boolean;
  feeDistributionMethod: FeeMethod;
}

const defaultForm: SettingsForm = {
  defaultIrpfPercentage: "15",
  defaultVatMode: "Exento",
  monthlySelfEmployedFee: "",
  monthlyFixedExpenses: "",
  defaultTravelCost: "",
  applyTravelPerVisit: true,
  applySelfEmployedFee: true,
  feeDistributionMethod: "por_dia",
};

const numToStr = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : String(n);

const strToNum = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
};

const sanitizeNumericInput = (raw: string): string => {
  // Permite vacío, dígitos, un solo separador decimal (. o ,)
  let v = raw.replace(/[^\d.,]/g, "");
  // Solo un separador
  const firstSep = v.search(/[.,]/);
  if (firstSep !== -1) {
    v = v.slice(0, firstSep + 1) + v.slice(firstSep + 1).replace(/[.,]/g, "");
  }
  // Quitar ceros a la izquierda (pero conservar "0", "0.5", "0,5", "")
  if (/^0\d/.test(v)) v = v.replace(/^0+/, "");
  return v;
};

export default function Settings() {
  const { user } = useAuth();
  const [form, setForm] = useState<SettingsForm>(defaultForm);
  const [voice, setVoice] = useState<VoiceSettings>(defaultVoiceSettings);
  const [usage, setUsage] = useState(() => getAiUsage());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVoice(loadVoiceSettings());
    setUsage(getAiUsage());
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "default_irpf_percentage, default_vat_mode, monthly_self_employed_fee, monthly_fixed_expenses, default_travel_cost, apply_travel_per_visit, apply_self_employed_fee, fee_distribution_method",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Error cargando configuración:", error);
        toast.error("No se pudo cargar la configuración");
      } else if (data) {
        setForm({
          defaultIrpfPercentage: numToStr(data.default_irpf_percentage as number | null),
          defaultVatMode: ((data.default_vat_mode as VatMode) ?? "Exento"),
          monthlySelfEmployedFee: numToStr(data.monthly_self_employed_fee as number | null),
          monthlyFixedExpenses: numToStr(data.monthly_fixed_expenses as number | null),
          defaultTravelCost: numToStr(data.default_travel_cost as number | null),
          applyTravelPerVisit: data.apply_travel_per_visit ?? true,
          applySelfEmployedFee: data.apply_self_employed_fee ?? true,
          feeDistributionMethod: ((data.fee_distribution_method as FeeMethod) ?? "por_dia"),
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const updateVoice = (patch: Partial<VoiceSettings>) => {
    const next = { ...voice, ...patch };
    setVoice(next);
    saveVoiceSettings(next);
  };

  const updateNumericField = (key: keyof SettingsForm, raw: string) => {
    setForm((f) => ({ ...f, [key]: sanitizeNumericInput(raw) }));
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("Debes iniciar sesión");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      default_irpf_percentage: strToNum(form.defaultIrpfPercentage),
      default_vat_mode: form.defaultVatMode,
      monthly_self_employed_fee: strToNum(form.monthlySelfEmployedFee),
      monthly_fixed_expenses: strToNum(form.monthlyFixedExpenses),
      default_travel_cost: strToNum(form.defaultTravelCost),
      apply_travel_per_visit: form.applyTravelPerVisit,
      apply_self_employed_fee: form.applySelfEmployedFee,
      fee_distribution_method: form.feeDistributionMethod,
    };

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from("profiles").update(payload).eq("user_id", user.id)
      : await supabase.from("profiles").insert(payload);

    setSaving(false);
    if (error) {
      console.error("Error guardando configuración:", error);
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Configuración guardada correctamente");
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
            <Input
              id="irpf"
              type="text"
              inputMode="decimal"
              value={form.defaultIrpfPercentage}
              onChange={(e) => updateNumericField("defaultIrpfPercentage", e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Modo de IVA</Label>
            <Select value={form.defaultVatMode} onValueChange={(v) => setForm({ ...form, defaultVatMode: v as VatMode })}>
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
            <Input
              id="fee"
              type="text"
              inputMode="decimal"
              value={form.monthlySelfEmployedFee}
              onChange={(e) => updateNumericField("monthlySelfEmployedFee", e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fx">Gastos fijos mensuales (€)</Label>
            <Input
              id="fx"
              type="text"
              inputMode="decimal"
              value={form.monthlyFixedExpenses}
              onChange={(e) => updateNumericField("monthlyFixedExpenses", e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr">Desplazamiento por defecto (€)</Label>
            <Input
              id="tr"
              type="text"
              inputMode="decimal"
              value={form.defaultTravelCost}
              onChange={(e) => updateNumericField("defaultTravelCost", e.target.value)}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-base font-semibold">Cálculo del neto</h2>

          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Aplicar desplazamiento por visita</p><p className="text-xs text-muted-foreground">Resta el gasto de viaje al neto.</p></div>
            <Switch checked={form.applyTravelPerVisit} onCheckedChange={(v) => setForm({ ...form, applyTravelPerVisit: v })} />
          </div>

          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Aplicar cuota autónomo al neto</p><p className="text-xs text-muted-foreground">Reparte la cuota mensual.</p></div>
            <Switch checked={form.applySelfEmployedFee} onCheckedChange={(v) => setForm({ ...form, applySelfEmployedFee: v })} />
          </div>

          <div className="space-y-1.5">
            <Label>Método de reparto de la cuota</Label>
            <Select value={form.feeDistributionMethod} onValueChange={(v) => setForm({ ...form, feeDistributionMethod: v as FeeMethod })}>
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

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Mic className="h-4 w-4 text-primary" /> Voz e IA
          </h2>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Modo por defecto: <strong className="text-foreground">Gratis</strong>. La interpretación
            con IA solo se activa al pulsar <em>Interpretar con IA</em> y nunca de forma automática.
            No se guardan audios.
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Permitir IA opcional</p>
              <p className="text-xs text-muted-foreground">Habilita el botón <em>Interpretar con IA</em>.</p>
            </div>
            <Switch checked={voice.aiEnabled} onCheckedChange={(v) => updateVoice({ aiEnabled: v })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ailimit">Límite mensual de usos de IA (vacío = sin límite)</Label>
            <Input
              id="ailimit"
              type="text"
              inputMode="numeric"
              value={voice.monthlyAiLimit ? String(voice.monthlyAiLimit) : ""}
              onChange={(e) => {
                const v = sanitizeNumericInput(e.target.value);
                updateVoice({ monthlyAiLimit: v === "" ? 0 : Math.max(0, parseInt(v, 10) || 0) });
              }}
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Usos de IA este mes
              </span>
              <span className="font-semibold">
                {usage.count}
                {voice.monthlyAiLimit > 0 && (
                  <span className="text-muted-foreground"> / {voice.monthlyAiLimit}</span>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning-bg/40 p-3 text-xs">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
            <p>La IA es opcional y siempre manual. En el modo gratis puedes dictar con el teclado del móvil o escribir sin coste.</p>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSave} disabled={saving || loading}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  );
}
