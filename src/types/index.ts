export type CenterType = "Residencia" | "Centro de día" | "Domicilio" | "Clínica propia" | "Otro";

export type VisitStatus =
  | "Programada"
  | "Realizada"
  | "Cancelada"
  | "Pendiente de cobro"
  | "Cobrada"
  | "Facturada";

export type PaymentStatus = "Pendiente" | "Cobrado" | "Incluido en factura" | "No cobra" | "Revisar";

export type VatMode = "Exento" | "Con IVA" | "Configurable";

export interface Center {
  id: string;
  name: string;
  type: CenterType;
  address?: string;
  city?: string;
  contactPerson?: string;
  contactPhone?: string;
  defaultPricePerPatient?: number;
  usualSchedule?: string;
  notes?: string;
  isActive: boolean;
}

export interface Patient {
  id: string;
  centerId: string;
  fullName: string;
  phone?: string;
  birthDate?: string;
  patientCode?: string;
  usualTreatment?: string;
  clinicalNotes?: string;
  allergies?: string;
  importantWarnings?: string;
  defaultPrice?: number;
  lastVisitDate?: string;
  nextVisitDate?: string;
  isActive: boolean;
}

export interface VisitPatient {
  id: string;
  visitId: string;
  patientId: string;
  treatmentDone?: string;
  treatmentNotes?: string;
  priceCharged: number;
  paymentStatus: PaymentStatus;
  attended: boolean;
}

export interface Visit {
  id: string;
  centerId: string;
  visitDate: string; // ISO yyyy-mm-dd
  startTime: string; // HH:mm
  endTime: string;
  status: VisitStatus;
  grossAmount: number;
  irpfPercentage: number;
  vatMode: VatMode;
  vatPercentage: number;
  travelCost: number;
  materialCost: number;
  otherExpenses: number;
  estimatedNetAmount: number;
  patientsCount: number;
  generalNotes?: string;
  materialNotes?: string;
  patients: VisitPatient[];
}

export interface Material {
  id: string;
  name: string;
  category:
    | "Corte"
    | "Fresado"
    | "Protección"
    | "Cura"
    | "Higiene"
    | "Cremas"
    | "Instrumental"
    | "Consumibles"
    | "Documentación"
    | "Otros";
  currentStock: number;
  minimumStock: number;
  unit: string;
  estimatedUnitCost?: number;
  isEssential: boolean;
  notes?: string;
}

export interface FiscalSettings {
  defaultIrpfPercentage: number;
  defaultVatMode: VatMode;
  monthlySelfEmployedFee: number;
  monthlyFixedExpenses: number;
  defaultTravelCost: number;
  applyTravelPerVisit: boolean;
  applySelfEmployedFee: boolean;
  feeDistributionMethod: "por_dia" | "por_visita" | "por_ingreso";
}
