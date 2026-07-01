import "server-only";

/**
 * Fire-and-forget alert dispatcher for sensitive admin events. Supports two
 * delivery channels:
 *
 *   - Email via Resend (preferred — Resend is already configured for OTP)
 *     Set YNOT_SECURITY_ALERT_EMAIL to the recipient address.
 *   - Generic JSON webhook (Slack / Discord / PagerDuty)
 *     Set YNOT_SECURITY_ALERT_WEBHOOK to the webhook URL.
 *
 * Both can be enabled at once. If neither is set, alerts no-op and the audit
 * trail in audit_events is the only record.
 *
 * Never throws. Never blocks the request. Failures log to console so a
 * Resend outage or webhook 500 doesn't turn into a 500 for the admin.
 */

export type SecurityAlertEvent =
  | "admin_role_granted"
  | "admin_role_revoked"
  | "owner_role_granted"
  | "profile_sessions_revoked"
  | "top_up_approved_large"
  | "top_up_approval_blocked"
  | "top_up_velocity_unusual"
  | "admin_login_unfamiliar_ip"
  | "admin_user_created";

export type SecurityAlert = {
  event: SecurityAlertEvent;
  actor: { profileId?: string | null; adminId?: string | null; role?: string | null };
  target?: { profileId?: string | null; email?: string | null };
  details?: Record<string, unknown>;
};

const DEFAULT_EMAIL_FROM = "YNOT Security <no-reply@ynotopen.com>";

function formatWebhookText(alert: SecurityAlert) {
  const lines = [
    `*[YNOT security]* \`${alert.event}\``,
    `actor: ${alert.actor.role ?? "?"} / profile=${alert.actor.profileId ?? "?"}`,
  ];
  if (alert.target) {
    lines.push(`target: profile=${alert.target.profileId ?? "?"}${alert.target.email ? ` (${alert.target.email})` : ""}`);
  }
  if (alert.details) {
    lines.push("```" + JSON.stringify(alert.details, null, 2) + "```");
  }
  return { text: lines.join("\n") };
}

function formatEmail(alert: SecurityAlert) {
  const subject = `[YNOT security] ${alert.event}`;
  const lines: string[] = [
    `<h2 style="margin:0 0 12px;font-family:system-ui,sans-serif;">${alert.event}</h2>`,
    `<p style="font-family:system-ui,sans-serif;color:#333;">`,
    `  <strong>Actor:</strong> ${alert.actor.role ?? "?"} (profile=${alert.actor.profileId ?? "?"}${alert.actor.adminId ? `, admin=${alert.actor.adminId}` : ""})<br/>`,
  ];
  if (alert.target) {
    lines.push(
      `  <strong>Target:</strong> profile=${alert.target.profileId ?? "?"}${alert.target.email ? ` (${alert.target.email})` : ""}<br/>`,
    );
  }
  lines.push(`  <strong>Time:</strong> ${new Date().toISOString()}<br/>`);
  lines.push(`</p>`);
  if (alert.details) {
    lines.push(
      `<pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px;overflow:auto;">${escapeHtml(JSON.stringify(alert.details, null, 2))}</pre>`,
    );
  }
  lines.push(
    `<p style="color:#888;font-size:11px;font-family:system-ui,sans-serif;">Sent automatically by YNOT Website. See audit_events table for the full trail.</p>`,
  );
  return { subject, html: lines.join("\n") };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendWebhook(url: string, alert: SecurityAlert) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(formatWebhookText(alert)),
    });
    if (!response.ok) {
      console.warn(
        "security_alert_webhook_non_ok",
        `${response.status} ${response.statusText}`,
      );
    }
  } catch (error: unknown) {
    console.warn(
      "security_alert_webhook_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function sendEmail(to: string, alert: SecurityAlert) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "security_alert_email_skipped",
      "RESEND_API_KEY is not configured",
    );
    return;
  }
  const from = process.env.SIGNUP_EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
  const { subject, html } = formatEmail(alert);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(
        "security_alert_email_non_ok",
        `${response.status} ${response.statusText} ${body.slice(0, 200)}`,
      );
    }
  } catch (error: unknown) {
    console.warn(
      "security_alert_email_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function emitSecurityAlert(alert: SecurityAlert): void {
  const webhookUrl = process.env.YNOT_SECURITY_ALERT_WEBHOOK?.trim();
  const emailTo = process.env.YNOT_SECURITY_ALERT_EMAIL?.trim();

  // Fire-and-forget on both channels in parallel. We don't await — the user
  // request shouldn't pay the latency cost, and outages here must not turn
  // into 500s for the admin who triggered the action.
  if (webhookUrl) {
    void sendWebhook(webhookUrl, alert);
  }
  if (emailTo) {
    void sendEmail(emailTo, alert);
  }
}
