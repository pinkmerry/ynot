import "server-only";

import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

import type { ResolvedAdminSession } from "./resolve-current-profile";

export type AdminRole = ResolvedAdminSession["adminRole"];

export function adminHasRole(
  admin: ResolvedAdminSession,
  allowedRoles: readonly AdminRole[],
) {
  return allowedRoles.includes(admin.adminRole);
}

export function requireAdminRoleResponse(
  admin: ResolvedAdminSession,
  allowedRoles: readonly AdminRole[],
  message = "Owner or admin access is required.",
) {
  if (adminHasRole(admin, allowedRoles)) {
    return null;
  }

  return adminErrorResponse("forbidden", message, 403, {
    extra: {
      adminRole: admin.adminRole,
    },
  });
}
