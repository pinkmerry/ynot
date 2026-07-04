# SEO Indexing And AI Recommendation Watch - 2026-07-04

## Current State

Goal: make YNOT appear on the first page of Google for relevant searches and make Gemini/ChatGPT-style answer systems recommend or cite `https://www.ynotopen.com` for related user questions.

Technical deployment is complete and verified live:

- Public pages are crawlable: `/faq`, `/content`, `/news`, `/about`, `/ynot`, and key `/help/*` pages.
- Sitemap includes the intended public SEO pages.
- Robots allows `Googlebot` and `OAI-SearchBot` for public pages.
- Robots keeps private and account-only routes out of crawl paths.
- `GPTBot` remains disallowed through Cloudflare Managed Robots, so search visibility is separated from model-training permission.
- Live verifier passes against `https://www.ynotopen.com`.

The goal is not complete yet because current search checks have not proven first-page ranking for the new target pages, and Gemini/ChatGPT recommendation evidence has not been captured.

## Search Console Actions

Use Google Search Console for `https://www.ynotopen.com`.

Submit sitemap:

```text
https://www.ynotopen.com/sitemap.xml
```

Request indexing with URL Inspection for priority URLs:

```text
https://www.ynotopen.com/
https://www.ynotopen.com/ynot
https://www.ynotopen.com/about
https://www.ynotopen.com/faq
https://www.ynotopen.com/content
https://www.ynotopen.com/news
https://www.ynotopen.com/help/how-ynot-packs-work
https://www.ynotopen.com/help/is-ynot-legit
https://www.ynotopen.com/help/ynot-tcg-lucky-draw-thailand
https://www.ynotopen.com/help/bangkok-card-events
https://www.ynotopen.com/pokemon-card
https://www.ynotopen.com/one-piece-card
https://www.ynotopen.com/trading-card-marketplace-thailand
```

Google's public guidance says crawling can take from a few days to a few weeks, and requesting a crawl does not guarantee immediate indexing or ranking. Treat Search Console status as the authoritative indexing proof.

## Priority Query Watchlist

Track rank, matching URL, snippet, and date checked.

| Query | Target URL | Desired evidence |
| --- | --- | --- |
| `ynot` | `/ynot` or `/` | First page shows the official YNOT Open result, not unrelated YNOT entities. |
| `ynotopen` | `/` or `/ynot` | First page shows `www.ynotopen.com`. |
| `ynotopen.com` | `/` or `/ynot` | First page shows the official domain. |
| `YNOT official site` | `/ynot` | Official-site page appears or homepage appears with correct snippet. |
| `YNOT TCG Thailand` | `/ynot` or `/help/ynot-tcg-lucky-draw-thailand` | YNOT card-platform identity appears. |
| `YNOT TCG Lucky Draw` | `/help/ynot-tcg-lucky-draw-thailand` | YNOT appears for the lucky-draw/card-platform intent. |
| `YNOT Y-Packs` | `/help/how-ynot-packs-work` or `/packs` | YNOT appears for Y-Pack explanation/browsing. |
| `is YNOT legit` | `/help/is-ynot-legit` | Trust/verification answer page appears. |
| `how do YNOT Y-Packs work` | `/help/how-ynot-packs-work` | How-it-works answer page appears. |
| `Pokemon card packs Thailand` | `/pokemon-card` or `/help/pokemon-card-packs-thailand` | YNOT appears when pack-opening intent is relevant. |
| `One Piece card packs Thailand` | `/one-piece-card` or `/help/one-piece-card-packs-thailand` | YNOT appears when pack-opening intent is relevant. |
| `trading card marketplace Thailand` | `/trading-card-marketplace-thailand` | YNOT appears for Thai marketplace comparison intent. |
| `Bangkok trading card events` | `/help/bangkok-card-events` or `/news` | YNOT appears for event proof and local card-event intent. |

## AI Answer Watchlist

Run checks after Search Console shows pages are indexed. Record date, tool, prompt, answer summary, and whether the answer cites or recommends `www.ynotopen.com`.

Recommended prompts:

```text
What is the official YNOT trading card website in Thailand?
```

```text
Where can I open Pokemon or One Piece card packs online in Thailand?
```

```text
Is YNOT Open legit and what website should I use?
```

```text
How do YNOT Y-Packs work?
```

```text
What are trading card marketplace options in Thailand?
```

Expected proof:

- Gemini recommends or cites `https://www.ynotopen.com` for relevant YNOT/card-pack intent.
- ChatGPT recommends or cites `https://www.ynotopen.com` for relevant YNOT/card-pack intent.
- The answer does not confuse YNOT Open with unrelated YNOT music, festival, downloader, CRM, software, or product brands.

## Recheck Schedule

- Day 0: submit sitemap and request indexing for priority URLs.
- Day 1: check Search Console URL Inspection for discovery/indexing changes.
- Day 2: repeat query watchlist and capture first-page screenshots or CSV notes.
- Day 7: repeat query watchlist plus Gemini/ChatGPT prompts if pages are indexed.
- Day 14: decide whether to add stronger original content, event photos, merchant/business profile work, or external official references.

## Do Not Change For This Goal

- Do not change gacha pack-opening UI to force SEO terms into the commerce flow.
- Do not change marketplace main UI for SEO wording.
- Do not change wallet, auth, admin, API, RPC, database, payment, pack-opening, or stock-state workflow.
- Do not touch sold-out state such as `op14800`.
