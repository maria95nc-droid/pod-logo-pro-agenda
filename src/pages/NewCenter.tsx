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
import { useInvalidateAll } from "@/hooks/useData";

const TYPES = ["Residencia", "Centro de día", "Domicilio", "Clínica propia", "Otro"] as const;

export default function NewCenter() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Residencia");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [email, setEmail] = useState("");
  const [usualSchedule, setUsualSchedule] = useState("");
  const [visitFrequency, setVisitFrequency] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [billingNotes, setBillingNotes] = useState("");
  const [materialNotes, setMaterialNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data, error } = await supabase.from("centers").select("*").eq("id", id!).maybeSingle();
      if (error) { toast.error(error.message); setLoading(false); return; }
      if (!data) { toast.error("Centro no encontrado"); navigate("/pacientes"); return; }
      setName(data.name ?? "");
      setType(data.type ?? "Residencia");
      setAddress(data.address ?? "");
      setCity(data.city ?? "");
      setPostalCode((data as any).postal_code ?? "");
      setContactPerson(data.contact_person ?? "");
      setContactPhone(data.contact_phone ?? "");
      setEmail((data as any).email ?? "");
      setUsualSchedule(data.usual_schedule ?? "");
      setVisitFrequency((data as any).visit_frequency ?? "");
      setPrice(data.default_price_per_patient ?? "");
      setPaymentMethod((data as any).payment_method ?? "");
      setBillingNotes((data as any).billing_notes ?? "");
      setMaterialNotes((data as any).material_notes ?? "");
      setNotes(data.notes ?? "");
      setIsActive(data.is_active ?? true);
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Falta el nombre del centro");
    setBusy(true);
    const payload: any = {
      name: name.trim(),
      type,
      address: address || null,
      city: city || null,
      postal_code: postalCode || null,
      contact_person: contactPerson || null,
      contact_phone: contactPhone || null,
      email: email || null,
      usual_schedule: usualSchedule || null,
      visit_frequency: visitFrequency || null,
      default_price_per_patient: price === "" ? null : price,
      payment_method: paymentMethod || null,
      billing_notes: billingNotes || null,
      material_notes: materialNotes || null,
      notes: notes || null,
      is_active: isActive,
    };
    const { error } = isEdit
      ? await supabase.from("centers").update(payload).eq("id", id!)
      : await supabase.from("centers").insert({ ...payload, user_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Centro actualizado correctamente" : "Centro creado");
    invalidate();
    navigate("/pacientes");
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm("¿Eliminar este centro?")) return;
    setBusy(true);
    const { error } = await supabase.from("centers").delete().eq("id", id!);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Centro eliminado");
    invalidate();
    navigate("/pacientes");
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild><Link to="/pacientes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="flex-1 text-2xl font-bold">{isEdit ? "Editar centro" : "Nuevo centro"}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="addr">Dirección</Label>
            <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp">Código postal</Label>
              <Input id="cp" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact">Contacto</Label>
              <Input id="contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sch">Horario habitual</Label>
              <Input id="sch" value={usualSchedule} onChange={(e) => setUsualSchedule(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="freq">Frecuencia</Label>
              <Input id="freq" value={visitFrequency} onChange={(e) => setVisitFrequency(e.target.value)} placeholder="Mensual…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="price">Precio/paciente</Label>
              <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : +e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm">Forma de cobro</Label>
              <Input id="pm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Transferencia…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bn">Notas de facturación</Label>
            <Textarea id="bn" rows={2} value={billingNotes} onChange={(e) => setBillingNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mn">Notas de material</Label>
            <Textarea id="mn" rows={2} value={materialNotes} onChange={(e) => setMaterialNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas generales</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isEdit ? "Guardar cambios" : "Guardar centro"}
      </Button>
      {isEdit && (
        <Button variant="destructive" className="w-full" onClick={handleDelete} disabled={busy}>
          <Trash2 className="h-4 w-4" /> Eliminar centro
        </Button>
      )}
    </div>
  );
}
