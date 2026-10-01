"use client";

/**
 * Conversaciones — bandeja de WhatsApp (CRM WhatsApp + Captación, mig 275).
 *
 * Aislada del resto de Yenda: su sondeo y sus consultas solo existen
 * mientras esta pantalla está abierta. Visible con el addon `captacion`
 * para administración y recepción; doctores solo si la clínica lo activó
 * (la RLS y la API lo vuelven a exigir).
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2, MessagesSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { useOrgToday } from "@/hooks/use-org-today";
import { DataLoadError, useReportLoadError } from "../scheduler/data-load-error";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { DetailsPanel } from "./details-panel";
import { inboxFetch, inboxKeys, useConversations, useInboxSettings, useMessages, useOrgTags } from "./use-inbox";

const InboxSettingsDialog = dynamic(() => import("./inbox-settings").then((m) => m.InboxSettingsDialog), { ssr: false });

export default function ConversacionesPage() {
  const { organizationId } = useOrganization();
  const { isAdmin, isDoctor, loading: roleLoading } = useOrgRole();
  const { hasAnyAddon, loading: addonsLoading } = useOrgAddons();
  const { timezone } = useOrgToday();
  const { data: settings, isPending: settingsPending } = useInboxSettings(organizationId);
  const enabled = hasAnyAddon(["captacion"]);
  const doctorBlocked = isDoctor && !settings?.doctors_enabled;

  if (roleLoading || addonsLoading || (isDoctor && settingsPending)) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!enabled || doctorBlocked) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <MessagesSquare className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Conversaciones no está disponible</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {!enabled
            ? "Activa el módulo CRM WhatsApp + Captación para atender a tus pacientes desde Yenda."
            : "La clínica no habilitó el acceso de doctores a Conversaciones."}
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-primary">
          Volver al inicio
        </Link>
      </div>
    );
  }
  return <InboxApp orgId={organizationId} timezone={timezone} canManage={isAdmin} />;
}

function InboxApp({ orgId, timezone, canManage }: { orgId: string | null; timezone: string; canManage: boolean }) {
  const qc = useQueryClient();
  const conversations = useConversations(orgId);
  useReportLoadError(conversations.error, { area: "conversaciones", query: "wa_conversations" });
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: tags = [] } = useOrgTags(orgId);
  // Panel derecho abierto de entrada solo en escritorio grande; en tablet
  // y celular es un panel deslizable que se abre a pedido.
  const [detailsOpen, setDetailsOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messages = useMessages(activeId);
  useReportLoadError(messages.error, { area: "conversaciones", query: "wa_messages" });

  const rows = conversations.data;
  const active = useMemo(() => rows?.find((c) => c.id === activeId) ?? null, [rows, activeId]);

  // Escritorio: abre la primera conversación al cargar.
  useEffect(() => {
    if (!activeId && rows && rows.length > 0 && typeof window !== "undefined" && window.innerWidth >= 768) {
      setActiveId(rows[0].id);
    }
  }, [rows, activeId]);

  // Al abrir un chat con no leídos: marcar leído (y doble check a la paciente).
  const unread = active?.unread_count ?? 0;
  useEffect(() => {
    if (!active || unread === 0) return;
    void inboxFetch(`/api/inbox/conversations/${active.id}`, { method: "PATCH", body: { read: true } }).then(() =>
      qc.invalidateQueries({ queryKey: inboxKeys.conversations(orgId) }),
    );
  }, [active, unread, orgId, qc]);

  // Respaldo del envío de programados mientras la pantalla está abierta
  // (el disparador principal es pg_cron → /api/cron/inbox-dispatch).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void fetch("/api/inbox/dispatch", { method: "POST" }).catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="-mx-4 -mt-4 grid h-[calc(100dvh-5rem)] overflow-hidden md:-mx-7 md:-mb-7 md:-mt-7 md:h-[calc(100dvh-4rem)] md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[330px_minmax(0,1fr)_auto]">
      <div className={cn("min-h-0", activeId ? "hidden md:block" : "block")}>
        {conversations.error ? (
          <div className="p-4">
            <DataLoadError
              title="No se pudieron cargar las conversaciones."
              description="Tus conversaciones no se han perdido. Reintenta en un momento."
              error={conversations.error}
              onRetry={() => void conversations.refetch()}
              retrying={conversations.isFetching}
            />
          </div>
        ) : !rows ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <ConversationList
            conversations={rows}
            tags={tags}
            activeId={activeId}
            onSelect={setActiveId}
            timezone={timezone}
            canManage={canManage}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </div>

      <div className={cn("min-h-0 min-w-0", activeId ? "block" : "hidden md:block")}>
        {active ? (
          <ChatView
            conversation={active}
            messages={messages.data}
            messagesError={messages.error}
            onRetry={() => void messages.refetch()}
            retrying={messages.isFetching}
            timezone={timezone}
            onBack={() => setActiveId(null)}
            onToggleDetails={() => setDetailsOpen((v) => !v)}
            onSent={() => undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/30 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10" />
            <p className="text-sm">Elige una conversación para empezar</p>
          </div>
        )}
      </div>

      {active && detailsOpen && (
        <>
          {/* Escritorio grande: columna fija. Tablet/móvil: panel deslizable. */}
          <div className="hidden min-h-0 w-[320px] lg:block">
            <DetailsPanel conversation={active} messages={messages.data ?? []} timezone={timezone} />
          </div>
          <div className="fixed inset-0 z-40 flex justify-end bg-black/30 lg:hidden" onClick={() => setDetailsOpen(false)}>
            <div className="h-full w-[min(340px,92vw)]" onClick={(e) => e.stopPropagation()}>
              <DetailsPanel conversation={active} messages={messages.data ?? []} timezone={timezone} onClose={() => setDetailsOpen(false)} />
            </div>
          </div>
        </>
      )}

      {canManage && settingsOpen && <InboxSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </div>
  );
}
