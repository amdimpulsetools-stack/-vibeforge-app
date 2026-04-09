import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check org-level admin role (owner or admin)
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const isOrgAdmin =
    membership?.role === "owner" || membership?.role === "admin";

  if (!isOrgAdmin) redirect("/dashboard");

  return <>{children}</>;
}
