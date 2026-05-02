// ============================================================
// Parser local SIN IA. Detecta intenciones básicas a partir
// de un texto dictado en español usando reglas simples.
// Devuelve la misma forma `VoiceInterpretation` que el endpoint
// `interpret-voice`, para que el resto de la app no cambie.
// ============================================================
import type { VoiceInterpretation, VoiceIntent } from "@/types/voice";

const NUM_WORDS: Record<string, number> = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  veintidós: 22, veintitres: 23, veintitrés: 23, veinticuatro: 24,
  veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
};

function wordsToNumber(text: string): number | null {
  const t = text.toLowerCase().trim();
  if (/^\d+([.,]\d+)?$/.test(t)) return parseFloat(t.replace(",", "."));
  // Compuestos del tipo "treinta y cinco"
  const parts = t.split(/\s+y\s+|\s+/);
  let total = 0;
  let any = false;
  for (const p of parts) {
    if (p in NUM_WORDS) {
      total += NUM_WORDS[p];
      any = true;
    } else if (/^\d+$/.test(p)) {
      total += parseInt(p, 10);
      any = true;
    }
  }
  return any ? total : null;
}

function extractEuros(text: string): number | undefined {
  // "35 euros", "35€", "treinta y cinco euros"
  const m1 = text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os?)?)/i);
  if (m1) return parseFloat(m1[1].replace(",", "."));
  const m2 = text.match(/((?:\w+\s+){0,4}?\w+)\s+euros?/i);
  if (m2) {
    const n = wordsToNumber(m2[1]);
    if (n !== null) return n;
  }
  return undefined;
}

