// Devuelve la plantilla de residencias habituales de David para la importación
// inicial (el botón "Importar mis residencias" de la app).
//
// IMPORTANTE (revisado 2026-09-24): este archivo vive en un repositorio de
// GitHub PÚBLICO (necesario para publicar la web en GitHub Pages). Antes esta
// lista tenía los nombres reales de las residencias y sus precios escritos
// aquí mismo, en texto plano — cualquiera podía leerlos directamente en
// GitHub, sin necesidad de llamar a esta función ni de tener ninguna clave.
// La comprobación de email de más abajo protege la LLAMADA a la función, pero
// no protegía el CÓDIGO FUENTE, que es público igualmente. Esos datos deben
// darse por divulgados: quitarlos ahora no borra copias ya hechas ni cachés.
//
// Como las 12 residencias reales ya están importadas en la base de datos
// (este botón solo sirve para la carga inicial en una cuenta nueva), la
// plantilla se deja vacía en el código fuente en vez de mover el problema a
// un secreto: no hay necesidad real de mantener estos datos en ningún sitio
// nuevo. Si algún día hace falta una plantilla de alta rápida otra vez,
// debe rellenarse a mano desde la app (Centros → Nuevo centro), nunca
// volver a escribirse aquí.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OWNER_EMAIL = "davidmariaajnc@gmail.com";

const KNOWN_CENTERS: unknown[] = [];

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
