// ============================================================
// Tipos compartidos para los datos extraídos por voz vía la
// edge function `interpret-voice`. Coinciden con el JSON Schema
// usado en la herramienta `extract_voice_data`.
// ============================================================

export type VoiceIntent =
  | "centro"
  | "paciente"
  | "visita"
  | "material"
  | "tratamiento"
  | "cobro"
  | "desconocido";

export interface VoiceCenter {
  name?: string;
  type?: "residencia" | "centro_dia" | "domicilio" | "";
  address?: string;
  city?: string;
  contactName?: string;
  contactPhone?: string;
  defaultPricePerPatient?: number;
  notes?: string;
}

export interface VoicePatient {
  fullName?: string;
  centerName?: string;
  usualTreatment?: string;
  defaultPrice?: number;
  nextVisitDate?: string;
  warnings?: string;
  notes?: string;
}

export interface VoiceVisit {
  date?: string;
  startTime?: string;
  endTime?: string;
  centerName?: string;
  patientNames?: string[];
  pricePerPatient?: number;
  travelCost?: number;
  materialCost?: number;
  notes?: string;
}

export interface VoiceMaterial {
  name?: string;
  currentStock?: number;
  minimumStock?: number;
  category?: string;
  unit?: string;
  unitCost?: number;
}

export interface VoiceTreatment {
  patientName?: string;
  treatmentDone?: string;
  notes?: string;
  amountCharged?: number;
  paymentStatus?: "cobrado" | "pendiente" | "";
}

export interface VoicePayment {
  target?: string;
  newStatus?: "cobrada" | "pendiente" | "facturada" | "";
  when?: string;
}

export interface VoiceInterpretation {
  intent: VoiceIntent;
  confidence: number;
  center?: VoiceCenter;
  patient?: VoicePatient;
  visit?: VoiceVisit;
  material?: VoiceMaterial;
  treatment?: VoiceTreatment;
  payment?: VoicePayment;
}
