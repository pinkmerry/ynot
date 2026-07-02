# YNOT SEO/GEO/AEO Category And Brand Retest

Date: 2026-07-02

## Current Search Evidence

Google Chrome evidence for broad category queries:

- `pokemon card`: `www.ynotopen.com` was not in the extracted top 3. The visible top 3 were official Pokemon properties: `asia.pokemon-card.com/th/`, `tcg.pokemon.com`, and `asia.pokemon-card.com`.
- `one piece card`: `www.ynotopen.com` was not in the extracted top 3. The visible top 3 were official One Piece properties plus a Thailand market Facebook group.
- `ynot`: prior Chrome evidence showed `www.ynotopen.com` was not in the first 10 visible organic results. Top extracted results were a YouTube downloader, Y Not 7/Facebook, and Spotify.
- ChatGPT, query `ynot`: normal chat recognized YNOT from conversation context but did not cite `www.ynotopen.com`; temporary chat asked for clarification and did not identify the YNOT site.

Evidence files:

- `google-pokemon-card-refresh.json`
- `google-one-piece-card-refresh.json`
- `../seo-ynot-top3-2026-07-02/google-ynot-refresh.json`
- `../seo-ynot-top3-2026-07-02/chatgpt-ynot-refresh.json`
- `../seo-ynot-top3-2026-07-02/chatgpt-ynot-temporary-refresh.json`

## Competitor Signals

HTML extraction saved in `competitor-html-summary.json`.

- Pokesona ranks around Thailand Pokemon intent with a direct category title: `English & Japanese Pokemon TCG Cards Thailand | Pokesona Thailand`, plus `Organization`, `WebSite`, and `SearchAction` JSON-LD.
- Kira Cards Pokemon and One Piece pages use category-specific titles, `Store` / `LocalBusiness`, `WebSite`, `SearchAction`, `BreadcrumbList`, `CollectionPage`, `ItemList`, `Product`, `Offer`, shipping, and return policy schema.
- Kira's One Piece guide adds `BlogPosting`, `WebPage`, and `FAQPage`, which is a strong AEO/GEO pattern for question-style answers.
- Broad `ynot` competitors are unrelated but stronger established entities: a YouTube downloader, restaurants, music/festival properties, social accounts, and marketplace seller pages.

## Implemented Locally

Added new public answer pages for high-intent searches that YNOT can honestly target:

- `/help/ynot-tcg-lucky-draw-thailand`
- `/help/pokemon-card-packs-thailand`
- `/help/one-piece-card-packs-thailand`

Updated local SEO signals:

- Added `YNOT TCG Lucky Draw`, `Pokemon card packs Thailand`, `One Piece card packs Thailand`, and Thai query variants to the public answer page contract.
- Added clear disclaimers that YNOT is not the official Pokemon or One Piece site.
- Added proof points that connect official franchise pages to the correct use case and YNOT to Y-Packs, wallet coins, collection, exchange, and shipping.
- Added homepage/footer internal links with descriptive anchors for `YNOT TCG`, `Pokemon Cards`, and `One Piece Cards`.
- Added these URLs to the generated sitemap.
- Local robots includes `OAI-SearchBot` and sitemap output.

## Verification

Passed:

- `npm run test:seo`
- `npm run typecheck`
- `npm run lint` with 25 existing warnings and 0 errors
- `NEXT_PUBLIC_SITE_URL=https://www.ynotopen.com npm run build`
- `npm run verify:cloudflare`

The deployable verification was repeated from clean branch `codex/seo-top3-isolated` at `/Users/pinkmerry/Project X/YNOTT-seo-top3-worktree` so the SEO release is separated from unrelated marketplace and material-file changes in the original checkout.

Local production smoke on `http://localhost:3023`:

- `/help/ynot-tcg-lucky-draw-thailand` returned 200 with title `YNOT TCG Lucky Draw Thailand | YNOT`.
- `/help/pokemon-card-packs-thailand` returned 200 with title `Pokemon Card Packs Thailand With YNOT | YNOT`.
- `/help/one-piece-card-packs-thailand` returned 200 with title `One Piece Card Packs Thailand With YNOT | YNOT`.
- `/sitemap.xml` returned 200 and included all three new help URLs.
- `/robots.txt` returned 200 and included `OAI-SearchBot`.

Evidence files:

- `local-render-refresh.json`
- `local-ynot-tcg-refresh.html`
- `local-pokemon-card-refresh.html`
- `local-one-piece-card-refresh.html`
- `local-sitemap-refresh.html`
- `local-robots-refresh.html`

## Live Production Blocker

Production is not yet improved because the new build is not live:

- `https://www.ynotopen.com/sitemap.xml` returns 404.
- `https://www.ynotopen.com/help/ynot-tcg-lucky-draw-thailand` returns 404.
- `https://www.ynotopen.com/help/pokemon-card-packs-thailand` returns 404.
- `https://www.ynotopen.com/help/one-piece-card-packs-thailand` returns 404.
- `https://www.ynotopen.com/robots.txt` is still Cloudflare managed output and does not include `OAI-SearchBot` or `Sitemap: https://www.ynotopen.com/sitemap.xml`.

Evidence file: `production-crawl-surface-refresh.json`.

## What To Do Next For Top-3 Movement

1. Deploy this SEO build safely, without unrelated marketplace/material work.
2. Submit `https://www.ynotopen.com/sitemap.xml` in Google Search Console.
3. Request indexing for the homepage and the three new help pages.
4. Add the official site link to Instagram `_yfifteen` bio and use consistent copy: `YNOT Official Site - TCG Y-Packs Thailand`.
5. Ask event/partner pages in Bangkok to link to the matching event or homepage URL with descriptive anchor text.
6. Add a weekly event/content page only when there is real event evidence; rotate weekly highlights on one stable `/events/bangkok-tcg` page instead of creating thin weekly pages.
7. Add merchant/product schema to real marketplace/product/category pages once those public pages are ready and crawlable.
