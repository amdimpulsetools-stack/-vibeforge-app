import { WhatsAppClient } from "./client";
import type {
  WhatsAppTemplate,
  MetaCreateTemplatePayload,
  MetaTemplateComponent,
  MetaTemplateButtonComponent,
} from "./types";

/**
 * Builds a Meta Graph API template payload from our local WhatsApp template.
 */
export function buildMetaTemplatePayload(
  template: WhatsAppTemplate
): MetaCreateTemplatePayload {
  const components: MetaTemplateComponent[] = [];

  // Header component
  if (template.header_type !== "NONE" && template.header_content) {
    const headerComponent: MetaTemplateComponent = {
      type: "HEADER",
    };

    if (template.header_type === "TEXT") {
      headerComponent.format = "TEXT";
      headerComponent.text = template.header_content;
    } else {
      headerComponent.format = template.header_type as "IMAGE" | "VIDEO" | "DOCUMENT";
      headerComponent.example = {
        header_handle: [template.header_content],
      };
    }

    components.push(headerComponent);
  }

  // Body component
  const bodyComponent: MetaTemplateComponent = {
    type: "BODY",
    text: template.body_text,
  };

  // Add sample values for body variables
  const variableNumbers = Object.keys(template.sample_values)
    .map(Number)
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  if (variableNumbers.length > 0) {
    bodyComponent.example = {
      body_text: [variableNumbers.map((n) => template.sample_values[String(n)] || `ejemplo_${n}`)],
    };
  }

  components.push(bodyComponent);

  // Footer component
  if (template.footer_text) {
    components.push({
      type: "FOOTER",
      text: template.footer_text,
    });
  }

  // Buttons component
  if (template.buttons && template.buttons.length > 0) {
    const metaButtons: MetaTemplateButtonComponent[] = template.buttons.map(
      (btn) => {
        const metaBtn: MetaTemplateButtonComponent = {
          type: btn.type,
          text: btn.text,
        };
        if (btn.type === "URL" && btn.url) {
          metaBtn.url = btn.url;
        }
        if (btn.type === "PHONE_NUMBER" && btn.phone_number) {
          metaBtn.phone_number = btn.phone_number;
        }
        return metaBtn;
      }
    );

    components.push({
      type: "BUTTONS",
      buttons: metaButtons,
    });
  }

  return {
    name: template.meta_template_name,
    language: template.language,
    category: template.category,
    components,
  };
}

/**
 * Submits a template to Meta for review.
 */
export async function submitTemplateToMeta(
  client: WhatsAppClient,
  template: WhatsAppTemplate
): Promise<{ metaTemplateId: string }> {
  const payload = buildMetaTemplatePayload(template);
  const response = await client.createTemplate(payload);
  return { metaTemplateId: response.id };
}

/**
 * Syncs a template's status from Meta.
 */
export async function syncTemplateStatus(
  client: WhatsAppClient,
  template: WhatsAppTemplate
): Promise<{
  status: WhatsAppTemplate["status"];
  rejectionReason?: string;
}> {
  const response = await client.getTemplate(template.meta_template_name);

  if (!response.data || response.data.length === 0) {
    return { status: "DRAFT" };
  }

  const metaTemplate = response.data[0];
  const status = metaTemplate.status?.toUpperCase() as WhatsAppTemplate["status"];

  return {
    status: status || "PENDING",
    rejectionReason: undefined, // Meta includes this in template details if rejected
  };
}

/**
 * Validates a Meta template name (lowercase, underscores, no spaces).
 */
export function isValidMetaTemplateName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name) && name.length <= 512;
}

/**
 * Converts a human-readable name to a valid Meta template name.
 */
export function toMetaTemplateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[áà]/g, "a")
    .replace(/[éè]/g, "e")
    .replace(/[íì]/g, "i")
    .replace(/[óò]/g, "o")
    .replace(/[úù]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
