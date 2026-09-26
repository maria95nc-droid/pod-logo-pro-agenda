-- Datos de facturación del centro: se habían quitado del formulario por
-- simplicidad, pero son imprescindibles para poder emitir una factura real
-- (razón social y NIF/CIF pueden no coincidir con el nombre corto que usa
-- David a diario, p. ej. "YADINSA, S.A." para "Residencia Ave María").
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS tax_id text;

COMMENT ON COLUMN public.centers.legal_name IS
  'Razón social exacta para la factura (puede diferir del nombre corto habitual). NULL si aún no se conoce.';
COMMENT ON COLUMN public.centers.tax_id IS
  'NIF/CIF del centro para la factura. NULL si aún no se conoce.';
