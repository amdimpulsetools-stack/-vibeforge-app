// Tipos generados automáticamente desde Supabase
// Ejecuta: npm run types para regenerar

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          plan: "free" | "pro" | "enterprise";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          plan?: "free" | "pro" | "enterprise";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          plan?: "free" | "pro" | "enterprise";
          is_active?: boolean;
          updated_at?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: "owner" | "admin" | "member";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role?: "owner" | "admin" | "member";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          role?: "owner" | "admin" | "member";
          is_active?: boolean;
          updated_at?: string;
        };
      };
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
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          organization_id?: string;
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
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          display_order?: number;
          organization_id?: string;
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
          organization_id: string;
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
          organization_id: string;
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
          organization_id?: string;
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
          organization_id: string;
          user_id: string | null;
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
          organization_id: string;
          user_id?: string | null;
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
          organization_id?: string;
          user_id?: string | null;
          updated_at?: string;
        };
      };
      doctor_services: {
        Row: {
          id: string;
          doctor_id: string;
          service_id: string;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          service_id: string;
          organization_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          service_id?: string;
          organization_id?: string;
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
          organization_id: string;
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
          organization_id: string;
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
          organization_id?: string;
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
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          is_system?: boolean;
          organization_id?: string;
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
          organization_id: string;
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
          organization_id: string;
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
          organization_id?: string;
          updated_at?: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          patient_name: string;
          patient_phone: string | null;
          patient_id: string | null;
          doctor_id: string;
          office_id: string;
          service_id: string;
          appointment_date: string;
          start_time: string;
          end_time: string;
          status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
          origin: string | null;
          payment_method: string | null;
          responsible: string | null;
          notes: string | null;
          edited_by_name: string | null;
          edited_at: string | null;
          price_snapshot: number | null;
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          patient_name: string;
          patient_phone?: string | null;
          patient_id?: string | null;
          doctor_id: string;
          office_id: string;
          service_id: string;
          appointment_date: string;
          start_time: string;
          end_time: string;
          status?: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
          origin?: string | null;
          payment_method?: string | null;
          responsible?: string | null;
          notes?: string | null;
          edited_by_name?: string | null;
          edited_at?: string | null;
          price_snapshot?: number | null;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          patient_name?: string;
          patient_phone?: string | null;
          patient_id?: string | null;
          doctor_id?: string;
          office_id?: string;
          service_id?: string;
          appointment_date?: string;
          start_time?: string;
          end_time?: string;
          status?: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
          origin?: string | null;
          payment_method?: string | null;
          responsible?: string | null;
          notes?: string | null;
          edited_by_name?: string | null;
          edited_at?: string | null;
          price_snapshot?: number | null;
          organization_id?: string;
          updated_at?: string;
        };
      };
      patients: {
        Row: {
          id: string;
          dni: string | null;
          document_type: "DNI" | "CE" | "Pasaporte";
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          birth_date: string | null;
          departamento: string | null;
          distrito: string | null;
          is_foreigner: boolean;
          nationality: string | null;
          status: "active" | "inactive";
          origin: string | null;
          adicional_1: string | null;
          adicional_2: string | null;
          viene_desde: string | null;
          notes: string | null;
          organization_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dni?: string | null;
          document_type?: "DNI" | "CE" | "Pasaporte";
          first_name: string;
          last_name: string;
          phone?: string | null;
          email?: string | null;
          birth_date?: string | null;
          departamento?: string | null;
          distrito?: string | null;
          is_foreigner?: boolean;
          nationality?: string | null;
          status?: "active" | "inactive";
          origin?: string | null;
          adicional_1?: string | null;
          adicional_2?: string | null;
          viene_desde?: string | null;
          notes?: string | null;
          organization_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dni?: string | null;
          document_type?: "DNI" | "CE" | "Pasaporte";
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          email?: string | null;
          birth_date?: string | null;
          departamento?: string | null;
          distrito?: string | null;
          is_foreigner?: boolean;
          nationality?: string | null;
          status?: "active" | "inactive";
          origin?: string | null;
          adicional_1?: string | null;
          adicional_2?: string | null;
          viene_desde?: string | null;
          notes?: string | null;
          organization_id?: string;
          updated_at?: string;
        };
      };
      patient_tags: {
        Row: {
          id: string;
          patient_id: string;
          tag: string;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          tag: string;
          organization_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          tag?: string;
          organization_id?: string;
        };
      };
      patient_payments: {
        Row: {
          id: string;
          patient_id: string;
          appointment_id: string | null;
          amount: number;
          payment_method: string | null;
          notes: string | null;
          payment_date: string;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          appointment_id?: string | null;
          amount: number;
          payment_method?: string | null;
          notes?: string | null;
          payment_date?: string;
          organization_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          appointment_id?: string | null;
          amount?: number;
          payment_method?: string | null;
          notes?: string | null;
          payment_date?: string;
          organization_id?: string;
        };
      };
      schedule_blocks: {
        Row: {
          id: string;
          block_date: string;
          start_time: string | null;
          end_time: string | null;
          office_id: string | null;
          all_day: boolean;
          reason: string | null;
          created_by: string | null;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          block_date: string;
          start_time?: string | null;
          end_time?: string | null;
          office_id?: string | null;
          all_day?: boolean;
          reason?: string | null;
          created_by?: string | null;
          organization_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          block_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          office_id?: string | null;
          all_day?: boolean;
          reason?: string | null;
          created_by?: string | null;
          organization_id?: string;
        };
      };
      global_variables: {
        Row: {
          id: string;
          name: string;
          key: string;
          value: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          key: string;
          value?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          organization_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          key?: string;
          value?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          organization_id?: string;
        };
      };
      email_settings: {
        Row: {
          id: string;
          organization_id: string;
          sender_name: string | null;
          sender_email: string | null;
          reply_to_email: string | null;
          brand_color: string;
          email_logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          sender_name?: string | null;
          sender_email?: string | null;
          reply_to_email?: string | null;
          brand_color?: string;
          email_logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          sender_name?: string | null;
          sender_email?: string | null;
          reply_to_email?: string | null;
          brand_color?: string;
          email_logo_url?: string | null;
          updated_at?: string;
        };
      };
      email_templates: {
        Row: {
          id: string;
          organization_id: string;
          slug: string;
          category: string;
          name: string;
          description: string | null;
          subject: string;
          body: string;
          is_enabled: boolean;
          channel: "email" | "whatsapp" | "both";
          timing_value: number | null;
          timing_unit: string | null;
          min_plan_slug: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          slug: string;
          category: string;
          name: string;
          description?: string | null;
          subject?: string;
          body?: string;
          is_enabled?: boolean;
          channel?: "email" | "whatsapp" | "both";
          timing_value?: number | null;
          timing_unit?: string | null;
          min_plan_slug?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          slug?: string;
          category?: string;
          name?: string;
          description?: string | null;
          subject?: string;
          body?: string;
          is_enabled?: boolean;
          channel?: "email" | "whatsapp" | "both";
          timing_value?: number | null;
          timing_unit?: string | null;
          min_plan_slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
      };
    };
  };
}
