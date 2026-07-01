#!/usr/bin/env node
import {
  finish,
  includes,
  marketplaceSql,
  matches,
  notMatches,
  readWebsite,
} from "./marketplace-verification-helpers.mjs";

const sql = marketplaceSql().toLowerCase();
const inventoryGuard = readWebsite("src/lib/marketplace/inventory-source-guard.ts");
const source = [
  readWebsite("src/lib/marketplace/listings.ts"),
  readWebsite("src/lib/marketplace/official-shop.ts"),
  readWebsite("src/lib/marketplace/seller-consignment.ts"),
  readWebsite("src/lib/marketplace/orders.ts"),
  readWebsite("src/lib/marketplace/payouts.ts"),
].join("\n");
const customerBagUi = readWebsite("src/features/ynot/components.tsx");
const customerClient = readWebsite("src/features/ynot/client.tsx");

includes(inventoryGuard, "official_stock", "inventory guard allows official stock");
includes(inventoryGuard, "seller_consignment", "inventory guard allows seller consignment");
includes(inventoryGuard, "marketplace_purchase", "inventory guard allows marketplace purchase source");
notMatches(inventoryGuard, /gacha|reward|customer_bag|collection_item|draw_round/i, "inventory guard excludes gacha/reward/customer-bag source kinds");

matches(sql, /source_kind in \('official_stock', 'seller_consignment', 'marketplace_purchase'\)/, "database source-kind constraint excludes gacha rewards");
matches(sql, /item_type in \('card', 'sealed_box', 'sealed_pack'\)/, "database supports MVP marketplace physical item types");
notMatches(sql, /references public\.(collection_items|reward_conversions|draw_round_prizes|draw_round_prize_units|wallets|top_ups)/, "marketplace migrations do not foreign-key to gacha reward/wallet tables");
notMatches(source, /\.from\("(collection_items|reward_conversions|draw_round_prizes|draw_round_prize_units|wallets|top_ups)"\)/, "marketplace service modules do not read core gacha reward or wallet tables directly");
notMatches(source, /sell for coins|sell only|coin conversion/i, "marketplace service copy avoids coin-selling language");

includes(customerClient, "Gacha Rewards and Marketplace sections", "Customer Bag UI labels separate gacha and marketplace sections");
includes(customerClient, 'en="Marketplace"', "Customer Bag UI has a Marketplace section tab");
includes(customerClient, "collection-marketplace-separation", "Customer Bag keeps marketplace activity separate from gacha rewards");
includes(customerClient, "Rewards in this bag cannot become marketplace listings.", "Customer Bag blocks gacha reward listing confusion");
includes(customerClient, "Physical consignment only", "Customer Bag sends marketplace selling to physical consignment flow");
notMatches(customerBagUi, /Submit to marketplace[\s\S]{0,500}Sell only/i, "Customer Bag does not mix marketplace submit copy with coin sell-only copy");

finish("marketplace no-gacha inventory");
