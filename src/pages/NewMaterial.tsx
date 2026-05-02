import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { MicButton } from "@/components/voice/MicButton";
import { consumeVoicePrefill } from "@/components/voice/FloatingVoiceButton";

export default function NewMaterial() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [stock, setStock] = useState<number | "">("");
  const [minStock, setMinStock] = useState<number | "">("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("ud");
  const [unitCost, setUnitCost] = useState<number | "">("");

  useEffect(() => {
    const pre = consumeVoicePrefill();
    if (pre?.intent === "material" && pre.material) applyVoice(pre.material);
  }, []);

  const applyVoice = (m: NonNullable<ReturnType<typeof consumeVoicePrefill>>["material"]) => {
    if (!m) return;
    if (m.name) setName(m.name);
    if (typeof m.currentStock === "number") setStock(m.currentStock);
    if (typeof m.minimumStock === "number") setMinStock(m.minimumStock);
    if (m.category) setCategory(m.category);
    if (m.unit) setUnit(m.unit);
    if (typeof m.unitCost === "number") setUnitCost(m.unitCost);
    toast.success("Datos rellenados desde el dictado");
  };

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild>
          <Link to="/material"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">Nuevo material</h1>
        <MicButton
          hintIntent="material"
          title="Dictar material"
          exampleHint='Ej.: "Añadir material guantes nitrilo, stock 50, mínimo 10, categoría protección."'
          onConfirm={(d) => applyVoice(d.material)}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="s">Stock actual</Label>
              <Input id="s" type="number" value={stock} onChange={(e) => setStock(e.target.value === "" ? "" : +e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms">Stock mínimo</Label>
              <Input id="ms" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value === "" ? "" : +e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat">Categoría</Label>
              <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u">Unidad</Label>
              <Input id="u" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="uc">Coste unitario (€)</Label>
              <Input id="uc" type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value === "" ? "" : +e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={() => {
          if (!name.trim()) return toast.error("Falta el nombre del material");
          toast.success("Material añadido");
          navigate("/material");
        }}
      >
        <Save className="h-4 w-4" /> Guardar material
      </Button>
    </div>
  );
}
