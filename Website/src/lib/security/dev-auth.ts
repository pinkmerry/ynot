import "server-only";

/**
 * Returns true only when ALL of the following hold:
 *   - NODE_ENV is not "production"
 *   - YNOT_ENABLE_DEV_AUTH=true is explicitly set
 *
 * Production deployments must never satisfy the second condition. The double
 * gate prevents a single misconfigured env var (NODE_ENV unset on a Worker
 * build, for example) from enabling owner-tier preview/mock auth shortcuts on
 * a live site.
 */
export function isDevAuthAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.YNOT_ENABLE_DEV_AUTH === "true";
}
