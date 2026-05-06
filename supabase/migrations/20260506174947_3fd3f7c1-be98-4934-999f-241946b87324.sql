ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS visit_frequency text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS billing_notes text,
  ADD COLUMN IF NOT EXISTS material_notes text;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS payment_status text;