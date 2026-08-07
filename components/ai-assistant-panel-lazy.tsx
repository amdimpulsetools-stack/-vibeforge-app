"use client";

import dynamic from "next/dynamic";

// El layout del dashboard es un Server Component: importar el panel IA
// estáticamente lo metía (con su lógica de chat, cuota y viewport) en el
// First Load de TODAS las páginas del dashboard. Este wrapper cliente lo
// baja como chunk aparte tras la hidratación (ssr:false) — el botón
// flotante aparece unos ms después, fuera del camino crítico.
const AiAssistantPanel = dynamic(
  () => import("@/components/ai-assistant-panel").then((m) => m.AiAssistantPanel),
  { ssr: false }
);

export function AiAssistantPanelLazy() {
  return <AiAssistantPanel />;
}
