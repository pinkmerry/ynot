#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

const cwd = process.cwd();
export const websiteRoot =
  basename(cwd) === "Website" && existsSync(resolve(cwd, "package.json"))
    ? cwd
    : resolve(cwd, "Website");
export const repoRoot = resolve(websiteRoot, "..");
export const marketplaceMigrationDir = resolve(
  repoRoot,
  "Database/marketplace-supabase/migrations",
);

export function readWebsite(file) {
  return readFileSync(resolve(websiteRoot, file), "utf8");
}

export function readRepo(file) {
  return readFileSync(resolve(repoRoot, file), "utf8");
}

export function fileExists(file) {
  return existsSync(resolve(websiteRoot, file));
}

export function marketplaceMigrationFiles() {
  return readdirSync(marketplaceMigrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file,
      text: readFileSync(resolve(marketplaceMigrationDir, file), "utf8"),
    }));
}

export function marketplaceSql() {
  return marketplaceMigrationFiles()
    .map(({ name, text }) => `-- ${name}\n${text}`)
    .join("\n");
}

export function marketplaceSourceText() {
  const files = readdirSync(resolve(websiteRoot, "src/lib/marketplace"))
    .filter((file) => file.endsWith(".ts"))
    .sort();
  return files
    .map((file) => `// src/lib/marketplace/${file}\n${readWebsite(`src/lib/marketplace/${file}`)}`)
    .join("\n");
}

export function pass(message) {
  console.log(`PASS ${message}`);
}

export function check(message, condition) {
  if (condition) {
    pass(message);
    return;
  }
  throw new Error(`FAIL ${message}`);
}

export function includes(text, needle, message) {
  check(message, text.includes(needle));
}

export function matches(text, pattern, message) {
  check(message, pattern.test(text));
}

export function notMatches(text, pattern, message) {
  check(message, !pattern.test(text));
}

export function finish(name) {
  console.log(`PASS ${name} verification complete`);
}
