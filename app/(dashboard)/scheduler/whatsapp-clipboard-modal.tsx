"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, X, Copy, Check } from "lucide-react";
import {
  loadWaClipboardConfig,
  buildWhatsAppMessage,
  type AppointmentVariables,
} from "@/lib/whatsapp-clipboard-config";

interface WhatsAppClipboardModalProps {
  open: boolean;
  variables: AppointmentVariables;
  onClose: () => void;
}

export function WhatsAppClipboardModal({
  open,
  variables,
  onClose,
}: WhatsAppClipboardModalProps) {
  const [copied, setCopied] = useState(false);
  const config = loadWaClipboardConfig();

  const message = buildWhatsAppMessage(config.template, variables);

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
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
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
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {message}
            </p>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
              >
                Listo
              </button>

              <button
                onClick={handleCopy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent active:bg-accent/80"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ¡Copiado!
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar mensaje de Whatsapp
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
