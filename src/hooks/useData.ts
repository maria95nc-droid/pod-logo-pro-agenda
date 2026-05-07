import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ============ Centers ============
export function useCenters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["centers"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("centers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ============ Patients ============
export function usePatients() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patients"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ============ Visits ============
export function useVisits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["visits"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, visit_patients(*), visit_materials(*)")
        .order("visit_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVisit(id?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["visit", id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, visit_patients(*), visit_materials(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// ============ Materials ============
export function useMaterials() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["materials"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ============ Expenses ============
export function useExpenses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["expenses"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ============ User settings (profile) ============
export interface UserSettings {
  default_irpf_percentage: number;
  default_vat_mode: "Exento" | "Con IVA" | "Configurable";
  monthly_self_employed_fee: number;
  monthly_fixed_expenses: number;
  default_travel_cost: number;
  apply_travel_per_visit: boolean;
  apply_self_employed_fee: boolean;
  apply_fixed_expenses: boolean;
  fee_distribution_method: "por_dia" | "por_visita" | "por_ingreso";
}

export const defaultUserSettings: UserSettings = {
  default_irpf_percentage: 15,
  default_vat_mode: "Exento",
  monthly_self_employed_fee: 0,
  monthly_fixed_expenses: 0,
  default_travel_cost: 0,
  apply_travel_per_visit: false,
  apply_self_employed_fee: false,
  apply_fixed_expenses: false,
  fee_distribution_method: "por_dia",
};

export function useUserSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_settings"],
    enabled: !!user,
    queryFn: async (): Promise<UserSettings> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "default_irpf_percentage, default_vat_mode, monthly_self_employed_fee, monthly_fixed_expenses, default_travel_cost, apply_travel_per_visit, apply_self_employed_fee, fee_distribution_method",
        )
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return defaultUserSettings;
      return {
        default_irpf_percentage: Number(data.default_irpf_percentage ?? defaultUserSettings.default_irpf_percentage),
        default_vat_mode: (data.default_vat_mode as UserSettings["default_vat_mode"]) ?? "Exento",
        monthly_self_employed_fee: Number(data.monthly_self_employed_fee ?? 0),
        monthly_fixed_expenses: Number(data.monthly_fixed_expenses ?? 0),
        default_travel_cost: Number(data.default_travel_cost ?? 0),
        apply_travel_per_visit: data.apply_travel_per_visit ?? false,
        apply_self_employed_fee: data.apply_self_employed_fee ?? false,
        apply_fixed_expenses: false,
        fee_distribution_method: (data.fee_distribution_method as UserSettings["fee_distribution_method"]) ?? "por_dia",
      };
    },
  });
}

// ============ Generic invalidate helpers ============
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["centers"] });
    qc.invalidateQueries({ queryKey: ["patients"] });
    qc.invalidateQueries({ queryKey: ["visits"] });
    qc.invalidateQueries({ queryKey: ["materials"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["user_settings"] });
  };
}

