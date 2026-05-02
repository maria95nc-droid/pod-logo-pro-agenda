import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { MicButton } from "@/components/voice/MicButton";
import { consumeVoicePrefill } from "@/components/voice/FloatingVoiceButton";
import type { CenterType } from "@/types";

const TYPE_MAP: Record<string, CenterType> = {
  residencia: "Residencia",
  centro_dia: "Centro de día",
  domicilio: "Domicilio",
};

export default function NewCenter() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<CenterType>("Residencia");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  // Pre-rellenar desde el botón flotante de voz
  useEffect(() => {
    const pre = consumeVoicePrefill();
    if (pre?.intent === "centro" && pre.center) applyVoice(pre.center);
  }, []);

  const applyVoice = (c: NonNullable<ReturnType<typeof consumeVoicePrefill>>["center"]) => {
    if (!c) return;
    if (c.name) setName(c.name);
    if (c.type && TYPE_MAP[c.type]) setType(TYPE_MAP[c.type]);
    if (c.address) setAddress(c.address);
    if (c.city) setCity(c.city);
    if (c.contactName) setContactPerson(c.contactName);
    if (c.contactPhone) setContactPhone(c.contactPhone);
    if (typeof c.defaultPricePerPatient === "number") setPrice(c.defaultPricePerPatient);
    if (c.notes) setNotes(c.notes);
    toast.success("Datos rellenados desde el dictado");
  };

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild>
          <Link to="/pacientes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">Nuevo centro</h1>
        <MicButton
          hintIntent="centro"
          title="Dictar centro"
          exampleHint='Ej.: "Añadir residencia Los Olivos en Calle Mayor 25, contacto Marta, teléfono 600123123, precio por paciente 35 euros."'
          onConfirm={(d) => applyVoice(d.center)}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as CenterType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Residencia">Residencia</SelectItem>
                <SelectItem value="Centro de día">Centro de día</SelectItem>
                <SelectItem value="Domicilio">Domicilio</SelectItem>
                <SelectItem value="Clínica propia">Clínica propia</SelectItem>
                <SelectItem value="Otro">Otro</SelectItem>
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
              <Input
                id="price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : +e.target.value)}
              />
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

      <Button
        className="w-full"
        size="lg"
        onClick={() => {
          if (!name.trim()) return toast.error("Falta el nombre del centro");
          toast.success("Centro creado");
          navigate("/pacientes");
        }}
      >
        <Save className="h-4 w-4" /> Guardar centro
      </Button>
    </div>
  );
}
