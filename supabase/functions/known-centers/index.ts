// Devuelve la plantilla de residencias habituales de David para la importación inicial.
// Vive en el backend (no en el bundle público) porque contiene datos reales de su
// cartera de clientes (nombres de centros, precios, forma de cobro).
//
// La app permite alta libre de cuentas (email/contraseña), así que exigir solo un
// JWT válido no basta: cualquier desconocido podría registrarse y leer estos datos.
// Por eso, además del JWT (verificado por la plataforma), comprobamos que el email
// del usuario autenticado es el del propietario antes de devolver la lista real.
import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_EMAIL = "davidmariaajnc@gmail.com";

const KNOWN_CENTERS = [
  { name: "Argüelles", type: "Residencia", defaultPricePerPatient: 14, notes: "Cartera habitual desde junio." },
  { name: "Trubia", type: "Residencia", defaultPricePerPatient: 14, notes: "Cartera habitual desde julio." },
  { name: "Oviedo", type: "Residencia", defaultPricePerPatient: 14, notes: "Cartera habitual desde julio/agosto." },
  { name: "Amar", type: "Residencia", defaultPricePerPatient: 18, notes: "Cartera habitual desde junio." },
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
    billingNotes:
      "Son 3 centros distintos; se factura con fecha del mes siguiente a la visita (visita en mayo se factura en junio).",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const authHeader = req.headers.get("Authorization") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData?.user?.email?.toLowerCase().trim();

  if (userError || !email || email !== OWNER_EMAIL) {
    // Usuario autenticado pero no es el propietario: no revelamos datos de negocio.
    return new Response(JSON.stringify({ centers: [] }), { headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ centers: KNOWN_CENTERS }), { headers: jsonHeaders });
});
