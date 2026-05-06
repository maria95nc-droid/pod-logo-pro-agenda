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
  veinticinco: 25, veintiseis: 26, veintiséis: 26, veintisiete: 27,
  veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
};

const SINGLE_DIGIT_WORDS: Record<string, string> = {
  cero: "0", uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4",
  cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

function wordsToNumber(text: string): number | null {
  const t = text.toLowerCase().trim();
  if (/^\d+([.,]\d+)?$/.test(t)) return parseFloat(t.replace(",", "."));
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
  const m1 = text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os?)?)/i);
  if (m1) return parseFloat(m1[1].replace(",", "."));
  // "por veinticinco euros" / "a treinta euros"
  const m2 = text.match(/\b(?:por|a|precio(?:\s+de)?)\s+((?:[\wáéíóúñ]+\s+){0,4}?[\wáéíóúñ]+)\s+euros?/i);
  if (m2) {
    const n = wordsToNumber(m2[1]);
    if (n !== null) return n;
  }
  return undefined;
}

function extractTime(text: string): string | undefined {
  const m1 = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (m1) {
    const h = parseInt(m1[1], 10);
    return `${String(h).padStart(2, "0")}:${m1[2]}`;
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
  // "a las nueve y media"
  const m3 = text.match(/a\s+las?\s+([\wáéíóú]+)(?:\s+y\s+(media|cuarto|treinta|quince))?/i);
  if (m3) {
    const h = NUM_WORDS[m3[1].toLowerCase()];
    if (typeof h === "number") {
      const mod = (m3[2] || "").toLowerCase();
      let min = "00";
      if (mod === "media" || mod === "treinta") min = "30";
      else if (mod === "cuarto" || mod === "quince") min = "15";
      return `${String(h).padStart(2, "0")}:${min}`;
    }
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const t = text.toLowerCase();
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (/\bhoy\b/.test(t)) return fmt(today);
  if (/\bpasado\s+mañana\b/.test(t)) {
    const d = new Date(today); d.setDate(d.getDate() + 2); return fmt(d);
  }
  if (/\bmañana\b/.test(t)) {
    const d = new Date(today); d.setDate(d.getDate() + 1); return fmt(d);
  }
  // "el 30 de mayo" / "30 de mayo de 2026"
  const m = t.match(/\b(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS[m[2]];
    if (mon) {
      let year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
      const candidate = new Date(year, mon - 1, day);
      if (!m[3] && candidate < new Date(today.toDateString())) {
        year += 1;
      }
      return fmt(new Date(year, mon - 1, day));
    }
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

function extractPhone(text: string): string | undefined {
  // Dígitos juntos
  const m = text.match(/(?:tel[eé]fono|m[oó]vil|n[uú]mero(?:\s+es)?)\s*[:\-]?\s*([\d\s]{6,})/i);
  if (m) {
    const digits = m[1].replace(/\D/g, "");
    if (digits.length >= 6) return digits;
  }
  // Dígitos dictados con palabras
  const m2 = text.match(/(?:tel[eé]fono|m[oó]vil|n[uú]mero(?:\s+es)?)\s+((?:(?:cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)[\s,.-]+){5,})((?:cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))/i);
  if (m2) {
    const seq = (m2[1] + m2[2]).toLowerCase().split(/[\s,.-]+/).filter(Boolean);
    const digits = seq.map((w) => SINGLE_DIGIT_WORDS[w] ?? "").join("");
    if (digits.length >= 6) return digits;
  }
  return undefined;
}

function detectIntent(text: string): VoiceIntent {
  const t = text.toLowerCase();
  if (/\bmarcar\b.*(cobrad|pagad)/.test(t) || /\bcobrad[ao]\b/.test(t)) return "cobro";
  if (/\bfacturad[ao]\b/.test(t)) return "cobro";
  if (/\bgasto\b/.test(t)) return "material";
  if (/(añadir|agregar|nuevo|nueva|crear|crea)\s+(material|guantes|gasas|alcohol|stock)/.test(t)) return "material";
  if (/\bmaterial\b/.test(t) && /(stock|mínim|minim|unidad)/.test(t)) return "material";
  if (/(añadir|agregar|nueva|crear|crea)\s+(?:una\s+)?visita/.test(t)) return "visita";
  // Paciente: cualquier mención clara
  if (/\bpaciente\b/.test(t)) return "paciente";
  if (/(añadir|agregar|nueva|crear|crea)\s+(?:una\s+)?(residencia|centro|domicilio)/.test(t)) return "centro";
  if (/(tratamiento|nota)\b/.test(t)) return "tratamiento";
  return "desconocido";
}

const PATIENT_STOP = /\b(que\s+tengo\s+que|que\s+voy\s+a|en\s+la\s+residencia|en\s+residencia|en\s+el\s+centro|en\s+centro|en\s+el\s+domicilio|en\s+domicilio|precio|por\s+\d|por\s+(?:[\wáéíóú]+\s+){0,3}euros?|su\s+n[uú]mero|tel[eé]fono|m[oó]vil|n[uú]mero|tratamiento|el\s+\d|\d+\s+de\s+[a-záéíóú]+|a\s+las?)/i;

function extractPatientName(text: string): string | undefined {
  // 1) "llamado/llamada NOMBRE"
  let m = text.match(/llamad[oa]\s+(.+)/i);
  if (m) return cutAtStop(m[1]);
  // 2) "paciente NOMBRE"
  m = text.match(/paciente\s+(.+)/i);
  if (m) {
    // Saltar "nuevo"/"nueva" si va antes
    const rest = m[1].replace(/^(?:nuevo|nueva)\s+/i, "");
    return cutAtStop(rest);
  }
  return undefined;
}

function cutAtStop(s: string): string | undefined {
  const stopMatch = s.match(PATIENT_STOP);
  const cut = stopMatch ? s.slice(0, stopMatch.index).trim() : s.trim();
  const cleaned = cut.replace(/[,.;].*$/, "").trim();
  return cleaned || undefined;
}

function extractCenterName(text: string): string | undefined {
  let m = text.match(/\ben\s+(?:la\s+|el\s+)?(?:residencia|centro\s+de\s+día|centro|domicilio)\s+(.+)/i);
  if (m) return cutAtStop(m[1]);
  m = text.match(/\b(?:residencia|centro\s+de\s+día|centro|domicilio)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ' -]{1,60})/);
  if (m) return cutAtStop(m[1]);
  return undefined;
}

function extractTreatmentSimple(text: string): string | undefined {
  const m = text.match(/\btratamiento\s+(.+)$/i);
  return m?.[1]?.trim();
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

function afterKeyword(text: string, keywords: string[]): string | undefined {
  for (const k of keywords) {
    const re = new RegExp(`${k}\\s+(.+)`, "i");
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return undefined;
}

export function parseVoiceLocal(text: string): VoiceInterpretation {
  const intent = detectIntent(text);
  const interp: VoiceInterpretation = { intent, confidence: 0.5 };

  switch (intent) {
    case "centro": {
      const name = extractCenterName(text) ??
        afterKeyword(text, ["añadir", "agregar", "crear", "crea", "nueva", "nuevo"]);
      interp.center = {
        name: name?.replace(/^(residencia|centro\s+de\s+día|centro|domicilio)\s+/i, "").trim(),
        type: extractCenterType(text) ?? "",
        defaultPricePerPatient: extractEuros(text),
        address: (text.match(/\b(?:calle|c\/|avenida|av\.|plaza)\s+([^,.]+)/i)?.[0] || "").trim() || undefined,
      };
      break;
    }
    case "paciente": {
      const phone = extractPhone(text);
      const time = extractTime(text);
      const date = extractDate(text);
      const centerName = extractCenterName(text);
      const fullName = extractPatientName(text);
      const price = extractEuros(text);
      interp.patient = {
        fullName,
        centerName,
        usualTreatment: extractTreatmentSimple(text),
        defaultPrice: price,
        nextVisitDate: date,
        nextVisitTime: time,
        phone,
      };
      if (date) {
        interp.visit = {
          date,
          startTime: time,
          centerName,
          pricePerPatient: price,
          patientNames: fullName ? [fullName] : [],
        };
      }
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
        patientName: extractPatientName(text),
        treatmentDone: afterKeyword(text, ["tratamiento", "nota"]),
        amountCharged: extractEuros(text),
      };
      break;
    }
    case "cobro": {
      const target =
        extractCenterName(text) ??
        extractPatientName(text) ??
        (text.match(/visita\s+de\s+(hoy|mañana|ayer)/i)?.[1]);
      const newStatus: "cobrada" | "facturada" | "pendiente" | "" =
        /facturad[ao]/i.test(text) ? "facturada" : /pendien/i.test(text) ? "pendiente" : "cobrada";
      interp.payment = { target, newStatus };
      break;
    }
  }

  return interp;
}

// Exporto helpers por si UI quiere mostrar el teléfono
export const voiceHelpers = { extractPhone, extractTime, extractDate };
