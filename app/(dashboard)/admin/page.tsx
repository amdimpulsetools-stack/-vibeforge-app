import { createClient } from "@/lib/supabase/server";
import { AdminPageContent } from "./admin-page-content";

const COUNT_TABLES = ["offices", "doctors", "services", "lookup_values", "organization_members", "exam_catalog", "custom_diagnosis_codes"] as const;

export default async function AdminPage() {
  const supabase = await createClient();

  const counts = await Promise.all(
    COUNT_TABLES.map(async (table) => {
      const { count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    })
  );

  return (
    <AdminPageContent
      officeCount={counts[0]}
      doctorCount={counts[1]}
      serviceCount={counts[2]}
      lookupCount={counts[3]}
      memberCount={counts[4]}
      examCount={counts[5]}
      diagnosisCodesCount={counts[6]}
    />
  );
}
