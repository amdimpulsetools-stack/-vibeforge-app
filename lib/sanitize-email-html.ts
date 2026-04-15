/**
 * Sanitizer for user-authored email bodies (from the rich-text editor).
 *
 * Applied twice, defense in depth:
 *   1. In the browser when the user edits (so what they see is what gets saved).
 *   2. On the server before injecting into the email template shell.
 *
 * The allow-list is intentionally conservative: we only allow formatting
 * tags that are widely supported by email clients (Gmail, Outlook, Apple
 * Mail, Yahoo, etc.). Styles are limited to `text-align` for alignment —
 * anything else is stripped, which prevents style-based XSS and keeps the
 * output compatible with the inline-style template wrapper.
 */

import DOMPurify from "isomorphic-dompurify";

type DOMPurifyConfig = Parameters<typeof DOMPurify.sanitize>[1];

const EMAIL_HTML_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: [
    "p", "br", "div", "span",
    "strong", "b", "em", "i", "u", "s",
    "h1", "h2", "h3",
    "ul", "ol", "li",
    "blockquote",
    "a",
    "hr",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "style"],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/|#)/i,
  FORBID_TAGS: [
    "script", "style", "iframe", "object", "embed",
    "form", "input", "button", "select", "textarea",
    "link", "meta", "base",
  ],
  FORBID_ATTR: [
    "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur",
    "onchange", "onsubmit", "onkeydown", "onkeyup", "onkeypress",
    "srcdoc",
  ],
  ALLOW_DATA_ATTR: false,
};

const ALLOWED_STYLE_PROPS = new Set(["text-align"]);

/**
 * Sanitize HTML authored by a user.
 *
 * Works in both browser and Node (thanks to isomorphic-dompurify).
 */
export function sanitizeEmailHtml(dirty: string): string {
  if (!dirty) return "";

  const clean = DOMPurify.sanitize(dirty, EMAIL_HTML_CONFIG) as unknown as string;

  // Post-process inline styles: keep only `text-align`. DOMPurify allows
  // `style` as an attribute but doesn't filter individual properties —
  // we do that here so we don't ship arbitrary CSS to email clients.
  return clean.replace(/\sstyle="([^"]*)"/gi, (_match, raw: string) => {
    const kept = raw
      .split(";")
      .map((decl) => decl.trim())
      .filter((decl) => {
        const colon = decl.indexOf(":");
        if (colon === -1) return false;
        const prop = decl.slice(0, colon).trim().toLowerCase();
        return ALLOWED_STYLE_PROPS.has(prop);
      });
    return kept.length ? ` style="${kept.join("; ")}"` : "";
  });
}

/**
 * Substitute `{{variable}}` tokens in already-sanitized HTML. The values
 * are HTML-escaped to prevent a variable payload from reintroducing
 * markup (e.g. a patient name with `<script>` chars).
 */
export function substituteVariables(
  safeHtml: string,
  variables: Record<string, string>
): string {
  let out = safeHtml;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replaceAll(key, escapeHtml(value));
  }
  return out;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
