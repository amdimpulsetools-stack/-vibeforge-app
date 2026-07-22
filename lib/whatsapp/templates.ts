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
      // Same Meta rule as the body: a TEXT header containing {{1}} must
      // ship an example value or the whole template is rejected (#100).
      if (/\{\{\d+\}\}/.test(template.header_content)) {
        headerComponent.example = { header_text: ["Ejemplo"] };
      }
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

  // Add sample values for body variables. Meta REJECTS ("Invalid
  // parameter", #100) any template whose body contains {{n}} variables
  // but ships no example values — so the variable list must come from
  // the BODY TEXT itself, not only from whatever sample_values the user
  // happened to type. Union of both sources + fallback per variable.
  const bodyVarNumbers = [...template.body_text.matchAll(/\{\{(\d+)\}\}/g)].map(
    (m) => Number(m[1])
  );
  const sampleKeyNumbers = Object.keys(template.sample_values)
    .map(Number)
    .filter((n) => !isNaN(n));
  const variableNumbers = [...new Set([...bodyVarNumbers, ...sampleKeyNumbers])].sort(
    (a, b) => a - b
  );

  if (variableNumbers.length > 0) {
    bodyComponent.example = {
      body_text: [
        variableNumbers.map(
          (n) => template.sample_values[String(n)]?.trim() || `Ejemplo ${n}`
        ),
      ],
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
 * Pre-valida contra las reglas NO documentadas en el error de Meta —
 * ambas devuelven el críptico "Invalid parameter" (#100) sin explicar:
 *  1. Las variables del body deben ser consecutivas empezando en {{1}}
 *     ({{1}},{{2}},{{5}} → rechazada por el salto).
 *  2. El body no puede TERMINAR en una variable (ni empezar por una en
 *     algunas revisiones — lo bloqueamos también, cuesta nada).
 * Devuelve un mensaje accionable en español, o null si pasa.
 * (Reproducido en vivo con el founder, 2026-07-22.)
 */
export function validateTemplateBodyForMeta(bodyText: string): string | null {
  const numbers = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
    Number(m[1])
  );
  if (numbers.length > 0) {
    const unique = [...new Set(numbers)].sort((a, b) => a - b);
    const expected = Array.from({ length: unique.length }, (_, i) => i + 1);
    const isSequential = unique.every((n, i) => n === expected[i]);
    if (!isSequential) {
      return (
        `Meta exige variables consecutivas empezando en {{1}} y sin saltos. ` +
        `Tu mensaje usa {{${unique.join("}}, {{")}}} — renumera a ` +
        `{{${expected.join("}}, {{")}}} (y ajusta el mapeo).`
      );
    }
    const trimmed = bodyText.trim();
    if (/\{\{\d+\}\}$/.test(trimmed)) {
      return (
        "Meta no permite que el mensaje TERMINE en una variable. " +
        "Agrega texto después de la última variable (ej. \"¡Te esperamos!\")."
      );
    }
    if (/^\{\{\d+\}\}/.test(trimmed)) {
      return (
        "Meta no permite que el mensaje EMPIECE con una variable. " +
        "Agrega texto antes (ej. \"Hola {{1}}, ...\")."
      );
    }
  }
  return null;
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
