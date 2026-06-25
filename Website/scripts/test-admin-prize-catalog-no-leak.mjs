/**
 * Customer-leak guard for the admin prize-catalog feature.
 *
 * Invariants:
 * 1. The customer shell (cr/Shell.tsx) must NOT import anything from
 *    the admin prize-catalog directory — admin-only code stays admin-only.
 * 2. Any prize-catalog file that references house-logic identifiers
 *    (unlockAtSoldPct, standalone "weight") must also contain "isOwner",
 *    ensuring the data only renders behind an owner gate.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(DIR, "..", "src", "features", "ynot");
const PRIZE_CATALOG_DIR = join(ROOT, "admin", "prize-catalog");
const SHELL_PATH = join(ROOT, "cr", "Shell.tsx");

/** Recursively collect .ts/.tsx files under a directory. */
function collectTsTsx(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectTsTsx(full));
    } else if (/\.(tsx?)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

describe("admin prize-catalog customer-leak guard", () => {
  it("customer Shell.tsx does not import from prize-catalog", () => {
    const shellSrc = readFileSync(SHELL_PATH, "utf8");
    const importLines = shellSrc
      .split("\n")
      .filter((line) => /^\s*(import|export)\s/.test(line));

    for (const line of importLines) {
      assert.ok(
        !line.includes("prize-catalog"),
        `Shell.tsx imports from prize-catalog (admin-only leak): ${line.trim()}`,
      );
    }
  });

  it("files referencing house-logic odds also contain isOwner gate", () => {
    const files = collectTsTsx(PRIZE_CATALOG_DIR);
    assert.ok(files.length > 0, "should find at least one .ts/.tsx file");

    const houseLogicPattern = /\bunlockAtSoldPct\b/;
    // Match standalone "weight" (property access or identifier), not substring
    // matches like "fontWeight" or "font-weight".
    const weightPattern = /(?<![.\w-])weight(?![.\w-])/;

    const violations = [];

    for (const filePath of files) {
      const src = readFileSync(filePath, "utf8");
      const hasHouseRef =
        houseLogicPattern.test(src) || weightPattern.test(src);
      if (!hasHouseRef) continue; // file doesn't reference either — passes trivially

      const hasOwnerGate = /\bisOwner\b/.test(src);
      if (!hasOwnerGate) {
        const rel = filePath.replace(PRIZE_CATALOG_DIR, "");
        violations.push(rel);
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Files reference house-logic (unlockAtSoldPct/weight) without isOwner gate: ${violations.join(", ")}`,
    );
  });
});
