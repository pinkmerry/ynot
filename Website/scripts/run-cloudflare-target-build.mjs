#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const [, , target, separator, ...command] = process.argv;

const commonPrunedPaths = [
  "src/app/api/marketplace",
  "src/app/api/debug",
  "src/app/api/dev",
  "src/app/(store)/local-readiness",
  "src/app/(store)/local-stock-subsku-test",
  "src/app/pack-open-prototype",
];

const prunedPathsByTarget = {
  website: [
    ...commonPrunedPaths,
    "src/app/(store)/marketplace",
    "src/app/admin/marketplace",
    "src/app/api/ynot/marketplace",
  ],
  marketplace: [
    ...commonPrunedPaths,
    "src/app/(auth)",
    "src/app/(store)/account",
    "src/app/(store)/collection",
    "src/app/(store)/contact",
    "src/app/(store)/exchange",
    "src/app/(store)/gacha",
    "src/app/(store)/notifications",
    "src/app/(store)/packs",
    "src/app/(store)/profile",
    "src/app/(store)/ranking",
    "src/app/(store)/shipping",
    "src/app/(store)/wallet",
    "src/app/admin/audit",
    "src/app/admin/campaigns",
    "src/app/admin/categories",
    "src/app/admin/health",
    "src/app/admin/prizes",
    "src/app/admin/rankings",
    "src/app/admin/settings",
    "src/app/admin/shipping",
    "src/app/admin/tier-animations",
    "src/app/admin/top-ups",
    "src/app/admin/users",
    "src/app/admin/ynot",
    "src/app/api/auth",
    "src/app/api/line",
    "src/app/api/lucky-draw",
    "src/app/api/ynot/addresses",
    "src/app/api/ynot/admin",
    "src/app/api/ynot/collection",
    "src/app/api/ynot/exchange",
    "src/app/api/ynot/gacha",
    "src/app/api/ynot/packs",
    "src/app/api/ynot/shipping",
    "src/app/api/ynot/wallet",
    "src/app/icon.png",
    "src/app/page.tsx",
  ],
};

function usage() {
  console.error(
    "Usage: node scripts/run-cloudflare-target-build.mjs <website|marketplace> -- <command> [args...]",
  );
}

if (!target || separator !== "--" || command.length === 0) {
  usage();
  process.exit(2);
}

const prunedPaths = prunedPathsByTarget[target];
if (!prunedPaths) {
  usage();
  process.exit(2);
}

const root = process.cwd();
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ynott-cf-${target}-`));
const moved = [];

function cleanGeneratedOutput() {
  for (const relPath of [".next", ".open-next"]) {
    fs.rmSync(path.join(root, relPath), { recursive: true, force: true });
  }
}

function moveOut(relPath) {
  const source = path.join(root, relPath);
  if (!fs.existsSync(source)) return;

  const destination = path.join(stagingRoot, relPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
  moved.push({ relPath, source, destination });
}

function restoreMovedPaths() {
  for (const item of moved.reverse()) {
    if (!fs.existsSync(item.destination)) continue;
    fs.mkdirSync(path.dirname(item.source), { recursive: true });
    fs.renameSync(item.destination, item.source);
  }
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}

cleanGeneratedOutput();

try {
  for (const relPath of prunedPaths) {
    moveOut(relPath);
  }

  console.log(
    `[cf:target-build] ${target}: pruned ${moved.length} route path(s) before OpenNext build`,
  );

  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  restoreMovedPaths();
  console.log(`[cf:target-build] ${target}: restored pruned route path(s)`);
}
