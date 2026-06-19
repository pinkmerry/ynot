import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const client = read("../src/features/ynot/client.tsx");
const route = read("../src/app/api/ynot/admin/campaigns/route.ts");

test("normal prize target equals total slots (no +1 for the last prize)", () => {
  assert.match(client, /function normalPrizeTarget\([\s\S]*?return Math\.max\(1, Math\.round\(Number\(totalSlots\) \|\| 1\)\)/);
  assert.match(route, /function lastPrizeNormalPrizeTarget\([\s\S]*?return Math\.max\(1, Math\.round\(Number\(totalSlots\) \|\| 1\)\)/);
});

test("reward-unit validation requires normal prizes to equal total slots (last prize excluded)", () => {
  assert.match(client, /configuredRewardUnits !== totalSlots/);
});

test("the admin form describes the last prize as an extra bonus on top", () => {
  assert.match(client, /Last Prize is an extra bonus on top/i);
});
