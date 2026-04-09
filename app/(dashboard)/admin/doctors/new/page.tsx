"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Doctors are now added through the members panel (invitations).
// Redirect to members page.
export default function NewDoctorPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/members");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
