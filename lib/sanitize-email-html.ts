/**
 * Sanitizer for user-authored email bodies (from the rich-text editor).
 *
 * Applied twice, defense in depth:
 *   1. In the browser when the user edits (so what they see is what gets saved).
 *   2. On the server before injecting into the email template shell.
 *
 * Uses `sanitize-html` (pure JS, no jsdom) so it runs safely in both Node
 * serverless functions and browser bundles without pulling ESM-only deps.
 *
 * The allow-list is intentionally conservative: we only allow formatting
 * tags that are widely supported by email clients (Gmail, Outlook, Apple
 * Mail, Yahoo, etc.). Inline styles are limited to `text-align` for
 * alignment — anything else is stripped, which prevents style-based XSS
 * and keeps the output compatible with the inline-style template wrapper.
 */

import sanitizeHtml from "sanitize-html";

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "div", "span",
    "strong", "b", "em", "i", "u", "s",
    "h1", "h2", "h3",
    "ul", "ol", "li",
    "blockquote",
    "a",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      "text-align": [/^(left|right|center|justify|start|end)$/i],
    },
  },
  disallowedTagsMode: "discard",
};

export function sanitizeEmailHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, OPTIONS);
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
