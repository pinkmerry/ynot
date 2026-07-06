import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(relPath) {
  return readFileSync(path.join(appRoot, relPath), "utf8");
}

const THEME_CSS_PATH = "src/features/marketplace-ui/theme/marketplace-theme.css";
const MP_ICON_PATH = "src/features/marketplace-ui/shared/MpIcon.tsx";
const MP_PRIMITIVES_PATH = "src/features/marketplace-ui/shared/MpPrimitives.tsx";
const MONEY_PATH = "src/features/marketplace-ui/shared/money.ts";
const CUSTOMER_LAYOUT_PATH = "src/app/(store)/marketplace/layout.tsx";
const ADMIN_LAYOUT_PATH = "src/app/admin/marketplace/layout.tsx";

test("package exposes the scoped marketplace UI foundation test script", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-ui-foundation"],
    "node --test scripts/test-marketplace-ui-foundation.mjs",
  );
});

test("theme CSS exists and ports the real prototype tokens and classes", () => {
  assert.ok(existsSync(path.join(appRoot, THEME_CSS_PATH)), "missing theme/marketplace-theme.css");
  const css = readApp(THEME_CSS_PATH);

  // core design tokens verified against the prototype source at
  // /Users/pinkmerry/Downloads/ynott/project/marketplace-theme.css
  for (const token of [
    "--mp-bg",
    "--mp-paper",
    "--mp-line",
    "--mp-ink",
    "--mp-mute",
    "--mp-green",
    "--mp-gold",
    "--mp-rose",
    "--mp-font",
    "--mp-mono",
    "--mp-r-sm",
    "--mp-r-md",
    "--mp-r-lg",
    "--mp-shadow",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(token)), `missing token ${token}`);
  }

  // core classes verified against the prototype source
  for (const cls of [
    ".mp-root",
    ".mp-btn",
    ".mp-btn-primary",
    ".mp-btn-green",
    ".mp-btn-lg",
    ".mp-chip",
    ".mp-badge",
    ".mp-badge-official",
    ".mp-badge-community",
    ".mp-badge-graded",
    ".mp-badge-sold",
    ".mp-badge-raw",
    ".mp-panel",
    ".mp-card",
    ".mp-empty",
    ".mp-steps",
    ".mp-step",
    ".mpa-shell",
    ".mpa-table",
    ".mpa-btn-sm",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(cls) + "[\\s,{.]"), `missing class ${cls}`);
  }

  // keyframes ported from the prototype HTML <style> block
  assert.match(css, /@keyframes mpToastIn/, "missing mpToastIn keyframes");
  assert.match(css, /@keyframes mpSpin/, "missing mpSpin keyframes");

  // page background scoped to .mp-root, matching the prototype's #f7f5ee paper bg
  assert.match(css, /#f7f5ee/, "missing prototype paper background color");
});

test("both marketplace layouts import the theme CSS", () => {
  const customerLayout = readApp(CUSTOMER_LAYOUT_PATH);
  const adminLayout = readApp(ADMIN_LAYOUT_PATH);
  assert.match(
    customerLayout,
    /@\/features\/marketplace-ui\/theme\/marketplace-theme\.css/,
    "customer marketplace layout must import the theme CSS",
  );
  assert.match(
    adminLayout,
    /@\/features\/marketplace-ui\/theme\/marketplace-theme\.css/,
    "admin marketplace layout must import the theme CSS",
  );
});

test("both marketplace layouts self-host JetBrains Mono via next/font and wrap in mp-root", () => {
  const customerLayout = readApp(CUSTOMER_LAYOUT_PATH);
  const adminLayout = readApp(ADMIN_LAYOUT_PATH);

  for (const [label, source] of [
    ["customer", customerLayout],
    ["admin", adminLayout],
  ]) {
    assert.match(source, /from "next\/font\/google"/, `${label} layout must use next/font/google`);
    assert.match(source, /JetBrains_Mono/, `${label} layout must self-host JetBrains Mono`);
    assert.match(source, /variable:\s*["']--mp-font-mono["']/, `${label} layout must expose --mp-font-mono`);
    assert.match(source, /mp-root/, `${label} layout must apply the mp-root wrapper class`);
    assert.doesNotMatch(
      source,
      /fonts\.googleapis\.com/,
      `${label} layout must not link fonts.googleapis.com directly (next/font self-hosts at build)`,
    );
  }

  // customer layout must keep the existing cart provider/drawer mounted
  assert.match(customerLayout, /MarketplaceCartProvider/, "customer layout must keep MarketplaceCartProvider mounted");
  assert.match(customerLayout, /MarketplaceCartDrawer/, "customer layout must keep MarketplaceCartDrawer mounted");
});

test("MpIcon.tsx exports a typed icon component with the prototype's icon set", () => {
  assert.ok(existsSync(path.join(appRoot, MP_ICON_PATH)), "missing shared/MpIcon.tsx");
  const source = readApp(MP_ICON_PATH);
  assert.match(source, /interface MpIconProps/, "must define MpIconProps interface");
  assert.match(source, /name:\s*string/, "MpIconProps must type name as string");
  assert.match(source, /size\?:\s*number/, "MpIconProps must type size as optional number");
  assert.match(source, /(?:React\.)?SVGProps<SVGSVGElement>/, "MpIconProps must extend SVGProps<SVGSVGElement>");
  assert.match(source, /export function MpIcon|export const MpIcon/, "must export MpIcon");

  // sample of icon names ported verbatim from marketplace-shared.jsx's MPIcon switch
  for (const iconName of ["search", "bell", "shield", "truck", "bag", "store", "user", "check"]) {
    assert.match(source, new RegExp(`case "${iconName}"`), `missing icon case "${iconName}"`);
  }
});

test("money.ts exports formatThb (satang->baht) and formatNumber", () => {
  assert.ok(existsSync(path.join(appRoot, MONEY_PATH)), "missing shared/money.ts");
  const source = readApp(MONEY_PATH);
  assert.match(source, /export function formatThb/, "must export formatThb");
  assert.match(source, /export function formatNumber/, "must export formatNumber");
  assert.match(source, /\/\s*100/, "formatThb must convert satang to baht via / 100");
});

test("MpPrimitives.tsx exports all shared primitives with prototype-matching classes", () => {
  assert.ok(existsSync(path.join(appRoot, MP_PRIMITIVES_PATH)), "missing shared/MpPrimitives.tsx");
  const source = readApp(MP_PRIMITIVES_PATH);

  for (const exportName of [
    "MpBadge",
    "MpBtn",
    "MpPanel",
    "MpChip",
    "MpEmpty",
    "MpSteps",
    "MpToasts",
    "useToasts",
  ]) {
    assert.match(
      source,
      new RegExp(`export function ${exportName}|export const ${exportName}`),
      `must export ${exportName}`,
    );
  }

  // class names emitted must match the ported theme CSS
  assert.match(source, /mp-badge/);
  assert.match(source, /mp-btn/);
  assert.match(source, /mp-panel/);
  assert.match(source, /mp-chip/);
  assert.match(source, /mp-empty/);
  assert.match(source, /mp-steps/);
  assert.match(source, /mpa-btn-sm/);

  // MpToasts/useToasts need client-side hooks
  assert.match(source, /"use client"/, "hook-using primitives must opt into the client boundary");
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
