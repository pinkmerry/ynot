# YNOT One-Word Visibility Retest And Fix

Date: 2026-07-02

## Refreshed Baseline

Google Chrome, query: `ynot`

- Result: `www.ynotopen.com` was not in the extracted top 3.
- `www.ynotopen.com` was not found in the first 10 visible organic links extracted from the page.
- Top 3 extracted results were:
  - `YNOT - Free YouTube Video Downloader` at `https://james-see.github.io/ynot/`
  - `Ynot7 - วายน็อตเซเว่น (@ynot7official)` at Facebook
  - `BEST OF Y NOT 7` at Spotify
- Evidence: `google-ynot-refresh.json` and `google-ynot-refresh.png`.

ChatGPT, prompt: `ynot`

- Logged-in normal chat result: ChatGPT identified YNOT as a trading-card/Y-Pack platform from chat context, but did not cite `www.ynotopen.com`.
- Temporary chat result: ChatGPT asked for clarification and did not identify YNOT as the ynotopen.com site.
- Evidence: `chatgpt-ynot-refresh.json`, `chatgpt-ynot-refresh-after.png`, `chatgpt-ynot-temporary-refresh.json`, and `chatgpt-ynot-temporary-refresh-after.png`.

## Research

Google Search Central guidance used for implementation:

- Organization structured data can help Google understand an organization's name, alternate names, real-world presence, online presence, `url`, `logo`, and `sameAs`: https://developers.google.com/search/docs/appearance/structured-data/organization
- WebSite site-name structured data belongs on the home page and can provide a preferred site name and alternate names: https://developers.google.com/search/docs/appearance/site-names
- Canonical signals help Google identify the preferred representative URL when multiple or similar URLs exist: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls

OpenAI guidance used for implementation:

- OpenAI uses `OAI-SearchBot` for search discovery and retrieval, separate from training crawlers: https://developers.openai.com/api/docs/bots
- ChatGPT search uses web results with links to relevant sources when search is triggered: https://openai.com/index/introducing-chatgpt-search/

## Implementation

Implemented the strongest on-site changes available before deployment and external indexing:

- Added stable `Organization` entity ID: `https://www.ynotopen.com/#organization`.
- Added `WebSite` entity ID: `https://www.ynotopen.com/#website`.
- Added alternate names: `YNOT Open`, `YNOT Y-Packs`, `YNOT TCG Thailand`, `YNOT Thailand`, `YNOT official site`, `YNOT card platform`, and `_yfifteen`.
- Added official logo and image references to `https://www.ynotopen.com/ynot-logo-512.png`.
- Added official Instagram `sameAs`: `https://www.instagram.com/_yfifteen/`.
- Added a homepage JSON-LD graph with Organization and WebSite schema.
- Added `WebSite` `SearchAction` for `https://www.ynotopen.com/packs?search={search_term_string}`.
- Added `WebSite.hasPart` pointing to `/help/ynot-official-site`.
- Added visible homepage/footer copy: `YNOT Official Site`, `YNOT Official Site is ynotopen.com`, and disambiguation from unrelated YNOT YouTube downloader, Ynot7/Y Not 7 music, Spotify, phone case, restaurant, festival, software, and studio results.
- Updated the official-site answer page to explain exactly what YNOT means on ynotopen.com and what it is not.
- Added tests so `instagram.com/ynot`, `ynot.limited`, missing alternate names, or missing homepage schema are caught.

## Local Render Verification

Local production server:

- `http://localhost:3022/`

Rendered homepage contains:

- `YNOT Official Site`
- `YNOT Official Site is ynotopen.com`
- `https://www.ynotopen.com/#organization`
- `https://www.ynotopen.com/#website`
- `YNOT TCG Thailand`
- `SearchAction`
- `YouTube downloader`
- `Ynot7`
- `Spotify`
- `https://www.instagram.com/_yfifteen/`
- `ynot-logo-512.png`

Rendered official help page contains:

- `YNOT Official Site`
- `https://www.ynotopen.com`
- `YouTube downloader`
- `Ynot7`
- `BEST OF Y NOT 7`
- `Spotify`

Rendered robots output contains:

- `OAI-SearchBot`
- `GPTBot`
- `Sitemap: https://www.ynotopen.com/sitemap.xml`

Evidence: `local-render-refresh.json`, `local-home-refresh.html`, `local-official-refresh.html`, `local-sitemap-refresh.html`, and `local-robots-refresh.html`.

## Verification

- `npm run test:seo` passed.
- `npm run typecheck` passed.
- `npm run lint` passed with existing warnings only.
- `NEXT_PUBLIC_SITE_URL=https://www.ynotopen.com npm run build` passed.

## Conclusion

The current live Google/ChatGPT one-word `ynot` result is not top 3 for `www.ynotopen.com`.

The local implementation now gives crawlers a clearer official entity page for `YNOT`, but Google and ChatGPT will not update until this build is deployed, crawled, and indexed. Ranking for the one-word query also needs off-site reinforcement: Search Console indexing, Instagram bio/profile links, consistent `YNOT Official Site` / `YNOT Open` naming, and backlinks from event or partner pages.
