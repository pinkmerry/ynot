import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readProject(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("server address helper lazily creates one default address from complete profile fields only when none exists", () => {
  const helper = readProject("src/features/ynot/server-addresses.ts");

  assert.match(helper, /import "server-only"/);
  assert.match(helper, /export const profileAddressSelect/);
  assert.match(helper, /export const userAddressSelect/);
  assert.match(helper, /function profileRowToAddressInput/);
  assert.match(helper, /isCompleteShippingAddress\(profileAddress\)/);
  assert.match(helper, /export async function ensureDefaultAddressFromProfile/);
  assert.match(helper, /\.from\("profiles"\)[\s\S]*\.select\(profileAddressSelect\)/);
  assert.match(helper, /\.from\("user_addresses"\)[\s\S]*\.select\(userAddressSelect\)/);
  assert.match(helper, /if \(existing\.length > 0\) return existing/);
  assert.match(helper, /\.insert\(\{[\s\S]*label: "Profile default"[\s\S]*is_default: true/);
});

test("server address helper requires explicit profile country before lazy backfill", () => {
  const helper = readProject("src/features/ynot/server-addresses.ts");

  assert.match(helper, /country: row\.country,/);
  assert.match(helper, /if \(!isCompleteShippingAddress\(profileAddress\)\)/);
  assert.match(helper, /const completeProfileAddress = profileAddress as CompleteProfileAddress/);
  assert.match(helper, /country: completeProfileAddress\.country,/);
  assert.doesNotMatch(helper, /country: row\.country \?\? "Thailand"/);
  assert.doesNotMatch(helper, /country: profileAddress\.country \?\? "Thailand"/);
  assert.doesNotMatch(helper, /country: completeProfileAddress\.country \?\? "Thailand"/);
});

test("server address helper rereads addresses after racing default insert", () => {
  const helper = readProject("src/features/ynot/server-addresses.ts");

  assert.match(helper, /if \(insertError\.code === "23505"\)/);
  assert.match(helper, /return readAddressRows\(supabase, profileId\)/);
  assert.match(helper, /throw insertError/);
});

test("server address helper maps saved address rows to full action-token DTOs", () => {
  const helper = readProject("src/features/ynot/server-addresses.ts");

  assert.match(helper, /export async function toYnotAddress/);
  assert.match(helper, /await addressActionToken\(profileId, row\.id\)/);
  assert.match(helper, /recipientName: row\.recipient_name/);
  assert.match(helper, /subdistrict: row\.subdistrict/);
  assert.match(helper, /postalCode: row\.postal_code/);
  assert.match(helper, /deliveryNote: row\.delivery_note/);
  assert.match(helper, /export async function getProfileAddresses/);
  assert.match(helper, /return Promise\.all\(rows\.map\(\(row\) => toYnotAddress\(profileId, row\)\)\)/);
});

test("profile API keeps profile fields separate from shipping address fields", () => {
  const route = readProject("src/app/api/lucky-draw/profile/route.ts");

  assert.match(route, /import \{[\s\S]*ensureDefaultAddressFromProfile[\s\S]*toYnotAddress[\s\S]*\} from "@\/features\/ynot\/server-addresses"/);
  assert.match(route, /addressLine1: row\.address_line1 \?\? ""/);
  assert.doesNotMatch(route, /addressLine1: defaultAddress\?\.address_line1 \?\? row\.address_line1/);
  assert.doesNotMatch(route, /const defaultAddress = await syncDefaultAddress/);
  assert.doesNotMatch(route, /async function syncDefaultAddress/);
  assert.match(route, /const addresses = await ensureDefaultAddressFromProfile\(session\.profileId, supabase\)/);
});

test("dashboard address loader uses lazy profile backfill", () => {
  const dataFile = readProject("src/features/ynot/data.ts");
  const getAddressesBlock = dataFile.slice(
    dataFile.indexOf("export async function getAddresses"),
    dataFile.indexOf("async function getRankingsImpl"),
  );

  assert.match(dataFile, /import \{ getProfileAddresses \} from "\.\/server-addresses"/);
  assert.match(getAddressesBlock, /return readOrEmpty\("addresses", \(\) => getProfileAddresses\(profileId\)\)/);
  assert.doesNotMatch(getAddressesBlock, /\.from\("user_addresses"\)[\s\S]*\.select\("\*"\)[\s\S]*\.eq\("profile_id", profileId\)/);
});

test("personal-info page updates the visible address list after profile save", () => {
  const experience = readProject("src/features/ynot/cr/PersonalInfoExperience.tsx");

  assert.match(experience, /const \[addressRows, setAddressRows\] = useState\(addresses\)/);
  assert.match(experience, /function syncAddress\(address: YnotAddress\)/);
  assert.match(experience, /<ProfileSection onAddressSynced=\{syncAddress\} \/>/);
  assert.match(experience, /onAddressSynced\(defaultAddress\)/);
  assert.match(experience, /<AddressesSection addresses=\{addressRows\} \/>/);
});

test("adding a new default address clears old defaults before marking the new row", () => {
  const route = readProject("src/app/api/ynot/addresses/route.ts");

  assert.match(route, /const shouldBeDefault = Boolean\(body\?\.isDefault\)/);
  assert.match(route, /is_default: false/);
  assert.match(route, /\.update\(\{ is_default: false \}\)[\s\S]*\.neq\("id", inserted\.id\)/);
  assert.match(route, /\.update\(\{ is_default: true \}\)[\s\S]*\.eq\("id", inserted\.id\)/);
});
