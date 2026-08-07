import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { PatientWithTags } from "@/types/admin";
import { PatientsClient } from "./patients-client";

// Debe coincidir con PAGE_SIZE y el select del listado en patients-client.tsx
// — la key de React Query que siembra esta página es la de "página 0 sin
// filtros", así que columnas u orden distintos romperían la equivalencia.
const PAGE_SIZE = 25;

export default async function PatientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Misma query que el cliente para la página 0 sin filtros. RLS (org activa
  // + restricción de doctor) aplica igual que en el navegador: mismo usuario,
  // misma sesión. Si falla, el cliente simplemente hace su fetch normal.
  const { data, count } = await supabase
    .from("patients")
    .select(
      "id, first_name, last_name, dni, document_type, phone, email, birth_date, sex, status, is_recurring, created_at, referral_source, origin, departamento, distrito, notes, custom_field_1, custom_field_2, is_foreigner, nationality, patient_tags(id, tag)",
      { count: "exact" }
    )
    .order("last_name")
    .range(0, PAGE_SIZE - 1);

  return (
    <PatientsClient
      initialFirstPage={
        data
          ? { rows: data as unknown as PatientWithTags[], count: count ?? 0 }
          : null
      }
    />
  );
}
