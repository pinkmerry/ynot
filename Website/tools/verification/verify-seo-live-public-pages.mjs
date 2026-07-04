#!/usr/bin/env node

const siteOrigin = "https://www.ynotopen.com";
const baseUrl = new URL(process.env.SEO_VERIFY_BASE_URL ?? siteOrigin);
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
      "YNOT wallet coins",
      "YNOT support Thailand",
      "YNOT shipping exchange help",
    ],
  },
  {
    path: "/content",
    kind: "hub",
    topics: [
      "YNOT trading card guides",
      "Pokemon card packs Thailand",
      "One Piece card packs Thailand",
      "where to buy trading cards Thailand",
      "trading card marketplace Thailand",
      "Bangkok trading card events",
      "YNOT TCG Lucky Draw",
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
    path: "/help/how-ynot-packs-work",
    kind: "answer",
    topics: ["how do YNOT Y-Packs work", "YNOT pack opening Thailand"],
  },
];

const sitemapRequiredPaths = [
  "/faq",
  "/content",
  "/news",
  "/about",
  "/ynot",
  "/help/how-ynot-packs-work",
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

    if (page.kind === "answer") {
      expect(hasJsonLdType(text, "Article"), `${page.path} missing Article JSON-LD`);
      expect(hasJsonLdType(text, "FAQPage"), `${page.path} missing FAQPage JSON-LD`);
      expect(text.includes("Related guides"), `${page.path} missing related guide links`);
      expect(text.includes("/faq"), `${page.path} should link the FAQ hub`);
      expect(text.includes("/content"), `${page.path} should link the content hub`);
      expect(text.includes("/news"), `${page.path} should link the news hub`);
    } else {
      expect(text.includes("Organized source hub"), `${page.path} missing hub framing`);
    }
  }
}

async function verifySitemap() {
  const { response, text } = await fetchPath("/sitemap.xml");
  expect(response.status === 200, `/sitemap.xml should return 200, got ${response.status}`);
  for (const path of sitemapRequiredPaths) {
    expect(text.includes(`${siteOrigin}${path}`), `sitemap missing ${path}`);
  }
  expect(!text.includes(`${siteOrigin}/ranking`), "sitemap must not include /ranking");
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
      `${siteOrigin}/faq`,
      `${siteOrigin}/content`,
      `${siteOrigin}/news`,
      "Account, wallet, collection, exchange, shipping, admin, API, login, signup, and ranking pages are intentionally excluded",
    ],
    "/llms.txt",
  );
  expect(!text.includes(`${siteOrigin}/admin`), "llms.txt must not include /admin");
  expect(!text.includes(`${siteOrigin}/wallet`), "llms.txt must not include /wallet");
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
  await verifyRobots();
  await verifyLlmsText();
  await verifyPrivateBoundary();

  if (failures.length > 0) {
    console.error(`SEO live verifier failed for ${baseUrl.origin}`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`SEO live verifier passed for ${baseUrl.origin}`);
  console.log(`Checked ${publicPages.length} public SEO pages, sitemap, robots, llms.txt, and private boundaries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
