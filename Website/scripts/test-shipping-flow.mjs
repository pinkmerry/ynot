import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shippingRoute = readFileSync(
  new URL("../src/app/api/ynot/shipping/route.ts", import.meta.url),
  "utf8",
);
const platformVerifier = readFileSync(
  new URL("../tools/verification/verify-platform-foundation.mjs", import.meta.url),
  "utf8",
);

function functionBody(source, functionName) {
  const functionStart = source.indexOf(`function ${functionName}`);
  if (functionStart < 0) return "";
  const bodyStart = source.indexOf("{", functionStart);
  if (bodyStart < 0) return "";

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }

  return "";
}

function sourceBefore(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  return source.slice(0, markerIndex);
}

function callSource(source, marker) {
  const callStart = source.indexOf(marker);
  if (callStart < 0) return "";
  const parenStart = source.indexOf("(", callStart);
  if (parenStart < 0) return "";

  let depth = 0;
  for (let index = parenStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0) return source.slice(callStart, index + 1);
  }

  return "";
}

function verifierCallSource(functionName, rel, label) {
  const marker = `${functionName}("${rel}", "${label}",`;
  const markerIndex = platformVerifier.indexOf(marker);
  if (markerIndex < 0) return "";
  const callEnd = platformVerifier.indexOf(");", markerIndex);
  if (callEnd < 0) return "";
  return platformVerifier.slice(markerIndex, callEnd + 2);
}

test("customer shipping route uses the same mutation guard as other customer flows", () => {
  const beforeBodyParsing = sourceBefore(shippingRoute, "request.json()");

  assert.match(beforeBodyParsing, /enforceSameOriginMutation\(request\)/);
  assert.match(
    beforeBodyParsing,
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*enforceSameOriginMutation\(request\)[\s\S]*if\s*\(\1\)\s*(?:return\s+\1|\{\s*return\s+\1;?\s*\})/,
  );
});

test("customer shipping route validates action tokens, duplicate cards, count, and idempotency before RPC", () => {
  const beforeShippingRpc = sourceBefore(shippingRoute, 'supabase.rpc("request_shipping_for_items"');
  const shippingRpcCall = callSource(shippingRoute, 'supabase.rpc("request_shipping_for_items"');

  assert.match(shippingRoute, /const UUID_RE\s*=/);
  assert.match(shippingRoute, /const IDEMPOTENCY_KEY_RE\s*=/);
  assert.match(shippingRoute, /const MAX_SHIPPING_ITEMS\s*=/);
  assert.match(shippingRoute, /function normalizeUuid/);
  assert.match(shippingRoute, /function normalizeCollectionItemActionTokens/);
  assert.match(shippingRoute, /resolveCollectionItemActionTokens/);
  assert.match(shippingRoute, /isCollectionItemActionToken/);
  assert.match(shippingRoute, /function normalizeIdempotencyKey/);
  assert.match(shippingRoute, /Each card can only be selected once/);
  assert.match(shippingRoute, /Ship up to \$\{MAX_SHIPPING_ITEMS\} cards at a time/);
  assert.match(shippingRoute, /Invalid idempotency key/);
  assert.match(beforeShippingRpc, /\baddressId\b[\s\S]{0,160}normalizeUuid\(/);
  assert.match(beforeShippingRpc, /\bcollectionItemTokens\b[\s\S]{0,240}normalizeCollectionItemActionTokens\(/);
  assert.match(beforeShippingRpc, /\bidempotencyKey\b[\s\S]{0,160}normalizeIdempotencyKey\(/);
  assert.match(beforeShippingRpc, /if\s*\(!addressId\)/);
  assert.match(beforeShippingRpc, /if\s*\(!collectionItemTokens\.length\)/);
  assert.match(beforeShippingRpc, /if\s*\(!idempotencyKey\)/);
  assert.match(beforeShippingRpc, /resolvedCollectionItemIds\s*=\s*await resolveCollectionItemActionTokens\(/);
  assert.match(shippingRpcCall, /\bp_address_id:\s*addressId\b/);
  assert.match(shippingRpcCall, /\bp_collection_item_ids:\s*resolvedCollectionItemIds\b/);
  assert.match(shippingRpcCall, /\bp_idempotency_key:\s*idempotencyKey\b/);
  assert.doesNotMatch(shippingRpcCall, /\bbody\?\.addressId\b/);
  assert.doesNotMatch(shippingRpcCall, /\bbody\?\.collectionItemIds\b/);
  assert.doesNotMatch(shippingRpcCall, /\bcollectionItemTokens\b/);
  assert.doesNotMatch(shippingRpcCall, /\bbody\?\.idempotencyKey\b/);
});

test("customer shipping route maps database errors to safe customer messages", () => {
  assert.match(shippingRoute, /function shippingErrorMessage/);
  assert.match(shippingRoute, /valid_shipping_address_required/);
  assert.match(shippingRoute, /collection_item_not_shippable/);
  assert.match(shippingRoute, /shippingErrorMessage\(error\.message\)/);
  assert.doesNotMatch(
    shippingRoute,
    /Response\.json\(\s*\{[\s\S]*\berror\s*:\s*error\.message/,
  );
});

test("customer shipping route returns an allowlisted public result", () => {
  const publicResultBody = functionBody(shippingRoute, "publicShippingResult");

  assert.match(shippingRoute, /function publicShippingResult/);
  assert.match(shippingRoute, /result:\s*publicShippingResult\(data\)/);
  assert.match(publicResultBody, /status:/);
  assert.match(publicResultBody, /publicCode:/);
  assert.match(publicResultBody, /itemCount:/);
  assert.match(publicResultBody, /replayed:/);
  assert.doesNotMatch(publicResultBody, /\.\.\.(?:value|data|raw)\b/);
  assert.deepEqual(
    [...publicResultBody.matchAll(/\bvalue\.(\w+)/g)].map((match) => match[0]),
    ["value.status", "value.publicCode", "value.itemCount", "value.replayed"],
  );
  assert.doesNotMatch(shippingRoute, /result:\s*data\b/);
  assert.doesNotMatch(shippingRoute, /\.\.\.(?:data|raw|result)\b/);
  assert.doesNotMatch(shippingRoute, /shippingRequestId:\s*value\.shippingRequestId/);
});

test("platform verifier covers customer shipping hardening", () => {
  const crossOriginCheck = verifierCallSource(
    "check",
    "src/app/api/ynot/shipping/route.ts",
    "shipping request rejects cross-origin cookie mutations",
  );
  const validationCheck = verifierCallSource(
    "check",
    "src/app/api/ynot/shipping/route.ts",
    "shipping request validates action tokens and idempotency keys",
  );
  const rawErrorCheck = verifierCallSource(
    "notCheck",
    "src/app/api/ynot/shipping/route.ts",
    "shipping request does not return raw RPC errors",
  );
  const publicResultCheck = verifierCallSource(
    "check",
    "src/app/api/ynot/shipping/route.ts",
    "shipping request returns allowlisted RPC result",
  );

  assert.match(crossOriginCheck, /enforceSameOriginMutation\\?\(request\\?\)/);
  assert.match(validationCheck, /normalizeUuid/);
  assert.match(validationCheck, /normalizeCollectionItemActionTokens/);
  assert.match(validationCheck, /resolveCollectionItemActionTokens/);
  assert.match(validationCheck, /normalizeIdempotencyKey/);
  assert.match(rawErrorCheck, /error\\?\.message/);
  assert.match(publicResultCheck, /publicShippingResult/);
});
