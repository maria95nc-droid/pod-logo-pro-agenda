ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS next_visit_time text;
ALTER TABLE public.visit_patients ADD COLUMN IF NOT EXISTS paid_at timestamptz;