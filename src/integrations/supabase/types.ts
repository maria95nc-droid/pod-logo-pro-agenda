export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      centers: {
        Row: {
          address: string | null
          billing_notes: string | null
          city: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          default_income_type: string | null
          default_price_per_patient: number | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          material_notes: string | null
          name: string
          notes: string | null
          payment_method: string | null
          postal_code: string | null
          tax_id: string | null
          type: string
          updated_at: string
          user_id: string
          usual_schedule: string | null
          visit_frequency: string | null
          visit_frequency_weeks: number | null
        }
        Insert: {
          address?: string | null
          billing_notes?: string | null
          city?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          default_income_type?: string | null
          default_price_per_patient?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          material_notes?: string | null
          name: string
          notes?: string | null
          payment_method?: string | null
          postal_code?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
          user_id: string
          usual_schedule?: string | null
          visit_frequency?: string | null
          visit_frequency_weeks?: number | null
        }
        Update: {
          address?: string | null
          billing_notes?: string | null
          city?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          default_income_type?: string | null
          default_price_per_patient?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          material_notes?: string | null
          name?: string
          notes?: string | null
          payment_method?: string | null
          postal_code?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          usual_schedule?: string | null
          visit_frequency?: string | null
          visit_frequency_weeks?: number | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          updated_at: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          updated_at?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          updated_at?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category: string
          created_at: string
          current_stock: number
          estimated_unit_cost: number | null
          id: string
          is_essential: boolean
          minimum_stock: number
          name: string
          notes: string | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          current_stock?: number
          estimated_unit_cost?: number | null
          id?: string
          is_essential?: boolean
          minimum_stock?: number
          name: string
          notes?: string | null
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          current_stock?: number
          estimated_unit_cost?: number | null
          id?: string
          is_essential?: boolean
          minimum_stock?: number
          name?: string
          notes?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          allergies: string | null
          birth_date: string | null
          center_id: string | null
          clinical_notes: string | null
          created_at: string
          default_price: number | null
          full_name: string
          id: string
          important_warnings: string | null
          is_active: boolean
          last_visit_date: string | null
          next_visit_date: string | null
          next_visit_time: string | null
          patient_code: string | null
          payment_status: string | null
          phone: string | null
          updated_at: string
          user_id: string
          usual_treatment: string | null
        }
        Insert: {
          allergies?: string | null
          birth_date?: string | null
          center_id?: string | null
          clinical_notes?: string | null
          created_at?: string
          default_price?: number | null
          full_name: string
          id?: string
          important_warnings?: string | null
          is_active?: boolean
          last_visit_date?: string | null
          next_visit_date?: string | null
          next_visit_time?: string | null
          patient_code?: string | null
          payment_status?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
          usual_treatment?: string | null
        }
        Update: {
          allergies?: string | null
          birth_date?: string | null
          center_id?: string | null
          clinical_notes?: string | null
          created_at?: string
          default_price?: number | null
          full_name?: string
          id?: string
          important_warnings?: string | null
          is_active?: boolean
          last_visit_date?: string | null
          next_visit_date?: string | null
          next_visit_time?: string | null
          patient_code?: string | null
          payment_status?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
          usual_treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apply_self_employed_fee: boolean | null
          apply_travel_per_visit: boolean | null
          created_at: string
          default_irpf_percentage: number | null
          default_travel_cost: number | null
          default_vat_mode: string | null
          display_name: string | null
          fee_distribution_method: string | null
          id: string
          monthly_fixed_expenses: number | null
          monthly_self_employed_fee: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          apply_self_employed_fee?: boolean | null
          apply_travel_per_visit?: boolean | null
          created_at?: string
          default_irpf_percentage?: number | null
          default_travel_cost?: number | null
          default_vat_mode?: string | null
          display_name?: string | null
          fee_distribution_method?: string | null
          id?: string
          monthly_fixed_expenses?: number | null
          monthly_self_employed_fee?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          apply_self_employed_fee?: boolean | null
          apply_travel_per_visit?: boolean | null
          created_at?: string
          default_irpf_percentage?: number | null
          default_travel_cost?: number | null
          default_vat_mode?: string | null
          display_name?: string | null
          fee_distribution_method?: string | null
          id?: string
          monthly_fixed_expenses?: number | null
          monthly_self_employed_fee?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      visit_materials: {
        Row: {
          created_at: string
          id: string
          material_id: string | null
          material_name: string | null
          notes: string | null
          quantity: number
          visit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id?: string | null
          material_name?: string | null
          notes?: string | null
          quantity?: number
          visit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string | null
          material_name?: string | null
          notes?: string | null
          quantity?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_materials_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_patients: {
        Row: {
          attended: boolean
          created_at: string
          id: string
          paid_at: string | null
          patient_id: string | null
          patient_name: string | null
          payment_breakdown: Json | null
          payment_status: string
          price_charged: number
          treatment_done: string | null
          treatment_notes: string | null
          visit_id: string
        }
        Insert: {
          attended?: boolean
          created_at?: string
          id?: string
          paid_at?: string | null
          patient_id?: string | null
          patient_name?: string | null
          payment_breakdown?: Json | null
          payment_status?: string
          price_charged?: number
          treatment_done?: string | null
          treatment_notes?: string | null
          visit_id: string
        }
        Update: {
          attended?: boolean
          created_at?: string
          id?: string
          paid_at?: string | null
          patient_id?: string | null
          patient_name?: string | null
          payment_breakdown?: Json | null
          payment_status?: string
          price_charged?: number
          treatment_done?: string | null
          treatment_notes?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_patients_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          center_id: string | null
          created_at: string
          end_time: string | null
          estimated_net_amount: number
          general_notes: string | null
          gross_amount: number
          id: string
          import_batch: string | null
          income_type: string | null
          invoice_number: string | null
          irpf_percentage: number
          material_cost: number
          material_notes: string | null
          other_expenses: number
          patients_count: number
          source_ref: string | null
          start_time: string | null
          status: string
          travel_cost: number
          updated_at: string
          user_id: string
          vat_mode: string
          vat_percentage: number
          visit_date: string
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          end_time?: string | null
          estimated_net_amount?: number
          general_notes?: string | null
          gross_amount?: number
          id?: string
          import_batch?: string | null
          income_type?: string | null
          invoice_number?: string | null
          irpf_percentage?: number
          material_cost?: number
          material_notes?: string | null
          other_expenses?: number
          patients_count?: number
          source_ref?: string | null
          start_time?: string | null
          status?: string
          travel_cost?: number
          updated_at?: string
          user_id: string
          vat_mode?: string
          vat_percentage?: number
          visit_date: string
        }
        Update: {
          center_id?: string | null
          created_at?: string
          end_time?: string | null
          estimated_net_amount?: number
          general_notes?: string | null
          gross_amount?: number
          id?: string
          import_batch?: string | null
          income_type?: string | null
          invoice_number?: string | null
          irpf_percentage?: number
          material_cost?: number
          material_notes?: string | null
          other_expenses?: number
          patients_count?: number
          source_ref?: string | null
          start_time?: string | null
          status?: string
          travel_cost?: number
          updated_at?: string
          user_id?: string
          vat_mode?: string
          vat_percentage?: number
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
