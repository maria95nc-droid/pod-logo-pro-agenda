-- Módulo de contabilidad fiscal: clasificación de cada visita a efectos de
-- IRPF y del Modelo 130. Solo trabaja con dinero DECLARADO (Empresa y
-- Particular); no existe ninguna categoría de dinero no declarado en el
-- modelo de datos — eso queda fuera a propósito.
--
-- `income_type`:
--   'Empresa'    -> paga la propia entidad/residencia con su NIF/CIF, 15% IRPF.
--   'Particular' -> paga el paciente o su familia directamente, sin retención.
-- NULL = sin clasificar todavía (la app debe preguntar, nunca asumir).
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS income_type text CHECK (income_type IN ('Empresa', 'Particular')),
  ADD COLUMN IF NOT EXISTS invoice_number text;

COMMENT ON COLUMN public.visits.income_type IS
  'Clasificación fiscal de quién paga: Empresa (retiene 15% IRPF) o Particular (sin retención). NULL = sin clasificar, la app debe preguntar.';
COMMENT ON COLUMN public.visits.invoice_number IS
  'Número de factura real (p. ej. "F-2026-066") cuando esta visita está facturada. Sirve para detectar huecos en la numeración correlativa.';

CREATE INDEX IF NOT EXISTS idx_visits_invoice_number ON public.visits (user_id, invoice_number) WHERE invoice_number IS NOT NULL;

-- Recuerda, por centro, quién suele pagar (la entidad o cada paciente), para
-- no tener que volver a preguntarlo cada vez que se registra una visita ahí.
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS default_income_type text CHECK (default_income_type IN ('Empresa', 'Particular'));

COMMENT ON COLUMN public.centers.default_income_type IS
  'Quién paga habitualmente en este centro: Empresa (la entidad, con retención) o Particular (cada paciente/familia, sin retención). Se usa para rellenar por defecto una visita nueva; el usuario puede cambiarlo caso a caso.';
