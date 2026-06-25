#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function pass(label) {
  passes.push(label);
}

function fail(label) {
  failures.push(label);
}

function check(label, condition) {
  if (condition) pass(label);
  else fail(label);
}

function parseJson(rel) {
  return JSON.parse(read(rel));
}

function validateWorkerConfig(rel, expected) {
  const config = parseJson(rel);
  const vars = config.vars ?? {};
  const forbiddenSecrets = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "LINE_SESSION_SECRET",
    "LINE_LOGIN_CHANNEL_SECRET",
    "SLIP2GO_SECRET_KEY",
  ];

  const expectedEntry = expected.workerEntry ?? ".open-next/worker.js";
  check(`${rel} uses expected Worker entry`, config.main === expectedEntry);
  check(`${rel} has expected Worker name`, config.name === expected.workerName);
  check(`${rel} enables nodejs_compat`, config.compatibility_flags?.includes("nodejs_compat"));
  check(
    `${rel} enables global_fetch_strictly_public`,
    config.compatibility_flags?.includes("global_fetch_strictly_public"),
  );
  check(`${rel} binds static assets`, config.assets?.binding === "ASSETS");
  check(`${rel} enables observability`, config.observability?.enabled === true);
  if (expected.routePatterns) {
    const routePatterns = (config.routes ?? []).map((route) => route.pattern);
    check(
      `${rel} has expected Cloudflare routes`,
      JSON.stringify(routePatterns) === JSON.stringify(expected.routePatterns),
    );
  }
  check(`${rel} uses free-first mode without service bindings`, !config.services);
  check(`${rel} uses free-first mode without R2`, !config.r2_buckets);
  check(`${rel} uses free-first mode without Durable Objects`, !config.durable_objects);
  check(`${rel} uses free-first mode without DO migrations`, !config.migrations);
  check(`${rel} leaves image optimization unbound for free-first deploy`, !config.images);
  check(`${rel} locks production rate-limit backend`, vars.RATE_LIMIT_BACKEND === "supabase");
  check(`${rel} sets production env`, vars.NEXTJS_ENV === "production");
  check(`${rel} omits paid cache prefix`, !Object.hasOwn(vars, "NEXT_INC_CACHE_R2_PREFIX"));
  check(`${rel} sets LINE Login channel ID`, vars.LINE_LOGIN_CHANNEL_ID === expected.lineLoginChannelId);
  check(`${rel} enables LINE login`, vars.NEXT_PUBLIC_ENABLE_LINE_LOGIN === "true");
  check(`${rel} sets public site URL`, vars.NEXT_PUBLIC_SITE_URL === expected.siteUrl);
  check(
    `${rel} sets LIFF id`,
    typeof vars.NEXT_PUBLIC_LINE_LIFF_ID === "string" &&
      /^\d+-[A-Za-z0-9]+$/.test(vars.NEXT_PUBLIC_LINE_LIFF_ID),
  );
  check(
    `${rel} sets Supabase URL`,
    typeof vars.NEXT_PUBLIC_SUPABASE_URL === "string" &&
      /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(vars.NEXT_PUBLIC_SUPABASE_URL),
  );
  check(
    `${rel} sets Supabase publishable key`,
    typeof vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === "string" &&
      vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("eyJ"),
  );
  check(
    `${rel} keeps server secrets out of checked-in vars`,
    forbiddenSecrets.every((name) => !Object.hasOwn(vars, name)),
  );
  if (expected.bulkOpenQueue) {
    check(
      `${rel} binds Pull All queue producer`,
      JSON.stringify(config.queues?.producers ?? []) ===
        JSON.stringify([{ binding: "BULK_OPEN_QUEUE", queue: "ynott-bulk-open" }]),
    );
    check(
      `${rel} binds Pull All queue consumer`,
      config.queues?.consumers?.[0]?.queue === "ynott-bulk-open" &&
        config.queues.consumers[0].max_batch_size === 5 &&
        config.queues.consumers[0].max_retries === 3,
    );
    check(
      `${rel} runs Pull All watchdog every 15 minutes`,
      JSON.stringify(config.triggers?.crons ?? []) === JSON.stringify(["*/15 * * * *"]),
    );
  } else {
    check(`${rel} does not bind Pull All queue`, !config.queues);
  }
}

validateWorkerConfig("wrangler.website.jsonc", {
  siteUrl: "https://www.ynotopen.com",
  workerName: "ynott-website",
  workerEntry: "bulk-open-worker.ts",
  lineLoginChannelId: "2009971080",
  routePatterns: ["ynotopen.com/*", "www.ynotopen.com/*"],
  bulkOpenQueue: true,
});
validateWorkerConfig("wrangler.website.ci.jsonc", {
  siteUrl: "https://www.ynotopen.com",
  workerName: "ynott-website",
  workerEntry: "bulk-open-worker.ts",
  lineLoginChannelId: "2009971080",
  routePatterns: [],
  bulkOpenQueue: true,
});

