# SEO Top-3 Keyword Plan - 2026-07-02

## Goal

Move YNOT Open toward top-3 visibility for:

- `pokemon card`
- `one piece card`
- `ynot tcg`
- `ynotopen`

The exact ranking target is not fully controllable from code because Google and AI search systems also depend on crawl timing, backlinks, brand/entity authority, user behavior, and off-site corroboration. The codebase can still make the public pages more indexable, more answerable, and easier to submit to Search Console.

## Fresh Google Evidence

Tested in Chrome with:

```text
https://www.google.com/search?q=<query>&num=10&hl=en&pws=0
```

### `pokemon card`

YNOT Open did not appear in the visible top 10.

Top visible results were dominated by official Pokemon sources and large retail/social surfaces:

1. `asia.pokemon-card.com/th/`
2. `tcg.pokemon.com/`
3. `asia.pokemon-card.com/`
4. Pokemon Thailand Facebook
5. Toys R Us Thailand Pokemon category
6. Thai Pokemon portal
7. Shopee card Pokemon search

### `one piece card`

YNOT Open did not appear in the visible top 10.

Top visible results were dominated by official One Piece Card Game sources and community/market surfaces:

1. `asia-th.onepiece-cardgame.com/`
2. `en.onepiece-cardgame.com/`
3. One Piece Market Thailand Facebook group
4. Official card list page
5. TCG Thailand product category
6. Asia English official site
7. Lazada One Piece Card tag

### `ynot tcg`

YNOT Open already appeared at position 1.

Top visible results:

1. `https://www.ynotopen.com/`
2. YNOT Instagram event post
3. Facebook Pokemon card group event post

### `ynotopen`

YNOT Open already appeared at position 1.

Top visible results:

1. `https://www.ynotopen.com/`
2. unrelated `ynot7official` Instagram
3. unrelated Ynot7 Facebook

## Top-Result HTML Patterns

Crawler fetches were made with a standard browser-like user agent.

### Pokemon official pages

- `asia.pokemon-card.com/th/` returns a full HTML page with canonical URL, Thai official title, meta description, Open Graph title/description, and page sections for recommended topics, card-game news, and how to play.
- `tcg.pokemon.com/en-us/` returns a large official page with canonical URL, product/collection copy, strong title, and headings for new products, apps, championship series, play programs, and product guide.
- `asia.pokemon-card.com/` is a lighter regional selector page with a direct H1.

Pattern: official authority plus clear product/rules/event intent. YNOT should not claim this official intent. It should win the narrower "open Pokemon card packs online Thailand / Y-Pack" intent.

### One Piece official and market pages

- `asia-th.onepiece-cardgame.com/` returns a full Thai official page with strong title, description, OG data, card/game/product/event copy, and current deck/product content.
- `en.onepiece-cardgame.com/` returns the English official page with similar product/event/rules copy.
- The top Facebook group page exposes a huge HTML payload with title, description, canonical URL, and community-market language.

Pattern: official authority plus community market authority. YNOT should target live public Y-Pack evidence, pack prices, visible rewards, stock signals, and reward-management support.

### Branded YNOT pages

- `www.ynotopen.com` is already #1 for `ynot tcg` and `ynotopen`.
- Before this pass, the homepage H1 was visual-only (`YNOT`), while metadata and schema were stronger.
- The new H1 is now `YNOT Open Thailand TCG Y-Packs`, and the page continues to expose YNOT Open, ynotopen.com, Pokemon, One Piece, wallet coins, exchange, and shipping language.

## Related Keyword Map

### Primary branded

- `ynot`
- `YNOT`
- `ynotopen`
- `ynotopen.com`
- `YNOT Open`
- `YNOT official site`
- `YNOT official website`
- `YNOT TCG`
- `YNOT TCG Thailand`
- `YNOT Y-Packs`
- `_yfifteen`

### Pokemon card cluster

- `pokemon card`
- `Pokemon card Thailand`
- `Pokemon card packs Thailand`
- `Pokemon TCG packs Thailand`
- `Pokemon card shop Thailand`
- `Pokemon card market Thailand`
- `Pokemon card trading Thailand`
- `buy Pokemon card Thailand`
- `open Pokemon card packs online Thailand`
- `Pokemon mystery pack Thailand`
- `Pokemon card lucky draw Thailand`
- `Pokemon card Y-Pack`
- `YNOT Pokemon card packs`

### One Piece card cluster

- `one piece card`
- `One Piece card Thailand`
- `One Piece card packs Thailand`
- `One Piece TCG Thailand`
- `One Piece card shop Thailand`
- `One Piece card market Thailand`
- `One Piece card trading Thailand`
- `buy One Piece card Thailand`
- `open One Piece card packs online Thailand`
- `One Piece mystery pack Thailand`
- `One Piece card lucky draw Thailand`
- `One Piece card Y-Pack`
- `YNOT One Piece card packs`

### Marketplace/comparison cluster

- `SNKRDUNK alternative trading cards Thailand`
- `StockX alternative trading cards`
- `trading card marketplace Thailand`
- `card trading Thailand`
- `online TCG pack opening Thailand`

### Event/local proof cluster

- `Bangkok trading card events`
- `BKK card event`
- `Pokemon card event Bangkok`
- `One Piece card event Bangkok`
- `YNOT card event Bangkok`
- `Thailand International Card Expo YNOT`

## Implementation Plan

### Done in this pass

- Make the homepage H1 describe the entity and category: `YNOT Open Thailand TCG Y-Packs`.
- Keep the official YNOT entity name as `YNOT Open` in Organization schema.
- Expand the Pokemon and One Piece series hubs with search-landscape sections:
  - official-source intent
  - shop/community-market intent
  - YNOT Open Y-Pack intent
- Add commercial variants to query targets:
  - `Pokemon card shop Thailand`
  - `Pokemon card market Thailand`
  - `buy Pokemon card Thailand`
  - `One Piece card market Thailand`
  - `buy One Piece card Thailand`
- Add FAQ answers that clarify YNOT is not a general card shop, but is relevant when public packs or marketplace listings are live.
- Include the new landscape content in `llms-full.txt` for AI answer systems.

### Next actions outside code

- Submit these URLs in Google Search Console URL Inspection:
  - `/`
  - `/ynot`
  - `/pokemon-card`
  - `/one-piece-card`
  - `/help/ynot-tcg-lucky-draw-thailand`
  - `/help/pokemon-card-packs-thailand`
  - `/help/one-piece-card-packs-thailand`
  - the strongest live pack URLs for Pokemon and One Piece
- Update Instagram bio/name and event captions to say `YNOT Open - Thailand TCG Y-Packs` and link to `https://www.ynotopen.com/ynot`.
- Ask event partners and card communities to link to `https://www.ynotopen.com/ynot`, `/pokemon-card`, or `/one-piece-card` using descriptive anchor text.
- Preserve event pages/posts as proof. Do not replace old event proof every week; add new dated proof and keep stable evergreen pages linked.

## Ranking Strategy

- `ynotopen`: maintain and defend position 1 with entity consistency.
- `ynot tcg`: maintain position 1 and improve the displayed title/snippet after recrawl.
- `pokemon card`: do not attempt to beat official Pokemon pages for official-source intent. Target top visibility for narrower local/commercial variants first.
- `one piece card`: do not attempt to beat official One Piece pages for official-source intent. Target local market and Y-Pack variants first.

