import "server-only";

export function getLineLoginChannelId() {
  return process.env.LINE_LOGIN_CHANNEL_ID?.trim() || null;
}

export function getLineCallbackUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredSiteUrl) return null;

  try {
    return `${new URL(configuredSiteUrl).origin}/api/line/callback`;
  } catch {
    return null;
  }
}
