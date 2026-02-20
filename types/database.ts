// Tipos generados automáticamente desde Supabase
// Ejecuta: npm run types para regenerar

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: "user" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: "user" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: "user" | "admin";
          updated_at?: string;
        };
      };
      offices: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          updated_at?: string;
        };
      };
      service_categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          updated_at?: string;
        };
      };
      services: {
        Row: {
          id: string;
          name: string;
          category_id: string;
          base_price: number;
          duration_minutes: number;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category_id: string;
          base_price?: number;
          duration_minutes?: number;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category_id?: string;
          base_price?: number;
          duration_minutes?: number;
          is_active?: boolean;
          display_order?: number;
          updated_at?: string;
        };
      };
      doctors: {
        Row: {
          id: string;
          full_name: string;
          cmp: string;
          photo_url: string | null;
          color: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          cmp: string;
          photo_url?: string | null;
          color?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          cmp?: string;
          photo_url?: string | null;
          color?: string;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      doctor_services: {
        Row: {
          id: string;
          doctor_id: string;
          service_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          service_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          service_id?: string;
        };
      };
      doctor_schedules: {
        Row: {
          id: string;
          doctor_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          office_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          office_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          office_id?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      lookup_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          is_system?: boolean;
          updated_at?: string;
        };
      };
      lookup_values: {
        Row: {
          id: string;
          category_id: string;
          label: string;
          value: string;
          color: string | null;
          icon: string | null;
          display_order: number;
          is_active: boolean;
          is_default: boolean;
          metadata: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          label: string;
          value: string;
          color?: string | null;
          icon?: string | null;
          display_order?: number;
          is_active?: boolean;
          is_default?: boolean;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          label?: string;
          value?: string;
          color?: string | null;
          icon?: string | null;
          display_order?: number;
          is_active?: boolean;
          is_default?: boolean;
          metadata?: Record<string, unknown> | null;
          updated_at?: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          patient_name: string;
          patient_phone: string | null;
          doctor_id: string;
          office_id: string;
          service_id: string;
          appointment_date: string;
          start_time: string;
          end_time: string;
          status: "scheduled" | "confirmed" | "completed" | "cancelled";
          origin: string | null;
          payment_method: string | null;
          responsible: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_name: string;
          patient_phone?: string | null;
          doctor_id: string;
          office_id: string;
          service_id: string;
          appointment_date: string;
          start_time: string;
          end_time: string;
          status?: "scheduled" | "confirmed" | "completed" | "cancelled";
          origin?: string | null;
          payment_method?: string | null;
          responsible?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_name?: string;
          patient_phone?: string | null;
          doctor_id?: string;
          office_id?: string;
          service_id?: string;
          appointment_date?: string;
          start_time?: string;
          end_time?: string;
          status?: "scheduled" | "confirmed" | "completed" | "cancelled";
          origin?: string | null;
          payment_method?: string | null;
          responsible?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
      };
    };
  };
}
