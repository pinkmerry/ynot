import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../Database/supabase/migrations/20260616000000_open_gacha_replay_reveal_image.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("replay enrichment anchor joins card_stock_units via the prize unit", () => {
  assert.match(sql, /left join public\.draw_round_prize_units prize_unit/);
  assert.match(
    sql,
    /left join public\.card_stock_units stock\s*\n\s*on stock\.id = prize_unit\.card_stock_unit_id/,
  );
});

test("replay items gain stock-resolved image fields", () => {
  assert.match(
    sql,
    /'imageUrl', coalesce\(stock\.image_url, cards\.image_url\)/,
  );
  assert.match(
    sql,
    /'imageResolvedFromStockUnit', nullif\(stock\.image_url, ''\) is not null/,
  );
});

test("migration follows the idempotent functiondef-patch pattern with post-asserts", () => {
  assert.match(sql, /pg_get_functiondef/);
  assert.match(sql, /raise exception 'open_replay_reveal_patch_failed'/);
});
