-- Trazabilidad e idempotencia de las visitas importadas por el asistente
-- (log-activity). Antes, el borrado por lotes usaba una búsqueda de texto
-- libre (`general_notes ILIKE 'prefijo%'`), que resultó insegura: PostgREST
-- trata el asterisco '*' como comodín además de '%' y '_', así que un
-- prefijo con asteriscos podía casar con cualquier nota y borrar visitas que
-- no eran del lote. Además, nada impedía insertar la misma factura dos
-- veces si una llamada se repetía (reintento de red, doble clic, etc.).
--
-- Con estas dos columnas:
--   - `source_ref`   identifica una visita concreta de forma única (p. ej.
--     "factura:F-2026-066"). Un índice único parcial por usuario impide
--     duplicar la misma factura aunque se reintente la importación.
--   - `import_batch` identifica el lote de importación (p. ej.
--     "facturas-2026-09") para poder deshacer un lote completo por
--     coincidencia EXACTA, nunca por patrón sobre texto libre.
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS import_batch text;

CREATE UNIQUE INDEX IF NOT EXISTS visits_user_source_ref_key
  ON public.visits (user_id, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visits_import_batch
  ON public.visits (user_id, import_batch)
  WHERE import_batch IS NOT NULL;

COMMENT ON COLUMN public.visits.source_ref IS
  'Identificador único del origen de la visita cuando viene de una importación (p. ej. "factura:F-2026-066"). Único por usuario: reintentar la misma importación no duplica la visita.';
COMMENT ON COLUMN public.visits.import_batch IS
  'Etiqueta del lote de importación que creó esta visita, para poder deshacer el lote entero por coincidencia exacta.';
