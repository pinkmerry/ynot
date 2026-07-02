import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(".");

function appPath(relPath) {
  return path.join(appRoot, relPath);
}

function readApp(relPath) {
  const fullPath = appPath(relPath);
  assert.ok(existsSync(fullPath), `missing ${relPath}`);
  return readFileSync(fullPath, "utf8");
}

function loadSeoModule() {
  const source = readApp("src/lib/seo/public-answer-pages.ts");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: cjsModule.exports,
    module: cjsModule,
    require,
  });
  return cjsModule.exports;
}

test("public answer pages map the failed Google and ChatGPT query intents", () => {
  const seo = loadSeoModule();
  const pages = seo.publicAnswerPages;

  for (const expectedPath of [
    "/about",
    "/ynot",
    "/help/how-ynot-packs-work",
    "/help/top-up-wallet",
    "/help/shipping-and-exchange",
    "/help/ynot-wallet-coins-not-crypto",
    "/help/ynot-tcg-lucky-draw-thailand",
    "/help/is-ynot-legit",
    "/help/pokemon-card-packs-thailand",
    "/help/open-pokemon-tcg-packs-online-thailand",
    "/help/one-piece-card-packs-thailand",
    "/help/snkrdunk-stockx-card-trading-alternatives",
    "/help/where-to-buy-trading-cards-thailand",
    "/help/bangkok-card-events",
    "/trading-card-marketplace-thailand",
  ]) {
    assert.ok(
      pages.some((page) => page.path === expectedPath),
      `missing public answer page ${expectedPath}`,
    );
  }

  const yPacks = seo.getPublicAnswerPage("how-ynot-packs-work");
  assert.equal(yPacks.path, "/help/how-ynot-packs-work");
  assert.match(yPacks.answer.en, /Y-Pack/i);
  assert.match(yPacks.answer.en, /digital/i);
  assert.match(yPacks.answer.en, /collection/i);
  assert.ok(
    yPacks.queryTargets.includes("how do YNOT Y-Packs work"),
    "Y-Pack explainer must target the failed branded query",
  );
  assert.ok(
    yPacks.proofPoints.length >= 3,
    "Y-Pack explainer needs visible proof points for AI citations",
  );

  const officialSite = seo.getPublicAnswerPage("ynot-official-site");
  assert.equal(officialSite.path, "/ynot");
  assert.match(officialSite.title.en, /YNOT Official Site/i);
  assert.match(officialSite.answer.en, /https:\/\/www\.ynotopen\.com/);
  assert.match(officialSite.answer.en, /YNOT Open/);
  assert.match(officialSite.answer.en, /ynotopen\.com/);
  assert.match(officialSite.answer.en, /YouTube downloader/);
  assert.match(officialSite.answer.en, /Y Not 7/);
  assert.match(officialSite.answer.en, /BEST OF Y NOT 7/);
  assert.match(officialSite.answer.en, /Spotify/);
  assert.match(officialSite.answer.en, /Y Not Festival/);
  assert.match(officialSite.answer.en, /YnotOne/);
  assert.ok(
    officialSite.queryTargets.includes("ynot"),
    "official-site page must target the exact one-word YNOT query",
  );
  assert.ok(
    officialSite.queryTargets.includes("what does ynot mean"),
    "official-site page must target the exact YNOT meaning query",
  );
  assert.ok(
    officialSite.queryTargets.includes("ynotopen"),
    "official-site page must target the exact ynotopen query",
  );
  assert.ok(
    officialSite.queryTargets.includes("YNOT Open"),
    "official-site page must target the YNOT Open entity query",
  );
  assert.ok(
    officialSite.proofPoints.some((proof) => /_yfifteen/.test(proof.en)),
    "official-site page must cite the official Instagram identity",
  );

  const ynotTcg = seo.getPublicAnswerPage("ynot-tcg-lucky-draw-thailand");
  assert.equal(ynotTcg.path, "/help/ynot-tcg-lucky-draw-thailand");
  assert.match(ynotTcg.title.en, /YNOT TCG/i);
  assert.match(ynotTcg.answer.en, /Y-Pack/i);
  assert.match(ynotTcg.answer.en, /Lucky Draw/i);
  assert.match(ynotTcg.answer.en, /Thailand/i);
  assert.ok(
    ynotTcg.queryTargets.includes("ynot tcg"),
    "YNOT TCG page must target the exact branded TCG query",
  );
  assert.ok(
    ynotTcg.queryTargets.includes("YNOT TCG Lucky Draw"),
    "YNOT TCG page must target the entity phrase recommended by research",
  );
  assert.ok(
    ynotTcg.proofPoints.some((proof) => /ynotopen\.com/.test(proof.en)),
    "YNOT TCG page must connect the entity to the official domain",
  );

  const ynotTrust = seo.getPublicAnswerPage("is-ynot-legit");
  assert.equal(ynotTrust.path, "/help/is-ynot-legit");
  assert.match(ynotTrust.title.en, /YNOT.*Legit|Legit.*YNOT/i);
  assert.match(ynotTrust.answer.en, /ynotopen\.com/);
  assert.match(ynotTrust.answer.en, /official Instagram/i);
  assert.match(ynotTrust.answer.en, /public/i);
  assert.ok(
    ynotTrust.queryTargets.includes("is YNOT legit"),
    "YNOT trust page must target direct legitimacy searches",
  );
  assert.ok(
    ynotTrust.queryTargets.includes("is ynotopen safe"),
    "YNOT trust page must target safety searches for the official domain",
  );
  assert.ok(
    ynotTrust.queryTargets.includes("YNOT reviews Thailand"),
    "YNOT trust page must target review-style trust searches",
  );
  assert.ok(
    ynotTrust.proofPoints.some((proof) => /_yfifteen/.test(proof.en)),
    "YNOT trust page must connect trust proof to the official Instagram profile",
  );
  assert.ok(
    ynotTrust.proofPoints.some((proof) => /public pack/.test(proof.en)),
    "YNOT trust page must tell users to verify public pack details before opening",
  );
  assert.ok(
    Array.isArray(ynotTrust.sourceLinks) && ynotTrust.sourceLinks.length >= 2,
    "YNOT trust page must expose source links for public proof",
  );

  const cryptoDisambiguation = seo.getPublicAnswerPage(
    "ynot-wallet-coins-not-crypto",
  );
  assert.match(cryptoDisambiguation.answer.en, /not a crypto token/i);
  assert.ok(
    cryptoDisambiguation.queryTargets.includes("YNOT wallet top up coins"),
    "coin disambiguation must target the failed wallet query",
  );

  const pokemonCategory = seo.getPublicAnswerPage("pokemon-card-packs-thailand");
  assert.equal(pokemonCategory.path, "/help/pokemon-card-packs-thailand");
  assert.match(pokemonCategory.title.en, /Pokemon Card/i);
  assert.match(pokemonCategory.answer.en, /not the official Pokemon/i);
  assert.match(pokemonCategory.answer.en, /Y-Pack/i);
  assert.ok(
    pokemonCategory.queryTargets.includes("pokemon card"),
    "Pokemon category page must target the exact broad query",
  );
  assert.ok(
    pokemonCategory.queryTargets.includes("Pokemon card packs Thailand"),
    "Pokemon category page must target local pack intent",
  );
  assert.ok(
    pokemonCategory.queryTargets.includes("Pokemon card shop Thailand"),
    "Pokemon category page must target card-shop intent without pretending YNOT is the official publisher",
  );
  assert.ok(
    pokemonCategory.queryTargets.includes("buy Pokemon card Thailand"),
    "Pokemon category page must target commercial purchase variants",
  );
  assert.ok(
    pokemonCategory.queryTargets.includes("การ์ดโปเกมอน"),
    "Pokemon category page must target Thai-language collector intent",
  );
  assert.ok(
    pokemonCategory.proofPoints.some((proof) => /official Pokemon/.test(proof.en)),
    "Pokemon category page must send official rules/card database intent to official sources",
  );

  const onePieceCategory = seo.getPublicAnswerPage("one-piece-card-packs-thailand");
  assert.equal(onePieceCategory.path, "/help/one-piece-card-packs-thailand");
  assert.match(onePieceCategory.title.en, /One Piece Card/i);
  assert.match(onePieceCategory.answer.en, /not the official One Piece/i);
  assert.match(onePieceCategory.answer.en, /Y-Pack/i);
  assert.ok(
    onePieceCategory.queryTargets.includes("one piece card"),
    "One Piece category page must target the exact broad query",
  );
  assert.ok(
    onePieceCategory.queryTargets.includes("One Piece card packs Thailand"),
    "One Piece category page must target local pack intent",
  );
  assert.ok(
    onePieceCategory.queryTargets.includes("One Piece card market Thailand"),
    "One Piece category page must target community market intent",
  );
  assert.ok(
    onePieceCategory.queryTargets.includes("buy One Piece card Thailand"),
    "One Piece category page must target commercial purchase variants",
  );
  assert.ok(
    onePieceCategory.queryTargets.includes("การ์ดวันพีซ"),
    "One Piece category page must target Thai-language collector intent",
  );
  assert.ok(
    onePieceCategory.proofPoints.some((proof) => /official One Piece/.test(proof.en)),
    "One Piece category page must send official rules/card database intent to official sources",
  );

  const marketplaceAlternatives = seo.getPublicAnswerPage(
    "snkrdunk-stockx-card-trading-alternatives",
  );
  assert.equal(
    marketplaceAlternatives.path,
    "/help/snkrdunk-stockx-card-trading-alternatives",
  );
  assert.match(marketplaceAlternatives.answer.en, /SNKRDUNK/);
  assert.match(marketplaceAlternatives.answer.en, /StockX/);
  assert.match(marketplaceAlternatives.answer.en, /not SNKRDUNK or StockX/i);
  assert.ok(
    marketplaceAlternatives.queryTargets.includes(
      "SNKRDUNK alternative trading cards Thailand",
    ),
    "competitor-intent page must target SNKRDUNK alternative searches",
  );
  assert.ok(
    marketplaceAlternatives.queryTargets.includes("StockX alternative trading cards"),
    "competitor-intent page must target StockX alternative searches",
  );
  assert.ok(
    marketplaceAlternatives.queryTargets.includes("trading card marketplace Thailand"),
    "competitor-intent page must target broader marketplace/category searches",
  );
  assert.ok(
    marketplaceAlternatives.proofPoints.some((proof) => /Y-Packs/.test(proof.en)),
    "competitor-intent page must connect the comparison back to YNOT Y-Packs",
  );
  assert.ok(
    marketplaceAlternatives.faqs.some((faq) =>
      /same as SNKRDUNK or StockX/i.test(faq.question.en),
    ),
    "competitor-intent page must answer the obvious comparison question",
  );

  const marketplaceGuide = seo.getPublicAnswerPage(
    "trading-card-marketplace-thailand",
  );
  assert.equal(marketplaceGuide.path, "/trading-card-marketplace-thailand");
  assert.match(marketplaceGuide.title.en, /Trading Card Marketplace Thailand/i);
  assert.match(marketplaceGuide.answer.en, /SNKRDUNK/);
  assert.match(marketplaceGuide.answer.en, /StockX/);
  assert.match(marketplaceGuide.answer.en, /Y-Pack/i);
  assert.ok(
    marketplaceGuide.queryTargets.includes("trading card marketplace Thailand"),
    "marketplace guide must target broad Thailand marketplace searches",
  );
  assert.ok(
    marketplaceGuide.queryTargets.includes("Pokemon card marketplace Thailand"),
    "marketplace guide must target Pokemon marketplace intent",
  );
  assert.ok(
    marketplaceGuide.queryTargets.includes("SNKRDUNK alternative trading cards Thailand"),
    "marketplace guide must target SNKRDUNK-adjacent intent",
  );
  assert.ok(
    marketplaceGuide.queryTargets.includes("StockX alternative trading cards"),
    "marketplace guide must target StockX-adjacent intent",
  );
  assert.ok(
    marketplaceGuide.sourceLinks.some((source) => /stockx\.com/.test(source.href)),
    "marketplace guide must cite StockX marketplace evidence",
  );
  assert.ok(
    marketplaceGuide.sourceLinks.some((source) => /snkrdunk\.com/.test(source.href)),
    "marketplace guide must cite SNKRDUNK marketplace evidence",
  );
  assert.ok(
    marketplaceGuide.sourceLinks.some((source) => /tcgthailand\.com/.test(source.href)),
    "marketplace guide must cite Thai marketplace evidence",
  );
  assert.ok(
    marketplaceGuide.sourceLinks.some((source) => /kyocards\.com/.test(source.href)),
    "marketplace guide must cite Southeast Asia marketplace evidence",
  );
  assert.ok(
    marketplaceGuide.sourceLinks.some((source) => /thaicardexchange\.com/.test(source.href)),
    "marketplace guide must cite Thai card exchange evidence",
  );

  const buyingGuide = seo.getPublicAnswerPage(
    "where-to-buy-trading-cards-thailand",
  );
  assert.equal(
    buyingGuide.path,
    "/help/where-to-buy-trading-cards-thailand",
  );
  assert.match(buyingGuide.title.en, /Where To Buy Trading Cards In Thailand/i);
  assert.match(buyingGuide.answer.en, /Pokemon/i);
  assert.match(buyingGuide.answer.en, /One Piece/i);
  assert.match(buyingGuide.answer.en, /YNOT/i);
  assert.ok(
    buyingGuide.queryTargets.includes("where to buy Pokemon cards in Thailand"),
    "buying guide must target Pokemon buying searches",
  );
  assert.ok(
    buyingGuide.queryTargets.includes("where to buy One Piece cards in Bangkok"),
    "buying guide must target One Piece Bangkok buying searches",
  );
  assert.ok(
    buyingGuide.queryTargets.includes("trading card shop Thailand"),
    "buying guide must target local trading-card-shop searches",
  );
  assert.ok(
    buyingGuide.queryTargets.includes("Pokemon card marketplace Thailand"),
    "buying guide must target Pokemon marketplace searches while marketplace is gated",
  );
  assert.ok(
    buyingGuide.proofPoints.some((proof) => /official/.test(proof.en)),
    "buying guide must send official product/store-list intent to official sources",
  );
  assert.ok(
    buyingGuide.proofPoints.some((proof) => /buy, sell, auction, marketplace/.test(proof.en)),
    "buying guide must explain the catalog language used by ranked shop and marketplace pages",
  );
  assert.ok(
    buyingGuide.proofPoints.some((proof) => /Y-Pack/.test(proof.en)),
    "buying guide must connect adjacent buying intent back to YNOT Y-Packs",
  );
  assert.ok(
    Array.isArray(buyingGuide.sourceLinks) && buyingGuide.sourceLinks.length >= 4,
    "buying guide must expose external source links for competitor/source proof",
  );
  assert.ok(
    buyingGuide.sourceLinks.some((source) => /onepiece-cardgame/.test(source.href)),
    "buying guide must cite official One Piece source evidence",
  );
  assert.ok(
    buyingGuide.sourceLinks.some((source) => /bangkoktcg\.com/.test(source.href)),
    "buying guide must cite local card-shop source evidence",
  );
  assert.ok(
    buyingGuide.sourceLinks.some((source) => /tcgthailand\.com/.test(source.href)),
    "buying guide must cite Thai marketplace source evidence",
  );
  assert.ok(
    buyingGuide.sourceLinks.some((source) => /sasom\.co\.th/.test(source.href)),
    "buying guide must cite a ranked Pokemon buying-guide source example",
  );

  const bangkokEvents = seo.getPublicAnswerPage("bangkok-card-events");
  assert.equal(bangkokEvents.path, "/help/bangkok-card-events");
  assert.match(bangkokEvents.answer.en, /Bangkok|BKK/i);
  assert.match(bangkokEvents.answer.en, /stable/i);
  assert.ok(
    bangkokEvents.queryTargets.includes("Bangkok trading card events"),
    "Bangkok event page must target local event discovery",
  );
  assert.ok(
    bangkokEvents.queryTargets.includes("Pokemon card event Bangkok"),
    "Bangkok event page must target Pokemon event searches",
  );
  assert.ok(
    bangkokEvents.queryTargets.includes("YNOT card event Bangkok"),
    "Bangkok event page must target branded local event searches",
  );
  assert.ok(
    bangkokEvents.queryTargets.includes("YNOT TCG VIP Card International Expo"),
    "Bangkok event page must target the public VIP Card International Expo YNOT mention",
  );
  assert.ok(
    bangkokEvents.queryTargets.includes("YNOT x MIDNIGHT Bangkok"),
    "Bangkok event page must target the YNOT x MIDNIGHT event proof phrase",
  );
  assert.ok(
    bangkokEvents.queryTargets.includes("_yfifteen Bangkok card event"),
    "Bangkok event page must target the official Instagram event proof phrase",
  );
  assert.ok(
    bangkokEvents.faqs.some((faq) => /rotate.*every week/i.test(faq.question.en)),
    "Bangkok event page must answer the weekly rotation question",
  );
  assert.ok(
    bangkokEvents.proofPoints.some((proof) => /past-event proof/i.test(proof.en)),
    "Bangkok event page must preserve event proof instead of replacing it",
  );
  assert.ok(
    bangkokEvents.proofPoints.some((proof) => /YNOT x MIDNIGHT/.test(proof.en)),
    "Bangkok event page must preserve the YNOT x MIDNIGHT external proof phrase",
  );
  assert.ok(
    Array.isArray(bangkokEvents.sourceLinks) && bangkokEvents.sourceLinks.length >= 3,
    "Bangkok event page must expose public source links for event/entity proof",
  );
  assert.ok(
    bangkokEvents.sourceLinks.some(
      (source) => source.href === "https://www.instagram.com/_yfifteen/",
    ),
    "Bangkok event page must link the official Instagram source",
  );
  assert.ok(
    bangkokEvents.sourceLinks.some((source) => /DYG_PoKhWtr/.test(source.href)),
    "Bangkok event page must link the YNOT x MIDNIGHT source mention",
  );
  assert.ok(
    bangkokEvents.sourceLinks.some((source) =>
      /VIP CARD INTERNATIONAL EXPO 2026/.test(source.title.en),
    ),
    "Bangkok event page must link a VIP Card International Expo 2026 YNOT TCG mention",
  );
});

