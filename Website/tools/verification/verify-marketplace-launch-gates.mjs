#!/usr/bin/env node
import {
  check,
  fileExists,
  finish,
  includes,
  matches,
  readWebsite,
} from "./marketplace-verification-helpers.mjs";

const packageJson = JSON.parse(readWebsite("package.json"));
const websiteConfig = JSON.parse(readWebsite("wrangler.website.jsonc"));
const marketplaceConfig = JSON.parse(readWebsite("wrangler.marketplace.jsonc"));
const marketplaceCiConfig = JSON.parse(readWebsite("wrangler.marketplace.ci.jsonc"));
const routeGuards = readWebsite("src/lib/marketplace/route-guards.ts");
const marketplacePage = readWebsite("src/app/(store)/marketplace/page.tsx");
const detailPage = readWebsite("src/app/(store)/marketplace/listings/[listingId]/page.tsx");
const sellerPage = readWebsite("src/app/(store)/marketplace/seller/page.tsx");
const adminPage = readWebsite("src/app/admin/marketplace/page.tsx");
const opsSnapshot = readWebsite("src/lib/marketplace/ops-snapshot.ts");
const webhookRoute = readWebsite("src/app/api/ynot/marketplace/payments/webhook/route.ts");
const workerEntry = readWebsite("bulk-open-worker.ts");

check("marketplace Worker config exists", fileExists("wrangler.marketplace.jsonc"));
check("marketplace route-safe CI Worker config exists", fileExists("wrangler.marketplace.ci.jsonc"));
check("marketplace Worker has separate service name", marketplaceConfig.name === "ynott-marketplace");
check("website Worker remains separate service name", websiteConfig.name === "ynott-website");
check("marketplace CI deploy has no production routes by default", Array.isArray(marketplaceCiConfig.routes) && marketplaceCiConfig.routes.length === 0);

const routePatterns = (marketplaceConfig.routes ?? []).map((route) => route.pattern);
for (const pattern of [
  "www.ynotopen.com/marketplace*",
  "www.ynotopen.com/admin/marketplace*",
  "www.ynotopen.com/api/marketplace/*",
  "www.ynotopen.com/api/ynot/marketplace/*",
  "ynotopen.com/marketplace*",
  "ynotopen.com/admin/marketplace*",
  "ynotopen.com/api/marketplace/*",
  "ynotopen.com/api/ynot/marketplace/*",
]) {
  check(`marketplace Worker owns ${pattern}`, routePatterns.includes(pattern));
}

check("marketplace Worker enables owner-only prelaunch", marketplaceConfig.vars?.YNOT_MARKETPLACE_OWNER_ONLY === "true");
check("marketplace Worker enables marketplace flag", marketplaceConfig.vars?.YNOT_MARKETPLACE_ENABLED === "true");
check("marketplace Worker declares marketplace surface", marketplaceConfig.vars?.YNOT_WORKER_SURFACE === "marketplace");
check("marketplace Worker uses marketplace rate-limit backend", marketplaceConfig.vars?.RATE_LIMIT_BACKEND === "marketplace_supabase");
check(
  "marketplace Worker points to website auth bridge",
  marketplaceConfig.vars?.MARKETPLACE_AUTH_BRIDGE_URL === "https://www.ynotopen.com/api/internal/marketplace/session",
);
check(
  "marketplace Worker pins Marketplace Supabase project ref",
  typeof marketplaceConfig.vars?.MARKETPLACE_SUPABASE_PROJECT_REF === "string" &&
    marketplaceConfig.vars.MARKETPLACE_EXPECTED_SUPABASE_PROJECT_REF === marketplaceConfig.vars.MARKETPLACE_SUPABASE_PROJECT_REF,
);
check(
  "marketplace Worker configures Marketplace Supabase URL",
  typeof marketplaceConfig.vars?.MARKETPLACE_SUPABASE_URL === "string" &&
    /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(marketplaceConfig.vars.MARKETPLACE_SUPABASE_URL),
);
check("marketplace Worker omits Marketplace service-role key", !Object.hasOwn(marketplaceConfig.vars ?? {}, "MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY"));
check("marketplace Worker omits auth bridge secret", !Object.hasOwn(marketplaceConfig.vars ?? {}, "MARKETPLACE_AUTH_BRIDGE_SECRET"));
check("marketplace Worker omits payment webhook secret", !Object.hasOwn(marketplaceConfig.vars ?? {}, "MARKETPLACE_PAYMENT_WEBHOOK_SECRET"));
check("marketplace Worker has no gacha Pull All queue binding", !marketplaceConfig.queues);
check("marketplace Worker can run marketplace cron", Array.isArray(marketplaceConfig.triggers?.crons) && marketplaceConfig.triggers.crons.length > 0);

