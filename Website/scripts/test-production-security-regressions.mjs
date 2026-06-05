import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(appRoot, "..");
const sourceRoot = path.join(appRoot, "src");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

function readRepo(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function repoPath(relPath) {
  return path.join(repoRoot, relPath);
}

function relApp(absPath) {
  return path.relative(appRoot, absPath).replaceAll(path.sep, "/");
}

function staticImportSpecifiers(absPath) {
  const source = readFileSync(absPath, "utf8");
  const ast = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true);
  const imports = [];

  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (statement.importClause?.isTypeOnly) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    imports.push(statement.moduleSpecifier.text);
  }

  return imports;
}

function resolveLocalImport(fromAbsPath, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;

  const base = specifier.startsWith("@/")
    ? path.join(sourceRoot, specifier.slice(2))
    : path.resolve(path.dirname(fromAbsPath), specifier);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
    path.join(base, "index.jsx"),
    path.join(base, "index.js"),
  ];

  return (
    candidates.find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? null
  );
}

function reachableStaticGraph(entryRelPaths) {
  const pending = entryRelPaths.map((entry) => appPath(entry));
  const seen = new Set();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current) || !existsSync(current)) continue;
    seen.add(current);

    for (const specifier of staticImportSpecifiers(current)) {
      const resolved = resolveLocalImport(current, specifier);
      if (resolved && !seen.has(resolved)) pending.push(resolved);
    }
  }

  return seen;
}

test("public storefront routes do not statically reach admin controls or admin client barrel", () => {
  const graph = reachableStaticGraph([
    "src/app/page.tsx",
    "src/app/(store)/packs/page.tsx",
    "src/app/(store)/packs/[slug]/page.tsx",
    "src/app/(store)/gacha/[campaignId]/page.tsx",
    "src/app/(store)/gacha/[campaignId]/open/page.tsx",
  ]);
  const reached = [...graph].map(relApp).sort();

  assert.ok(
    !reached.includes("src/features/ynot/StorefrontAdminControls.tsx"),
    `public routes statically reach StorefrontAdminControls:\n${reached.join("\n")}`,
  );
  assert.ok(
    !reached.includes("src/features/ynot/client.tsx"),
    `public routes statically reach the monolithic ynot client barrel:\n${reached.join("\n")}`,
  );
});

test("admin routes are rejected by a server layout before rendering the admin shell", () => {
  const layoutPath = "src/app/admin/layout.tsx";
  assert.ok(existsSync(appPath(layoutPath)), "admin layout is missing");
  assert.match(
    readApp(layoutPath),
    /await\s+requireAdminRoute\(["']\/admin["']\)/,
    "admin layout must force a server-side admin redirect gate",
  );
  assert.match(
    readApp("src/lib/auth/protected-route.ts"),
    /export\s+async\s+function\s+requireAdminRoute/,
    "protected-route helper must expose the admin redirect gate",
  );
});

test("production CSP and Supabase auth cookie adapters are hardened", () => {
  const nextConfig = readApp("next.config.ts");
  assert.doesNotMatch(
    nextConfig,
    /script-src[^"\n]*'unsafe-eval'/,
    "production script-src must not carry a static unsafe-eval allowance",
  );
  assert.match(
    nextConfig,
    /isDevelopment[\s\S]*'unsafe-eval'/,
    "development-only unsafe-eval should be explicit for Next debug tooling",
  );

  const hardenerPath = "src/lib/supabase/cookie-options.ts";
  assert.ok(existsSync(appPath(hardenerPath)), "Supabase cookie hardener is missing");
  const hardener = readApp(hardenerPath);
  assert.match(hardener, /httpOnly:\s*true/);
  assert.match(hardener, /sameSite:\s*"lax"/);
  assert.match(hardener, /path:\s*"\/"/);

  for (const file of [
    "src/lib/supabase/server.ts",
    "src/lib/supabase/proxy.ts",
    "src/app/auth/callback/route.ts",
  ]) {
    assert.match(
      readApp(file),
      /hardenSupabaseCookieOptions/,
      `${file} must harden Supabase auth-token cookie writes`,
    );
  }
});

test("draw_rounds DELETE realtime migration does not reference the row being deleted", () => {
  const migrationDir = repoPath("Database/supabase/migrations");
  const migration = readdirSync(migrationDir)
    .filter((name) => /fix_draw_round_delete_realtime_event\.sql$/.test(name))
    .sort()
    .at(-1);
  assert.ok(migration, "missing draw_rounds DELETE realtime fix migration");

  const sql = readRepo(`Database/supabase/migrations/${migration}`);
  assert.match(sql, /tg_table_name\s*=\s*'draw_rounds'[\s\S]*tg_op\s*=\s*'DELETE'/);
  assert.match(sql, /public_draw_round_id\s*:=\s*null/);
  assert.match(sql, /public_topic\s+is\s+not\s+null\s+and\s+public_draw_round_id\s+is\s+not\s+null/);
  assert.doesNotMatch(
    sql,
    /public_draw_round_id\s*:=\s*old\.id/,
    "draw_rounds DELETE events must not insert a FK to the deleted row",
  );
});

test("public code has no last-prize identity fields", () => {
  const publicSources = [
    "src/features/ynot/data.ts",
    "src/app/api/ynot/gacha/open/route.ts",
    "src/features/ynot/types.ts",
  ].map(readApp).join("\n");

  assert.doesNotMatch(
    publicSources,
    /lastPrize|last_prize|last-prize|lastPrizeCardId|lastPrizeStockUnitKey|lastPrizePreview/,
  );
});
