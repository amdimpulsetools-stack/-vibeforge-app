/**
 * Shared Resend email sender.
 *
 * All email-sending routes go through `sendEmail` so we have ONE place that:
 *   - reads `RESEND_API_KEY` and `EMAIL_FROM`
 *   - formats the From header consistently (`Name <address>`)
 *   - awaits the send (critical on Vercel serverless — fire-and-forget dies
 *     when the handler returns)
 *   - returns a typed result instead of throwing
 *
 * Callers never crash because email failed: they get `{ skipped }` when
 * Resend isn't configured, `{ error }` when the API returns an error, and
 * `{ id }` on success. The decision of what to do on failure (log, retry,
 * surface to the user) lives at the call site.
 */

import { Resend } from "resend";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Display name shown in the recipient's inbox. Defaults to "Yenda". */
  fromName?: string;
  /** Override the address used in the From header. Defaults to `EMAIL_FROM`. */
  fromAddress?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
  /** Tags for Resend analytics. */
  tags?: { name: string; value: string }[];
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

let _client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

function buildFrom(name: string | undefined, address: string): string {
  const safeName = (name || "Yenda").replace(/[<>"\\\n\r]/g, "").trim() || "Yenda";
  return `${safeName} <${address}>`;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getClient();
  const fromAddress = params.fromAddress || process.env.EMAIL_FROM;
  if (!client || !fromAddress) {
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await client.emails.send({
      from: buildFrom(params.fromName, fromAddress),
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      headers: params.headers,
      tags: params.tags,
    });

    if (error) {
      return {
        ok: false,
        skipped: false,
        error: error.message || String(error),
      };
    }
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Convenience: true if Resend is configured. Handlers can use this to
 * decide whether to skip token insertion etc. when there's no way to
 * actually deliver the email.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
