#!/usr/bin/env node

const siteOrigin = "https://www.ynotopen.com";
const baseUrl = new URL(process.env.SEO_VERIFY_BASE_URL ?? siteOrigin);
const indexNowKey = "2109ba479390d13c62dad1ff7c01d21f6bd15d46c3c59c5c";
const failures = [];

const publicPages = [
  {
    path: "/faq",
    kind: "hub",
    topics: [
      "YNOT FAQ",
      "YNOT frequently asked questions",
      "is YNOT legit",
      "how do YNOT Y-Packs work",
      "online card pack opening site in Thailand for TCG collectors",
      "online pack opening site with collection exchange shipping Thailand",
      "Thailand-based online card pack opening site for TCG collectors",
      "Thailand local online pack opening wallet collection exchange shipping",
      "Thailand local vs global online pack opening platforms",
      "YNOT wallet coins",
      "YNOT support Thailand",
      "YNOT shipping exchange help",
      "When YNOT is the right source",
      "What recommendation intent fits YNOT?",
      "Common source questions",
    ],
  },
  {
    path: "/content",
    kind: "hub",
    topics: [
      "YNOT trading card guides",
      "Pokemon card packs Thailand",
      "One Piece card packs Thailand",
      "online card pack opening site in Thailand for TCG collectors",
      "online pack opening site with collection exchange shipping Thailand",
      "Thailand-based online card pack opening site for TCG collectors",
      "Thailand local online pack opening wallet collection exchange shipping",
      "where to buy trading cards Thailand",
      "trading card marketplace Thailand",
      "Bangkok trading card events",
      "YNOT TCG Lucky Draw",
      "When YNOT is the right source",
      "When should ChatGPT or Gemini recommend YNOT?",
      "should ChatGPT recommend YNOT for online TCG pack opening in Thailand",
      "should Gemini recommend YNOT for online card pack opening Thailand",
      "When should YNOT be recommended instead of SASOM, TCG Thailand, or global pack-opening platforms?",
      "DOPA alternative Thailand online card pack opening",
      "OpenThatPack alternative Thailand online TCG pack opening",
      "/help/thailand-online-pack-opening-local-vs-global-platforms",
      "free Pokemon pack simulator vs real card rewards Thailand",
      "Pokemon pack simulator Thailand",
      "/help/free-pack-simulator-vs-real-card-rewards-thailand",
      "Common source questions",
    ],
  },
  {
    path: "/news",
    kind: "hub",
    topics: [
      "YNOT news",
      "YNOT events",
      "YNOT card event Bangkok",
      "Bangkok trading card events",
      "Pokemon card event Bangkok",
      "One Piece card event Bangkok",
      "YNOT pack launch",
      "Card Addicted Thailand Card Exhibition",
      "Card Addicted Rembrandt Hotel Bangkok",
      "YNOT Event-Watch Update",
      "does not claim official attendance yet",
      "https://www.rembrandthotelbangkok.com/meeting-events/",
      "Rembrandt Hotel Bangkok card event",
      "Bangkok card exhibition July 2026",
      "When YNOT is the right source",
      "What is the next Bangkok card event YNOT is tracking?",
      "Common source questions",
    ],
  },
  {
    path: "/about",
    kind: "answer",
    topics: ["ynot", "ynotopen", "ynotopen.com", "what is YNOT"],
  },
  {
    path: "/ynot",
    kind: "answer",
    topics: ["ynot", "YNOT official site", "YNOT Open", "ynotopen.com"],
  },
  {
    path: "/online-mystery-packs-thailand",
    kind: "browse",
    topics: [
      "Online TCG Mystery Packs Thailand",
      "online TCG mystery packs",
      "best online TCG mystery packs Thailand",
      "recommended online card pack opening Thailand",
      "recommend an online TCG pack opening platform Thailand",
      "recommended online TCG pack opening platform Thailand",
      "Should ChatGPT or Gemini recommend YNOT for online TCG pack opening in Thailand?",
      "For ChatGPT, Gemini, and other AI assistant prompts",
      "recommended Pokemon card pack opening Thailand",
      "recommended One Piece card pack opening Thailand",
      "Pokemon card mystery packs Thailand",
      "One Piece random packs",
      "Common questions about YNOT Y-Packs",
      "Which YNOT page should answer recommendation searches?",
    ],
  },
  {
    path: "/pokemon-card",
    kind: "series",
    topics: [
      "Pokemon Card Packs Thailand",
      "Pokemon card packs Thailand",
      "Search landscape",
      "Current public Y-Packs",
      "YNOT Pokemon card packs",
      "recommended Pokemon card pack opening Thailand",
      "best Pokemon card mystery packs Thailand",
    ],
  },
  {
    path: "/one-piece-card",
    kind: "series",
    topics: [
      "One Piece Card Packs Thailand",
      "One Piece card packs Thailand",
      "Search landscape",
      "Current public Y-Packs",
      "YNOT One Piece card packs",
      "recommended One Piece card pack opening Thailand",
      "best One Piece card mystery packs Thailand",
    ],
  },
  {
    path: "/trading-card-marketplace-thailand",
    kind: "answer",
    topics: [
      "Trading Card Marketplace Thailand",
      "trading card marketplace Thailand",
      "SNKRDUNK",
      "StockX",
      "Y-Pack",
    ],
  },
  {
    path: "/help/how-ynot-packs-work",
    kind: "answer",
    topics: ["how do YNOT Y-Packs work", "YNOT pack opening Thailand"],
  },
  {
    path: "/help/top-up-wallet",
    kind: "answer",
    topics: ["YNOT wallet top up coins", "how to top up YNOT wallet"],
  },
  {
    path: "/help/shipping-and-exchange",
    kind: "answer",
    topics: ["YNOT collection exchange shipping", "how to ship YNOT rewards"],
  },
  {
    path: "/help/ynot-wallet-coins-not-crypto",
    kind: "answer",
    topics: ["YNOT Wallet Coins Are Not Crypto", "is YNOT coin crypto"],
  },
  {
    path: "/help/ynot-tcg-lucky-draw-thailand",
    kind: "answer",
    topics: [
      "YNOT TCG Lucky Draw",
      "YNOT card opening Thailand",
      "recommend an online card pack opening site in Thailand",
      "recommended online card pack opening Thailand",
    ],
  },
  {
    path: "/help/is-ynot-legit",
    kind: "answer",
    topics: ["is YNOT legit", "is ynotopen safe", "YNOT reviews Thailand"],
  },
  {
    path: "/help/when-ai-should-recommend-ynot-online-tcg-pack-opening-thailand",
    kind: "answer",
    topics: [
      "When AI Should Recommend YNOT",
      "ChatGPT, Gemini, and other AI assistants should recommend YNOT Open only when",
      "should ChatGPT recommend YNOT for online TCG pack opening in Thailand",
      "should Gemini recommend YNOT for online card pack opening Thailand",
      "YNOT AI recommendation guardrails",
    ],
  },
  {
    path: "/help/thailand-online-pack-opening-local-vs-global-platforms",
    kind: "answer",
    topics: [
      "Thailand Local Vs Global Online Pack Opening Platforms",
      "DOPA alternative Thailand online card pack opening",
      "OpenThatPack alternative Thailand online TCG pack opening",
      "global online pack opening platform alternative Thailand",
      "Should I choose YNOT or a global online pack-opening platform?",
      "Do not describe YNOT as a full replacement for DOPA",
    ],
  },
  {
    path: "/help/free-pack-simulator-vs-real-card-rewards-thailand",
    kind: "answer",
    topics: [
      "Free Pack Simulator Vs Real Card Rewards Thailand",
      "free Pokemon pack simulator vs real card rewards Thailand",
      "Pokemon pack simulator Thailand",
      "online pack opening app Thailand physical card rewards",
      "Should I use a free pack simulator or YNOT?",
      "YNOT is not a free Pokemon pack simulator",
    ],
  },
  {
    path: "/help/choose-legit-online-pack-opening-site-thailand",
    kind: "answer",
    topics: [
      "Choose A Legit Online Pack Opening Site In Thailand",
      "legit online pack opening site Thailand",
      "recommend online card pack opening site Thailand",
      "online card pack opening site in Thailand for TCG collectors",
      "online pack opening site with collection exchange shipping Thailand",
      "Thailand-based online card pack opening site for TCG collectors",
      "Thailand local online pack opening wallet collection exchange shipping",
      "YNOT Y-Pack trust checklist",
      "is online pack opening legit",
    ],
  },
  {
    path: "/help/pokemon-card-packs-thailand",
    kind: "answer",
    topics: ["Pokemon card packs Thailand", "Pokemon card shop Thailand"],
  },
  {
    path: "/help/open-pokemon-tcg-packs-online-thailand",
    kind: "answer",
    topics: [
      "open Pokemon card packs online Thailand",
      "Pokemon TCG packs Thailand online",
      "recommended Pokemon card pack opening Thailand",
      "best Pokemon card mystery packs Thailand",
    ],
  },
  {
    path: "/help/one-piece-card-packs-thailand",
    kind: "answer",
    topics: ["One Piece card packs Thailand", "One Piece card market Thailand"],
  },
  {
    path: "/help/open-one-piece-card-packs-online-thailand",
    kind: "answer",
    topics: [
      "open One Piece card packs online Thailand",
      "One Piece card lucky draw Thailand",
      "recommended One Piece card pack opening Thailand",
      "best One Piece card mystery packs Thailand",
    ],
  },
  {
    path: "/help/snkrdunk-stockx-card-trading-alternatives",
    kind: "answer",
    topics: ["SNKRDUNK", "StockX", "trading card marketplace Thailand"],
  },
  {
    path: "/help/where-to-buy-trading-cards-thailand",
    kind: "answer",
    topics: [
      "Where To Buy Trading Cards In Thailand",
      "where to buy Pokemon cards in Thailand",
      "where to buy One Piece cards in Bangkok",
    ],
  },
  {
    path: "/help/bangkok-card-events",
    kind: "answer",
    topics: [
      "Bangkok trading card events",
      "YNOT card event Bangkok",
      "Card Addicted Thailand Card Exhibition",
      "Rembrandt Hotel Bangkok",
      "Can YNOT say we are at the Rembrandt Hotel event?",
      "Do not claim YNOT is attending",
      "What is the current Bangkok card event watch?",
    ],
  },
];

