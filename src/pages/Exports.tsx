import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, FileText, FileJson, Printer, FileDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  useCenters, usePatients, useUserSettings, defaultUserSettings,
} from "@/hooks/useData";
import {
  fetchExportData, buildXlsx, buildCsv, buildJson, buildPdf,
  downloadBlob, fileBaseName, periodTag, type ExportFilters,
} from "@/lib/exporters";

const STATUSES = ["Programada","Realizada","Pendiente de cobro","Cobrada","Facturada","Cancelada"];

function todayISO(d = new Date()) { return d.toISOString().slice(0, 10); }
function startOfMonth() { const d = new Date(); return todayISO(new Date(d.getFullYear(), d.getMonth(), 1)); }
function endOfMonth() { const d = new Date(); return todayISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function startOfYear() { return `${new Date().getFullYear()}-01-01`; }
function endOfYear() { return `${new Date().getFullYear()}-12-31`; }
function startOfWeek() {
  const d = new Date(); const day = (d.getDay() + 6) % 7;
  return todayISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - day));
}
function endOfWeek() {
  const d = new Date(); const day = (d.getDay() + 6) % 7;
  return todayISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 6));
}

export default function Exports() {
  const { data: centers = [] } = useCenters();
  const { data: patients = [] } = usePatients();
  const { data: settings = defaultUserSettings } = useUserSettings();

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(endOfMonth());
  const [centerId, setCenterId] = useState<string>("all");
  const [patientId, setPatientId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const filters: ExportFilters = useMemo(() => ({
    from: from || undefined,
    to: to || undefined,
    centerId: centerId !== "all" ? centerId : undefined,
    patientId: patientId !== "all" ? patientId : undefined,
    status: status !== "all" ? status : undefined,
  }), [from, to, centerId, patientId, status]);

  const tag = periodTag(filters);

  const run = async (kind: string) => {
    try {
      setBusy(kind);
      const data = await fetchExportData(filters, settings);
      if (kind === "xlsx") {
        downloadBlob(buildXlsx(data), `${fileBaseName("Completo", tag)}.xlsx`);
      } else if (kind === "pdf") {
        downloadBlob(buildPdf(data), `${fileBaseName("Gestoria", tag)}.pdf`);
      } else if (kind === "json") {
        downloadBlob(buildJson(data), `${fileBaseName("Backup", tag)}.json`);
      } else if (kind === "print") {
        const blob = buildPdf(data);
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        setTimeout(() => w?.print(), 600);
      } else if (kind.startsWith("csv:")) {
        const sub = kind.split(":")[1] as any;
        downloadBlob(buildCsv(data, sub), `${fileBaseName(sub, tag)}.csv`);
      }
      toast.success("Exportación completada");
    } catch (e: any) {
      toast.error(e?.message || "Error al exportar");
    } finally {
      setBusy(null);
    }
  };

  const setRange = (f: string, t: string) => { setFrom(f); setTo(t); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/finanzas"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Exportar datos</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold">Filtros</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setRange(startOfWeek(), endOfWeek())}>Semana</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(startOfMonth(), endOfMonth())}>Mes</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(startOfYear(), endOfYear())}>Año</Button>
            <Button size="sm" variant="outline" onClick={() => setRange("", "")}>Todo</Button>
          </div>

          <div>
            <Label>Centro</Label>
            <Select value={centerId} onValueChange={setCenterId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los centros</SelectItem>
                {centers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paciente</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los pacientes</SelectItem>
                {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado de visita</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">Exportaciones principales</p>
          <Button className="w-full justify-start" disabled={!!busy} onClick={() => run("xlsx")}>
            <FileSpreadsheet className="h-4 w-4" /> {busy === "xlsx" ? "Generando…" : "Exportar Excel completo (.xlsx)"}
          </Button>
          <Button variant="outline" className="w-full justify-start" disabled={!!busy} onClick={() => run("pdf")}>
            <FileText className="h-4 w-4" /> {busy === "pdf" ? "Generando…" : "Exportar PDF resumen (gestoría)"}
          </Button>
          <Button variant="outline" className="w-full justify-start" disabled={!!busy} onClick={() => run("json")}>
            <FileJson className="h-4 w-4" /> {busy === "json" ? "Generando…" : "Copia de seguridad (.json)"}
          </Button>
          <Button variant="outline" className="w-full justify-start" disabled={!!busy} onClick={() => run("print")}>
            <Printer className="h-4 w-4" /> Imprimir / Guardar como PDF
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">Exportaciones CSV</p>
          {[
            ["csv:visitas","Visitas"],["csv:pacientes","Pacientes"],["csv:centros","Centros"],
            ["csv:finanzas","Finanzas"],["csv:gastos","Gastos"],["csv:material","Material"],
          ].map(([k, label]) => (
            <Button key={k} variant="outline" className="w-full justify-start" disabled={!!busy} onClick={() => run(k)}>
              <FileDown className="h-4 w-4" /> {busy === k ? "Generando…" : `CSV - ${label}`}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-3.5 text-xs text-muted-foreground">
          Los importes netos son estimaciones internas y no sustituyen la revisión de una gestoría.
          Solo se exportan datos del usuario autenticado.
        </CardContent>
      </Card>
    </div>
  );
}
