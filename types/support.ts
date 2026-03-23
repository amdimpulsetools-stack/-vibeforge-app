export type TicketStatus = "open" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type SenderType = "user" | "support" | "system";

export interface SupportTicket {
  id: string;
  organization_id: string;
  created_by: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_type: SenderType;
  body: string;
  created_at: string;
}

export interface SupportTicketWithLastMessage extends SupportTicket {
  last_message?: SupportMessage | null;
  message_count?: number;
}

export const TICKET_STATUS_CONFIG: Record<
  TicketStatus,
  { label_es: string; label_en: string; color: string }
> = {
  open: { label_es: "Abierto", label_en: "Open", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  waiting: { label_es: "Esperando", label_en: "Waiting", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  resolved: { label_es: "Resuelto", label_en: "Resolved", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  closed: { label_es: "Cerrado", label_en: "Closed", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};
