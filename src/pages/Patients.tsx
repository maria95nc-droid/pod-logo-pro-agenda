import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { patients, centers } from "@/data/mock";
import { Plus, Search, Phone, MapPin, AlertTriangle, Building2 } from "lucide-react";
import { MicButton } from "@/components/voice/MicButton";
import { setVoicePrefill } from "@/components/voice/FloatingVoiceButton";

export default function Patients() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const filtered = patients.filter((p) => p.fullName.toLowerCase().includes(query.toLowerCase()));
  const activeCenters = centers.filter((c) => c.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Pacientes y centros</h1>
        <MicButton
          hintIntent="paciente"
          title="Dictar paciente o centro"
          exampleHint='Ej.: "Añadir paciente María García en Los Olivos…" o "Añadir residencia Los Pinos en…"'
          onConfirm={(d) => {
            setVoicePrefill(d);
            navigate(d.intent === "centro" ? "/centros/nuevo" : "/pacientes/nuevo");
          }}
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

          <div className="space-y-2">
            {filtered.map((p) => {
              const c = centers.find((x) => x.id === p.centerId);
              return (
                <Link key={p.id} to={`/pacientes/${p.id}`}>
                  <Card className="shadow-card transition-smooth hover:shadow-elevated">
                    <CardContent className="flex items-center gap-3 p-3.5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                        {p.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold">{p.fullName}</p>
                          {p.importantWarnings && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-status-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
                              <AlertTriangle className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{c?.name} · {p.usualTreatment}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-semibold text-primary">{p.defaultPrice}€</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="centros" className="space-y-3">
          <div className="flex justify-end">
            <Button asChild><Link to="/centros/nuevo"><Plus className="h-4 w-4" /> Nuevo centro</Link></Button>
          </div>
          <div className="space-y-2">
            {activeCenters.map((c) => {
              const count = patients.filter((p) => p.centerId === c.id).length;
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
                          {c.address && <p className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.address}, {c.city}</p>}
                          {c.contactPhone && <p className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.contactPhone}</p>}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-semibold">{count}</p>
                        <p className="text-muted-foreground">pac.</p>
                        {c.defaultPricePerPatient && <p className="mt-1 font-semibold text-primary">{c.defaultPricePerPatient}€</p>}
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
