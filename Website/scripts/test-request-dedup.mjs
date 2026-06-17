import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
