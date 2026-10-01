"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2, Workflow } from "lucide-react";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { setInboxOrg } from "../../use-inbox";
import { useFlow } from "../use-flows";

// El lienzo solo en el navegador (React Flow mide el DOM); aislado a esta ruta.
const FlowEditor = dynamic(() => import("./flow-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

export default function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { organizationId } = useOrganization();
  setInboxOrg(organizationId ?? null);
  const { isAdmin, loading: roleLoading } = useOrgRole();
  const { hasAnyAddon, loading: addonsLoading } = useOrgAddons();
  const q = useFlow(organizationId ? id : null);

  if (roleLoading || addonsLoading || q.isPending) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!hasAnyAddon(["captacion"]) || q.error) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <Workflow className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">{q.error ? (q.error as Error).message : "Flows no está disponible"}</h1>
        <Link href="/conversaciones/flows" className="mt-4 inline-block text-sm font-medium text-primary">
          Volver a Flows
        </Link>
      </div>
    );
  }
  return <FlowEditor key={q.data.flow.id} flow={q.data.flow} readOnly={!isAdmin} />;
}
