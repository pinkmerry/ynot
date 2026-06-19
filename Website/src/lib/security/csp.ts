export const nonceHeaderName = "x-nonce";

export function createCspNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: {
  nonce: string;
  isDevelopment: boolean;
}) {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://static.line-scdn.net",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const styleSrc = [
    "'self'",
    isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`,
    "https://fonts.googleapis.com",
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.line.me https://access.line.me",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://liff.line.me https://access.line.me",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://access.line.me",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
