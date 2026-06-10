import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) {
  throw new Error(`Refusing to mutate non-local Supabase URL: ${url}`);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function mustData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function deleteRows(label, queryBuilder) {
  const { error } = await queryBuilder;
  if (error) console.warn(`[cleanup] ${label}: ${error.message}`);
}

const suffix = randomUUID().slice(0, 8);
let cardId = "";
let boxSkuId = "";
let packSkuId = "";

async function cleanup() {
  if (!cardId) return;
  await deleteRows("card_stock_ledger", supabase.from("card_stock_ledger").delete().eq("card_id", cardId));
  await deleteRows(
    "card_stock_units children",
    supabase.from("card_stock_units").delete().eq("card_id", cardId).not("parent_stock_unit_id", "is", null),
  );
  await deleteRows("card_stock_units", supabase.from("card_stock_units").delete().eq("card_id", cardId));
  if (boxSkuId) {
    await deleteRows(
      "stock_sku_conversion_rules parent",
      supabase.from("stock_sku_conversion_rules").delete().eq("parent_stock_sku_id", boxSkuId),
    );
  }
  if (packSkuId) {
    await deleteRows(
      "stock_sku_conversion_rules child",
      supabase.from("stock_sku_conversion_rules").delete().eq("child_stock_sku_id", packSkuId),
    );
  }
  await deleteRows("stock_skus", supabase.from("stock_skus").delete().eq("card_id", cardId));
  await deleteRows("cards", supabase.from("cards").delete().eq("id", cardId));
}

try {
  const card = mustData(
    await supabase
      .from("cards")
      .insert({
        name: `Stock Sub SKU Smoke ${suffix}`,
        search_name: `stock-subsku-smoke-${suffix}`,
        card_code: `SMOKE-${suffix}`,
        search_code: `smoke-${suffix}`,
        series: "one_piece",
        grade: "Ungraded",
        condition: "sealed",
        catalog_category: "Packs",
        is_test: true,
      })
      .select("id")
      .single(),
    "insert test card",
  );
  cardId = card.id;

  const box = mustData(
    await supabase.rpc("upsert_stock_sku", {
      p_card_id: cardId,
      p_sku_code: `SMOKE-${suffix}-BOX`,
      p_label: "Smoke Box",
      p_unit_kind: "box",
      p_admin_id: null,
    }),
    "create box SKU",
  );
  boxSkuId = box.stockSkuId;

  const pack = mustData(
    await supabase.rpc("upsert_stock_sku", {
      p_card_id: cardId,
      p_sku_code: `SMOKE-${suffix}-PACK`,
      p_label: "Smoke Pack",
      p_unit_kind: "pack",
      p_admin_id: null,
    }),
    "create pack SKU",
  );
  packSkuId = pack.stockSkuId;

  mustData(
    await supabase.rpc("upsert_stock_sku", {
      p_stock_sku_id: boxSkuId,
      p_sku_code: `SMOKE-${suffix}-BOX`,
      p_label: "Smoke Box",
      p_unit_kind: "box",
      p_child_stock_sku_id: packSkuId,
      p_child_quantity: 24,
      p_admin_id: null,
    }),
    "attach box conversion",
  );

  mustData(
    await supabase.rpc("adjust_stock_sku_units", {
      p_stock_sku_id: boxSkuId,
      p_quantity_delta: 1,
      p_admin_id: null,
      p_source_type: "local_stock_subsku_smoke",
      p_metadata: { smoke: true },
      p_condition: "sealed",
    }),
    "add one box",
  );

  const opened = mustData(
    await supabase.rpc("open_stock_container", {
      p_parent_stock_sku_id: boxSkuId,
      p_quantity: 1,
      p_admin_id: null,
      p_note: "local smoke",
    }),
    "open one box",
  );

  assert.equal(opened.openedContainers, 1);
  assert.equal(opened.createdChildUnits, 24);
  assert.equal(opened.childQuantity, 24);

  const summary = mustData(
    await supabase.rpc("get_admin_prize_stock_summaries", {
      p_card_ids: [cardId],
    }),
    "batch prize stock summary",
  );

  const subSkuRows = Array.isArray(summary?.subSkuSummaries) ? summary.subSkuSummaries : [];
  const packRows = subSkuRows.filter((row) => row.stockSkuId === packSkuId);
  const boxRow = subSkuRows.find((row) => row.stockSkuId === boxSkuId);
  const packRow = packRows[0];
  const legacyPackRow = subSkuRows.find(
    (row) =>
      row.legacyStockUnitGroupKey === true &&
      row.stockUnitGroupKey === ["sealed", "", "", "", ""].join("\u001f"),
  );

  assert.ok(boxRow, "box Sub SKU summary row exists");
  assert.ok(packRow, "pack Sub SKU summary row exists");
  assert.equal(packRows.length, 1);
  assert.equal(boxRow.stockUnitGroupKey, `stock-sku:${boxSkuId}`);
  assert.equal(boxRow.availableUnits, 0);
  assert.equal(boxRow.childStockSkuId, packSkuId);
  assert.equal(boxRow.childQuantity, 24);
  assert.equal(packRow.stockUnitGroupKey, `stock-sku:${packSkuId}`);
  assert.equal(packRow.availableUnits, 24);
  assert.ok(legacyPackRow, "legacy pack group-key alias exists");
  assert.equal(legacyPackRow.stockSkuId ?? null, null);
  assert.equal(legacyPackRow.sourceStockSkuId, packSkuId);
  assert.equal(legacyPackRow.availableUnits, 24);

  console.log("stock Sub SKU local DB smoke passed");
} finally {
  await cleanup();
}
