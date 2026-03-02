import nodemailer from "nodemailer";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/**
 * Send an email using nodemailer.
 *
 * Configure via env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If SMTP is not configured, logs the email to console (dev mode).
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; previewUrl?: string }> {
  const { to, subject, html, from, replyTo } = options;
  const recipients = Array.isArray(to) ? to : [to];

  // No SMTP configured → log to console for development
  if (!process.env.SMTP_HOST) {
    console.log("\n📧 ─── EMAIL (no SMTP configured) ───");
    console.log(`   To:      ${recipients.join(", ")}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   From:    ${from || "noreply"}`);
    if (replyTo) console.log(`   Reply:   ${replyTo}`);
    console.log("   HTML:    (logged below)");
    console.log("─────────────────────────────────────\n");
    return { success: true, messageId: "dev-console" };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const defaultFrom = process.env.SMTP_FROM || `VibeForge <${process.env.SMTP_USER}>`;

  const info = await transporter.sendMail({
    from: from || defaultFrom,
    to: recipients.join(", "),
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  return {
    success: true,
    messageId: info.messageId,
  };
}
