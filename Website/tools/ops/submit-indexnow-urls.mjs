#!/usr/bin/env node

const siteOrigin = process.env.INDEXNOW_SITE_ORIGIN ?? "https://www.ynotopen.com";
const endpoint = process.env.INDEXNOW_ENDPOINT ?? "https://api.indexnow.org/indexnow";
const indexNowKey = "2109ba479390d13c62dad1ff7c01d21f6bd15d46c3c59c5c";
const keyFile = `${indexNowKey}.txt`;
const dryRun = process.argv.includes("--dry-run");
const skipKeyCheck = process.argv.includes("--skip-key-check");

const priorityPaths = [
  "/",
  "/ynot",
  "/about",
  "/faq",
  "/content",
  "/news",
  "/online-mystery-packs-thailand",
  "/pokemon-card",
  "/one-piece-card",
  "/trading-card-marketplace-thailand",
  "/help/how-ynot-packs-work",
  "/help/top-up-wallet",
  "/help/shipping-and-exchange",
  "/help/ynot-wallet-coins-not-crypto",
  "/help/is-ynot-legit",
  "/help/ynot-tcg-lucky-draw-thailand",
  "/help/pokemon-card-packs-thailand",
  "/help/open-pokemon-tcg-packs-online-thailand",
  "/help/one-piece-card-packs-thailand",
  "/help/open-one-piece-card-packs-online-thailand",
  "/help/snkrdunk-stockx-card-trading-alternatives",
  "/help/where-to-buy-trading-cards-thailand",
  "/help/bangkok-card-events",
];

function absoluteUrl(path) {
  return new URL(path, siteOrigin).toString();
}

async function verifyKeyFile() {
  const keyUrl = absoluteUrl(`/${keyFile}`);
  const response = await fetch(`${keyUrl}?codex_indexnow_key_check=${Date.now()}`, {
    headers: {
      "user-agent": "YNOT IndexNow verifier",
    },
  });
  const text = (await response.text()).trim();
  if (!response.ok || text !== indexNowKey) {
    throw new Error(
      `IndexNow key file check failed at ${keyUrl}: ${response.status} ${text.slice(0, 80)}`,
    );
  }
  return keyUrl;
}

async function submit() {
  const origin = new URL(siteOrigin);
  const urlList = priorityPaths.map(absoluteUrl);
  const keyLocation = absoluteUrl(`/${keyFile}`);
  const body = {
    host: origin.host,
    key: indexNowKey,
    keyLocation,
    urlList,
  };

  if (!skipKeyCheck) {
    await verifyKeyFile();
  }

  if (dryRun) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "user-agent": "YNOT IndexNow submitter",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();

  if (![200, 202].includes(response.status)) {
    throw new Error(`IndexNow submit failed: ${response.status} ${text}`);
  }

  console.log(`IndexNow accepted ${urlList.length} YNOT public SEO URLs.`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Key location: ${keyLocation}`);
  console.log(`HTTP status: ${response.status}`);
  if (text.trim()) {
    console.log(text.trim());
  }
}

submit().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
