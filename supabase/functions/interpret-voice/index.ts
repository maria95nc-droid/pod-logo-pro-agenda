// Interpreta texto dictado en español y extrae datos estructurados
// según la intención (centro, paciente, visita, material, tratamiento, cobro)
import { corsHeaders } from "@supabase/supabase-js/cors";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `Eres un asistente que interpreta dictados en español de un podólogo
que trabaja en residencias, centros de día y domicilios en España.

Recibes un texto transcrito por voz. Debes:
1. Detectar la INTENCIÓN del usuario entre: centro, paciente, visita, material, tratamiento, cobro, desconocido.
2. Extraer todos los campos relevantes presentes en el texto.
3. Si una fecha es relativa ("mañana", "el lunes", "el 15 de febrero"), conviértela a formato YYYY-MM-DD usando la fecha de hoy proporcionada.
4. Las horas en formato HH:MM (24h).
5. Importes en euros como número (ej: "treinta y cinco euros" -> 35).
6. Si un campo no se menciona, devuélvelo como null o array vacío.

Llama SIEMPRE a la función "extract_voice_data".`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_voice_data",
    description: "Extrae datos estructurados del dictado de voz",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["centro", "paciente", "visita", "material", "tratamiento", "cobro", "desconocido"],
        },
        confidence: { type: "number", description: "0..1" },
        center: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["residencia", "centro_dia", "domicilio", ""] },
            address: { type: "string" },
            city: { type: "string" },
            contactName: { type: "string" },
            contactPhone: { type: "string" },
            defaultPricePerPatient: { type: "number" },
            notes: { type: "string" },
          },
        },
        patient: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            centerName: { type: "string" },
            usualTreatment: { type: "string" },
            defaultPrice: { type: "number" },
            nextVisitDate: { type: "string", description: "YYYY-MM-DD" },
            warnings: { type: "string" },
            notes: { type: "string" },
          },
        },
        visit: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            startTime: { type: "string", description: "HH:MM" },
            endTime: { type: "string", description: "HH:MM" },
            centerName: { type: "string" },
            patientNames: { type: "array", items: { type: "string" } },
            pricePerPatient: { type: "number" },
            travelCost: { type: "number" },
            materialCost: { type: "number" },
            notes: { type: "string" },
          },
        },
        material: {
          type: "object",
          properties: {
            name: { type: "string" },
            currentStock: { type: "number" },
            minimumStock: { type: "number" },
            category: { type: "string" },
            unit: { type: "string" },
            unitCost: { type: "number" },
          },
        },
        treatment: {
          type: "object",
          properties: {
            patientName: { type: "string" },
            treatmentDone: { type: "string" },
            notes: { type: "string" },
            amountCharged: { type: "number" },
            paymentStatus: { type: "string", enum: ["cobrado", "pendiente", ""] },
          },
        },
        payment: {
          type: "object",
          properties: {
            target: { type: "string", description: "Nombre de centro, paciente o referencia de visita" },
            newStatus: { type: "string", enum: ["cobrada", "pendiente", "facturada", ""] },
            when: { type: "string", description: "YYYY-MM-DD opcional" },
          },
        },
      },
      required: ["intent", "confidence"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { transcript, hintIntent } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");

    const today = new Date().toISOString().slice(0, 10);
    const userMsg = `Fecha de hoy: ${today}.${
      hintIntent ? ` Intención sugerida por el contexto de la pantalla: ${hintIntent}.` : ""
    }\n\nTexto dictado:\n"""${transcript}"""`;

    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_voice_data" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de uso alcanzado, prueba en un momento." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA agotados. Añade saldo en tu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "Error de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    return new Response(JSON.stringify({ transcript, data: args }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("interpret-voice error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
