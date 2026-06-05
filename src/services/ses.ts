import { AwsClient } from "aws4fetch";
import type { Env } from "../env.ts";
import { formatCents } from "../lib/money.ts";

export interface SendResult {
  messageId: string;
}

/**
 * Send the proposal email via Amazon SES v2 (SigV4-signed fetch — no AWS SDK).
 * Throws on non-2xx; the caller logs the failure and continues (the proposal is
 * still "sent" and the public link still works).
 */
export async function sendProposalEmail(
  env: Env,
  input: { to: string; clientName: string; totalCents: number; depositCents: number; publicUrl: string },
): Promise<SendResult> {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS SES credentials are not configured");
  }

  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "ses",
  });

  const first = input.clientName.split(" ")[0] || "there";
  const subject = "Your Greenscape Pro proposal is ready";
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#faf8f4;margin:0;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e9e2d5;border-radius:14px;overflow:hidden">
    <div style="background:#1a4736;color:#fff;padding:24px 28px">
      <div style="font-weight:700;font-size:18px">Greenscape Pro</div>
      <div style="color:#cdd9d2;font-size:13px">Outdoor Living, Designed &amp; Built</div>
    </div>
    <div style="padding:28px">
      <p>Hi ${escapeHtml(first)},</p>
      <p>Thank you for having us out. Your proposal is ready to review online — including the full scope of work and a simple option to reserve your spot on our build calendar with a deposit.</p>
      <p style="background:#f1f7f4;border-radius:10px;padding:14px 16px;margin:18px 0">
        <strong>Project total:</strong> ${formatCents(input.totalCents)}<br/>
        <strong>50% deposit to begin:</strong> ${formatCents(input.depositCents)}
      </p>
      <p style="text-align:center;margin:26px 0">
        <a href="${input.publicUrl}" style="background:#c2683f;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;display:inline-block">View &amp; accept your proposal →</a>
      </p>
      <p style="color:#6b6960;font-size:13px">Questions? Just reply to this email.</p>
      <p>— Marcus &amp; the Greenscape Pro team</p>
    </div>
  </div></body></html>`;
  const text = `Hi ${first},\n\nYour Greenscape Pro proposal is ready.\nProject total: ${formatCents(input.totalCents)}\n50% deposit to begin: ${formatCents(input.depositCents)}\n\nView & accept: ${input.publicUrl}\n\n— Marcus & the Greenscape Pro team`;

  const resp = await aws.fetch(`https://email.${env.AWS_REGION}.amazonaws.com/v2/email/outbound-emails`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      FromEmailAddress: env.SES_FROM,
      Destination: { ToAddresses: [input.to] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Html: { Data: html }, Text: { Data: text } } } },
    }),
  });

  if (!resp.ok) throw new Error(`SES ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as { MessageId?: string };
  return { messageId: json.MessageId ?? "unknown" };
}

/** Generic SES send (used by the reactivation agent). */
export async function sendEmail(
  env: Env,
  input: { to: string; subject: string; html: string; text: string },
): Promise<SendResult> {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS SES credentials are not configured");
  }
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "ses",
  });
  const resp = await aws.fetch(`https://email.${env.AWS_REGION}.amazonaws.com/v2/email/outbound-emails`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      FromEmailAddress: env.SES_FROM,
      Destination: { ToAddresses: [input.to] },
      Content: { Simple: { Subject: { Data: input.subject }, Body: { Html: { Data: input.html }, Text: { Data: input.text } } } },
    }),
  });
  if (!resp.ok) throw new Error(`SES ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as { MessageId?: string };
  return { messageId: json.MessageId ?? "unknown" };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
