// ============================================================
// Configuración local (localStorage) de "Voz e IA".
// - Modo por defecto: Gratis (sin IA).
// - IA opcional, con contador mensual y límite configurable.
// No se guardan audios en ningún caso.
// ============================================================

export interface VoiceSettings {
  /** Si la IA está habilitada como opción manual */
  aiEnabled: boolean;
  /** Límite mensual de usos de IA. 0 = sin límite */
  monthlyAiLimit: number;
}

const KEY_SETTINGS = "voiceSettings.v1";
const KEY_USAGE = "voiceAiUsage.v1";

export const defaultVoiceSettings: VoiceSettings = {
  aiEnabled: true, // disponible como opción manual, NUNCA automática
  monthlyAiLimit: 50,
};

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (!raw) return defaultVoiceSettings;
    return { ...defaultVoiceSettings, ...JSON.parse(raw) };
  } catch {
    return defaultVoiceSettings;
  }
}

export function saveVoiceSettings(s: VoiceSettings) {
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

interface UsageRecord {
  month: string; // YYYY-MM
  count: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getAiUsage(): UsageRecord {
  try {
    const raw = localStorage.getItem(KEY_USAGE);
    const m = currentMonth();
    if (!raw) return { month: m, count: 0 };
    const parsed = JSON.parse(raw) as UsageRecord;
    if (parsed.month !== m) return { month: m, count: 0 };
    return parsed;
  } catch {
    return { month: currentMonth(), count: 0 };
  }
}

export function incrementAiUsage(): UsageRecord {
  const u = getAiUsage();
  const next: UsageRecord = { month: u.month, count: u.count + 1 };
  try {
    localStorage.setItem(KEY_USAGE, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}

export function canUseAi(settings: VoiceSettings): { ok: boolean; reason?: string; usage: UsageRecord } {
  const usage = getAiUsage();
  if (!settings.aiEnabled) {
    return { ok: false, reason: "La interpretación con IA está desactivada en Configuración.", usage };
  }
  if (settings.monthlyAiLimit > 0 && usage.count >= settings.monthlyAiLimit) {
    return {
      ok: false,
      reason: `Has alcanzado el límite mensual de ${settings.monthlyAiLimit} usos de IA.`,
      usage,
    };
  }
  return { ok: true, usage };
}
