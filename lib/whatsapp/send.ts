import { WhatsAppClient } from "./client";
import type {
  WhatsAppTemplate,
  MetaSendMessagePayload,
  MetaMessageComponent,
  MetaMessageParameter,
} from "./types";

/**
 * Resolves variable values for a WhatsApp template given appointment data.
 */
export function resolveVariableValues(
  template: WhatsAppTemplate,
  data: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [position, variableName] of Object.entries(template.variable_mapping)) {
    resolved[position] = data[variableName] || "";
  }

  return resolved;
}

/**
 * Builds the Meta API payload for sending a template message.
 */
export function buildSendPayload(
  template: WhatsAppTemplate,
  recipientPhone: string,
  variableValues: Record<string, string>
): MetaSendMessagePayload {
  const components: MetaMessageComponent[] = [];

  // Header parameters (if header has variables)
  if (template.header_type === "TEXT" && template.header_content?.includes("{{")) {
    components.push({
      type: "header",
      parameters: [{ type: "text", text: variableValues["header_1"] || "" }],
    });
  } else if (template.header_type === "IMAGE" && template.header_content) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: template.header_content } }],
    });
  }

  // Body parameters
  const variableNumbers = Object.keys(variableValues)
    .map(Number)
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  if (variableNumbers.length > 0) {
    const parameters: MetaMessageParameter[] = variableNumbers.map((n) => ({
      type: "text" as const,
      text: variableValues[String(n)] || "",
    }));

    components.push({
      type: "body",
      parameters,
    });
  }

  // Button parameters (for URL buttons with dynamic suffix)
  if (template.buttons) {
    template.buttons.forEach((btn, index) => {
      if (btn.type === "URL" && btn.url?.includes("{{")) {
        components.push({
          type: "button",
          sub_type: "url",
          index,
          parameters: [{ type: "text", text: variableValues[`btn_${index}`] || "" }],
        });
      }
    });
  }

  return {
    messaging_product: "whatsapp",
    to: recipientPhone.replace(/[^0-9]/g, ""), // Strip non-numeric chars
    type: "template",
    template: {
      name: template.meta_template_name,
      language: { code: template.language },
      components: components.length > 0 ? components : undefined,
    },
  };
}

/**
 * Sends a WhatsApp template message through the Meta API.
 * Returns the WhatsApp message ID (wamid).
 */
export async function sendWhatsAppMessage(
  client: WhatsAppClient,
  template: WhatsAppTemplate,
  recipientPhone: string,
  variableValues: Record<string, string>
): Promise<{ wamid: string }> {
  const payload = buildSendPayload(template, recipientPhone, variableValues);
  const response = await client.sendTemplateMessage(payload);

  const wamid = response.messages?.[0]?.id;
  if (!wamid) {
    throw new Error("No message ID returned from Meta");
  }

  return { wamid };
}