const packageJson = parseJson("package.json");
check("package exposes cf:build script", Boolean(packageJson.scripts?.["cf:build"]));
check("package exposes website Cloudflare deploy script", Boolean(packageJson.scripts?.["cf:deploy:website"]));
check(
  "website Cloudflare deploy script uses route-safe CI config",
  /wrangler\.website\.ci\.jsonc/.test(packageJson.scripts?.["cf:deploy:website"] ?? ""),
);
check("package exposes manual website route deploy script", Boolean(packageJson.scripts?.["cf:deploy:website:routes"]));
check("package omits retired LIFF Cloudflare deploy script", !packageJson.scripts?.["cf:deploy:liff"]);
check("package omits retired LIFF Cloudflare build script", !packageJson.scripts?.["cf:build:liff"]);
check("package omits retired LIFF Cloudflare preview script", !packageJson.scripts?.["cf:preview:liff"]);
check("package omits retired LIFF Cloudflare typegen script", !packageJson.scripts?.["cf:typegen:liff"]);

const deployWorkflow = read("../.github/workflows/cloudflare-deploy.yml");
check(
  "deploy workflow targets website Worker only",
  !/cf:deploy:liff|ynott-line-liff|LIFF Worker/.test(deployWorkflow),
);

const campaignData = read("src/features/ynot/data.ts");
check(
  "single-campaign admin renders do not scan all inventory summaries",
  /if \(!campaignIds\.length\) return \[\];[\s\S]*const inventoryCampaignId =[\s\S]*campaignIds\.length === 1 \? campaignIds\[0\] : null[\s\S]*p_draw_round_id: inventoryCampaignId/.test(
    campaignData,
  ),
);

const ownerReviewPage = read("src/app/admin/campaigns/[id]/review/page.tsx");
check(
  "owner review page opts out of unrelated dashboard reads",
  /campaignReadiness: false,[\s\S]*ownerApprovalRequests: true,[\s\S]*wallet: false,/.test(
    ownerReviewPage,
  ),
);
check(
  "owner review page resolves both UUID and slug campaign routes",
  /entry\.id === id \|\| entry\.slug === id/.test(ownerReviewPage),
);

const adminShell = read("src/features/ynot/admin/Shell.tsx");
check(
  "admin shell disables production prefetch for heavyweight navigation links",
  (adminShell.match(/prefetch=\{false\}/g) ?? []).length >= 4,
);

const adminClient = read("src/features/ynot/client.tsx");
check(
  "owner review queue disables production prefetch for review links",
  /href=\{`\/admin\/campaigns\/\$\{request\.campaign\.id\}\/review`\}[\s\S]*prefetch=\{false\}/.test(
    adminClient,
  ),
);

const supabaseProxy = read("src/lib/supabase/proxy.ts");
check(
  "anonymous middleware requests skip Supabase auth refresh",
  /if \(!hasSupabaseAuthCookie\(request\)\) return supabaseResponse;/.test(
    supabaseProxy,
  ),
);

const homePage = read("src/app/page.tsx");
check(
  "homepage uses public-only data loader",
  /getYnotPublicHomeData/.test(homePage) && !/getYnotDashboardSlice/.test(homePage),
);

const publicHomeDataMatch = campaignData.match(
  /export async function getYnotPublicHomeData\(\): Promise<YnotDashboardData> \{[\s\S]*?\n\}/,
);
check(
  "public homepage resolves viewer state without wallet, campaign, or inventory reads",
  Boolean(publicHomeDataMatch) &&
    /const viewer = await getYnotViewer\(\);/.test(publicHomeDataMatch?.[0] ?? "") &&
    !/getYnotDashboardSlice|getWallet|getOwnerApprovalRequests|getCampaigns|getCollection|getGachaOpenHistory|getTopUps|getPaymentMethods|getStoreCategories/.test(
      publicHomeDataMatch?.[0] ?? "",
    ),
);

const devVarsExample = read(".dev.vars.example");
for (const key of [
  "RATE_LIMIT_BACKEND=supabase",
  "NEXT_PUBLIC_SUPABASE_URL=",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=",
  "NEXT_PUBLIC_LINE_LIFF_ID=",
  "LINE_LOGIN_CHANNEL_ID=",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "LINE_LOGIN_CHANNEL_SECRET=",
  "SLIP2GO_SECRET_KEY=",
]) {
  check(`.dev.vars.example documents ${key}`, devVarsExample.includes(key));
}

const runbook = read("docs/runbooks/CLOUDFLARE-MIGRATION.md");
check("runbook lists Cloudflare account snapshot", /Account ID/.test(runbook));
check("runbook lists resource creation gates", /Cloudflare Resources To Create/.test(runbook));
check("runbook lists cutover gates", /Cutover Gates/.test(runbook));
check("runbook documents secret handling", /wrangler secret put/.test(runbook));
check(
  "runbook documents website-only active deploy path",
  !/cf:deploy:liff|cf:build:liff|cf:preview:liff|wrangler\.liff|ynott-line-liff/.test(runbook),
);

console.log("Cloudflare migration config verification");
for (const item of passes) console.log(`PASS ${item}`);
for (const item of failures) console.log(`FAIL ${item}`);
if (failures.length) process.exit(1);
