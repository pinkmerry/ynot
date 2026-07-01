#!/usr/bin/env node
import {
  finish,
  includes,
  marketplaceSourceText,
  matches,
  notMatches,
  readWebsite,
} from "./marketplace-verification-helpers.mjs";

const accountBridge = readWebsite("src/lib/marketplace/account-bridge.ts");
const routeGuards = readWebsite("src/lib/marketplace/route-guards.ts");
const config = readWebsite("src/lib/marketplace/config.ts");
const backfillTool = readWebsite("tools/ops/backfill-marketplace-accounts.mjs");
const packageJson = JSON.parse(readWebsite("package.json"));
const source = marketplaceSourceText();

includes(accountBridge, "ResolvedProfileSession", "marketplace account bridge uses YNOTT profile session");
includes(routeGuards, "resolveAdminSession", "marketplace access derives admin role server-side");
includes(accountBridge, 'supabase.rpc("marketplace_get_or_create_account"', "account ensure uses idempotent RPC");
includes(accountBridge, ".eq(\"ynot_profile_id\", profile.profileId)", "account read uses current YNOTT profile id");
includes(backfillTool, ".from(\"profiles\")", "marketplace account backfill reads YNOTT core profiles");
includes(backfillTool, "marketplace_get_or_create_account", "marketplace account backfill uses the idempotent account RPC");
includes(backfillTool, "MARKETPLACE_ACCOUNT_BACKFILL_ACK", "production account backfill requires explicit apply acknowledgement");
includes(backfillTool, "--dry-run", "marketplace account backfill defaults to dry-run operation");
includes(
  packageJson.scripts["ops:backfill-marketplace-accounts"],
  "backfill-marketplace-accounts.mjs",
  "package script exposes marketplace account backfill",
);
includes(routeGuards, "ownerOnlyMarketplaceAccess", "owner-only launch gate exists");
includes(routeGuards, "marketplace_owner_required", "prelaunch owner-only denial exists");
includes(config, "MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY", "marketplace service-role env is server-only named");
includes(config, "MARKETPLACE_EXPECTED_SUPABASE_PROJECT_REF", "marketplace project-ref mismatch guard exists");
includes(config, "marketplace_supabase_environment_mismatch", "marketplace environment mismatch guard exists");

notMatches(source, /password(_hash)?|resetPassword|signUp\(|signInWithPassword|auth\.admin\.createUser/i, "marketplace has no separate password or credential store");
notMatches(source, /role\s*:\s*body\.|adminRole\s*:\s*body\.|actor.*body\./i, "marketplace does not trust browser-submitted actor or role fields");
matches(source, /request_id|requestId/g, "marketplace responses and mutations carry request ids");

finish("marketplace identity bridge");
