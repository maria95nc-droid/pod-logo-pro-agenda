import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInvalidateAll } from "@/hooks/useData";

export default function NewMaterial() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [stock, setStock] = useState<number | "">("");
  const [minStock, setMinStock] = useState<number | "">("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("ud");
  const [unitCost, setUnitCost] = useState<number | "">("");

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Falta el nombre del material");
    setBusy(true);
    const { error } = await supabase.from("materials").insert({
      user_id: user.id,
      name: name.trim(),
      category: category || "Otros",
      current_stock: stock === "" ? 0 : stock,
      minimum_stock: minStock === "" ? 0 : minStock,
      unit: unit || "ud",
      estimated_unit_cost: unitCost === "" ? null : unitCost,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Material añadido");
    invalidate();
    navigate("/material");
  };

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" asChild><Link to="/material"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="flex-1 text-2xl font-bold">Nuevo material</h1>
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

      <Button className="w-full" size="lg" onClick={handleSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar material
      </Button>
    </div>
  );
}
