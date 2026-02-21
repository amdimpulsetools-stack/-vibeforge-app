// Tipos generados automáticamente desde Supabase
// Ejecuta: npm run types para regenerar

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Domingo ... 6=Sábado
export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type GlobalVariableType = "text" | "number" | "boolean" | "color";

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
      doctors: {
        Row: {
          id: string;
          name: string;
          specialty: string | null;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          color: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          specialty?: string | null;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          color?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          specialty?: string | null;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          color?: string;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      services: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price: number | null;
          color: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number | null;
          color?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number | null;
          color?: string;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      doctor_services: {
        Row: { doctor_id: string; service_id: string };
        Insert: { doctor_id: string; service_id: string };
        Update: { doctor_id?: string; service_id?: string };
      };
      doctor_schedules: {
        Row: {
          id: string;
          doctor_id: string;
          day_of_week: DayOfWeek;
          start_time: string;
          end_time: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          day_of_week: DayOfWeek;
          start_time: string;
          end_time: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          day_of_week?: DayOfWeek;
          start_time?: string;
          end_time?: string;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      break_times: {
        Row: {
          id: string;
          doctor_id: string | null;
          name: string;
          start_time: string;
          end_time: string;
          day_of_week: DayOfWeek | null;
          is_recurring: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id?: string | null;
          name: string;
          start_time: string;
          end_time: string;
          day_of_week?: DayOfWeek | null;
          is_recurring?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string | null;
          name?: string;
          start_time?: string;
          end_time?: string;
          day_of_week?: DayOfWeek | null;
          is_recurring?: boolean;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          doctor_id: string;
          service_id: string;
          patient_name: string;
          patient_phone: string | null;
          patient_email: string | null;
          appointment_date: string;
          start_time: string;
          end_time: string;
          status: AppointmentStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          service_id: string;
          patient_name: string;
          patient_phone?: string | null;
          patient_email?: string | null;
          appointment_date: string;
          start_time: string;
          end_time: string;
          status?: AppointmentStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          service_id?: string;
          patient_name?: string;
          patient_phone?: string | null;
          patient_email?: string | null;
          appointment_date?: string;
          start_time?: string;
          end_time?: string;
          status?: AppointmentStatus;
          notes?: string | null;
          updated_at?: string;
        };
      };
      global_variables: {
        Row: {
          id: string;
          key: string;
          value: string;
          type: GlobalVariableType;
          description: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: string;
          type?: GlobalVariableType;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: string;
          type?: GlobalVariableType;
          description?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
      };
    };
  };
}
