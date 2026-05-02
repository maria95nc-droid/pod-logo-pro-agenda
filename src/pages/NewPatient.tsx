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
import { centers } from "@/data/mock";

export default function NewPatient() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [centerId, setCenterId] = useState("");
  const [usualTreatment, setUsualTreatment] = useState("");
  const [defaultPrice, setDefaultPrice] = useState<number | "">("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [warnings, setWarnings] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const pre = consumeVoicePrefill();
    if (pre?.intent === "paciente" && pre.patient) applyVoice(pre.patient);
  }, []);

  const applyVoice = (p: NonNullable<ReturnType<typeof consumeVoicePrefill>>["patient"]) => {
    if (!p) return;
    if (p.fullName) setFullName(p.fullName);
    if (p.centerName) {
      const found = centers.find((c) =>
        c.name.toLowerCase().includes(p.centerName!.toLowerCase()),
      );
      if (found) setCenterId(found.id);
    }
    if (p.usualTreatment) setUsualTreatment(p.usualTreatment);
    if (typeof p.defaultPrice === "number") setDefaultPrice(p.defaultPrice);
    if (p.nextVisitDate) setNextVisitDate(p.nextVisitDate);
    if (p.warnings) setWarnings(p.warnings);
    if (p.notes) setNotes(p.notes);
    toast.success("Datos rellenados desde el dictado");
  };

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild>
          <Link to="/pacientes"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">Nuevo paciente</h1>
        <MicButton
          hintIntent="paciente"
          title="Dictar paciente"
          exampleHint='Ej.: "Añadir paciente María García en Los Olivos, tratamiento corte de uñas y durezas, precio 35 euros, próxima visita el 15 de febrero."'
          onConfirm={(d) => applyVoice(d.patient)}
        />
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
                {centers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t">Tratamiento habitual</Label>
            <Input id="t" value={usualTreatment} onChange={(e) => setUsualTreatment(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="p">Precio</Label>
              <Input
                id="p"
                type="number"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value === "" ? "" : +e.target.value)}
              />
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
            <Label htmlFor="n">Notas</Label>
            <Textarea id="n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={() => {
          if (!fullName.trim()) return toast.error("Falta el nombre del paciente");
          toast.success("Paciente creado");
          navigate("/pacientes");
        }}
      >
        <Save className="h-4 w-4" /> Guardar paciente
      </Button>
    </div>
  );
}
