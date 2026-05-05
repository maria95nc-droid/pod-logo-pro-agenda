
-- ============ helper trigger function ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ centers ============
CREATE TABLE public.centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Residencia',
  address TEXT,
  city TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  default_price_per_patient NUMERIC,
  usual_schedule TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centers_select_own" ON public.centers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "centers_insert_own" ON public.centers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "centers_update_own" ON public.centers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "centers_delete_own" ON public.centers FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER centers_set_updated_at BEFORE UPDATE ON public.centers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ patients ============
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  center_id UUID REFERENCES public.centers(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  birth_date DATE,
  patient_code TEXT,
  usual_treatment TEXT,
  clinical_notes TEXT,
  allergies TEXT,
  important_warnings TEXT,
  default_price NUMERIC,
  last_visit_date DATE,
  next_visit_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients_select_own" ON public.patients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "patients_insert_own" ON public.patients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "patients_update_own" ON public.patients FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "patients_delete_own" ON public.patients FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER patients_set_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ visits ============
CREATE TABLE public.visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  center_id UUID REFERENCES public.centers(id) ON DELETE SET NULL,
  visit_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  status TEXT NOT NULL DEFAULT 'Programada',
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  irpf_percentage NUMERIC NOT NULL DEFAULT 0,
  vat_mode TEXT NOT NULL DEFAULT 'Exento',
  vat_percentage NUMERIC NOT NULL DEFAULT 0,
  travel_cost NUMERIC NOT NULL DEFAULT 0,
  material_cost NUMERIC NOT NULL DEFAULT 0,
  other_expenses NUMERIC NOT NULL DEFAULT 0,
  estimated_net_amount NUMERIC NOT NULL DEFAULT 0,
  patients_count INT NOT NULL DEFAULT 0,
  general_notes TEXT,
  material_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visits_select_own" ON public.visits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "visits_insert_own" ON public.visits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "visits_update_own" ON public.visits FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "visits_delete_own" ON public.visits FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER visits_set_updated_at BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ visit_patients ============
CREATE TABLE public.visit_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT,
  treatment_done TEXT,
  treatment_notes TEXT,
  price_charged NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'Pendiente',
  attended BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vp_select_via_visit" ON public.visit_patients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));
CREATE POLICY "vp_insert_via_visit" ON public.visit_patients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));
CREATE POLICY "vp_update_via_visit" ON public.visit_patients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));
CREATE POLICY "vp_delete_via_visit" ON public.visit_patients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));

-- ============ materials ============
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Otros',
  current_stock NUMERIC NOT NULL DEFAULT 0,
  minimum_stock NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unidad',
  estimated_unit_cost NUMERIC,
  is_essential BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials_select_own" ON public.materials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "materials_insert_own" ON public.materials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "materials_update_own" ON public.materials FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "materials_delete_own" ON public.materials FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER materials_set_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ visit_materials ============
CREATE TABLE public.visit_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  material_name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vm_select_via_visit" ON public.visit_materials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));
CREATE POLICY "vm_insert_via_visit" ON public.visit_materials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));
CREATE POLICY "vm_update_via_visit" ON public.visit_materials FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));
CREATE POLICY "vm_delete_via_visit" ON public.visit_materials FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.user_id = auth.uid()));

-- ============ expenses ============
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'Otros',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select_own" ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "expenses_insert_own" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses_update_own" ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "expenses_delete_own" ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- indexes
CREATE INDEX idx_centers_user ON public.centers(user_id);
CREATE INDEX idx_patients_user ON public.patients(user_id);
CREATE INDEX idx_patients_center ON public.patients(center_id);
CREATE INDEX idx_visits_user ON public.visits(user_id);
CREATE INDEX idx_visits_date ON public.visits(visit_date);
CREATE INDEX idx_vp_visit ON public.visit_patients(visit_id);
CREATE INDEX idx_vm_visit ON public.visit_materials(visit_id);
CREATE INDEX idx_materials_user ON public.materials(user_id);
CREATE INDEX idx_expenses_user ON public.expenses(user_id);
