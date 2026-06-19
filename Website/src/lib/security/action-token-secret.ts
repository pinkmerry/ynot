import "server-only";

export function dedicatedActionTokenSecret(envKey: string) {
  const value = process.env[envKey]?.trim();
  if (value) return value;

  if (process.env.NODE_ENV !== "production") {
    return `dev-local-${envKey.toLowerCase()}-secret`;
  }

  throw new Error(`Missing dedicated customer token secret: ${envKey}`);
}
