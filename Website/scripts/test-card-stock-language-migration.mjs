import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const base = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  resolve(base, "../../Database/supabase/migrations/20260623120000_card_stock_unit_language.sql"),
  "utf8",
);

test("adds language column with the canonical CHECK", () => {
  assert.ok(/add column if not exists language text/.test(sql));
  assert.ok(/language in \('english', 'japanese', 'korean', 'chinese'\)/.test(sql));
});

test("threads language through the stock_sku identity helpers", () => {
  assert.ok(sql.includes("p_language text default null"));
  assert.ok(sql.includes("drop function if exists app_private.stock_sku_default_code"));
  assert.ok(sql.includes("app_private.ensure_default_stock_sku"));
});

test("adjust RPCs keep their signature (language rides p_metadata)", () => {
  assert.ok(sql.includes("normalized_metadata ->> 'language'"));
});

test("re-applies ensure_default_stock_sku grants + default_code search_path (security regressions guard)", () => {
  assert.ok(
    /grant execute on function app_private\.ensure_default_stock_sku\(uuid, text, text, text, text, text, text, text, text\) to service_role/.test(sql),
    "must re-grant ensure_default_stock_sku to service_role after DROP",
  );
  assert.ok(
    /revoke all on function app_private\.ensure_default_stock_sku\(uuid, text, text, text, text, text, text, text, text\) from public, anon, authenticated/.test(sql),
    "must re-revoke ensure_default_stock_sku from public/anon/authenticated",
  );
  assert.ok(
    sql.includes("set search_path = pg_catalog, app_private, public"),
    "must restore stock_sku_default_code search_path",
  );
});
