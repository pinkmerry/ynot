import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readProject(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("personal-info profile save syncs default shipping address", () => {
  const route = readProject("src/app/api/lucky-draw/profile/route.ts");

  assert.match(route, /const addressSelect = .*user_addresses/s);
  assert.match(route, /async function syncDefaultAddress/);
  assert.match(route, /\.from\("user_addresses"\)[\s\S]*\.update\(addressPatch\)/);
  assert.match(route, /\.from\("user_addresses"\)[\s\S]*\.insert\(\{[\s\S]*label: "Default"/);
  assert.match(route, /const defaultAddress = await syncDefaultAddress\(/);
  assert.match(route, /profile: toProfileInfo\(data, defaultAddress\)/);
  assert.match(route, /defaultAddress: defaultAddress \? toAddressPayload\(defaultAddress\) : null/);
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
