#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  check,
  finish,
  includes,
  matches,
  notMatches,
  readRepo,
  repoRoot,
} from "./marketplace-verification-helpers.mjs";

const migrationPath =
  "Database/marketplace-supabase/migrations/20260630133000_marketplace_customer_cart_rpc.sql";
const migrationFile = resolve(repoRoot, migrationPath);
const sql = readRepo(migrationPath);
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();
const supabaseCwd = resolve(repoRoot, "Database/marketplace-supabase");

const requiredRpcNames = [
  "marketplace_list_customer_cart",
  "marketplace_get_customer_cart_summary",
  "marketplace_add_customer_cart_item",
  "marketplace_remove_customer_cart_item",
  "marketplace_list_customer_watchlist",
  "marketplace_watch_listing",
  "marketplace_unwatch_listing",
];

const readRpcNames = [
  "marketplace_list_customer_cart",
  "marketplace_get_customer_cart_summary",
  "marketplace_list_customer_watchlist",
];

const mutatingRpcNames = [
  "marketplace_add_customer_cart_item",
  "marketplace_remove_customer_cart_item",
  "marketplace_watch_listing",
  "marketplace_unwatch_listing",
];

function functionBlock(name) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  );
  const match = sql.match(pattern);
  check(`${name} function block is parseable`, Boolean(match));
  return match?.[0] ?? "";
}

function signatureBlock(name) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
    "i",
  );
  const match = sql.match(pattern);
  check(`${name} signature is parseable`, Boolean(match));
  return match?.[1] ?? "";
}

function maybeRunSupabaseLint() {
  if (!existsSync(resolve(supabaseCwd, "config.toml"))) {
    console.log(
      "SKIP SQL execution verification skipped: marketplace Supabase config is missing",
    );
    return;
  }

  const version = spawnSync("supabase", ["--version"], {
    cwd: supabaseCwd,
    encoding: "utf8",
  });
  if (version.error?.code === "ENOENT") {
    console.log(
      "SKIP SQL execution verification skipped: Supabase CLI is not installed; static checks completed",
    );
    return;
  }
  if (version.status !== 0) {
    console.log(
      "SKIP SQL execution verification skipped: Supabase CLI is not usable in this shell; static checks completed",
    );
    return;
  }

  const lint = spawnSync("supabase", ["db", "lint", "--local"], {
    cwd: supabaseCwd,
    encoding: "utf8",
    timeout: 30_000,
  });
  const output = `${lint.stdout ?? ""}\n${lint.stderr ?? ""}`.trim();
  if (lint.status === 0) {
    console.log("PASS supabase db lint --local completed");
    return;
  }

  if (
    /docker|connect|connection refused|supabase start|not running|could not connect|failed to connect|cannot connect/i.test(
      output,
    )
  ) {
    console.log(
      "SKIP SQL execution verification skipped: local Supabase database is not running; static checks completed",
    );
    return;
  }

  throw new Error(
    `FAIL supabase db lint --local failed\n${output || "(no output)"}`,
  );
}

check("customer cart RPC migration exists", existsSync(migrationFile));

for (const rpc of requiredRpcNames) {
  includes(compactSql, `create or replace function public.${rpc}`, `${rpc} is defined`);
  matches(
    compactSql,
    new RegExp(`revoke all on function public\\.${rpc}\\([^;]+from public, anon, authenticated;`),
    `${rpc} revokes browser role execution`,
  );
  matches(
    compactSql,
    new RegExp(`grant execute on function public\\.${rpc}\\([^;]+to service_role;`),
    `${rpc} grants service role execution only`,
  );
}

for (const rpc of readRpcNames) {
  includes(signatureBlock(rpc).toLowerCase(), "p_actor_profile_id uuid", `${rpc} receives actor profile id`);
  includes(functionBlock(rpc).toLowerCase(), "marketplace_require_customer_account", `${rpc} validates account ownership`);
}

for (const rpc of mutatingRpcNames) {
  const block = functionBlock(rpc);
  const compactBlock = block.replace(/\s+/g, " ").toLowerCase();
  includes(compactBlock, "marketplace_require_customer_account", `${rpc} validates account ownership`);
  includes(compactBlock, "marketplace_idempotency_keys", `${rpc} persists idempotency`);
  includes(compactBlock, "marketplace_audit_events", `${rpc} writes audit event`);
  includes(compactBlock, "rpc_response_payload := jsonb_build_object", `${rpc} returns explicit response payload`);
  notMatches(
    block,
    /['"](?:request_hash|requestHash|idempotency_key|idempotencyKey)['"]/,
    `${rpc} response does not expose idempotency internals`,
  );
}

for (const rpc of ["marketplace_add_customer_cart_item", "marketplace_watch_listing"]) {
  matches(
    functionBlock(rpc).replace(/\s+/g, " ").toLowerCase(),
    /from public\.marketplace_listing_snapshots [\s\S]* for update/,
    `${rpc} locks base listing snapshots`,
  );
  notMatches(
    functionBlock(rpc).toLowerCase(),
    /marketplace_public_listing_snapshots[\s\S]{0,220}for update/,
    `${rpc} does not lock active-only public listing view`,
  );
}

includes(
  compactSql,
  "least(greatest(coalesce(p_limit, 50), 1), 50)",
  "cart list limit is clamped to 50",
);
includes(
  compactSql,
  "least(greatest(coalesce(p_limit, 100), 1), 100)",
  "watchlist limit is clamped to 100",
);
includes(compactSql, "'cart.item.add'", "cart add idempotency scope is explicit");
includes(compactSql, "'cart.item.remove'", "cart remove idempotency scope is explicit");
includes(compactSql, "'watchlist.item.watch'", "watch idempotency scope is explicit");
includes(compactSql, "'watchlist.item.unwatch'", "unwatch idempotency scope is explicit");
includes(compactSql, "'marketplace_cart_item_added'", "cart add audit event is recorded");
includes(compactSql, "'marketplace_cart_item_removed'", "cart remove audit event is recorded");
includes(compactSql, "'marketplace_listing_watched'", "watch audit event is recorded");
includes(compactSql, "'marketplace_listing_unwatched'", "unwatch audit event is recorded");

const publicPayloadBlock = functionBlock("marketplace_customer_listing_payload");
includes(publicPayloadBlock, "jsonb_build_object", "customer listing payload is explicitly built");
notMatches(
  publicPayloadBlock,
  /['"](?:snapshot_payload|snapshotPayload|buyerMarketplaceAccountId|sellerMarketplaceAccountId|ynotProfileId|requestHash|idempotencyKey|email|phone|address|payout|privateAdminNote)['"]/i,
  "customer listing payload does not include private or raw payload keys",
);

for (const rpc of ["marketplace_list_customer_cart", "marketplace_list_customer_watchlist"]) {
  notMatches(
    functionBlock(rpc),
    /['"](?:snapshot_payload|snapshotPayload)['"]/i,
    `${rpc} does not expose raw snapshot payload keys`,
  );
}

maybeRunSupabaseLint();

finish("marketplace customer cart SQL");
