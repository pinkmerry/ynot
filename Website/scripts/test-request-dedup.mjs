import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function sliceFn(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const rest = src.slice(start + startMarker.length);
  const nextIdx = rest.search(/\n(?:async function |function |export )/);
  return src.slice(start, start + startMarker.length + (nextIdx === -1 ? rest.length : nextIdx));
}

const authSrc = readFileSync(
  fileURLToPath(new URL("../src/lib/auth/resolve-current-profile.ts", import.meta.url)),
  "utf8",
);

test("resolveCurrentProfile is request-memoized via React cache()", () => {
  assert.match(authSrc, /import \{ cache \} from "react"/);
  assert.match(authSrc, /export const resolveCurrentProfile = cache\(async \(/);
});

test("resolveAdminSession is request-memoized via React cache()", () => {
  assert.match(authSrc, /export const resolveAdminSession = cache\(async \(/);
});

const dataSrc = readFileSync(
  fileURLToPath(new URL("../src/features/ynot/data.ts", import.meta.url)),
  "utf8",
);

test("getYnotViewer is request-memoized via React cache()", () => {
  assert.match(dataSrc, /import \{ cache \} from "react"/);
  assert.match(dataSrc, /export const getYnotViewer = cache\(async \(/);
});

test("customer paths fetch only the cards they reference, by id (no 250-row catalog cap)", () => {
  assert.doesNotMatch(dataSrc, /getRequestCardCatalog/, "getRequestCardCatalog should be removed");
  for (const marker of [
    "export async function getCollection",
    "export async function getGachaOpenHistory",
    "export async function getShipping",
  ]) {
    const fn = sliceFn(dataSrc, marker);
    assert.match(fn, /getCardCatalogByIds\(supabase,/, `${marker} should use getCardCatalogByIds`);
  }
});
