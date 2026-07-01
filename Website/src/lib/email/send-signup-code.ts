import "server-only";

type DeliveryMode = "mock" | "resend";

type SendSignupCodeInput = {
  email: string;
  code: string;
};

type SendSignupCodeResult = {
  delivery: DeliveryMode;
  messageId?: string;
};

function signupOtpDeliveryMode(): DeliveryMode {
  const configured = process.env.SIGNUP_OTP_DELIVERY?.trim().toLowerCase();
  if (configured === "mock" || configured === "resend") return configured;
  return process.env.NODE_ENV === "production" ? "resend" : "mock";
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendSignupCodeEmail({
  email,
  code,
}: SendSignupCodeInput): Promise<SendSignupCodeResult> {
  const delivery = signupOtpDeliveryMode();
  if (delivery === "mock") return { delivery };

  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("SIGNUP_EMAIL_FROM");
  const replyTo = process.env.SIGNUP_EMAIL_REPLY_TO?.trim();
  const escapedCode = escapeHtml(code);
  const text = [
    "Your YNOT signup code is:",
    "",
    code,
    "",
    "This code expires in 10 minutes. If you did not request it, you can ignore this email.",
  ].join("\n");
  const html = [
    "<p>Your YNOT signup code is:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${escapedCode}</p>`,
    "<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>",
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your YNOT signup code",
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend email failed with ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
  };
  return { delivery, messageId: payload.id };
}
