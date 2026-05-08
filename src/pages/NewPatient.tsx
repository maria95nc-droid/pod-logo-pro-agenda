import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCenters, useInvalidateAll } from "@/hooks/useData";
import { syncPatientNextVisit, removePatientFromFutureVisits } from "@/lib/patientVisitSync";

const PAYMENT_STATUSES = ["Pendiente", "Cobrado", "Incluido en factura", "No cobra", "Revisar"] as const;

export default function NewPatient() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { user } = useAuth();
  const { data: centers = [] } = useCenters();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const [fullName, setFullName] = useState("");
  const [centerId, setCenterId] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [patientCode, setPatientCode] = useState("");
  const [usualTreatment, setUsualTreatment] = useState("");
  const [defaultPrice, setDefaultPrice] = useState<number | "">("");
  const [lastVisitDate, setLastVisitDate] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextVisitTime, setNextVisitTime] = useState("");
  const [warnings, setWarnings] = useState("");
  const [allergies, setAllergies] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<string>("Pendiente");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data, error } = await supabase.from("patients").select("*").eq("id", id!).maybeSingle();
      if (error) { toast.error(error.message); setLoading(false); return; }
      if (!data) { toast.error("Paciente no encontrado"); navigate("/pacientes"); return; }
      setFullName(data.full_name ?? "");
      setCenterId(data.center_id ?? "");
      setPhone(data.phone ?? "");
      setBirthDate(data.birth_date ?? "");
      setPatientCode(data.patient_code ?? "");
      setUsualTreatment(data.usual_treatment ?? "");
      setDefaultPrice(data.default_price ?? "");
      setLastVisitDate(data.last_visit_date ?? "");
      setNextVisitDate(data.next_visit_date ?? "");
      setWarnings(data.important_warnings ?? "");
      setAllergies(data.allergies ?? "");
      setNotes(data.clinical_notes ?? "");
      setPaymentStatus((data as any).payment_status ?? "Pendiente");
      setIsActive(data.is_active ?? true);
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  const handleSave = async () => {
    if (!user) return;
    if (!fullName.trim()) return toast.error("Falta el nombre del paciente");
    setBusy(true);
    const payload: any = {
      full_name: fullName.trim(),
      center_id: centerId || null,
      phone: phone || null,
      birth_date: birthDate || null,
      patient_code: patientCode || null,
      usual_treatment: usualTreatment || null,
      default_price: defaultPrice === "" ? null : defaultPrice,
      last_visit_date: lastVisitDate || null,
      next_visit_date: nextVisitDate || null,
      important_warnings: warnings || null,
      allergies: allergies || null,
      clinical_notes: notes || null,
      payment_status: paymentStatus || null,
      is_active: isActive,
    };
    const { error } = isEdit
      ? await supabase.from("patients").update(payload).eq("id", id!)
      : await supabase.from("patients").insert({ ...payload, user_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Paciente actualizado correctamente" : "Paciente creado");
    invalidate();
    navigate("/pacientes");
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm("¿Eliminar este paciente?")) return;
    setBusy(true);
    const { error } = await supabase.from("patients").delete().eq("id", id!);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Paciente eliminado");
    invalidate();
    navigate("/pacientes");
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild><Link to="/pacientes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="flex-1 text-2xl font-bold">{isEdit ? "Editar paciente" : "Nuevo paciente"}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="fn">Nombre completo</Label>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Centro</Label>
            <Select value={centerId} onValueChange={setCenterId}>
              <SelectTrigger><SelectValue placeholder="Selecciona centro" /></SelectTrigger>
              <SelectContent>
                {centers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ph">Teléfono</Label>
              <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bd">Fecha de nacimiento</Label>
              <Input id="bd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc">Código de paciente</Label>
            <Input id="pc" value={patientCode} onChange={(e) => setPatientCode(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t">Tratamiento habitual</Label>
            <Input id="t" value={usualTreatment} onChange={(e) => setUsualTreatment(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="p">Precio</Label>
              <Input id="p" type="number" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value === "" ? "" : +e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado de pago</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="lv">Última visita</Label>
              <Input id="lv" type="date" value={lastVisitDate} onChange={(e) => setLastVisitDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd">Próxima visita</Label>
              <Input id="nd" type="date" value={nextVisitDate} onChange={(e) => setNextVisitDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w">Avisos clínicos</Label>
            <Input id="w" value={warnings} onChange={(e) => setWarnings(e.target.value)} placeholder="Diabetes, anticoagulantes…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="al">Alergias</Label>
            <Input id="al" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n">Notas clínicas</Label>
            <Textarea id="n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Activo</Label>
              <p className="text-xs text-muted-foreground">Si lo desactivas, no aparecerá en listas activas.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isEdit ? "Guardar cambios" : "Guardar paciente"}
      </Button>
      {isEdit && (
        <Button variant="destructive" className="w-full" onClick={handleDelete} disabled={busy}>
          <Trash2 className="h-4 w-4" /> Eliminar paciente
        </Button>
      )}
    </div>
  );
}
