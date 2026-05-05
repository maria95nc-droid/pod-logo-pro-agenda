import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateAll } from "@/hooks/useData";

const TYPES = ["Residencia", "Centro de día", "Domicilio", "Clínica propia", "Otro"] as const;

export default function NewCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Residencia");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Falta el nombre del centro");
    setBusy(true);
    const { error } = await supabase.from("centers").insert({
      user_id: user.id,
      name: name.trim(),
      type,
      address: address || null,
      city: city || null,
      contact_person: contactPerson || null,
      contact_phone: contactPhone || null,
      default_price_per_patient: price === "" ? null : price,
      notes: notes || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Centro creado");
    invalidate();
    navigate("/pacientes");
  };

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild><Link to="/pacientes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="flex-1 text-2xl font-bold">Nuevo centro</h1>
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
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="addr">Dirección</Label>
              <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Precio/paciente</Label>
              <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : +e.target.value)} />
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
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar centro
      </Button>
    </div>
  );
}
