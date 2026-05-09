#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const requiredPhaseDocs = [1, 2, 3, 4, 5, 6, 7].map((phase) => {
  const names = {
    1: "phase-1-production-data-inventory-backup.md",
    2: "phase-2-staging-supabase-preview.md",
    3: "phase-3-provider-identity-owner-admin.md",
    4: "phase-4-wallet-payment-admin-qa.md",
    5: "phase-5-gacha-collection-exchange-shipping-qa.md",
    6: "phase-6-production-preflight.md",
    7: "phase-7-production-smoke-limited-pilot.md",
  };
  return `docs/plans/production-phases/${names[phase]}`;
});

const requiredFiles = [
  "src/features/ynot/phase-readiness.ts",
  "src/app/(store)/local-readiness/page.tsx",
  "src/app/(store)/gacha/[campaignId]/page.tsx",
  "src/app/(store)/gacha/[campaignId]/open/page.tsx",
  "docs/plans/production-phases/00-index.md",
  "docs/plans/production-phases/README.md",
  "docs/plans/production-phases/appendix-go-no-go-evidence-template.md",
  "docs/plans/admin-content-studio-future-proofing.md",
  "../Database/supabase/migrations/20260507015626_phase1_auth_identity_realtime.sql",
  "../Database/supabase/migrations/20260507032000_phase2_platform_wallet_gacha.sql",
  ...requiredPhaseDocs,
];

const requiredSections = ["User stories", "Acceptance criteria", "UAT", "Real tests", "Stop rules"];
const requiredRoutes = [
  "/local-readiness",
  "/login",
  "/signup",
  "/profile",
  "/wallet",
  "/collection",
  "/exchange",
  "/shipping",
  "/admin",
  "/admin/campaigns",
  "/admin/prizes",
  "/admin/top-ups",
  "/admin/settings",
];

const failures = [];
function pass(message) { console.log(`PASS ${message}`); }
function fail(message) { failures.push(message); console.error(`FAIL ${message}`); }

for (const file of requiredFiles) {
  const path = resolve(root, file);
  if (existsSync(path)) pass(`${file} exists`);
  else fail(`${file} missing`);
}

for (const doc of requiredPhaseDocs) {
  const path = resolve(root, doc);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  for (const section of requiredSections) {
    if (text.toLowerCase().includes(section.toLowerCase())) pass(`${doc} includes ${section}`);
    else fail(`${doc} missing ${section}`);
  }
}

const readinessPath = resolve(root, "src/features/ynot/phase-readiness.ts");
if (existsSync(readinessPath)) {
  const text = readFileSync(readinessPath, "utf8");
  for (const phase of [1, 2, 3, 4, 5, 6, 7]) {
    if (text.includes(`phase: ${phase}`)) pass(`phase-readiness has Phase ${phase}`);
    else fail(`phase-readiness missing Phase ${phase}`);
  }
  for (const route of requiredRoutes) {
    if (text.includes(`href: "${route}"`) || route === "/local-readiness") pass(`readiness route/link covered: ${route}`);
    else fail(`readiness missing route/link: ${route}`);
  }
  if (!text.includes("/gacha/pokemon-gold-07")) pass("readiness avoids hardcoded demo campaign routes");
  else fail("readiness still links to hardcoded demo campaign routes");
  if (text.includes("external-gated") && text.includes("No production mutation is safe from localhost")) pass("readiness records external production gates");
  else fail("readiness does not record external production gates");
}

const pagePath = resolve(root, "src/app/(store)/local-readiness/page.tsx");
if (existsSync(pagePath)) {
  const text = readFileSync(pagePath, "utf8");
  if (text.includes("Phase 1–7 localhost test console")) pass("local-readiness page has owner-facing title");
  else fail("local-readiness page missing owner-facing title");
  if (text.includes("does not apply migrations")) pass("local-readiness page states no production mutation");
  else fail("local-readiness page missing no-production-mutation copy");
}

if (failures.length) {
  console.error(`\n${failures.length} phase readiness verification failure(s).`);
  process.exit(1);
}

console.log("\nPhase readiness verification passed.");
