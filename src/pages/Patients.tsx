import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, Phone, MapPin, AlertTriangle, Building2, Pencil, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MicButton } from "@/components/voice/MicButton";
import { useCenters, usePatients, useInvalidateAll, useKnownCenters } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function Patients() {
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const { data: patients = [] } = usePatients();
  const { data: centers = [] } = useCenters();
  const { data: knownCenters = [] } = useKnownCenters();

  const filtered = patients.filter((p) => p.full_name.toLowerCase().includes(query.toLowerCase()));
  const activeCenters = centers.filter((c) => c.is_active);

  const pendingKnownCenters = knownCenters.filter(
    (kc) => !centers.some((c) => c.name.trim().toLowerCase() === kc.name.trim().toLowerCase()),
  );

  const handleImportKnownCenters = async () => {
    if (!user || pendingKnownCenters.length === 0) return;
    setImporting(true);
    const rows = pendingKnownCenters.map((kc) => ({
      user_id: user.id,
      name: kc.name,
      type: kc.type,
      default_price_per_patient: kc.defaultPricePerPatient ?? null,
      visit_frequency: kc.visitFrequency ?? null,
      payment_method: kc.paymentMethod ?? null,
      billing_notes: kc.billingNotes ?? null,
      material_notes: kc.materialNotes ?? null,
      notes: kc.notes ?? null,
      is_active: true,
    }));
    const { error } = await supabase.from("centers").insert(rows);
    setImporting(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} residencia${rows.length === 1 ? "" : "s"} importada${rows.length === 1 ? "" : "s"}`);
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Pacientes y centros</h1>
        <MicButton
          hintIntent="paciente"
          title="Dictar paciente o centro"
          exampleHint='Ej.: "Añadir paciente María García en Los Olivos…" o "Añadir residencia Los Pinos en…"'
        />
      </div>

      <Tabs defaultValue="pacientes">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pacientes">Pacientes ({patients.length})</TabsTrigger>
          <TabsTrigger value="centros">Centros ({activeCenters.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pacientes" className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar paciente…" className="pl-9" />
            </div>
            <Button asChild><Link to="/pacientes/nuevo"><Plus className="h-4 w-4" /></Link></Button>
          </div>

          {filtered.length === 0 && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Aún no hay pacientes. Crea uno o díctalo por voz.</CardContent></Card>
          )}

          <div className="space-y-2">
            {filtered.map((p) => {
              const c = centers.find((x) => x.id === p.center_id);
              return (
              <Card key={p.id} className="shadow-card transition-smooth hover:shadow-elevated">
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                      {p.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold">{p.full_name}</p>
                        {p.important_warnings && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-status-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
                            <AlertTriangle className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c?.name ?? "Sin centro"} · {p.usual_treatment ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {p.default_price && <span className="text-xs font-semibold text-primary">{p.default_price}€</span>}
                      <Button asChild size="icon" variant="ghost" aria-label="Editar paciente">
                        <Link to={`/pacientes/${p.id}/editar`}><Pencil className="h-4 w-4" /></Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="centros" className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            {pendingKnownCenters.length > 0 && (
              <Button variant="outline" onClick={handleImportKnownCenters} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Importar mis residencias ({pendingKnownCenters.length})
              </Button>
            )}
            <Button asChild><Link to="/centros/nuevo"><Plus className="h-4 w-4" /> Nuevo centro</Link></Button>
          </div>
          {activeCenters.length === 0 && (
            <Card>
              <CardContent className="space-y-2 p-6 text-center text-sm text-muted-foreground">
                <p>Aún no hay centros. Añade uno o díctalo por voz.</p>
                {pendingKnownCenters.length > 0 && (
                  <p>O pulsa "Importar mis residencias" para cargar de golpe las {pendingKnownCenters.length} residencias que ya atiendes habitualmente.</p>
                )}
              </CardContent>
            </Card>
          )}
          <div className="space-y-2">
            {activeCenters.map((c) => {
              const count = patients.filter((p) => p.center_id === c.id).length;
              return (
              <Card key={c.id} className="shadow-card transition-smooth hover:shadow-elevated">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                          <Building2 className="h-3 w-3" />{c.type}
                        </div>
                        <p className="font-semibold">{c.name}</p>
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {c.address && <p className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.address}{c.city ? `, ${c.city}` : ""}</p>}
                          {c.contact_phone && <p className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.contact_phone}</p>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs">
                        <p className="font-semibold">{count} pac.</p>
                        {c.default_price_per_patient && <p className="font-semibold text-primary">{c.default_price_per_patient}€</p>}
                        <Button asChild size="icon" variant="ghost" aria-label="Editar centro">
                          <Link to={`/centros/${c.id}/editar`}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
