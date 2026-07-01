#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const appRoot = process.cwd();
const openNextRoot = path.join(appRoot, ".open-next");
const generatedWorkerEntry = path.join(openNextRoot, "worker.js");

function fail(message) {
  console.error(`[cf:patch:server-only] ${message}`);
  process.exitCode = 1;
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function patchFile(filePath) {
  const source = readIfExists(filePath);
  if (source === null) return false;

  const patched = source
    .replaceAll(
      'import "server-only";',
      "/* stripped server-only marker for Cloudflare Worker validation */",
    )
    .replaceAll(
      "import 'server-only';",
      "/* stripped server-only marker for Cloudflare Worker validation */",
    )
    .replaceAll(
      'require("server-only");',
      "/* stripped server-only marker for Cloudflare Worker validation */",
    )
    .replaceAll(
      "require('server-only');",
      "/* stripped server-only marker for Cloudflare Worker validation */",
    );

  if (patched !== source) {
    fs.writeFileSync(filePath, patched);
    return true;
  }

  return false;
}

function walkJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsFiles(fullPath));
    } else if (
      entry.isFile() &&
      /\.(?:mjs|cjs|js)$/.test(entry.name) &&
      !entry.name.endsWith(".map")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

if (!fs.existsSync(generatedWorkerEntry)) {
  fail("OpenNext build output is missing; run opennextjs-cloudflare build first.");
} else {
  const generatedFiles = walkJsFiles(openNextRoot);
  let patchedCount = 0;

  for (const filePath of generatedFiles) {
    if (patchFile(filePath)) patchedCount += 1;
  }

  const unresolved = [];

  for (const filePath of generatedFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    if (
      /(?:import\s+["']server-only["']|require\(["']server-only["']\))/.test(
        source,
      )
    ) {
      unresolved.push(path.relative(appRoot, filePath));
    }
  }

  if (unresolved.length) {
    fail(`unresolved server-only imports in ${unresolved.join(", ")}`);
  } else {
    console.log(
      `[cf:patch:server-only] patched ${patchedCount} generated file(s)`,
    );
  }
}
