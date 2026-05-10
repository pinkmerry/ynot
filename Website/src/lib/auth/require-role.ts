import "server-only";

import { resolveAdminSession, type ResolvedAdminSession } from "./resolve-current-profile";

export class AuthorizationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export async function requireAdminOrOwner(): Promise<ResolvedAdminSession> {
  const session = await resolveAdminSession();
  if (!session) {
    throw new AuthorizationError(401, "unauthenticated", "Login required.");
  }
  if (session.adminRole !== "owner" && session.adminRole !== "admin") {
    throw new AuthorizationError(403, "forbidden_role", "Admin or owner role required.");
  }
  return session;
}

export async function requireOwner(): Promise<ResolvedAdminSession> {
  const session = await resolveAdminSession();
  if (!session) {
    throw new AuthorizationError(401, "unauthenticated", "Login required.");
  }
  if (session.adminRole !== "owner") {
    throw new AuthorizationError(403, "owner_only", "Owner role required.");
  }
  return session;
}

export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  return null;
}
