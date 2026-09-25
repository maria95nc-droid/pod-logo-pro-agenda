import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { attendedPatientsCount, type PaymentVisit } from "@/lib/payments";
import { frequencyLabel, normalizeFrequencyWeeks } from "@/lib/visitReminders";
import type { UserSettings } from "@/hooks/useData";

/**
 * Cada cuánto se visita un centro, para las exportaciones.
 *
 * Manda la columna numérica `visit_frequency_weeks`, que es la que se edita y
 * la que usan los avisos; `visit_frequency` es la nota de texto antigua, que ya
 * no se puede cambiar desde el formulario y sólo se usa si no hay número.
 */
function centerFrequencyText(center: any): string {
  const weeks = normalizeFrequencyWeeks(center?.visit_frequency_weeks);
  if (weeks !== null) return frequencyLabel(weeks);
  return center?.visit_frequency || "";
}

export interface ExportFilters {
  from?: string; // yyyy-mm-dd
  to?: string;
  centerId?: string;
  patientId?: string;
  status?: string; // visit status
}

export interface ExportData {
  centers: any[];
  patients: any[];
  visits: any[]; // with visit_patients & visit_materials
  materials: any[];
  expenses: any[];
  settings: UserSettings;
  periodLabel: string;
}

const fmtDateES = (s?: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const num = (n: any) => Number(n || 0);
const eur = (n: number) => Math.round(n * 100) / 100;

export async function fetchExportData(filters: ExportFilters, settings: UserSettings): Promise<ExportData> {
  const [centersR, patientsR, visitsR, materialsR, expensesR] = await Promise.all([
    supabase.from("centers").select("*").order("name"),
    supabase.from("patients").select("*").order("full_name"),
    supabase.from("visits").select("*, visit_patients(*), visit_materials(*)").order("visit_date"),
    supabase.from("materials").select("*").order("name"),
    supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
  ]);
  if (centersR.error) throw centersR.error;
  if (patientsR.error) throw patientsR.error;
  if (visitsR.error) throw visitsR.error;
  if (materialsR.error) throw materialsR.error;
  if (expensesR.error) throw expensesR.error;

  let visits = visitsR.data ?? [];
  let expenses = expensesR.data ?? [];
  if (filters.from) {
    visits = visits.filter((v) => v.visit_date >= filters.from!);
    expenses = expenses.filter((e) => e.expense_date >= filters.from!);
  }
  if (filters.to) {
    visits = visits.filter((v) => v.visit_date <= filters.to!);
    expenses = expenses.filter((e) => e.expense_date <= filters.to!);
  }
  if (filters.centerId) visits = visits.filter((v) => v.center_id === filters.centerId);
  if (filters.status) visits = visits.filter((v) => v.status === filters.status);
  if (filters.patientId) {
    visits = visits.filter((v) =>
      ((v as any).visit_patients ?? []).some((vp: any) => vp.patient_id === filters.patientId),
    );
  }

  const periodLabel =
    filters.from && filters.to
      ? `${fmtDateES(filters.from)} - ${fmtDateES(filters.to)}`
      : filters.from
        ? `Desde ${fmtDateES(filters.from)}`
        : filters.to
          ? `Hasta ${fmtDateES(filters.to)}`
          : "Todos los registros";

  return {
    centers: centersR.data ?? [],
    patients: patientsR.data ?? [],
    visits,
    materials: materialsR.data ?? [],
    expenses,
    settings,
    periodLabel,
  };
}

function computeSummary(d: ExportData) {
  let gross = 0, paid = 0, pending = 0, invoiced = 0;
  let patientsAttended = 0;
  for (const v of d.visits) {
    const vps = (v as any).visit_patients ?? [];
    if (vps.length === 0) {
      gross += num(v.gross_amount);
      if (v.status === "Cobrada") paid += num(v.gross_amount);
      else if (v.status === "Facturada") invoiced += num(v.gross_amount);
      else pending += num(v.gross_amount);
    } else {
      for (const vp of vps) {
        const p = num(vp.price_charged);
        gross += p;
        if (vp.payment_status === "Cobrado") paid += p;
        else if (vp.payment_status === "Incluido en factura") invoiced += p;
        else pending += p;
      }
    }
    // Los registros rápidos guardan una sola fila agregada, así que contar
    // filas dejaría fuera a la mayoría de los pacientes de esa visita.
    patientsAttended += attendedPatientsCount(v as PaymentVisit);
  }
  const irpfPct = num(d.settings.default_irpf_percentage);
  const irpf = (gross * irpfPct) / 100;
  const travel = d.visits.reduce((s, v) => {
    const own = num(v.travel_cost);
    if (own > 0) return s + own;
    if (d.settings.apply_travel_per_visit) return s + num(d.settings.default_travel_cost);
    return s;
  }, 0);
  const material = d.visits.reduce((s, v) => s + num(v.material_cost), 0);
  const otherExpenses =
    d.visits.reduce((s, v) => s + num(v.other_expenses), 0) +
    d.expenses.reduce((s, e) => s + num(e.amount), 0);
  const fee = d.settings.apply_self_employed_fee ? num(d.settings.monthly_self_employed_fee) : 0;
  const fixed = num(d.settings.monthly_fixed_expenses);
  const net = gross - irpf - travel - material - otherExpenses - fee - fixed;
  const toInvoice = paid;
  return {
    gross: eur(gross), paid: eur(paid), pending: eur(pending), invoiced: eur(invoiced),
    irpfPct, irpf: eur(irpf), travel: eur(travel), material: eur(material),
    otherExpenses: eur(otherExpenses), fee: eur(fee), fixed: eur(fixed), net: eur(net),
    toInvoice: eur(toInvoice),
    visitsCount: d.visits.length, patientsAttended,
  };
}

function aoaToSheet(rows: any[][], colWidths?: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (colWidths) ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  // bold header row
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }
  return ws;
}

