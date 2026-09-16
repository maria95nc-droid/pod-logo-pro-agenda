// Centros/residencias que David ya atiende de forma habitual (datos reales de su cartera de clientes cerrada).
// Se usan solo como plantilla de importación inicial: el usuario puede editarlos o borrarlos después de importarlos.
export interface KnownCenter {
  name: string;
  type: "Residencia" | "Centro de día";
  defaultPricePerPatient?: number;
  visitFrequency?: string;
  paymentMethod?: string;
  billingNotes?: string;
  materialNotes?: string;
  notes?: string;
}

export const KNOWN_CENTERS: KnownCenter[] = [
  {
    name: "Argüelles",
    type: "Residencia",
    defaultPricePerPatient: 14,
    notes: "Cartera habitual desde junio.",
  },
  {
    name: "Trubia",
    type: "Residencia",
    defaultPricePerPatient: 14,
    notes: "Cartera habitual desde julio.",
  },
  {
    name: "Oviedo",
    type: "Residencia",
    defaultPricePerPatient: 14,
    notes: "Cartera habitual desde julio/agosto.",
  },
  {
    name: "Amar",
    type: "Residencia",
    defaultPricePerPatient: 18,
    notes: "Cartera habitual desde junio.",
  },
  {
    name: "Residencia Ave María",
    type: "Residencia",
    defaultPricePerPatient: 15,
    notes: "Hasta 130 pacientes (unos 40 al mes). Cartera habitual desde junio.",
  },
  {
    name: "Santo Ángel",
    type: "Residencia",
    defaultPricePerPatient: 25,
    paymentMethod: "Facturación directa a familias",
    billingNotes: "Se factura directamente a los padres/familias del residente, no al centro.",
  },
  {
    name: "Centro de Día Avilés",
    type: "Centro de día",
    defaultPricePerPatient: 15,
    visitFrequency: "Mañana y tarde",
    billingNotes: "Son 3 centros distintos; se factura con fecha del mes siguiente a la visita (visita en mayo se factura en junio).",
  },
  {
    name: "Residencia La Fresneda",
    type: "Residencia",
    defaultPricePerPatient: 15,
    notes: "Cartera habitual desde junio (alta como autónomo).",
  },
  {
    name: "Pravia",
    type: "Residencia",
    paymentMethod: "A través de empresa gestora (Eulen)",
    visitFrequency: "3 veces al mes",
    materialNotes: "El material lo pone el centro.",
  },
  {
    name: "Santa Bárbara",
    type: "Residencia",
    paymentMethod: "A través de empresa gestora (Eulen)",
    visitFrequency: "2 veces al mes",
    materialNotes: "El material lo pone el centro.",
  },
  {
    name: "Grao",
    type: "Residencia",
    paymentMethod: "A través de empresa gestora (Eulen)",
    visitFrequency: "2 veces al mes",
    materialNotes: "El material lo pone el centro.",
  },
  {
    name: "Lugones",
    type: "Residencia",
    paymentMethod: "A través de empresa gestora (Eulen)",
    visitFrequency: "2 veces al mes",
    materialNotes: "El material lo pone el centro.",
    notes: "Cartera habitual desde diciembre.",
  },
];
