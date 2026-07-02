# YNOT SEO/GEO/AEO Continuation

Date: 2026-07-02

## Current Live Crawl State

Production is no longer blocked:

- `https://www.ynotopen.com/` returns 200 with `YNOT Official Site - TCG Y-Packs Thailand`.
- `https://www.ynotopen.com/robots.txt` returns 200 and includes `OAI-SearchBot` plus `Sitemap: https://www.ynotopen.com/sitemap.xml`.
- `https://www.ynotopen.com/sitemap.xml` returns 200.
- Public answer pages for YNOT official site, YNOT TCG, Pokemon card packs, One Piece card packs, SNKRDUNK / StockX alternatives, Bangkok card events, and wallet coin disambiguation return 200 with JSON-LD.

## Current Google Evidence

Fresh Chrome checks with `hl=en&gl=th&pws=0`:

- `ynot`: `www.ynotopen.com` was not found in the extracted visible organic top 10. Current top results are still unrelated YNOT entities such as a YouTube downloader, Liquipedia player page, Y Not Festival, Ynot7, and Spotify / music-related pages.
- `ynotopen`: `www.ynotopen.com` appears at rank 1.
- `ynot tcg`: `www.ynotopen.com` appears at rank 1.
- `pokemon card`: `www.ynotopen.com` was not found in the extracted visible top results; official Pokemon properties and established commerce/community pages dominate.
- `one piece card`: `www.ynotopen.com` was not found in the extracted visible top results; official One Piece Card Game properties, a Thailand market group, TCG Thailand, and commerce pages dominate.

## Current ChatGPT Evidence

Fresh ChatGPT web-style prompt for `ynot`, `ynotopen`, `ynot tcg`, `pokemon card`, and `one piece card`:

- `ynot`: ChatGPT reported YNOT / ynotopen.com in the top 3 at rank 2.
- `ynotopen`: ChatGPT reported YNOT / ynotopen.com at rank 1.
- `ynot tcg`: ChatGPT reported YNOT / ynotopen.com at rank 1.
- `pokemon card`: ChatGPT did not report ynotopen.com in the top 3.
- `one piece card`: ChatGPT did not report ynotopen.com in the top 3.

## New Improvement Layer

Added root AI source indexes:

- `/llms.txt`: concise official YNOT source map for AI answer systems.
- `/llms-full.txt`: expanded official YNOT source map with answers, proof points, and FAQs.

These files are generated from the same public answer-page data as the sitemap and JSON-LD so the AI-readable source stays consistent with visible public content.

## Remaining Top-3 Gap

The branded terms are now working better:

- `ynotopen` is Google rank 1.
- `ynot tcg` is Google rank 1.
- ChatGPT reports `ynot`, `ynotopen`, and `ynot tcg` in the top 3.

The remaining hard terms are broad category terms:

- `pokemon card`
- `one piece card`

YNOT should not try to outrank official Pokemon or One Piece rules/card-database intent with thin content. The realistic path is to win narrower commercial/local/opening intents first:

- `open Pokemon card packs online Thailand`
- `Pokemon card mystery pack Thailand`
- `Pokemon TCG packs Thailand YNOT`
- `One Piece card packs Thailand`
- `One Piece card mystery pack Thailand`
- `online card pack opening Thailand`
- `YNOT card event Bangkok`
- `SNKRDUNK alternative trading cards Thailand`
- `StockX alternative trading cards`

## External Actions Still Needed

- Verify or regain access to the `ynotopen.com` Google Search Console property.
- Submit `https://www.ynotopen.com/sitemap.xml` in Search Console.
- Request indexing for `/`, `/help/ynot-official-site`, `/help/ynot-tcg-lucky-draw-thailand`, `/help/pokemon-card-packs-thailand`, `/help/open-pokemon-tcg-packs-online-thailand`, and `/help/one-piece-card-packs-thailand`.
- Add `https://www.ynotopen.com/` to the Instagram `_yfifteen` bio.
- Ask Bangkok event pages, partner pages, or card community recaps to link to the relevant YNOT page with descriptive anchor text.