export function buildXlsx(d: ExportData): Blob {
  const s = computeSummary(d);
  const wb = XLSX.utils.book_new();
  const genDate = new Date().toLocaleString("es-ES");

  // Resumen
  const resumen = aoaToSheet(
    [
      ["Resumen", d.periodLabel],
      ["Generado", genDate],
      [],
      ["Periodo", "Bruto total", "Cobrado", "Pendiente de cobro", "Facturado", "Pendiente de facturar",
       "IRPF estimado", "Gastos desplazamiento", "Gastos material", "Otros gastos", "Neto estimado",
       "Nº visitas", "Nº pacientes atendidos"],
      [d.periodLabel, s.gross, s.paid, s.pending, s.invoiced, s.toInvoice, s.irpf, s.travel, s.material,
       s.otherExpenses, s.net, s.visitsCount, s.patientsAttended],
      [],
      ["Aviso: Los importes netos son estimaciones internas y no sustituyen la revisión de una gestoría."],
    ],
    [22, 14, 14, 18, 14, 20, 14, 18, 16, 14, 16, 12, 18],
  );
  XLSX.utils.book_append_sheet(wb, resumen, "Resumen");

  // Visitas
  const cMap = new Map(d.centers.map((c) => [c.id, c]));
  const pMap = new Map(d.patients.map((p) => [p.id, p]));
  const visitasRows: any[][] = [[
    "Fecha", "Hora inicio", "Hora fin", "Centro", "Tipo de centro", "Pacientes",
    "Nº pacientes", "Bruto", "IRPF %", "IRPF €", "Desplazamiento", "Material",
    "Otros gastos", "Neto estimado", "Estado visita", "Estado cobro", "Estado facturación", "Notas",
  ]];
  for (const v of d.visits) {
    const c = cMap.get(v.center_id);
    const vps = (v as any).visit_patients ?? [];
    const pacNames = vps.map((vp: any) => pMap.get(vp.patient_id)?.full_name || vp.patient_name || "—").join(", ");
    const bruto = vps.length
      ? vps.reduce((s: number, vp: any) => s + num(vp.price_charged), 0)
      : num(v.gross_amount);
    // Un 0 % es un dato real (visita que paga el paciente, sin retención): con
    // `||` caía al porcentaje global y el informe inventaba una retención.
    const ownIrpf = v.irpf_percentage;
    const irpfPct = ownIrpf === null || ownIrpf === undefined || ownIrpf === "" ? s.irpfPct : num(ownIrpf);
    const irpfE = (bruto * irpfPct) / 100;
    const travel = num(v.travel_cost);
    const mat = num(v.material_cost);
    const other = num(v.other_expenses);
    const neto = bruto - irpfE - travel - mat - other;
    const cobro = vps.length
      ? (vps.every((vp: any) => vp.payment_status === "Cobrado") ? "Cobrado"
         : vps.some((vp: any) => vp.payment_status === "Cobrado") ? "Parcial" : "Pendiente")
      : v.status;
    visitasRows.push([
      fmtDateES(v.visit_date), v.start_time || "", v.end_time || "",
      c?.name || "", c?.type || "", pacNames, vps.length || v.patients_count || 0,
      eur(bruto), irpfPct, eur(irpfE), eur(travel), eur(mat), eur(other), eur(neto),
      v.status, cobro, v.status === "Facturada" ? "Sí" : "No", v.general_notes || "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, aoaToSheet(visitasRows,
    [12,10,10,22,16,30,12,10,8,10,14,10,12,14,16,14,16,30]), "Visitas");

  // Pacientes
  const pacRows: any[][] = [[
    "Nombre completo", "Centro", "Teléfono", "Tratamiento habitual", "Precio habitual",
    "Última visita", "Próxima visita", "Estado de pago", "Notas importantes",
  ]];
  for (const p of d.patients) {
    const c = cMap.get(p.center_id);
    pacRows.push([
      p.full_name, c?.name || "", p.phone || "", p.usual_treatment || "",
      p.default_price != null ? eur(num(p.default_price)) : "",
      fmtDateES(p.last_visit_date), fmtDateES(p.next_visit_date),
      p.payment_status || "", p.important_warnings || "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, aoaToSheet(pacRows, [24,22,14,24,14,14,14,16,30]), "Pacientes");

  // Centros
  const cenRows: any[][] = [[
    "Nombre", "Tipo", "Dirección", "Ciudad", "Contacto", "Teléfono",
    "Precio por paciente", "Forma de cobro", "Frecuencia de visita", "Activo", "Notas",
  ]];
  for (const c of d.centers) {
    cenRows.push([
      c.name, c.type || "", c.address || "", c.city || "", c.contact_person || "",
      c.contact_phone || "", c.default_price_per_patient != null ? eur(num(c.default_price_per_patient)) : "",
      c.payment_method || "", centerFrequencyText(c), c.is_active ? "Sí" : "No", c.notes || "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, aoaToSheet(cenRows, [22,16,26,16,18,14,16,16,18,8,30]), "Centros");

  // Cobros
  const cobRows: any[][] = [["Fecha visita", "Fecha cobro", "Centro", "Paciente", "Importe", "Estado", "Facturado"]];
  for (const v of d.visits) {
    const c = cMap.get(v.center_id);
    const vps = (v as any).visit_patients ?? [];
    if (vps.length === 0) {
      cobRows.push([fmtDateES(v.visit_date), v.status === "Cobrada" ? fmtDateES(v.updated_at) : "",
        c?.name || "", "", eur(num(v.gross_amount)), v.status, v.status === "Facturada" ? "Sí" : "No"]);
    } else {
      for (const vp of vps) {
        const p = pMap.get(vp.patient_id);
        cobRows.push([
          fmtDateES(v.visit_date), fmtDateES(vp.paid_at), c?.name || "",
          p?.full_name || vp.patient_name || "", eur(num(vp.price_charged)),
          vp.payment_status, vp.payment_status === "Incluido en factura" ? "Sí" : "No",
        ]);
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, aoaToSheet(cobRows, [12,12,22,24,12,18,10]), "Cobros");

  // Gastos
  const visitMap = new Map(d.visits.map((v) => [v.id, v]));
  const gasRows: any[][] = [["Fecha", "Categoría", "Descripción", "Importe", "Visita relacionada"]];
  for (const e of d.expenses) {
    const v = e.visit_id ? visitMap.get(e.visit_id) : null;
    gasRows.push([fmtDateES(e.expense_date), e.category, e.description || "",
      eur(num(e.amount)), v ? `${fmtDateES(v.visit_date)} ${cMap.get(v.center_id)?.name || ""}` : ""]);
  }
  XLSX.utils.book_append_sheet(wb, aoaToSheet(gasRows, [12,16,30,12,28]), "Gastos");

  // Material
  const matRows: any[][] = [[
    "Material", "Categoría", "Stock actual", "Stock mínimo", "Unidad",
    "Coste estimado", "Estado stock", "Notas",
  ]];
  for (const m of d.materials) {
    const stockState = num(m.current_stock) <= num(m.minimum_stock) ? "Bajo mínimo" : "OK";
    matRows.push([m.name, m.category, num(m.current_stock), num(m.minimum_stock), m.unit,
      m.estimated_unit_cost != null ? eur(num(m.estimated_unit_cost)) : "", stockState, m.notes || ""]);
  }
  XLSX.utils.book_append_sheet(wb, aoaToSheet(matRows, [22,16,12,12,10,14,14,28]), "Material");

  // Historial Pacientes
  const histRows: any[][] = [[
    "Fecha", "Paciente", "Centro", "Tratamiento realizado", "Notas", "Precio", "Próxima recomendación",
  ]];
  for (const v of d.visits) {
    const c = cMap.get(v.center_id);
    const vps = (v as any).visit_patients ?? [];
    for (const vp of vps) {
      const p = pMap.get(vp.patient_id);
      histRows.push([fmtDateES(v.visit_date), p?.full_name || vp.patient_name || "", c?.name || "",
        vp.treatment_done || "", vp.treatment_notes || "", eur(num(vp.price_charged)),
        fmtDateES(p?.next_visit_date)]);
    }
  }
  XLSX.utils.book_append_sheet(wb, aoaToSheet(histRows, [12,24,22,24,28,10,16]), "Historial Pacientes");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename);
}

export function rowsToCsv(rows: any[][]): string {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(esc).join(";")).join("\n");
}

export function buildCsv(d: ExportData, kind: "visitas" | "pacientes" | "centros" | "finanzas" | "gastos" | "material"): Blob {
  const cMap = new Map(d.centers.map((c) => [c.id, c]));
  const pMap = new Map(d.patients.map((p) => [p.id, p]));
  let rows: any[][] = [];
  if (kind === "visitas") {
    rows = [["Fecha","Centro","Pacientes","Bruto","Estado"]];
    for (const v of d.visits) {
      const vps = (v as any).visit_patients ?? [];
      const bruto = vps.length ? vps.reduce((s: number, vp: any) => s + num(vp.price_charged), 0) : num(v.gross_amount);
      rows.push([fmtDateES(v.visit_date), cMap.get(v.center_id)?.name || "",
        vps.map((vp: any) => pMap.get(vp.patient_id)?.full_name || vp.patient_name || "").join(", "),
        eur(bruto), v.status]);
    }
  } else if (kind === "pacientes") {
    rows = [["Nombre","Centro","Teléfono","Tratamiento","Precio","Próxima visita"]];
    for (const p of d.patients) rows.push([p.full_name, cMap.get(p.center_id)?.name || "", p.phone || "",
      p.usual_treatment || "", p.default_price != null ? eur(num(p.default_price)) : "", fmtDateES(p.next_visit_date)]);
  } else if (kind === "centros") {
    rows = [["Nombre","Tipo","Ciudad","Contacto","Teléfono","Activo"]];
    for (const c of d.centers) rows.push([c.name, c.type, c.city || "", c.contact_person || "",
      c.contact_phone || "", c.is_active ? "Sí" : "No"]);
  } else if (kind === "finanzas") {
    const s = computeSummary(d);
    rows = [
      ["Periodo", d.periodLabel],
      ["Bruto", s.gross], ["Cobrado", s.paid], ["Pendiente", s.pending],
      ["IRPF", s.irpf], ["Desplazamientos", s.travel], ["Material", s.material],
      ["Otros gastos", s.otherExpenses], ["Cuota autónomo", s.fee], ["Gastos fijos", s.fixed],
      ["Neto estimado", s.net], ["Visitas", s.visitsCount], ["Pacientes atendidos", s.patientsAttended],
    ];
  } else if (kind === "gastos") {
    rows = [["Fecha","Categoría","Descripción","Importe"]];
    for (const e of d.expenses) rows.push([fmtDateES(e.expense_date), e.category, e.description || "", eur(num(e.amount))]);
  } else if (kind === "material") {
    rows = [["Material","Categoría","Stock","Mínimo","Unidad"]];
    for (const m of d.materials) rows.push([m.name, m.category, num(m.current_stock), num(m.minimum_stock), m.unit]);
  }
  const csv = "\uFEFF" + rowsToCsv(rows);
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

export function buildJson(d: ExportData): Blob {
  const payload = {
    generated_at: new Date().toISOString(),
    period: d.periodLabel,
    settings: d.settings,
    centers: d.centers,
    patients: d.patients,
    visits: d.visits,
    materials: d.materials,
    expenses: d.expenses,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

export function buildPdf(d: ExportData): Blob {
  const s = computeSummary(d);
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text("Resumen para gestoría", 14, 18);
  doc.setFontSize(10); doc.text(`Periodo: ${d.periodLabel}`, 14, 26);
  doc.text(`Generado: ${new Date().toLocaleString("es-ES")}`, 14, 32);

  autoTable(doc, {
    startY: 40,
    head: [["Concepto", "Importe (€)"]],
    body: [
      ["Bruto total", s.gross.toFixed(2)],
      ["Cobrado", s.paid.toFixed(2)],
      ["Pendiente de cobro", s.pending.toFixed(2)],
      [`IRPF estimado (${s.irpfPct}%)`, s.irpf.toFixed(2)],
      ["Gastos desplazamiento", s.travel.toFixed(2)],
      ["Gastos material", s.material.toFixed(2)],
      ["Otros gastos", s.otherExpenses.toFixed(2)],
      ["Cuota autónomo", s.fee.toFixed(2)],
      ["Gastos fijos", s.fixed.toFixed(2)],
      ["Neto estimado", s.net.toFixed(2)],
      ["Visitas realizadas", String(s.visitsCount)],
      ["Pacientes atendidos", String(s.patientsAttended)],
    ],
  });

  // Por centro
  const cMap = new Map(d.centers.map((c) => [c.id, c]));
  const byCenter = new Map<string, { name: string; bruto: number; visitas: number }>();
  for (const v of d.visits) {
    const id = v.center_id || "—";
    const name = cMap.get(v.center_id)?.name || "Sin centro";
    const vps = (v as any).visit_patients ?? [];
    const bruto = vps.length ? vps.reduce((s: number, vp: any) => s + num(vp.price_charged), 0) : num(v.gross_amount);
    const cur = byCenter.get(id) ?? { name, bruto: 0, visitas: 0 };
    cur.bruto += bruto; cur.visitas += 1;
    byCenter.set(id, cur);
  }
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Centro", "Visitas", "Bruto (€)"]],
    body: Array.from(byCenter.values()).map((c) => [c.name, String(c.visitas), c.bruto.toFixed(2)]),
  });

  doc.setFontSize(8);
  doc.text(
    "Los importes netos son estimaciones internas y no sustituyen la revisión de una gestoría.",
    14, (doc as any).lastAutoTable.finalY + 10,
  );
  return doc.output("blob");
}

export function fileBaseName(prefix: string, periodTag: string) {
  return `Agenda_Podologica_${prefix}_${periodTag}`;
}

export function periodTag(filters: ExportFilters): string {
  if (filters.from && filters.to) return `${filters.from}_a_${filters.to}`;
  if (filters.from) return `desde_${filters.from}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