test("public answer pages expose schema-ready FAQ and article proof data", () => {
  const seo = loadSeoModule();

  assert.equal(
    seo.organizationJsonLd["@id"],
    "https://www.ynotopen.com/#organization",
    "Organization schema needs a stable entity id for YNOT",
  );
  assert.equal(seo.organizationJsonLd.url, "https://www.ynotopen.com");
  assert.equal(
    seo.organizationJsonLd.name,
    "YNOT Open",
    "Organization schema should use the disambiguated public entity name",
  );
  assert.equal(
    seo.organizationJsonLd.logo,
    "https://www.ynotopen.com/ynot-logo-512.png",
  );
  assert.ok(
    seo.organizationJsonLd.alternateName.includes("ynot"),
    "Organization schema must include the exact lowercase query users type",
  );
  assert.ok(
    seo.organizationJsonLd.alternateName.includes("ynotopen"),
    "Organization schema must connect the brand to ynotopen search intent",
  );
  assert.ok(
    seo.organizationJsonLd.alternateName.includes("ynotopen.com"),
    "Organization schema must connect the brand to the official domain query",
  );
  assert.ok(
    seo.organizationJsonLd.alternateName.includes("YNOT Open"),
    "Organization schema must include the entity name users search after broad YNOT",
  );
  assert.ok(
    seo.organizationJsonLd.alternateName.includes("YNOT Y-Packs"),
    "Organization schema must connect YNOT to Y-Pack intent",
  );
  assert.ok(
    seo.organizationJsonLd.alternateName.includes("YNOT TCG Thailand"),
    "Organization schema must connect YNOT to the local card category",
  );
  assert.ok(
    seo.organizationJsonLd.sameAs.includes("https://www.instagram.com/_yfifteen/"),
    "Organization schema must point to the official YNOT Instagram profile",
  );
  assert.ok(
    seo.organizationJsonLd.knowsAbout.includes("Y-Pack openings"),
    "Organization schema must describe the YNOT card-platform knowledge area",
  );
  assert.ok(
    seo.organizationJsonLd.knowsAbout.includes("Bangkok trading card events"),
    "Organization schema must connect YNOT with local Bangkok event authority",
  );
  assert.ok(
    seo.organizationJsonLd.knowsAbout.includes("TCG events Bangkok"),
    "Organization schema must connect YNOT with TCG event searches in Bangkok",
  );
  assert.ok(
    seo.organizationJsonLd.knowsAbout.includes("YNOT trust and safety"),
    "Organization schema must connect YNOT with trust and safety searches",
  );
  assert.ok(
    seo.organizationJsonLd.knowsAbout.includes("Trading card shops Thailand"),
    "Organization schema must connect YNOT with local card-shop searches",
  );
  assert.match(
    seo.organizationJsonLd.disambiguatingDescription,
    /YouTube downloader/,
    "Organization schema must disambiguate against the live Google top result",
  );
  assert.match(
    seo.organizationJsonLd.disambiguatingDescription,
    /Ynot7/,
    "Organization schema must disambiguate against the live Ynot7 result",
  );
  assert.match(
    seo.organizationJsonLd.disambiguatingDescription,
    /Spotify/,
    "Organization schema must disambiguate against the live Spotify result",
  );
  assert.match(
    seo.organizationJsonLd.disambiguatingDescription,
    /YnotOne/,
    "Organization schema must disambiguate against the live ChatGPT YnotOne result",
  );
  assert.equal(
    seo.organizationJsonLd.areaServed["@type"],
    "Country",
    "Organization schema must identify the Thailand service-area type",
  );
  assert.equal(
    seo.organizationJsonLd.areaServed.name,
    "Thailand",
    "Organization schema must identify the Thailand service area",
  );
  assert.ok(
    !seo.organizationJsonLd.sameAs.includes("https://instagram.com/ynot"),
    "Organization schema must not point to the unrelated instagram.com/ynot profile",
  );
  assert.ok(
    !seo.organizationJsonLd.sameAs.includes("https://ynot.limited/"),
    "Organization schema must not point to the unrelated ynot.limited brand",
  );

  assert.equal(seo.websiteJsonLd["@type"], "WebSite");
  assert.equal(seo.websiteJsonLd["@id"], "https://www.ynotopen.com/#website");
  assert.equal(seo.websiteJsonLd.name, "YNOT Open");
  assert.equal(seo.websiteJsonLd.url, "https://www.ynotopen.com");
  assert.ok(
    seo.websiteJsonLd.alternateName.includes("YNOT"),
    "WebSite schema must keep the short brand as an alternate site name",
  );
  assert.ok(
    seo.websiteJsonLd.alternateName.includes("YNOT Open"),
    "WebSite schema must support Google's site-name disambiguation",
  );
  assert.equal(
    seo.websiteJsonLd.potentialAction.target.urlTemplate,
    "https://www.ynotopen.com/packs?search={search_term_string}",
    "WebSite schema should expose a crawlable SearchAction for YNOT packs",
  );
  assert.ok(
    seo.websiteJsonLd.hasPart.some(
      (part) =>
        part["@type"] === "CollectionPage" &&
        part.url === "https://www.ynotopen.com/pokemon-card",
    ),
    "WebSite schema must expose the Pokemon card series hub",
  );
  assert.ok(
    seo.websiteJsonLd.hasPart.some(
      (part) =>
        part["@type"] === "CollectionPage" &&
        part.url === "https://www.ynotopen.com/one-piece-card",
    ),
    "WebSite schema must expose the One Piece card series hub",
  );
  assert.ok(
    seo.websiteJsonLd.hasPart.some(
      (part) =>
        part["@type"] === "WebPage" &&
        part.url === "https://www.ynotopen.com/help/is-ynot-legit",
    ),
    "WebSite schema must expose the YNOT trust and safety page",
  );
  assert.ok(
    seo.websiteJsonLd.hasPart.some(
      (part) =>
        part["@type"] === "WebPage" &&
        part.url ===
          "https://www.ynotopen.com/help/where-to-buy-trading-cards-thailand",
    ),
    "WebSite schema must expose the local trading-card buying guide",
  );
  assert.ok(
    seo.websiteJsonLd.hasPart.some(
      (part) =>
        part["@type"] === "WebPage" &&
        part.url === "https://www.ynotopen.com/trading-card-marketplace-thailand",
    ),
    "WebSite schema must expose the trading-card marketplace guide",
  );

  const homepageJsonLd = seo.buildHomePageJsonLd();
  assert.equal(homepageJsonLd["@context"], "https://schema.org");
  assert.ok(Array.isArray(homepageJsonLd["@graph"]));
  assert.equal(homepageJsonLd["@graph"].length, 4);
  assert.ok(
    homepageJsonLd["@graph"].some(
      (node) =>
        node["@type"] === "Brand" &&
        node.name === "YNOT" &&
        node.url === "https://www.ynotopen.com" &&
        node.sameAs.includes("https://www.instagram.com/_yfifteen/") &&
        node.parentOrganization["@id"] === "https://www.ynotopen.com/#organization",
    ),
    "homepage JSON-LD must expose a dedicated YNOT Brand node for ambiguous one-word entity searches",
  );
  assert.ok(
    homepageJsonLd["@graph"].some(
      (node) =>
        node["@type"] === "AboutPage" &&
        node["@id"] === "https://www.ynotopen.com/ynot#webpage" &&
        node.url === "https://www.ynotopen.com/ynot" &&
        node.about["@id"] === "https://www.ynotopen.com/#brand" &&
        node.mainEntity["@id"] === "https://www.ynotopen.com/#organization",
    ),
    "homepage JSON-LD must point crawlers to the exact-match /ynot brand disambiguation page",
  );
  assert.match(readApp("src/app/page.tsx"), /buildHomePageJsonLd/);
  assert.match(
    readApp("src/app/page.tsx"),
    /YNOT Open Official Site - Thailand TCG Y-Packs/,
  );
  assert.match(
    readApp("src/app/layout.tsx"),
    /YNOT Open · Thailand TCG Y-Packs Online/,
    "root metadata should use the YNOT Open site name",
  );
  assert.match(
    readApp("src/app/layout.tsx"),
    /template: "%s \| YNOT Open"/,
    "root title template should use the disambiguated YNOT Open site name",
  );
  assert.match(
    readApp("src/app/layout.tsx"),
    /applicationName: "YNOT Open"/,
    "application metadata should use YNOT Open for site-name consistency",
  );
  assert.match(
    readApp("src/app/layout.tsx"),
    /siteName: "YNOT Open"/,
    "root Open Graph metadata should use YNOT Open for site-name consistency",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /YNOT Open Thailand TCG Y-Packs/,
    "homepage H1 should describe the public entity and category, not only the short brand",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /YNOT Open is a Thailand TCG Y-Pack and card trading site/,
    "homepage should expose a concise What is YNOT Open answer block",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /YouTube downloader/,
    "homepage identity block should disambiguate current live Google conflicts",
  );

  for (const page of seo.publicAnswerPages) {
    assert.equal(page.owner, "YNOT Operations");
    assert.match(page.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(page.title.en.length >= 12, `${page.slug} has a thin title`);
    assert.ok(page.answer.en.length >= 80, `${page.slug} has a thin answer`);
    assert.ok(page.faqs.length >= 2, `${page.slug} needs FAQ coverage`);
    assert.ok(page.proofPoints.length >= 2, `${page.slug} needs proof points`);

    const jsonLd = seo.buildAnswerPageJsonLd(page);
    assert.equal(jsonLd.article["@type"], "Article");
    assert.equal(jsonLd.article.author.name, "YNOT Operations");
    if (page.sourceLinks && page.sourceLinks.length > 0) {
      assert.equal(
        jsonLd.article.mentions.length,
        page.sourceLinks.length,
        `${page.slug} Article mentions must match visible source links`,
      );
      assert.ok(
        jsonLd.article.mentions.every((mention) => mention["@type"] === "WebPage"),
        `${page.slug} Article mentions must describe source links as WebPage nodes`,
      );
    }
    assert.equal(jsonLd.faq["@type"], "FAQPage");
    assert.equal(
      jsonLd.faq.mainEntity.length,
      page.faqs.length,
      `${page.slug} FAQ schema must match visible FAQs`,
    );
  }
});

test("public series landing pages target broad card category intent", () => {
  const seo = loadSeoModule();

  assert.ok(Array.isArray(seo.publicSeriesLandingPages));
  assert.equal(seo.publicSeriesLandingPages.length, 2);

  const pokemonHub = seo.getPublicSeriesLandingPage("pokemon-card");
  assert.equal(pokemonHub.path, "/pokemon-card");
  assert.equal(pokemonHub.seriesParam, "pokemon");
  assert.match(pokemonHub.title.en, /Pokemon Card Packs Thailand/);
  assert.match(pokemonHub.answer.en, /official Pokemon rules/i);
  assert.ok(
    pokemonHub.queryTargets.includes("pokemon card"),
    "Pokemon hub must target the exact broad query",
  );
  assert.ok(
    pokemonHub.queryTargets.includes("open Pokemon card packs online Thailand"),
    "Pokemon hub must target the reachable commercial/local pack-opening query",
  );
  assert.ok(
    pokemonHub.queryTargets.includes("Pokemon card shop Thailand"),
    "Pokemon hub must include card shop variants from the current SERP landscape",
  );
  assert.ok(
    pokemonHub.searchLandscape.some((item) => /Official Pokemon TCG/i.test(item.title.en)),
    "Pokemon hub must explain official-source intent from the top Google results",
  );
  assert.ok(
    pokemonHub.searchLandscape.some((item) => /Card shop and marketplace/i.test(item.title.en)),
    "Pokemon hub must explain shop and marketplace intent",
  );
  assert.ok(
    pokemonHub.relatedLinks.some((link) => link.href === "/packs/pokemon"),
    "Pokemon hub must link directly to the static public pack catalog route",
  );
  assert.ok(
    pokemonHub.relatedLinks.some((link) => link.href === "/help/bangkok-card-events"),
    "Pokemon hub must link to local Bangkok event proof",
  );
  assert.ok(
    pokemonHub.relatedLinks.some(
      (link) => link.href === "/help/where-to-buy-trading-cards-thailand",
    ),
    "Pokemon hub must link to the local trading-card buying guide",
  );
  assert.ok(
    pokemonHub.sourceLinks.some((source) => /asia\.pokemon-card\.com\/th/.test(source.href)),
    "Pokemon hub must cite the official Thailand Pokemon source",
  );
  assert.ok(
    pokemonHub.sourceLinks.some((source) => /sasom\.co\.th/.test(source.href)),
    "Pokemon hub must cite a ranked Pokemon buying-guide source example",
  );

  const onePieceHub = seo.getPublicSeriesLandingPage("one-piece-card");
  assert.equal(onePieceHub.path, "/one-piece-card");
  assert.equal(onePieceHub.seriesParam, "one_piece");
  assert.match(onePieceHub.title.en, /One Piece Card Packs Thailand/);
  assert.match(onePieceHub.answer.en, /official One Piece Card Game rules/i);
  assert.ok(
    onePieceHub.queryTargets.includes("one piece card"),
    "One Piece hub must target the exact broad query",
  );
  assert.ok(
    onePieceHub.queryTargets.includes("open One Piece card packs online Thailand"),
    "One Piece hub must target the reachable commercial/local pack-opening query",
  );
  assert.ok(
    onePieceHub.queryTargets.includes("One Piece card market Thailand"),
    "One Piece hub must include market variants from the current SERP landscape",
  );
  assert.ok(
    onePieceHub.searchLandscape.some((item) => /Official One Piece Card Game/i.test(item.title.en)),
    "One Piece hub must explain official-source intent from the top Google results",
  );
  assert.ok(
    onePieceHub.searchLandscape.some((item) => /Community market and shop/i.test(item.title.en)),
    "One Piece hub must explain community market and shop intent",
  );
  assert.ok(
    onePieceHub.relatedLinks.some((link) => link.href === "/packs/one-piece"),
    "One Piece hub must link directly to the static public pack catalog route",
  );
  assert.ok(
    onePieceHub.relatedLinks.some((link) => link.href === "/help/bangkok-card-events"),
    "One Piece hub must link to local Bangkok event proof",
  );
  assert.ok(
    onePieceHub.relatedLinks.some(
      (link) => link.href === "/help/where-to-buy-trading-cards-thailand",
    ),
    "One Piece hub must link to the local trading-card buying guide",
  );
  assert.ok(
    onePieceHub.sourceLinks.some((source) => /asia-th\.onepiece-cardgame\.com/.test(source.href)),
    "One Piece hub must cite the official Thailand One Piece source",
  );
  assert.ok(
    onePieceHub.sourceLinks.some((source) => /en\.onepiece-cardgame\.com/.test(source.href)),
    "One Piece hub must cite the official global One Piece source",
  );

  for (const page of seo.publicSeriesLandingPages) {
    assert.equal(page.owner, "YNOT Operations");
    assert.match(page.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(page.searchIntents.length >= 3, `${page.slug} needs intent coverage`);
    assert.ok(page.searchLandscape.length >= 3, `${page.slug} needs SERP landscape coverage`);
    assert.ok(page.relatedLinks.length >= 3, `${page.slug} needs supporting links`);
    assert.ok(page.faqs.length >= 2, `${page.slug} needs FAQ coverage`);

    const jsonLd = seo.buildSeriesLandingPageJsonLd(page);
    assert.equal(jsonLd.collectionPage["@type"], "CollectionPage");
    assert.equal(jsonLd.collectionPage.publisher.name, "YNOT Open");
    assert.equal(
      jsonLd.collectionPage.mainEntity.itemListElement.length,
      page.relatedLinks.length,
      `${page.slug} ItemList schema must match visible related links`,
    );
    assert.equal(jsonLd.faq["@type"], "FAQPage");
    assert.equal(jsonLd.breadcrumb["@type"], "BreadcrumbList");

    const campaignJsonLd = seo.buildSeriesLandingPageJsonLd(page, [
      {
        slug: `${page.slug}-test-pack`,
        status: "live",
        titleTh: "Test Pack",
        titleEn: `${page.headline.en} Test Pack`,
        series: page.seriesParam,
        costCoins: 150,
        totalSlots: 100,
        remainingSlots: 24,
        openable: true,
        soldOut: false,
        categoryLabel: page.headline.en,
        heroLabel: "Visible chase card proof",
        displayTags: ["PSA10"],
      },
    ]);
    assert.equal(
      campaignJsonLd.collectionPage.mainEntity.itemListElement.length,
      1,
      `${page.slug} live campaign ItemList should replace supporting-link fallback`,
    );
    assert.equal(
      campaignJsonLd.collectionPage.mainEntity.itemListElement[0].url,
      `https://www.ynotopen.com/packs/${page.slug}-test-pack`,
      `${page.slug} live campaign ItemList must link to the public pack detail page`,
    );
    assert.equal(
      campaignJsonLd.collectionPage.mainEntity.itemListElement[0].item["@type"],
      "Product",
      `${page.slug} live campaign ItemList must expose Product schema, not only a generic page link`,
    );
    assert.equal(
      campaignJsonLd.collectionPage.mainEntity.itemListElement[0].item.offers
        .priceSpecification.unitText,
      "YNOT wallet coins per pack",
      `${page.slug} Product schema must expose the visible wallet-coin cost unit`,
    );
    assert.ok(
      !(
        "priceCurrency" in
        campaignJsonLd.collectionPage.mainEntity.itemListElement[0].item.offers
      ),
      `${page.slug} Y-Pack Product schema must not invent cash currency`,
    );
  }
});

test("public pack browse and detail routes expose commerce-ready proof schema", () => {
  const seo = loadSeoModule();
  const livePack = {
    slug: "pokemon-public-pack",
    status: "live",
    titleTh: "Pokemon Public Pack",
    titleEn: "Pokemon Public Pack",
    series: "pokemon",
    costCoins: 250,
    totalSlots: 100,
    remainingSlots: 12,
    openable: true,
    soldOut: false,
    categoryLabel: "Pokemon card packs",
    heroLabel: "Visible chase card proof",
    displayTags: ["PSA10", "sealed"],
    bannerImageUrl: "/packs/pokemon-public-pack.png",
  };
  const closedPack = {
    ...livePack,
    slug: "sold-one-piece-pack",
    status: "closed",
    titleEn: "Sold One Piece Pack",
    series: "one_piece",
    remainingSlots: 0,
    openable: false,
    soldOut: true,
  };

  const browseJsonLd = seo.buildPacksBrowseJsonLd([livePack, closedPack], {
    path: "/packs/pokemon",
    series: "pokemon",
  });
  assert.equal(browseJsonLd.collectionPage["@type"], "CollectionPage");
  assert.equal(
    browseJsonLd.collectionPage.url,
    "https://www.ynotopen.com/packs/pokemon",
  );
  assert.equal(browseJsonLd.collectionPage.mainEntity["@type"], "ItemList");
  assert.equal(browseJsonLd.collectionPage.mainEntity.numberOfItems, 2);
  assert.equal(
    browseJsonLd.collectionPage.mainEntity.itemListElement[0].item["@type"],
    "Product",
  );
  assert.equal(
    browseJsonLd.collectionPage.mainEntity.itemListElement[0].item.offers
      .priceSpecification.unitText,
    "YNOT wallet coins per pack",
  );
  assert.equal(
    browseJsonLd.collectionPage.mainEntity.itemListElement[0].item.offers
      .availability,
    "https://schema.org/InStock",
  );
  assert.equal(
    browseJsonLd.collectionPage.mainEntity.itemListElement[1].item.offers
      .availability,
    "https://schema.org/SoldOut",
  );
  assert.ok(
    !("priceCurrency" in browseJsonLd.collectionPage.mainEntity.itemListElement[0].item.offers),
    "Y-Pack schema must not invent a THB priceCurrency for wallet coin packs",
  );
  assert.ok(
    !(
      "priceCurrency" in
      browseJsonLd.collectionPage.mainEntity.itemListElement[0].item.offers
        .priceSpecification
    ),
    "Y-Pack priceSpecification must stay truthful to wallet coins",
  );
  assert.equal(
    browseJsonLd.breadcrumb.itemListElement.at(-1).name,
    "Pokemon Card Y-Packs",
  );
  assert.equal(
    browseJsonLd.breadcrumb.itemListElement.at(-1).item,
    "https://www.ynotopen.com/packs/pokemon",
  );

  const detailJsonLd = seo.buildPackDetailJsonLd(livePack);
  assert.equal(detailJsonLd.product["@type"], "Product");
  assert.equal(
    detailJsonLd.product.url,
    "https://www.ynotopen.com/packs/pokemon-public-pack",
  );
  assert.equal(detailJsonLd.breadcrumb["@type"], "BreadcrumbList");
  assert.match(
    JSON.stringify(detailJsonLd.product),
    /YNOT wallet coins per pack/,
    "pack detail product schema must expose wallet coin cost",
  );

  assert.ok(
    existsSync(appPath("src/features/ynot/pack-seo.ts")),
    "missing pack SEO helper",
  );
  assert.match(
    readApp("src/features/ynot/PackCatalogRoute.tsx"),
    /buildPacksBrowseJsonLd/,
    "pack catalog route must render CollectionPage and ItemList schema",
  );
  assert.match(
    readApp("src/features/ynot/PackCatalogRoute.tsx"),
    /isPublicPackSeoCampaign/,
    "pack catalog route must filter schema to public SEO-eligible packs",
  );
  assert.ok(
    existsSync(appPath("src/app/(store)/packs/pokemon/page.tsx")),
    "missing static Pokemon pack catalog route",
  );
  assert.ok(
    existsSync(appPath("src/app/(store)/packs/one-piece/page.tsx")),
    "missing static One Piece pack catalog route",
  );
  assert.match(
    readApp("src/app/(store)/packs/pokemon/page.tsx"),
    /canonicalPath="\/packs\/pokemon"/,
    "Pokemon pack catalog route must use a static canonical URL",
  );
  assert.match(
    readApp("src/app/(store)/packs/pokemon/page.tsx"),
    /pageTitle=\{\s*<I18nText\s+en="Pokemon Card Y-Packs Thailand"/,
    "Pokemon pack catalog route must expose a series-specific H1",
  );
  assert.match(
    readApp("src/app/(store)/packs/pokemon/page.tsx"),
    /pageLead=\{\s*<I18nText\s+en="Browse current public Pokemon card Y-Packs/,
    "Pokemon pack catalog route must expose a crawlable category intro",
  );
  assert.match(
    readApp("src/app/(store)/packs/pokemon/page.tsx"),
    /catalogHeading=\{\s*<I18nText\s+en="Current public Pokemon card Y-Packs"/,
    "Pokemon pack catalog route must expose a crawlable category H2",
  );
  assert.match(
    readApp("src/app/(store)/packs/one-piece/page.tsx"),
    /canonicalPath="\/packs\/one-piece"/,
    "One Piece pack catalog route must use a static canonical URL",
  );
  assert.match(
    readApp("src/app/(store)/packs/one-piece/page.tsx"),
    /pageTitle=\{\s*<I18nText\s+en="One Piece Card Y-Packs Thailand"/,
    "One Piece pack catalog route must expose a series-specific H1",
  );
  assert.match(
    readApp("src/app/(store)/packs/one-piece/page.tsx"),
    /pageLead=\{\s*<I18nText\s+en="Browse current public One Piece card Y-Packs/,
    "One Piece pack catalog route must expose a crawlable category intro",
  );
  assert.match(
    readApp("src/app/(store)/packs/one-piece/page.tsx"),
    /catalogHeading=\{\s*<I18nText\s+en="Current public One Piece card Y-Packs"/,
    "One Piece pack catalog route must expose a crawlable category H2",
  );
  assert.match(
    readApp("src/app/(store)/packs/[slug]/page.tsx"),
    /generateMetadata/,
    "pack detail pages must produce per-pack metadata",
  );
  assert.match(
    readApp("src/app/(store)/packs/[slug]/page.tsx"),
    /buildPackDetailJsonLd/,
    "pack detail pages must render Product schema",
  );
  assert.match(
    readApp("src/features/ynot/pack-seo.ts"),
    /visibility === "public"/,
    "pack SEO eligibility must preserve the public/private crawl boundary",
  );
  assert.match(
    readApp("src/features/ynot/PublicAnswerPage.tsx"),
    /<h2[^>]*id="public-answer-title"/,
    "public answer pages must expose their direct answer as a semantic H2",
  );
  assert.match(
    readApp("src/features/ynot/PublicAnswerPage.tsx"),
    /<h2>\s*<I18nText en="Public event and social proof"/,
    "public answer pages must expose source-link proof under a semantic H2",
  );
  assert.match(
    readApp("src/features/ynot/PublicAnswerPage.tsx"),
    /Public event and social proof/,
    "public answer pages must label event and social proof for crawlers and users",
  );
  assert.match(
    readApp("src/features/ynot/SeriesSeoLandingPage.tsx"),
    /<h2[^>]*id="series-hub-title"/,
    "series landing pages must expose the search-intent answer as a semantic H2",
  );
  assert.match(
    readApp("src/features/ynot/SeriesSeoLandingPage.tsx"),
    /<h2>\s*<I18nText en="Live pack evidence for this category"/,
    "series landing pages must expose current pack evidence under a semantic H2",
  );
  assert.match(
    readApp("src/features/ynot/cr/YPackExperience.tsx"),
    /pageTitle/,
    "pack browse experience must accept route-specific H1 copy",
  );
});

test("sitemap and robots routes publish the public answer surface", () => {
  const seo = loadSeoModule();

  const sitemapEntries = seo.getPublicSitemapEntries();
  for (const page of seo.publicAnswerPages) {
    assert.ok(
      sitemapEntries.some((entry) => entry.url === `https://www.ynotopen.com${page.path}`),
      `sitemap missing ${page.path}`,
    );
  }
  for (const page of seo.publicSeriesLandingPages) {
    assert.ok(
      sitemapEntries.some((entry) => entry.url === `https://www.ynotopen.com${page.path}`),
      `sitemap missing ${page.path}`,
    );
  }
  assert.ok(
    !sitemapEntries.some((entry) => entry.url.includes("/ranking")),
    "ranking must stay out of the public sitemap",
  );
  const sitemapEntriesWithPack = seo.getPublicSitemapEntries([
    {
      path: "/packs/pokemon-public-pack",
      priority: 0.86,
      changeFrequency: "daily",
    },
  ]);
  assert.ok(
    sitemapEntriesWithPack.some(
      (entry) =>
        entry.url === "https://www.ynotopen.com/packs/pokemon-public-pack",
    ),
    "sitemap helper must accept live public pack detail URLs",
  );
  assert.ok(
    sitemapEntries.some((entry) => entry.url === "https://www.ynotopen.com/packs/pokemon"),
    "sitemap must expose the static Pokemon pack catalog route",
  );
  assert.ok(
    sitemapEntries.some((entry) => entry.url === "https://www.ynotopen.com/packs/one-piece"),
    "sitemap must expose the static One Piece pack catalog route",
  );

  const robots = seo.getRobotsPolicy();
  assert.ok(
    robots.rules.some((rule) => rule.userAgent === "OAI-SearchBot" && rule.allow === "/"),
    "robots must explicitly allow OAI-SearchBot for ChatGPT Search discovery",
  );
  assert.ok(
    !robots.rules.some((rule) => rule.userAgent === "GPTBot" && rule.allow === "/"),
    "robots must not publish a custom GPTBot Allow that conflicts with Cloudflare's AI-training crawler block",
  );
  assert.ok(
    robots.rules.some(
      (rule) =>
        rule.userAgent === "*" &&
        Array.isArray(rule.disallow) &&
        rule.disallow.includes("/admin") &&
        rule.disallow.includes("/wallet") &&
        rule.disallow.includes("/ranking"),
    ),
    "robots must keep private and privacy-sensitive areas out",
  );
  assert.equal(robots.sitemap, "https://www.ynotopen.com/sitemap.xml");

  assert.match(readApp("src/app/sitemap.ts"), /getPublicSitemapEntries/);
  assert.match(
    readApp("src/app/sitemap.ts"),
    /packSitemapEntries/,
    "sitemap route must append public pack detail URLs",
  );
  assert.match(
    readApp("src/app/sitemap.ts"),
    /getCampaigns/,
    "sitemap route must fetch current public campaigns for pack URL discovery",
  );
  assert.match(readApp("src/app/robots.ts"), /getRobotsPolicy/);
});

test("AI source index exposes YNOT canonical answers for GEO and AEO", () => {
  const seo = loadSeoModule();

  const llms = seo.buildLlmsText();
  assert.match(llms, /^# YNOT/m);
  assert.match(llms, /Official source index for YNOT/);
  assert.match(llms, /https:\/\/www\.ynotopen\.com\/ynot/);
  assert.match(llms, /https:\/\/www\.ynotopen\.com\/help\/ynot-tcg-lucky-draw-thailand/);
  assert.match(llms, /https:\/\/www\.ynotopen\.com\/help\/is-ynot-legit/);
  assert.match(
    llms,
    /https:\/\/www\.ynotopen\.com\/help\/where-to-buy-trading-cards-thailand/,
  );
  assert.match(llms, /https:\/\/www\.ynotopen\.com\/pokemon-card/);
  assert.match(llms, /https:\/\/www\.ynotopen\.com\/one-piece-card/);
  assert.match(llms, /Filtered Y-Pack browse route: https:\/\/www\.ynotopen\.com\/packs\/pokemon/);
  assert.match(llms, /Filtered Y-Pack browse route: https:\/\/www\.ynotopen\.com\/packs\/one-piece/);
  assert.match(llms, /https:\/\/www\.ynotopen\.com\/trading-card-marketplace-thailand/);
  assert.match(llms, /pokemon card/);
  assert.match(llms, /one piece card/);
  assert.match(llms, /SNKRDUNK alternative trading cards Thailand/);
  assert.match(llms, /trading card marketplace Thailand/);
  assert.match(llms, /Bangkok trading card events/);
  assert.match(llms, /https:\/\/www\.instagram\.com\/_yfifteen\//);
  assert.doesNotMatch(llms, /https:\/\/www\.ynotopen\.com\/admin/);
  assert.doesNotMatch(llms, /https:\/\/www\.ynotopen\.com\/wallet/);

  const full = seo.buildLlmsText({ full: true });
  assert.ok(
    full.length > llms.length,
    "full AI source index should include expanded answers, proof points, and FAQs",
  );
  assert.match(full, /Proof points:/);
  assert.match(full, /Search landscape:/);
  assert.match(full, /Source links:/);
  assert.match(full, /VIP CARD INTERNATIONAL EXPO 2026/);
  assert.match(full, /YNOT x MIDNIGHT/);
  assert.match(full, /is YNOT legit/);
  assert.match(full, /official Instagram/);
  assert.match(full, /where to buy Pokemon cards in Thailand/);
  assert.match(full, /trading card shop Thailand/);
  assert.match(full, /Pokemon card marketplace Thailand/);
  assert.match(full, /StockX trading cards marketplace example/);
  assert.match(full, /SNKRDUNK Pokemon card marketplace example/);
  assert.match(full, /Card shop and marketplace intent/);
  assert.match(full, /Community market and shop intent/);
  assert.match(full, /FAQ:/);
  assert.match(full, /YNOT wallet coins are platform credits/);

  assert.ok(existsSync(appPath("src/app/llms.txt/route.ts")), "missing llms.txt route");
  assert.ok(
    existsSync(appPath("src/app/llms-full.txt/route.ts")),
    "missing llms-full.txt route",
  );
  assert.match(readApp("src/app/llms.txt/route.ts"), /buildLlmsText/);
  assert.match(readApp("src/app/llms-full.txt/route.ts"), /full: true/);
});

test("footer and route files make answer pages reachable from public UI", () => {
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/ynot"/,
    "footer and homepage should link to the exact-match YNOT official-site disambiguation page",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/help\/how-ynot-packs-work"/,
    "footer How It Works link should point to the Y-Pack explainer",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/help\/ynot-tcg-lucky-draw-thailand"/,
    "footer and homepage should link to the YNOT TCG page",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/help\/is-ynot-legit"/,
    "footer and homepage should link to the YNOT trust page",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/help\/where-to-buy-trading-cards-thailand"/,
    "footer should link to the local trading-card buying guide",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/trading-card-marketplace-thailand"/,
    "footer and homepage should link to the trading-card marketplace guide",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/pokemon-card"/,
    "footer and homepage should link to the Pokemon card series hub",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/packs\/pokemon"/,
    "footer and homepage should link to the static Pokemon Y-Pack catalog",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/one-piece-card"/,
    "footer and homepage should link to the One Piece card series hub",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/packs\/one-piece"/,
    "footer and homepage should link to the static One Piece Y-Pack catalog",
  );
  assert.match(
    readApp("src/features/ynot/SeriesSeoLandingPage.tsx"),
    /Search landscape/,
    "series hubs should render the SERP landscape analysis for broad card terms",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="\/help\/bangkok-card-events"/,
    "footer should link to the Bangkok events page",
  );
  assert.match(
    readApp("src/features/ynot/components.tsx"),
    /href="https:\/\/www\.instagram\.com\/_yfifteen\/"/,
    "footer Social link should point to the official YNOT Instagram profile",
  );
  assert.doesNotMatch(
    readApp("src/features/ynot/components.tsx"),
    /href="https:\/\/instagram\.com\/ynot"/,
    "footer Social link must not point to the unrelated instagram.com/ynot profile",
  );
  assert.match(
    readApp("src/app/(store)/contact/page.tsx"),
    /href="https:\/\/www\.instagram\.com\/_yfifteen\/"/,
    "contact page should point support users to the official YNOT Instagram profile",
  );
  assert.doesNotMatch(
    readApp("src/app/(store)/contact/page.tsx"),
    /href="https:\/\/instagram\.com\/ynot"/,
    "contact page must not point to the unrelated instagram.com/ynot profile",
  );
  assert.ok(
    existsSync(appPath("src/app/(store)/help/[slug]/page.tsx")),
    "missing help answer route",
  );
  assert.ok(
    existsSync(appPath("src/app/(store)/pokemon-card/page.tsx")),
    "missing Pokemon card series hub route",
  );
  assert.ok(
    existsSync(appPath("src/app/(store)/one-piece-card/page.tsx")),
    "missing One Piece card series hub route",
  );
  assert.ok(
    existsSync(appPath("src/app/(store)/ynot/page.tsx")),
    "missing exact-match YNOT official-site route",
  );
  assert.ok(
    existsSync(appPath("src/app/(store)/trading-card-marketplace-thailand/page.tsx")),
    "missing public trading-card marketplace guide route",
  );
  assert.ok(
    existsSync(appPath("src/features/ynot/series-seo-campaigns.ts")),
    "missing public series SEO campaign helper",
  );
  assert.match(
    readApp("src/app/(store)/pokemon-card/page.tsx"),
    /dynamic = "force-dynamic"/,
    "Pokemon card hub should fetch live public pack evidence",
  );
  assert.match(
    readApp("src/app/(store)/one-piece-card/page.tsx"),
    /dynamic = "force-dynamic"/,
    "One Piece card hub should fetch live public pack evidence",
  );
  assert.match(
    readApp("src/app/(store)/pokemon-card/page.tsx"),
    /getPublicSeriesSeoData/,
    "Pokemon card hub should load public series campaign evidence",
  );
  assert.match(
    readApp("src/app/(store)/one-piece-card/page.tsx"),
    /getPublicSeriesSeoData/,
    "One Piece card hub should load public series campaign evidence",
  );
  assert.match(
    readApp("src/features/ynot/SeriesSeoLandingPage.tsx"),
    /buildSeriesLandingPageJsonLd/,
    "series hub component must render structured data",
  );
  assert.match(
    readApp("src/features/ynot/SeriesSeoLandingPage.tsx"),
    /Current public Y-Packs/,
    "series hub component must render visible current public pack evidence",
  );
  assert.ok(existsSync(appPath("src/app/(store)/about/page.tsx")), "missing about route");
});
