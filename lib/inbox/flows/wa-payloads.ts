/**
 * Payloads interactivos de la API de Meta (botones y listas). Límites de
 * Meta, no nuestros: 3 botones de 20 caracteres; 10 filas (título 24,
 * descripción 72), botón de la lista 20. Los ids llevan "<nodo>:<id>" para
 * que la respuesta vuelva a su nodo.
 */

export function buttonsPayload(to: string, nodeId: string, text: string, buttons: Array<{ id: string; title: string }>): Record<string, unknown> {
  return {
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: `${nodeId}:${b.id}`.slice(0, 256), title: b.title.slice(0, 20) } })),
      },
    },
  };
}

export function listPayload(
  to: string,
  nodeId: string,
  text: string,
  buttonLabel: string,
  rows: Array<{ id: string; title: string; description?: string }>,
): Record<string, unknown> {
  return {
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: text.slice(0, 4096) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            rows: rows.slice(0, 10).map((r) => ({
              id: `${nodeId}:${r.id}`.slice(0, 200),
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  };
}

/** Texto plano que se muestra en el hilo por un interactivo enviado. */
export function interactiveDisplayBody(text: string, options: Array<{ title: string }>): string {
  return `${text}\n${options.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}`;
}