function extractTime(text: string): string | undefined {
  // "9:30", "9 y media", "a las 10"
  const m1 = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (m1) {
    const h = parseInt(m1[1], 10);
    const min = m1[2];
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  const m2 = text.match(/a\s+las?\s+(\d{1,2})(?:\s+y\s+(media|cuarto|treinta|quince))?/i);
  if (m2) {
    const h = parseInt(m2[1], 10);
    const mod = (m2[2] || "").toLowerCase();
    let min = "00";
    if (mod === "media" || mod === "treinta") min = "30";
    else if (mod === "cuarto" || mod === "quince") min = "15";
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const t = text.toLowerCase();
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (/\bhoy\b/.test(t)) return fmt(today);
  if (/\bmañana\b/.test(t)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return fmt(d);
  }
  if (/\bpasado\s+mañana\b/.test(t)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return fmt(d);
  }
  const days = ["domingo", "lunes", "martes", "miércoles", "miercoles", "jueves", "viernes", "sábado", "sabado"];
  const dayIdx = [0, 1, 2, 3, 3, 4, 5, 6, 6];
  for (let i = 0; i < days.length; i++) {
    if (new RegExp(`\\b${days[i]}\\b`).test(t)) {
      const target = dayIdx[i];
      const d = new Date(today);
      const diff = (target - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return fmt(d);
    }
  }
  return undefined;
}

function detectIntent(text: string): VoiceIntent {
  const t = text.toLowerCase();
  if (/\bmarcar\b.*(cobrad|pagad)/.test(t) || /\bcobrad[ao]\b/.test(t)) return "cobro";
  if (/\bfacturad[ao]\b/.test(t)) return "cobro";
  if (/\bgasto\b/.test(t)) return "material"; // tratado como entrada de coste
  if (/(añadir|agregar|nuevo|nueva|crear)\s+(material|guantes|gasas|alcohol|stock)/.test(t)) return "material";
  if (/\bmaterial\b/.test(t) && /(stock|mínim|minim|unidad)/.test(t)) return "material";
  if (/(añadir|agregar|nueva|crear)\s+visita/.test(t) || /\bvisita\s+(de|para|el|mañana|hoy)\b/.test(t)) return "visita";
  if (/(añadir|agregar|nuevo|crear)\s+paciente/.test(t)) return "paciente";
  if (/(añadir|agregar|nueva|crear)\s+(residencia|centro|domicilio)/.test(t)) return "centro";
  if (/(tratamiento|nota)\b/.test(t)) return "tratamiento";
  return "desconocido";
}

function afterKeyword(text: string, keywords: string[]): string | undefined {
  for (const k of keywords) {
    const re = new RegExp(`${k}\\s+(.+)`, "i");
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return undefined;
}

function extractName(text: string, keyword: RegExp): string | undefined {
  const m = text.match(keyword);
  if (!m) return undefined;
  // Coger 2-5 palabras siguientes hasta una coma o punto o conector
  const rest = text.slice(m.index! + m[0].length).trim();
  const m2 = rest.match(/^([A-ZÁÉÍÓÚÑa-záéíóúñ' -]{2,80}?)(?=[,.;]| en | con | precio | stock | mínimo | tel| teléfono|$)/);
  if (m2) return m2[1].trim();
  return rest.split(/[,.;]/)[0].trim() || undefined;
}

function extractCenterName(text: string): string | undefined {
  const m = text.match(/\b(?:en|de|del|la|el)\s+(?:residencia|centro\s+de\s+día|centro|domicilio)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ' -]{1,60})/i);
  if (m) return m[1].trim();
  const m2 = text.match(/\b(?:residencia|centro\s+de\s+día|centro|domicilio)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ' -]{1,60})/i);
  if (m2) return m2[1].trim();
  return undefined;
}

function extractCenterType(text: string): "residencia" | "centro_dia" | "domicilio" | undefined {
  const t = text.toLowerCase();
  if (/centro\s+de\s+día|centro\s+de\s+dia/.test(t)) return "centro_dia";
  if (/residencia/.test(t)) return "residencia";
  if (/domicilio/.test(t)) return "domicilio";
  return undefined;
}

function extractInt(text: string, label: RegExp): number | undefined {
  const m = text.match(label);
  if (!m) return undefined;
  const n = wordsToNumber(m[1]);
  return n ?? undefined;
}

/**
 * Punto de entrada: dado un texto dictado, devuelve una interpretación
 * estructurada usando solo reglas locales. Sin llamadas externas.
 */
export function parseVoiceLocal(text: string): VoiceInterpretation {
  const intent = detectIntent(text);
  const interp: VoiceInterpretation = { intent, confidence: 0.5 };

  switch (intent) {
    case "centro": {
      const name =
        extractName(text, /(?:residencia|centro\s+de\s+día|centro|domicilio)\s+/i) ??
        afterKeyword(text, ["añadir", "agregar", "crear", "nueva", "nuevo"]);
      interp.center = {
        name: name?.replace(/^(residencia|centro\s+de\s+día|centro|domicilio)\s+/i, "").trim(),
        type: extractCenterType(text) ?? "",
        defaultPricePerPatient: extractEuros(text),
        address: (text.match(/\b(?:calle|c\/|avenida|av\.|plaza)\s+([^,.]+)/i)?.[0] || "").trim() || undefined,
      };
      break;
    }
    case "paciente": {
      const name = extractName(text, /paciente\s+/i);
      interp.patient = {
        fullName: name,
        centerName: extractCenterName(text),
        defaultPrice: extractEuros(text),
      };
      break;
    }
    case "visita": {
      const numPatM = text.match(/con\s+(\d+|\w+)\s+pacientes?/i);
      const numPat = numPatM ? wordsToNumber(numPatM[1]) ?? undefined : undefined;
      interp.visit = {
        date: extractDate(text),
        startTime: extractTime(text),
        centerName: extractCenterName(text),
        pricePerPatient: extractEuros(text),
        patientNames: numPat ? Array(numPat).fill("Paciente") : [],
      };
      break;
    }
    case "material": {
      // Detectar gasto vs material
      if (/\bgasto\b/.test(text.toLowerCase())) {
        interp.material = {
          name: (text.match(/gasto\s+(?:de\s+)?([^,.\d]+)/i)?.[1] || "Gasto").trim(),
          unitCost: extractEuros(text),
          unit: "ud",
        };
      } else {
        const name = afterKeyword(text, ["material", "añadir", "agregar", "crear"]);
        interp.material = {
          name: name?.split(/,|\bstock\b|\bmínim/i)[0].trim(),
          currentStock: extractInt(text, /stock\s+(?:de\s+)?(\d+|\w+)/i),
          minimumStock: extractInt(text, /m[íi]nim[oa]\s+(?:de\s+)?(\d+|\w+)/i),
          unitCost: extractEuros(text),
        };
      }
      break;
    }
    case "tratamiento": {
      interp.treatment = {
        patientName: extractName(text, /paciente\s+/i),
        treatmentDone: afterKeyword(text, ["tratamiento", "nota"]),
        amountCharged: extractEuros(text),
      };
      break;
    }
    case "cobro": {
      const target =
        extractCenterName(text) ??
        extractName(text, /(?:visita|paciente)\s+(?:de\s+)?/i) ??
        (text.match(/visita\s+de\s+(hoy|mañana|ayer)/i)?.[1]);
      const newStatus: "cobrada" | "facturada" | "pendiente" | "" =
        /facturad[ao]/i.test(text) ? "facturada" : /pendien/i.test(text) ? "pendiente" : "cobrada";
      interp.payment = { target, newStatus };
      break;
    }
  }

  return interp;
}