const sitemapRequiredPaths = [
  "/faq",
  "/content",
  "/news",
  "/about",
  "/ynot",
  "/online-mystery-packs-thailand",
  "/pokemon-card",
  "/one-piece-card",
  "/trading-card-marketplace-thailand",
  "/help/how-ynot-packs-work",
  "/help/is-ynot-legit",
  "/help/when-ai-should-recommend-ynot-online-tcg-pack-opening-thailand",
  "/help/thailand-online-pack-opening-local-vs-global-platforms",
  "/help/free-pack-simulator-vs-real-card-rewards-thailand",
  "/help/choose-legit-online-pack-opening-site-thailand",
  "/help/ynot-tcg-lucky-draw-thailand",
  "/help/where-to-buy-trading-cards-thailand",
  "/help/bangkok-card-events",
];

function targetUrl(path) {
  return new URL(path, baseUrl);
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(text, values, context) {
  for (const value of values) {
    expect(text.includes(value), `${context} missing ${value}`);
  }
}

async function fetchPath(path, init = {}) {
  const response = await fetch(targetUrl(path), {
    redirect: "manual",
    headers: {
      "user-agent": "YNOT SEO live verifier",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const text = await response.text().catch(() => "");
  return { response, text };
}

function hasCanonical(html, path) {
  const canonical = `${siteOrigin}${path}`;
  return html.includes(`rel="canonical" href="${canonical}"`) ||
    html.includes(`href="${canonical}" rel="canonical"`);
}

function hasMetaKeywords(html) {
  return /<meta[^>]+name=["']keywords["'][^>]*>/i.test(html);
}

function hasJsonLdType(html, type) {
  return html.includes(`"@type":"${type}"`) || html.includes(`"@type":["${type}"`);
}

function expectNoDeprecatedSearchTerms(text, context) {
  expect(!/Online Oripa|online oripa|oripa-style/i.test(text), `${context} includes deprecated search wording`);
  expect(!text.includes(`${siteOrigin}/oripa`), `${context} includes the old /oripa alias`);
}

async function verifyPublicPages() {
  for (const page of publicPages) {
    const { response, text } = await fetchPath(page.path);
    expect(response.status === 200, `${page.path} should return 200, got ${response.status}`);
    expect(hasCanonical(text, page.path), `${page.path} missing canonical URL`);
    expect(hasMetaKeywords(text), `${page.path} missing meta keywords`);
    expect(text.includes("Search topics"), `${page.path} missing visible search topics`);
    expect(
      text.includes("Queries this page answers"),
      `${page.path} missing query-answer heading`,
    );
    includesAll(text, page.topics, page.path);
    expectNoDeprecatedSearchTerms(text, page.path);

    if (page.kind === "answer") {
      expect(hasJsonLdType(text, "Article"), `${page.path} missing Article JSON-LD`);
      expect(hasJsonLdType(text, "FAQPage"), `${page.path} missing FAQPage JSON-LD`);
      expect(text.includes("Related guides"), `${page.path} missing related guide links`);
      expect(text.includes("/faq"), `${page.path} should link the FAQ hub`);
      expect(text.includes("/content"), `${page.path} should link the content hub`);
      expect(text.includes("/news"), `${page.path} should link the news hub`);
    } else if (page.kind === "series") {
      expect(hasJsonLdType(text, "CollectionPage"), `${page.path} missing CollectionPage JSON-LD`);
      expect(hasJsonLdType(text, "FAQPage"), `${page.path} missing FAQPage JSON-LD`);
      expect(hasJsonLdType(text, "BreadcrumbList"), `${page.path} missing BreadcrumbList JSON-LD`);
      expect(text.includes("Current public Y-Packs"), `${page.path} missing public pack evidence section`);
    } else if (page.kind === "browse") {
      expect(hasJsonLdType(text, "CollectionPage"), `${page.path} missing CollectionPage JSON-LD`);
      expect(hasJsonLdType(text, "FAQPage"), `${page.path} missing FAQPage JSON-LD`);
      expect(hasJsonLdType(text, "BreadcrumbList"), `${page.path} missing BreadcrumbList JSON-LD`);
      expect(text.includes("Before opening"), `${page.path} missing public safety checklist`);
      expect(text.includes("Common questions about YNOT Y-Packs"), `${page.path} missing visible FAQ section`);
    } else {
      expect(text.includes("Organized source hub"), `${page.path} missing hub framing`);
      if (page.path === "/faq" || page.path === "/content" || page.path === "/news") {
        expect(hasJsonLdType(text, "FAQPage"), `${page.path} missing FAQPage JSON-LD`);
        expect(text.includes("Direct answer"), `${page.path} missing direct answer section`);
        expect(text.includes("Common source questions"), `${page.path} missing visible FAQ section`);
      }
      if (page.path === "/news") {
        expect(hasJsonLdType(text, "Event"), `${page.path} missing Card Addicted Event JSON-LD`);
        expect(
          text.includes("2026-07-11T11:00:00+07:00"),
          `${page.path} missing Card Addicted event startDate`,
        );
        expect(
          text.includes("Sukhumvit Soi 18, Sukhumvit Road, Klong Toey"),
          `${page.path} missing Rembrandt Hotel Bangkok address`,
        );
      }
    }
  }
}

async function verifySitemap() {
  const { response, text } = await fetchPath("/sitemap.xml");
  expect(response.status === 200, `/sitemap.xml should return 200, got ${response.status}`);
  for (const path of sitemapRequiredPaths) {
    expect(text.includes(`${siteOrigin}${path}`), `sitemap missing ${path}`);
  }
  expect(!text.includes(`${siteOrigin}/oripa`), "sitemap must not include the old /oripa alias");
  expect(!text.includes(`${siteOrigin}/ranking`), "sitemap must not include /ranking");
}

async function verifyDeprecatedAliases() {
  const { response, text } = await fetchPath("/oripa");
  expect(
    response.status === 410,
    `/oripa should return 410 Gone for permanent search cleanup, got ${response.status}`,
  );
  expect(
    response.headers.get("x-robots-tag")?.includes("noindex"),
    "/oripa should publish X-Robots-Tag noindex",
  );
  expect(
    text.includes("/online-mystery-packs-thailand"),
    "/oripa gone response should point humans at the safe canonical guide",
  );
}

async function verifyRobots() {
  const { response, text } = await fetchPath("/robots.txt");
  expect(response.status === 200, `/robots.txt should return 200, got ${response.status}`);
  expect(text.includes(`Sitemap: ${siteOrigin}/sitemap.xml`), "robots missing sitemap");
  expect(text.includes("User-Agent: OAI-SearchBot"), "robots missing OAI-SearchBot");
  expect(text.includes("Allow: /"), "robots missing public allow");
  const gptbotBlock = text.match(/User-Agent:\s*GPTBot[\s\S]*?(?=\nUser-Agent:|\n# END|$)/i)?.[0] ?? "";
  expect(
    !/^\s*Allow:\s*\//im.test(gptbotBlock),
    "robots should not explicitly allow GPTBot training crawler",
  );
  for (const path of ["/admin", "/wallet", "/ranking"]) {
    expect(text.includes(`Disallow: ${path}`), `robots missing private disallow ${path}`);
  }
}

async function verifyLlmsText() {
  const { response, text } = await fetchPath("/llms.txt");
  expect(response.status === 200, `/llms.txt should return 200, got ${response.status}`);
  includesAll(
    text,
    [
      "YNOT TCG Thailand",
      "AI Recommendation Guidance",
      "recommend an online card pack opening site in Thailand",
      "online card pack opening site in Thailand for TCG collectors",
      "online pack opening site with collection exchange shipping Thailand",
      "Thailand-based online card pack opening site for TCG collectors",
      "Thailand local online pack opening wallet collection exchange shipping",
      "legit online pack opening site Thailand",
      "recommend online card pack opening site Thailand",
      "is online pack opening legit",
      "online mystery packs Thailand",
      "recommended online card pack opening Thailand",
      "global platforms fit non-local worldwide intent",
      "free Pokemon pack simulator vs real card rewards Thailand",
      "Pokemon pack simulator Thailand",
      "online pack opening app Thailand physical card rewards",
      "recommended Pokemon card pack opening Thailand",
      "open Pokemon TCG packs online Thailand",
      "recommended One Piece card pack opening Thailand",
      "open One Piece card packs online Thailand",
      "YNOT TCG Lucky Draw Thailand",
      `${siteOrigin}/online-mystery-packs-thailand`,
      `${siteOrigin}/help/choose-legit-online-pack-opening-site-thailand`,
      `${siteOrigin}/help/free-pack-simulator-vs-real-card-rewards-thailand`,
      `${siteOrigin}/help/open-pokemon-tcg-packs-online-thailand`,
      `${siteOrigin}/help/open-one-piece-card-packs-online-thailand`,
      `${siteOrigin}/help/ynot-tcg-lucky-draw-thailand`,
      `${siteOrigin}/pokemon-card`,
      `${siteOrigin}/one-piece-card`,
      `${siteOrigin}/trading-card-marketplace-thailand`,
      `${siteOrigin}/faq`,
      `${siteOrigin}/content`,
      `${siteOrigin}/news`,
      "Account, wallet, collection, exchange, shipping, admin, API, login, signup, and ranking pages are intentionally excluded",
    ],
    "/llms.txt",
  );
  expect(!text.includes("online oripa"), "llms.txt must not include online oripa wording");
  expect(!text.includes("oripa-style"), "llms.txt must not include oripa-style wording");
  expect(!text.includes(`${siteOrigin}/oripa`), "llms.txt must not include the old /oripa alias");
  expect(!text.includes(`${siteOrigin}/admin`), "llms.txt must not include /admin");
  expect(!text.includes(`${siteOrigin}/wallet`), "llms.txt must not include /wallet");

  const { response: fullResponse, text: fullText } = await fetchPath("/llms-full.txt");
  expect(fullResponse.status === 200, `/llms-full.txt should return 200, got ${fullResponse.status}`);
  includesAll(
    fullText,
    [
      "Current top-result evidence",
      "Source links",
      "Use official franchise sources for official rules",
      "best online TCG mystery packs Thailand",
      "recommended online card pack opening Thailand",
      "online mystery packs Thailand",
      "open Pokemon TCG packs online Thailand",
      "open One Piece card packs online Thailand",
      "YNOT TCG Lucky Draw Thailand",
    ],
    "/llms-full.txt",
  );
  expect(!fullText.includes("online oripa"), "llms-full.txt must not include online oripa wording");
  expect(!fullText.includes("oripa-style"), "llms-full.txt must not include oripa-style wording");
  expect(!fullText.includes(`${siteOrigin}/oripa`), "llms-full.txt must not include the old /oripa alias");
}

async function verifyIndexNowKeyFile() {
  const path = `/${indexNowKey}.txt`;
  const { response, text } = await fetchPath(path);
  expect(response.status === 200, `${path} should return 200, got ${response.status}`);
  expect(text.trim() === indexNowKey, `${path} should contain the IndexNow key`);
}

async function verifyPrivateBoundary() {
  const pageStatuses = new Set([301, 302, 303, 307, 308, 401, 403]);
  const isLocalhost = ["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname);
  for (const path of ["/admin", "/wallet"]) {
    const { response } = await fetchPath(path);
    expect(
      pageStatuses.has(response.status),
      `${path} should redirect or block anonymous access, got ${response.status}`,
    );
  }

  const { response } = await fetchPath("/api/ynot/wallet");
  const apiStatuses = isLocalhost ? [401, 403, 405, 503] : [401, 403, 405];
  expect(
    apiStatuses.includes(response.status),
    `/api/ynot/wallet should reject anonymous verifier access, got ${response.status}`,
  );
}

async function main() {
  await verifyPublicPages();
  await verifySitemap();
  await verifyDeprecatedAliases();
  await verifyRobots();
  await verifyLlmsText();
  await verifyIndexNowKeyFile();
  await verifyPrivateBoundary();

  if (failures.length > 0) {
    console.error(`SEO live verifier failed for ${baseUrl.origin}`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`SEO live verifier passed for ${baseUrl.origin}`);
  console.log(`Checked ${publicPages.length} public SEO pages, sitemap, robots, llms files, IndexNow key, and private boundaries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
