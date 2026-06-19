import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Lightweight guard: asserts the bonus-award migration still contains the
// last-prize-as-bonus patch (no off-by-one). The authoritative runtime lock for
// the client sizing is test-final-open-quantity.mjs; a DB-level test of the RPC
// is deferred.
const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../Database/supabase/migrations/20260612090000_last_prize_bonus_award.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("last prize consumes no extra normal slot (no minus-one on the new path)", () => {
  assert.match(sql, /normal_units_needed := p_quantity;/);
});

test("last prize is appended as a bonus item at position p_quantity + 1", () => {
  assert.match(sql, /p_quantity \+ 1/);
  assert.match(sql, /lp_bonus_item is not null/);
  assert.match(sql, /result_items := result_items \|\| jsonb_build_array\(lp_bonus_item\)/);
});

test("legacy substitute fallback is preserved for short final pulls", () => {
  assert.match(sql, /last_prize_substitutes := true/);
});
