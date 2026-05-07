ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_irpf_percentage numeric,
  ADD COLUMN IF NOT EXISTS default_vat_mode text DEFAULT 'Exento',
  ADD COLUMN IF NOT EXISTS monthly_self_employed_fee numeric,
  ADD COLUMN IF NOT EXISTS monthly_fixed_expenses numeric,
  ADD COLUMN IF NOT EXISTS default_travel_cost numeric,
  ADD COLUMN IF NOT EXISTS apply_travel_per_visit boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS apply_self_employed_fee boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS fee_distribution_method text DEFAULT 'por_dia';