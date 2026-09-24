-- Frecuencia de visita estructurada por centro (en semanas), para poder
-- calcular cuándo toca la próxima visita y avisar con antelación de llamar
-- para concertarla. `visit_frequency` (texto libre) ya existía para notas
-- humanas ("cada mes", "2 veces al mes"...); esta columna nueva es la que
-- usa la app para calcular fechas, así que tiene que ser un número.
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS visit_frequency_weeks integer;

COMMENT ON COLUMN public.centers.visit_frequency_weeks IS
  'Cada cuántas semanas se visita este centro habitualmente (p. ej. 4 = mensual, 6 = mes y medio, 2 = quincenal). NULL si no tiene una cadencia fija.';
