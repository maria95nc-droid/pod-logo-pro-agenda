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

// ============ Generic invalidate helpers ============
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["centers"] });
    qc.invalidateQueries({ queryKey: ["patients"] });
    qc.invalidateQueries({ queryKey: ["visits"] });
    qc.invalidateQueries({ queryKey: ["materials"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };
}
