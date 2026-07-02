# YNOT Series SEO Hubs

Date: 2026-07-02

## Why This Layer Was Added

Current search evidence shows branded searches are improving, but broad category queries remain difficult:

- `ynotopen`: Google rank 1.
- `ynot tcg`: Google rank 1.
- `ynot`: not visible in the Google top 10 during the Chrome retest, but ChatGPT reported ynotopen.com in the top 3.
- `pokemon card`: ynotopen.com not visible in the extracted top results.
- `one piece card`: ynotopen.com not visible in the extracted top results.

External result patterns for broad card queries are category/product hubs, official rules/card databases, marketplace collections, price guides, and large communities. The previous YNOT pages were mainly help/answer pages, so the next on-site layer is a pair of public series hubs:

- `/pokemon-card`
- `/one-piece-card`

These hubs target reachable local/commercial variants such as online pack opening, Thailand pack browsing, Y-Pack opening, and reward management, while sending official rules and complete card-list intent to official sources.

## Implemented

- Added shared series-hub SEO data in `Website/src/lib/seo/public-answer-pages.ts`.
- Added `CollectionPage`, `FAQPage`, `BreadcrumbList`, and `ItemList` structured data for each hub.
- Added `/pokemon-card` and `/one-piece-card` App Router pages.
- Added both hubs to sitemap output and `llms.txt` / `llms-full.txt`.
- Updated homepage/footer category links to point to the new hub URLs.
- Added focused contract coverage in `Website/scripts/test-seo-public-answer-contract.mjs`.

## Verification

- `npm run test:seo`: pass, 6 tests.
- `npm run typecheck`: pass.
- `npm run lint`: pass with 25 existing warnings and 0 errors.
- `NEXT_PUBLIC_SITE_URL=https://www.ynotopen.com npm run build`: pass.
- `npm run verify:cloudflare`: pass.
- Local production smoke on port 3028:
  - `/pokemon-card`: 200, contains canonical URL, JSON-LD, filtered pack link, and target phrase.
  - `/one-piece-card`: 200, contains canonical URL, JSON-LD, filtered pack link, and target phrase.
  - `/sitemap.xml`: includes both hub URLs.
  - `/llms.txt`: includes both hub URLs and filtered Y-Pack browse routes.

## Remaining Gap

This does not instantly prove Google top-3 ranking. The pages now give Google and AI answer engines stronger crawlable category targets, but ranking movement still depends on recrawl, Search Console indexing, external authority, and links from real social/event/community surfaces.
