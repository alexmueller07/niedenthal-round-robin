// Email sending. With RESEND_API_KEY set, mail goes out through Resend and is
// logged as sent/failed. Without it, every send is logged as 'manual' and the
// Emails page shows copy-ready text — the app never hard-depends on a mailer.

import "server-only";
import { Resend } from "resend";
import { logEmail } from "./db";
import type { EmailContent } from "./templates";

export async function sendEmail(input: {
  toEmail: string;
  participantId: string | null;
  slotId: string | null;
  content: EmailContent;
}): Promise<void> {
  const { toEmail, participantId, slotId, content } = input;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    await logEmail({
      participantId,
      slotId,
      template: content.template,
      toEmail,
      subject: content.subject,
      body: content.body,
      status: "manual",
    });
    return;
  }

  let status: "sent" | "failed" = "sent";
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: toEmail,
      subject: content.subject,
      text: content.body,
    });
    if (error) status = "failed";
  } catch {
    status = "failed";
  }

  await logEmail({
    participantId,
    slotId,
    template: content.template,
    toEmail,
    subject: content.subject,
    body: content.body,
    status,
  });
}

export function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
