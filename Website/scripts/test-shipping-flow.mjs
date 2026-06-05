import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const shippingRoute = readFileSync(
  new URL("../src/app/api/ynot/shipping/route.ts", import.meta.url),
  "utf8",
);
const addressRoute = readFileSync(
  new URL("../src/app/api/ynot/addresses/route.ts", import.meta.url),
  "utf8",
);
const platformVerifier = readFileSync(
  new URL("../tools/verification/verify-platform-foundation.mjs", import.meta.url),
  "utf8",
);

function readOptionalUrl(url) {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const dataSource = readFileSync(
  new URL("../src/features/ynot/data.ts", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../src/features/ynot/types.ts", import.meta.url),
  "utf8",
);
const adminShippingPage = readFileSync(
  new URL("../src/app/admin/shipping/page.tsx", import.meta.url),
  "utf8",
);
const adminUsersPage = readFileSync(
  new URL("../src/app/admin/users/page.tsx", import.meta.url),
  "utf8",
);
const componentsSource = readFileSync(
  new URL("../src/features/ynot/components.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../src/features/ynot/client.tsx", import.meta.url),
  "utf8",
);
const adminShippingRoute = readFileSync(
  new URL("../src/app/api/ynot/admin/shipping/route.ts", import.meta.url),
  "utf8",
);
const adminShippingConsoleSource = readFileSync(
  new URL("../src/features/ynot/admin/AdminShippingConsole.tsx", import.meta.url),
  "utf8",
);
const personalInfoSource = readFileSync(
  new URL("../src/features/ynot/cr/PersonalInfoExperience.tsx", import.meta.url),
  "utf8",
);
const adminUserRouteSource = readOptionalUrl(
  new URL("../src/app/admin/users/[profileId]/page.tsx", import.meta.url),
);
const adminUser360Source = readOptionalUrl(
  new URL("../src/features/ynot/admin/AdminUser360.tsx", import.meta.url),
);
const shippingContextMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604100000_shipping_operations_context.sql", import.meta.url),
);
const shippingPickupMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604150000_shipping_pickup_statuses.sql", import.meta.url),
);
const shippingEventHandoffMigration = readOptionalUrl(
  new URL("../../Database/supabase/migrations/20260604160000_shipping_event_handoff_statuses.sql", import.meta.url),
);
const shippingStatusSource = readOptionalUrl(
  new URL("../src/features/ynot/shipping-status.ts", import.meta.url),
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

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  if (end) assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function typeBlock(typeName) {
  return between(typesSource, `export type ${typeName}`, "\nexport type ");
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

  assert.match(shippingRoute, /const IDEMPOTENCY_KEY_RE\s*=/);
  assert.match(shippingRoute, /const MAX_SHIPPING_ITEMS\s*=/);
  assert.match(shippingRoute, /function normalizeAddressActionToken/);
  assert.match(shippingRoute, /resolveAddressActionToken/);
  assert.match(shippingRoute, /isAddressActionToken/);
  assert.match(shippingRoute, /function normalizeCollectionItemActionTokens/);
  assert.match(shippingRoute, /resolveCollectionItemActionTokens/);
  assert.match(shippingRoute, /isCollectionItemActionToken/);
  assert.match(shippingRoute, /function normalizeIdempotencyKey/);
  assert.match(shippingRoute, /Each card can only be selected once/);
  assert.match(shippingRoute, /Ship up to \$\{MAX_SHIPPING_ITEMS\} cards at a time/);
  assert.match(shippingRoute, /Invalid idempotency key/);
  assert.match(beforeShippingRpc, /\baddressToken\b[\s\S]{0,180}normalizeAddressActionToken\(/);
  assert.match(beforeShippingRpc, /\bcollectionItemTokens\b[\s\S]{0,240}normalizeCollectionItemActionTokens\(/);
  assert.match(beforeShippingRpc, /\bidempotencyKey\b[\s\S]{0,160}normalizeIdempotencyKey\(/);
  assert.match(beforeShippingRpc, /if\s*\(!addressToken\)/);
  assert.match(beforeShippingRpc, /if\s*\(!collectionItemTokens\.length\)/);
  assert.match(beforeShippingRpc, /if\s*\(!idempotencyKey\)/);
  assert.match(beforeShippingRpc, /resolvedAddressId\s*=\s*await resolveAddressActionToken\(/);
  assert.match(beforeShippingRpc, /resolvedCollectionItemIds\s*=\s*await resolveCollectionItemActionTokens\(/);
  assert.match(shippingRpcCall, /\bp_address_id:\s*resolvedAddressId\b/);
  assert.match(shippingRpcCall, /\bp_collection_item_ids:\s*resolvedCollectionItemIds\b/);
  assert.match(shippingRpcCall, /\bp_idempotency_key:\s*idempotencyKey\b/);
  assert.doesNotMatch(shippingRpcCall, /\bbody\?\.addressId\b/);
  assert.doesNotMatch(shippingRpcCall, /\baddressToken\b/);
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

test("admin shipping page loads all requests and renders the operations console", () => {
  assert.match(adminShippingPage, /getShipping\(undefined,\s*true\)/);
  assert.match(adminShippingPage, /AdminShippingConsole/);
  assert.doesNotMatch(adminShippingPage, /getYnotDashboardSlice\(\{\s*shipping:\s*true\s*\}\)/);
});

test("shipping DTOs include user reward pack address tracking and timeline fields", () => {
  const shippingItemBlock = typeBlock("YnotShippingItem");
  const shippingCustomerBlock = typeBlock("YnotShippingCustomer");
  const addressSnapshotBlock = typeBlock("YnotShippingAddressSnapshot");
  const timelineEventBlock = typeBlock("YnotShippingTimelineEvent");
  const shippingRequestBlock = typeBlock("YnotShippingRequest");

  assert.match(shippingItemBlock, /sourceCampaignTitle/);
  assert.match(shippingItemBlock, /sourceOpenCode/);
  assert.match(shippingCustomerBlock, /export type YnotShippingCustomer/);
  assert.match(addressSnapshotBlock, /export type YnotShippingAddressSnapshot/);
  assert.match(timelineEventBlock, /export type YnotShippingTimelineEvent/);
  assert.match(shippingRequestBlock, /items\?: YnotShippingItem\[\]/);
  assert.match(shippingRequestBlock, /customer\?: YnotShippingCustomer \| null/);
  assert.match(shippingRequestBlock, /addressSnapshot\?: YnotShippingAddressSnapshot \| null/);
  assert.match(shippingRequestBlock, /timeline\?: YnotShippingTimelineEvent\[\]/);
});

test("shipping loader enriches requests from users items packs addresses and audits", () => {
  const getShippingBlock = between(dataSource, "export async function getShipping", "function publicShippingRequest");

  assert.match(getShippingBlock, /includeAll/);
  assert.match(getShippingBlock, /\.from\("shipping_request_items"\)/);
  assert.match(getShippingBlock, /\.from\("collection_items"\)/);
  assert.match(getShippingBlock, /\.from\("profiles"\)/);
  assert.match(getShippingBlock, /\.from\("user_addresses"\)/);
  assert.match(getShippingBlock, /\.from\("gacha_opens"\)/);
  assert.match(getShippingBlock, /\.from\("draw_rounds"\)/);
  assert.match(getShippingBlock, /\.from\("audit_events"\)/);
  assert.match(getShippingBlock, /addressSnapshotFromRow/);
  assert.match(getShippingBlock, /shippingItemsByRequestId/);
  assert.match(getShippingBlock, /timelineByShippingRequestId/);
});

test("customer public shipping strips admin-only customer and timeline context", () => {
  const publicBlock = between(dataSource, "function publicShippingRequest", "export async function getAddresses");

  assert.match(publicBlock, /customer:\s*null/);
  assert.match(publicBlock, /timeline:\s*\[\]/);
  assert.match(publicBlock, /adminNote:\s*null/);
  assert.match(publicBlock, /id:\s*request\.publicCode/);
});

test("shipping request stores address snapshot and enforces complete address plus value minimum", () => {
  assert.match(shippingContextMigration, /add column if not exists address_snapshot jsonb/);
  assert.match(shippingContextMigration, /shipping_minimum_coin_value_required/);
  assert.match(shippingContextMigration, /valid_shipping_address_required/);
  assert.match(shippingContextMigration, /recipient_name/);
  assert.match(shippingContextMigration, /postal_code/);
  assert.match(shippingContextMigration, /convert_coin_value_snapshot/);
  assert.match(shippingRoute, /shipping_minimum_coin_value_required/);
});

test("admin shipped transition is the only tracking-required fulfilment status", () => {
  assert.match(adminShippingRoute, /status === "shipped"/);
  assert.match(adminShippingRoute, /Tracking provider and tracking number are required/);
  assert.match(shippingEventHandoffMigration, /if p_status = 'shipped'[\s\S]*shipping_tracking_required/);
  assert.doesNotMatch(shippingEventHandoffMigration, /if p_status in \('shipped', 'delivered'\)[\s\S]*shipping_tracking_required/);
});

test("shipping status model supports pickup fulfilment states", () => {
  const shippingStatusBlock = typeBlock("YnotShippingStatus");
  const requestTypeBlock = between(
    readFileSync(new URL("../src/lib/supabase/types.ts", import.meta.url), "utf8"),
    "shipping_requests: {",
    "shipping_request_items:",
  );
  const rpcTypeBlock = between(
    readFileSync(new URL("../src/lib/supabase/types.ts", import.meta.url), "utf8"),
    "update_shipping_request_status:",
    "consume_api_rate_limit:",
  );

  assert.match(shippingStatusBlock, /ready_for_pickup/);
  assert.match(shippingStatusBlock, /picked_up/);
  assert.match(requestTypeBlock, /ready_for_pickup/);
  assert.match(requestTypeBlock, /picked_up/);
  assert.match(rpcTypeBlock, /ready_for_pickup/);
  assert.match(rpcTypeBlock, /picked_up/);
  assert.match(shippingStatusSource, /Ready for pickup/);
  assert.match(shippingStatusSource, /Picked up/);
});

test("shipping pickup migration adds pickup statuses", () => {
  assert.match(shippingPickupMigration, /drop constraint if exists shipping_requests_status_check/);
  assert.match(shippingPickupMigration, /add constraint shipping_requests_status_check/);
  assert.match(shippingPickupMigration, /ready_for_pickup/);
  assert.match(shippingPickupMigration, /picked_up/);
});

test("shipping event handoff migration allows direct pickup and delivery without tracking", () => {
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status = 'submitted'[\s\S]*p_status not in \('submitted', 'packing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status = 'packing'[\s\S]*p_status not in \('packing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status = 'ready_for_pickup'[\s\S]*p_status not in \('ready_for_pickup', 'picked_up', 'delivered', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /v_previous_status in \('delivered', 'picked_up', 'cancelled'\)/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /if p_status = 'shipped'[\s\S]*shipping_tracking_required/,
  );
  assert.doesNotMatch(
    shippingEventHandoffMigration,
    /if p_status in \('shipped', 'delivered'\)[\s\S]*shipping_tracking_required/,
  );
  assert.match(
    shippingEventHandoffMigration,
    /if p_status in \('shipped', 'delivered', 'picked_up'\)[\s\S]*status = 'shipped'/,
  );
});

test("admin shipping route requires tracking only for shipped status", () => {
  const trackingGuard = between(
    adminShippingRoute,
    "if (\n    status === \"shipped\"",
    "const adminNote",
  );

  assert.match(adminShippingRoute, /ready_for_pickup/);
  assert.match(adminShippingRoute, /picked_up/);
  assert.match(trackingGuard, /status === "shipped"/);
  assert.match(adminShippingRoute, /delivered/);
  assert.doesNotMatch(trackingGuard, /status === "delivered"/);
  assert.doesNotMatch(trackingGuard, /ready_for_pickup/);
  assert.doesNotMatch(trackingGuard, /picked_up/);
});

test("admin shipping route rejects cross-origin status mutations", () => {
  const beforeBodyParsing = sourceBefore(adminShippingRoute, "request.json()");

  assert.match(beforeBodyParsing, /enforceSameOriginMutation\(request\)/);
  assert.match(
    beforeBodyParsing,
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*enforceSameOriginMutation\(request\)[\s\S]*if\s*\(\1\)\s*(?:return\s+\1|\{\s*return\s+\1;?\s*\})/,
  );
});

test("admin shipping console only offers valid pickup-aware status transitions", () => {
  const nextStatusesBody = functionBody(
    adminShippingConsoleSource,
    "nextShippingStatuses",
  );

  assert.match(nextStatusesBody, /case "submitted":[\s\S]*\["submitted", "packing", "ready_for_pickup", "shipped", "delivered", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "packing":[\s\S]*\["packing", "ready_for_pickup", "shipped", "delivered", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "ready_for_pickup":[\s\S]*\["ready_for_pickup", "picked_up", "delivered", "cancelled"\]/);
  assert.match(nextStatusesBody, /case "shipped":[\s\S]*\["shipped", "delivered"\]/);
  assert.match(nextStatusesBody, /case "delivered":[\s\S]*\["delivered"\]/);
  assert.match(nextStatusesBody, /case "picked_up":[\s\S]*\["picked_up"\]/);
  assert.match(nextStatusesBody, /case "cancelled":[\s\S]*\["cancelled"\]/);
  assert.match(adminShippingConsoleSource, /return status === "shipped"/);
  assert.match(adminShippingConsoleSource, /statusOptions\.map/);
});

test("admin shipping console shows status action first and collapses long detail sections", () => {
  assert.match(adminShippingConsoleSource, /admin-shipping-action-bar/);
  assert.match(adminShippingConsoleSource, /admin-shipping-status-select/);
  assert.match(adminShippingConsoleSource, /ShippingDetailSection/);
  assert.match(adminShippingConsoleSource, /<details/);
  assert.match(adminShippingConsoleSource, /Customer/);
  assert.match(adminShippingConsoleSource, /Address/);
  assert.match(adminShippingConsoleSource, /Reward and pack source/);
  assert.match(adminShippingConsoleSource, /Tracking/);
  assert.match(adminShippingConsoleSource, /Timeline/);
  assert.match(adminShippingConsoleSource, /admin-shipping-queue-status-cell/);
  assert.match(adminShippingConsoleSource, /aria-label=\{`Select shipping request/);
});

test("admin user directory links to User 360 and the detail route loads admin user history", () => {
  assert.match(adminUsersPage, /\/admin\/users\/(?:\$\{user\.id\}|[\s\S]{0,120}user\.id)/);
  assert.match(adminUserRouteSource, /getAdminUserDetail/);
  assert.match(adminUserRouteSource, /AdminUser360/);
  assert.match(typesSource, /export type YnotAdminUserDetail/);
  assert.match(dataSource, /export async function getAdminUserDetail/);
});

test("customer shipping history shows reward source pack and tracking details", () => {
  const orderListBlock = between(componentsSource, "export function OrderList", "export function AdminSectionShell");
  const personalInfoShippingBlock = between(
    personalInfoSource,
    "function ShippingHistorySection",
    undefined,
  );

  assert.match(orderListBlock, /order\.items/);
  assert.match(orderListBlock, /sourceCampaignTitle/);
  assert.match(orderListBlock, /ynotShippingTrackingLabel\(order\)/);
  assert.match(personalInfoShippingBlock, /shippingRewardLabel\(shp\)/);
  assert.match(personalInfoShippingBlock, /shippingSourceLabel\(shp\)/);
  assert.match(personalInfoShippingBlock, /ynotShippingTrackingLabel\(shp\)/);
});

test("customer shipping history uses friendly pickup labels instead of raw statuses", () => {
  const orderListBlock = between(componentsSource, "export function OrderList", "export function AdminSectionShell");
  const personalInfoShippingBlock = between(
    personalInfoSource,
    "function ShippingHistorySection",
    undefined,
  );

  assert.match(shippingStatusSource, /ynotShippingStatusCustomerLabel/);
  assert.match(shippingStatusSource, /Ready for pickup/);
  assert.match(shippingStatusSource, /Picked up/);
  assert.match(orderListBlock, /ynotShippingStatusCustomerLabel/);
  assert.match(personalInfoShippingBlock, /ynotShippingStatusCustomerLabel/);
  assert.doesNotMatch(personalInfoShippingBlock, /shp\.status\.replace\(/);
  assert.match(personalInfoShippingBlock, /label: "Completed"/);
  assert.doesNotMatch(personalInfoShippingBlock, /label: "Delivered"/);
});

test("shipping audit history uses friendly pickup status labels", () => {
  const timelineLabelBody = functionBody(dataSource, "shippingTimelineLabel");
  const adminUserTimelineBlock = between(
    adminUser360Source,
    "Support timeline",
    "</AdminCard>",
  );

  assert.match(timelineLabelBody, /status === "ready_for_pickup"[\s\S]*Marked ready for pickup/);
  assert.match(timelineLabelBody, /status === "picked_up"[\s\S]*Marked picked up/);
  assert.match(adminUserTimelineBlock, /ynotShippingStatusLabel\(event\.previousStatus\)/);
  assert.match(adminUserTimelineBlock, /ynotShippingStatusLabel\(event\.status\)/);
  assert.doesNotMatch(adminUserTimelineBlock, /event\.previousStatus \? `\$\{event\.previousStatus\} -> `/);
});

test("customer shipping panel requires a complete address and confirms reward lock before submit", () => {
  const convertPanelBlock = between(clientSource, "export function CollectionConvertPanel", "export function AdminTopUpActions");

  assert.match(clientSource, /from "\.\/address-utils"/);
  assert.match(convertPanelBlock, /isCompleteShippingAddress\(selectedAddress\)/);
  assert.match(convertPanelBlock, /showShippingConfirm/);
  assert.match(convertPanelBlock, /This reward will be locked/);
  assert.match(convertPanelBlock, /SHIPPING_REQUEST_MIN_COINS/);
});

test("shipping address completeness helper matches the shipping RPC required fields", () => {
  const helper = readFileSync(
    new URL("../src/features/ynot/address-utils.ts", import.meta.url),
    "utf8",
  );

  assert.match(helper, /export const REQUIRED_SHIPPING_ADDRESS_FIELDS/);
  assert.match(helper, /key: "recipientName", label: "recipient name"/);
  assert.match(helper, /key: "phone", label: "phone"/);
  assert.match(helper, /key: "addressLine1", label: "address line 1"/);
  assert.match(helper, /key: "subdistrict", label: "subdistrict"/);
  assert.match(helper, /key: "district", label: "district"/);
  assert.match(helper, /key: "province", label: "province"/);
  assert.match(helper, /key: "postalCode", label: "postal code"/);
  assert.match(helper, /key: "country", label: "country"/);
  assert.match(helper, /export function missingShippingAddressFields/);
  assert.match(helper, /export function isCompleteShippingAddress/);
});

test("customer shipping UIs reuse the shared complete-address helper", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /from "..\/address-utils"/);
  assert.match(history, /isCompleteShippingAddress/);
  assert.match(history, /missingShippingAddressFields/);
  assert.doesNotMatch(history, /function isCompleteShippingAddress\(address/);
  assert.match(clientSource, /from "\.\/address-utils"/);
  assert.match(clientSource, /isCompleteShippingAddress/);
  assert.doesNotMatch(clientSource, /function isCompleteShippingAddress\(address/);
});

test("address creation API validates and returns a full selectable address DTO", () => {
  assert.match(addressRoute, /import \{[\s\S]*toYnotAddress[\s\S]*\} from "@\/features\/ynot\/server-addresses"/);
  assert.match(addressRoute, /const recipientName = clean\(body\?\.recipientName, 120\)/);
  assert.match(addressRoute, /const phone = clean\(body\?\.phone, 40\)/);
  assert.match(addressRoute, /const subdistrict = clean\(body\?\.subdistrict, 100\)/);
  assert.match(addressRoute, /const district = clean\(body\?\.district, 100\)/);
  assert.match(addressRoute, /const province = clean\(body\?\.province, 100\)/);
  assert.match(addressRoute, /const postalCode = clean\(body\?\.postalCode, 20\)/);
  assert.match(addressRoute, /if \(\[recipientName, phone, addressLine1, subdistrict, district, province, postalCode, country\]\.some\(\(value\) => !value\)\)/);
  assert.match(addressRoute, /address: await toYnotAddress\(session\.profileId, data as UserAddressRow\)/);
  assert.doesNotMatch(addressRoute, /address: \{\s*id: await addressActionToken/);
});

test("address creation API requires explicit country before saving", () => {
  assert.match(addressRoute, /const country = clean\(body\?\.country, 80\);/);
  assert.match(addressRoute, /if \(\[recipientName, phone, addressLine1, subdistrict, district, province, postalCode, country\]\.some\(\(value\) => !value\)\)/);
  assert.match(addressRoute, /const requiredAddress = \{[\s\S]*country,[\s\S]*\} as const satisfies Record<string, string>/);
  assert.match(addressRoute, /country: requiredAddress\.country,/);
  assert.doesNotMatch(addressRoute, /const country = clean\(body\?\.country, 80\) \?\? "Thailand"/);
  assert.doesNotMatch(addressRoute, /country: country \?\? "Thailand"/);
  assert.doesNotMatch(addressRoute, /country: requiredAddress\.country \?\? "Thailand"/);
});

test("address creation API rejects cross-origin address mutations before auth work", () => {
  const postHandler = addressRoute.slice(addressRoute.indexOf("export async function POST"));
  const beforeAuth = postHandler.slice(0, postHandler.indexOf("resolveCurrentProfile()"));

  assert.match(addressRoute, /import \{ enforceSameOriginMutation \} from "@\/lib\/security\/same-origin"/);
  assert.match(beforeAuth, /const crossOrigin = enforceSameOriginMutation\(request\)/);
  assert.match(beforeAuth, /if \(crossOrigin\) return crossOrigin/);
});

test("collection ship modal lets users choose existing address or add a new one inline", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /const \[addressRows, setAddressRows\] = useState\(addresses\)/);
  assert.match(history, /function handleAddressSaved\(address: YnotAddress\)/);
  assert.match(history, /<ShipModal[\s\S]*addresses=\{addressRows\}[\s\S]*onAddressSaved=\{handleAddressSaved\}/);
  assert.match(history, /const \[addingAddress, setAddingAddress\] = useState\(false\)/);
  assert.match(history, /Add a new address/);
  assert.match(history, /saveAddress\(\)/);
  assert.match(history, /onAddressSaved\(address\)/);
  assert.match(history, /setAddressId\(address\.id\)/);
});

test("collection ship modal prevents duplicate inline address saves while pending", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );
  const shipModal = history.slice(history.indexOf("function ShipModal"));

  assert.match(shipModal, /const \[addressSavePending, setAddressSavePending\] = useState\(false\)/);
  assert.match(shipModal, /if \(addressSavePending\) return/);
  assert.match(shipModal, /setAddressSavePending\(true\)/);
  assert.match(shipModal, /finally \{[\s\S]*setAddressSavePending\(false\)/);
  assert.match(shipModal, /disabled=\{submitting \|\| addressSavePending\}/);
  assert.match(shipModal, /disabled=\{!complete \|\| submitting \|\| addressSavePending\}/);
  assert.match(shipModal, /disabled=\{addressSavePending \|\| submitting\}/);
  assert.match(shipModal, /\{addressSavePending \? "Saving…" : "Save and use this address"\}/);
});

test("collection ship modal disables incomplete saved addresses before submit", () => {
  const history = readFileSync(
    new URL("../src/features/ynot/cr/HistoryExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /const missingFields = missingShippingAddressFields\(a\)/);
  assert.match(history, /const complete = missingFields\.length === 0/);
  assert.match(history, /disabled=\{!complete \|\| submitting \|\| addressSavePending\}/);
  assert.match(history, /Missing \{missingFields\.join\(", "\)\}/);
  assert.match(history, /const selectedAddress = addresses\.find\(\(address\) => address\.id === addressId\)/);
  assert.match(history, /disabled=\{addressSavePending \|\| submitting \|\| !isCompleteShippingAddress\(selectedAddress\)\}/);
});

test("legacy shipping page shares newly saved addresses between form and request panel", () => {
  const shippingPage = readFileSync(
    new URL("../src/app/(store)/shipping/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(clientSource, /export function AddressForm\(\{ addresses, onAddressSaved \}/);
  assert.match(clientSource, /subdistrict, setSubdistrict/);
  assert.match(clientSource, /country, setCountry/);
  assert.match(clientSource, /label, setLabel/);
  assert.match(clientSource, /onAddressSaved\?\.\(payload\.address as YnotAddress\)/);
  assert.match(clientSource, /export function ShippingRequestExperience/);
  assert.match(clientSource, /const \[addressRows, setAddressRows\] = useState\(addresses\)/);
  assert.match(clientSource, /<CollectionConvertPanel collection=\{collection\} addresses=\{addressRows\} \/>/);
  assert.match(clientSource, /<AddressForm addresses=\{addressRows\} onAddressSaved=\{syncAddress\} \/>/);
  assert.match(clientSource, /useEffect\(\(\) => \{[\s\S]*setAddressId\(nextAddressId\)/);
  assert.match(shippingPage, /import \{ ShippingRequestExperience \} from "@\/features\/ynot\/client"/);
  assert.match(shippingPage, /<ShippingRequestExperience collection=\{data\.collection\} addresses=\{data\.addresses\} \/>/);
  assert.doesNotMatch(shippingPage, /<CollectionConvertPanel collection=\{data\.collection\} addresses=\{data\.addresses\} \/>/);
  assert.doesNotMatch(shippingPage, /<AddressForm addresses=\{data\.addresses\} \/>/);
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
  assert.match(validationCheck, /normalizeAddressActionToken/);
  assert.match(validationCheck, /resolveAddressActionToken/);
  assert.match(validationCheck, /normalizeCollectionItemActionTokens/);
  assert.match(validationCheck, /resolveCollectionItemActionTokens/);
  assert.match(validationCheck, /normalizeIdempotencyKey/);
  assert.match(rawErrorCheck, /error\\?\.message/);
  assert.match(publicResultCheck, /publicShippingResult/);
});
