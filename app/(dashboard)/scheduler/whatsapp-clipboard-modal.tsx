"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X, Copy, Check } from "lucide-react";
import {
  WhatsAppIcon,
  waSolidButton,
  waOutlineButton,
} from "@/components/icons/whatsapp-icon";
import { cn } from "@/lib/utils";
import {
  loadWaClipboardConfig,
  buildWhatsAppMessage,
  normalizePhoneForWa,
  type AppointmentVariables,
} from "@/lib/whatsapp-clipboard-config";

interface WhatsAppClipboardModalProps {
  open: boolean;
  variables: AppointmentVariables;
  /** Patient phone (raw). When valid the "Enviar por WhatsApp" button is shown. */
  phone?: string | null;
  onClose: () => void;
}

export function WhatsAppClipboardModal({
  open,
  variables,
  phone,
  onClose,
}: WhatsAppClipboardModalProps) {
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Device-aware default action ordering. We track this on mount + on
  // resize so the visual update follows window size changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const config = loadWaClipboardConfig();
  const message = buildWhatsAppMessage(config.template, variables);
  const waPhone = normalizePhoneForWa(phone);
  const canSend = !!waPhone;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = message;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendWa = () => {
    if (!waPhone) return;
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Style classes for the action buttons. On mobile, "Enviar por WA" is
  // the primary visual; on desktop, "Copiar" is primary.
  //
  // Ojo con el reparto de color: "Copiar mensaje" NO abre WhatsApp (deja
  // el texto en el portapapeles para que lo pegues donde quieras), así
  // que se queda en la marca del tema aunque el modal se llame
  // "WhatsApp clipboard". El verde de WhatsApp está reservado para los
  // dos botones que sí hacen window.open a wa.me.
  const shell =
    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm";
  const brandBtn = cn(
    shell,
    "bg-primary font-semibold text-primary-foreground transition-colors hover:opacity-90 active:opacity-80"
  );
  const neutralBtn = cn(
    shell,
    "border border-border font-medium text-foreground transition-colors hover:bg-accent active:bg-accent/80"
  );
  const waPrimaryBtn = cn(shell, "font-semibold", waSolidButton);
  const waSecondaryBtn = cn(shell, "font-medium", waOutlineButton);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 400,
              duration: 0.2,
            }}
          >
            {/* Close button */}
            <div className="flex justify-between items-start mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-success-500" />
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold mb-2">Nueva cita reservada</h3>

            {/* Message preview */}
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed whitespace-pre-line">
              {message}
            </p>

            {/* Actions */}
            <div className="space-y-2">
              {canSend && isMobile && (
                <button onClick={handleSendWa} className={waPrimaryBtn}>
                  <WhatsAppIcon className="h-4 w-4" />
                  Enviar por WhatsApp
                </button>
              )}

              <button
                onClick={handleCopy}
                className={cn(canSend && !isMobile ? brandBtn : neutralBtn)}
              >
                {copied ? (
                  <>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        canSend && !isMobile
                          ? "text-primary-foreground"
                          : "text-emerald-500"
                      )}
                    />
                    <span
                      className={cn(
                        canSend && !isMobile
                          ? "text-primary-foreground"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      ¡Copiado!
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar mensaje
                  </>
                )}
              </button>

              {canSend && !isMobile && (
                <button onClick={handleSendWa} className={waSecondaryBtn}>
                  <WhatsAppIcon className="h-4 w-4" />
                  Enviar por WhatsApp
                </button>
              )}

              <button
                onClick={onClose}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Listo
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
