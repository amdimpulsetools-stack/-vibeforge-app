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
          address: string | null;
          google_maps_url: string | null;
          primary_specialty_id: string | null;
          plan: "free" | "pro" | "enterprise";
          is_active: boolean;
          created_at: string;
          updated_at: string;
          // Branding (migration 115)
          tagline: string | null;
          ruc: string | null;
          legal_name: string | null;
          district: string | null;
          phone: string | null;
          phone_secondary: string | null;
          email_public: string | null;
          website: string | null;
          social_facebook: string | null;
          social_instagram: string | null;
          social_tiktok: string | null;
          social_linkedin: string | null;
          social_youtube: string | null;
          social_whatsapp: string | null;
          print_color_primary: string | null;
          // SUNAT ubigeo (migration 117) — exactly 6 digits.
          ubigeo: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          address?: string | null;
          google_maps_url?: string | null;
          primary_specialty_id?: string | null;
          plan?: "free" | "pro" | "enterprise";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          tagline?: string | null;
          ruc?: string | null;
          legal_name?: string | null;
          district?: string | null;
          phone?: string | null;
          phone_secondary?: string | null;
          email_public?: string | null;
          website?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_tiktok?: string | null;
          social_linkedin?: string | null;
          social_youtube?: string | null;
          social_whatsapp?: string | null;
          print_color_primary?: string | null;
          ubigeo?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          address?: string | null;
          google_maps_url?: string | null;
          primary_specialty_id?: string | null;
          plan?: "free" | "pro" | "enterprise";
          is_active?: boolean;
          updated_at?: string;
          tagline?: string | null;
          ruc?: string | null;
          legal_name?: string | null;
          district?: string | null;
          phone?: string | null;
          phone_secondary?: string | null;
          email_public?: string | null;
          website?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_tiktok?: string | null;
          social_linkedin?: string | null;
          social_youtube?: string | null;
          social_whatsapp?: string | null;
          print_color_primary?: string | null;
          ubigeo?: string | null;
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
          theme: "light" | "dark";
          created_at: string;
          updated_at: string;
          // Terms / Privacy acceptance (migration 116). NULL means the user
          // predates the consent flow or has not yet accepted.
          accepted_terms_at: string | null;
          accepted_terms_version: string | null;
          accepted_privacy_at: string | null;
          accepted_privacy_version: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: "user" | "admin";
          theme?: "light" | "dark";
          created_at?: string;
          updated_at?: string;
          accepted_terms_at?: string | null;
          accepted_terms_version?: string | null;
          accepted_privacy_at?: string | null;
          accepted_privacy_version?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: "user" | "admin";
          theme?: "light" | "dark";
          updated_at?: string;
          accepted_terms_at?: string | null;
          accepted_terms_version?: string | null;
          accepted_privacy_at?: string | null;
          accepted_privacy_version?: string | null;
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
          pre_appointment_instructions: string | null;
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
          pre_appointment_instructions?: string | null;
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
          pre_appointment_instructions?: string | null;
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
      // doctor_specialties (migration 119) — multi specialty per doctor.
      doctor_specialties: {
        Row: {
          id: string;
          doctor_id: string;
          specialty: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          specialty: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          specialty?: string;
          is_primary?: boolean;
          created_at?: string;
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
          organization_id: string | null;
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
          organization_id?: string | null;
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
          organization_id?: string | null;
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
          custom_field_1: string | null;
          custom_field_2: string | null;
          referral_source: string | null;
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
          custom_field_1?: string | null;
          custom_field_2?: string | null;
          referral_source?: string | null;
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
          custom_field_1?: string | null;
          custom_field_2?: string | null;
          referral_source?: string | null;
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
          notification_emails: string | null;
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
          notification_emails?: string | null;
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
          notification_emails?: string | null;
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
      whatsapp_config: {
        Row: {
          id: string;
          organization_id: string;
          waba_id: string | null;
          phone_number_id: string | null;
          access_token: string | null;
          webhook_verify_token: string | null;
          business_verified: boolean;
          messaging_tier: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          waba_id?: string | null;
          phone_number_id?: string | null;
          access_token?: string | null;
          webhook_verify_token?: string | null;
          business_verified?: boolean;
          messaging_tier?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          waba_id?: string | null;
          phone_number_id?: string | null;
          access_token?: string | null;
          webhook_verify_token?: string | null;
          business_verified?: boolean;
          messaging_tier?: string;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      whatsapp_templates: {
        Row: {
          id: string;
          organization_id: string;
          local_template_id: string | null;
          meta_template_name: string;
          meta_template_id: string | null;
          category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
          language: string;
          status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
          rejection_reason: string | null;
          header_type: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
          header_content: string | null;
          body_text: string;
          footer_text: string | null;
          buttons: unknown;
          variable_mapping: unknown;
          sample_values: unknown;
          submitted_at: string | null;
          reviewed_at: string | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          local_template_id?: string | null;
          meta_template_name: string;
          meta_template_id?: string | null;
          category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
          language?: string;
          status?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
          rejection_reason?: string | null;
          header_type?: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
          header_content?: string | null;
          body_text?: string;
          footer_text?: string | null;
          buttons?: unknown;
          variable_mapping?: unknown;
          sample_values?: unknown;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          local_template_id?: string | null;
          meta_template_name?: string;
          meta_template_id?: string | null;
          category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
          language?: string;
          status?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
          rejection_reason?: string | null;
          header_type?: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
          header_content?: string | null;
          body_text?: string;
          footer_text?: string | null;
          buttons?: unknown;
          variable_mapping?: unknown;
          sample_values?: unknown;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          last_synced_at?: string | null;
          updated_at?: string;
        };
      };
      specialties: {
        Row: {
          id: string;
          name: string;
          slug: string;
          icon: string | null;
          description: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          icon?: string | null;
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          icon?: string | null;
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
        };
      };
      organization_specialties: {
        Row: {
          id: string;
          organization_id: string;
          specialty_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          specialty_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          specialty_id?: string;
        };
      };
      whatsapp_message_logs: {
        Row: {
          id: string;
          organization_id: string;
          template_id: string | null;
          recipient_phone: string;
          patient_id: string | null;
          appointment_id: string | null;
          wamid: string | null;
          status: "sent" | "delivered" | "read" | "failed";
          error_code: string | null;
          error_message: string | null;
          cost: number | null;
          sent_at: string;
          delivered_at: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          template_id?: string | null;
          recipient_phone: string;
          patient_id?: string | null;
          appointment_id?: string | null;
          wamid?: string | null;
          status?: "sent" | "delivered" | "read" | "failed";
          error_code?: string | null;
          error_message?: string | null;
          cost?: number | null;
          sent_at?: string;
          delivered_at?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          template_id?: string | null;
          recipient_phone?: string;
          patient_id?: string | null;
          appointment_id?: string | null;
          wamid?: string | null;
          status?: "sent" | "delivered" | "read" | "failed";
          error_code?: string | null;
          error_message?: string | null;
          cost?: number | null;
          sent_at?: string;
          delivered_at?: string | null;
          read_at?: string | null;
        };
      };
    };
  };
}
