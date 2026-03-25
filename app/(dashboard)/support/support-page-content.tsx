"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle,
  Plus,
  Send,
  ArrowLeft,
  Clock,
  CheckCircle2,
  Loader2,
  Headphones,
  Inbox,
} from "lucide-react";
import type {
  SupportTicket,
  SupportMessage,
  TicketStatus,
  TICKET_STATUS_CONFIG,
} from "@/types/support";
import { TICKET_STATUS_CONFIG as STATUS_CONFIG } from "@/types/support";

type ViewMode = "list" | "chat" | "new";

export function SupportPageContent() {
  const { t, language } = useLanguage();
  const { organization } = useOrganization();
  const supabase = createClient();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // Load tickets
  const loadTickets = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false });

    if (error) {
      toast.error(t("support.load_error"));
    } else {
      setTickets(data || []);
    }
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Load messages when ticket selected
  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages(data || []);
    }
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      loadMessages(selectedTicket.id);
    }
  }, [selectedTicket, loadMessages]);

  // Realtime subscription for messages
  useEffect(() => {
    if (!selectedTicket) return;

    const channel = supabase
      .channel(`support-messages-${selectedTicket.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${selectedTicket.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as SupportMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicket]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create new ticket
  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newMessage.trim()) {
      toast.error(t("support.fill_all_fields") || "Completa todos los campos");
      return;
    }
    if (!organization?.id) {
      toast.error("No se encontró tu organización. Intenta recargar la página.");
      return;
    }
    if (!userId) {
      toast.error("No se pudo verificar tu sesión. Intenta recargar la página.");
      return;
    }
    setSending(true);

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        organization_id: organization.id,
        created_by: userId,
        subject: newSubject.trim(),
        status: "open",
        priority: "normal",
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket creation error:", ticketError);
      toast.error(ticketError?.message || t("support.create_error"));
      setSending(false);
      return;
    }

    // Add first message
    const { error: msgError } = await supabase.from("support_messages").insert({
      ticket_id: ticket.id,
      sender_id: userId,
      sender_type: "user",
      body: newMessage.trim(),
    });

    if (msgError) {
      console.error("Message creation error:", msgError);
      toast.error(msgError.message || t("support.send_error"));
    } else {
      toast.success(t("support.ticket_created"));
      setNewSubject("");
      setNewMessage("");
      setSelectedTicket(ticket);
      setViewMode("chat");
      loadTickets();
    }
    setSending(false);
  };

  // Send message
  const handleSendMessage = async () => {
    if (!selectedTicket || !userId || !messageText.trim()) return;
    setSending(true);

    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selectedTicket.id,
      sender_id: userId,
      sender_type: "user",
      body: messageText.trim(),
    });

    if (error) {
      toast.error(t("support.send_error"));
    } else {
      setMessageText("");
      textareaRef.current?.focus();
    }
    setSending(false);
  };

  // Handle enter to send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const openTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setViewMode("chat");
  };

  const goBack = () => {
    setViewMode("list");
    setSelectedTicket(null);
    setMessages([]);
    loadTickets();
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return language === "es" ? "ahora" : "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(language === "es" ? "es" : "en", {
      day: "numeric",
      month: "short",
    });
  };

  const getStatusBadge = (status: TicketStatus) => {
    const config = STATUS_CONFIG[status];
    const label = language === "es" ? config.label_es : config.label_en;
    return (
      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", config.color)}>
        {label}
      </span>
    );
  };

  // ─── LIST VIEW ──────────────────────────────────
  if (viewMode === "list") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("support.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("support.subtitle")}
            </p>
          </div>
          <Button
            onClick={() => setViewMode("new")}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            {t("support.new_ticket")}
          </Button>
        </div>

        <Separator />

        {/* Tickets list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 mb-4">
              <Headphones className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold">{t("support.no_tickets")}</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {t("support.no_tickets_desc")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => openTicket(ticket)}
                className="w-full group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:bg-accent/40 hover:border-border"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    ticket.status === "open"
                      ? "bg-emerald-500/10"
                      : ticket.status === "waiting"
                        ? "bg-amber-500/10"
                        : "bg-zinc-500/10"
                  )}
                >
                  {ticket.status === "resolved" || ticket.status === "closed" ? (
                    <CheckCircle2
                      className={cn(
                        "h-5 w-5",
                        ticket.status === "resolved" ? "text-blue-400" : "text-zinc-400"
                      )}
                    />
                  ) : ticket.status === "waiting" ? (
                    <Clock className="h-5 w-5 text-amber-400" />
                  ) : (
                    <MessageCircle className="h-5 w-5 text-emerald-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {ticket.subject || t("support.no_subject")}
                    </span>
                    {getStatusBadge(ticket.status)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(ticket.updated_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── NEW TICKET VIEW ──────────────────────────────
  if (viewMode === "new") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("support.new_ticket")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("support.new_ticket_desc")}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("support.subject")}</label>
            <Input
              placeholder={t("support.subject_placeholder")}
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="bg-card"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("support.message")}</label>
            <Textarea
              placeholder={t("support.message_placeholder")}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={6}
              className="bg-card resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={goBack}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreateTicket}
              disabled={!newSubject.trim() || !newMessage.trim() || sending}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("support.send_ticket")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── CHAT VIEW ──────────────────────────────────
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      {/* Chat header */}
      <div className="flex items-center gap-3 pb-4">
        <button
          onClick={goBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate">
              {selectedTicket?.subject || t("support.no_subject")}
            </h2>
            {selectedTicket && getStatusBadge(selectedTicket.status)}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("support.ticket_id")}: {selectedTicket?.id.slice(0, 8)}
          </p>
        </div>
      </div>

      <Separator />

      {/* Messages area */}
      <ScrollArea className="flex-1 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t("support.no_messages")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isUser = msg.sender_type === "user" && msg.sender_id === userId;
              const isSystem = msg.sender_type === "system";

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                      {msg.body}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={cn("flex", isUser ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                      isUser
                        ? "bg-emerald-600 text-white rounded-br-md"
                        : "bg-card border border-border/60 text-foreground rounded-bl-md"
                    )}
                  >
                    {!isUser && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Headphones className="h-3 w-3 text-emerald-400" />
                        <span className="text-[10px] font-medium text-emerald-400">
                          {t("support.support_team")}
                        </span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {msg.body}
                    </p>
                    <span
                      className={cn(
                        "mt-1 block text-[10px]",
                        isUser ? "text-white/60 text-right" : "text-muted-foreground"
                      )}
                    >
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      {selectedTicket?.status !== "closed" && (
        <>
          <Separator />
          <div className="flex items-end gap-2 pt-3">
            <Textarea
              ref={textareaRef}
              placeholder={t("support.type_message")}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="min-h-[40px] max-h-[120px] resize-none bg-card"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || sending}
              size="icon"
              className="h-10 w-10 shrink-0 bg-emerald-600 hover:bg-emerald-700"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {t("support.enter_to_send")}
          </p>
        </>
      )}
    </div>
  );
}
