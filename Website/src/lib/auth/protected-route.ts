import "server-only";

import { redirect } from "next/navigation";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";

const localBase = "https://ynot.local";

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const parsed = new URL(value, localBase);
    if (parsed.origin !== localBase) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function loginRedirectPath(next: string) {
  const safeNext = safeNextPath(next);
  const params = new URLSearchParams();
  if (safeNext !== "/") params.set("next", safeNext);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

export async function requireCurrentProfile(next: string) {
  const session = await resolveCurrentProfile();
  if (!session) redirect(loginRedirectPath(next));
  return session;
}