for (const script of [
  "cf:build:marketplace",
  "cf:preview:marketplace",
  "cf:deploy:marketplace",
  "cf:deploy:marketplace:routes",
  "verify:marketplace",
  "verify:marketplace-production-db",
]) {
  check(`package exposes ${script}`, Boolean(packageJson.scripts?.[script]));
}
check(
  "marketplace route deploy is gated by production DB probe",
  packageJson.scripts?.["cf:deploy:marketplace:routes"]?.includes(
    "verify:marketplace-production-db",
  ),
);
check(
  "marketplace production DB probe exists",
  fileExists("tools/verification/verify-marketplace-production-db.mjs"),
);

includes(routeGuards, "config.ownerOnly && admin?.adminRole !== \"owner\"", "route guard enforces owner-only prelaunch server-side");
includes(routeGuards, "marketplace_owner_required", "owner-only denial code exists");
for (const [name, page] of [
  ["marketplace landing page", marketplacePage],
  ["marketplace listing detail page", detailPage],
  ["marketplace seller page", sellerPage],
]) {
  includes(page, "config.ownerOnly ? admin?.adminRole === \"owner\" || devOwnerPreview : true", `${name} can open after owner-only flag is disabled`);
}
const adminOwnerGateIndex = adminPage.indexOf(
  "if (config.ownerOnly && admin?.adminRole !== \"owner\")",
);
const opsSnapshotGateIndex = opsSnapshot.indexOf("const marketplaceAdminAllowed");
const opsSnapshotServiceReadIndexes = [
  "await listOfficialOrderDashboard()",
  "await listSellerPayoutQueue()",
  "await listMarketplaceQueueSummary(admin)",
  "await listMarketplaceReconciliationItems({",
].map((needle) => opsSnapshot.indexOf(needle));
check("admin marketplace page has owner-only prelaunch gate", adminOwnerGateIndex >= 0);
check(
  "marketplace ops snapshot gates before service-role marketplace reads",
  opsSnapshotGateIndex >= 0 &&
    opsSnapshotServiceReadIndexes.every((index) => index === -1 || opsSnapshotGateIndex < index),
);
includes(adminPage, "buildMarketplaceOpsSnapshot", "admin marketplace page uses redacted ops snapshot");
includes(opsSnapshot, "marketplaceAdminAllowed", "marketplace ops snapshot uses gated read flag");
includes(opsSnapshot, "!config.ownerOnly || admin?.adminRole === \"owner\"", "marketplace ops snapshot read flag requires owner in prelaunch");
matches(webhookRoute, /process\.env\.NODE_ENV === "production"[\s\S]*forwardedProto !== "https"/, "webhook fails closed on non-HTTPS in production");

includes(workerEntry, "runCoreScheduledJobs", "Worker entry delegates core scheduled jobs");
includes(workerEntry, "runMarketplaceScheduledJobs", "Worker entry delegates marketplace scheduled jobs");
includes(workerEntry, "MARKETPLACE_ENVIRONMENT", "Worker entry can distinguish marketplace runtime");

finish("marketplace launch gates");
