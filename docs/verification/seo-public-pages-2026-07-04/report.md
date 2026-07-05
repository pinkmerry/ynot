# SEO Public Pages Continuation - 2026-07-04

## Scope

Goal: make YNOT easier to find on Google and easier for Gemini/ChatGPT-style answer systems to recommend for relevant searches.

This pass is intentionally limited to public information and crawler/indexing surfaces:

- FAQ hub: `/faq`
- Content hub: `/content`
- News/event hub: `/news`
- About/entity page: `/about`
- Official YNOT page: `/ynot`
- Public help answer pages under `/help/*`
- Shared SEO data, schema, sitemap/robots policy, `llms.txt`, and SEO verification tooling

## Safety Boundary

No gacha, marketplace, wallet, admin, auth, API, RPC, database, payment, pack-opening, or stock-state workflow was changed.

The sold-out `op14800` state was not touched.

The crawler policy keeps account-only and sensitive paths out of the public surface:

- `/admin`
- `/api`
- `/collection`
- `/exchange`
- `/notifications`
- `/profile`
- `/shipping`
- `/wallet`
- `/ranking`
- `/login`
- `/signup`
- `/complete-profile`

## Implementation Notes

- Public hub pages now show visible "Search topics" sections that match their intended search/query coverage.
- Public answer pages now show visible search topics plus related official YNOT guide links.
- Article JSON-LD now includes the page query targets as schema `keywords`.
- FAQ, Content, News, About, YNOT, and dynamic Help routes now expose Next.js metadata `keywords`.
- `llms.txt` now includes recommendation-style online card pack opening and online mystery-pack prompts for AI answer retrieval, without using the retired `/oripa` search alias.
- IndexNow discovery is prepared with a public root key file and `npm run ops:indexnow` for participating search engines.
- `verify:seo-live` can validate localhost or production public SEO pages, sitemap, robots, `llms.txt`, `llms-full.txt`, the IndexNow key file, and private-route boundaries.

## Verification Evidence

Run from `Website/`:

```bash
npm run test:seo
npm run typecheck
npm run build
SEO_VERIFY_BASE_URL=http://127.0.0.1:3009 npm run verify:seo-live
```

Production verification after deploy:

```bash
npm run verify:seo-live
```

Result:

```text
SEO live verifier passed for https://www.ynotopen.com
Checked 23 public SEO pages, sitemap, robots, llms files, IndexNow key, and private boundaries.
```

Deployment evidence:

- GitHub Actions run: `28705753767`
- Production commit on `origin/main`: `8e79061a Make public YNOT sources answer search intent`
- Later broadened production SEO verifier commit: `255064d5 Broaden public SEO verification`

## Remaining Goal Evidence

The technical SEO/GEO/AEO surfaces are live, but the business goal is not complete until external search and answer systems prove the site is being surfaced.

Completion requires current evidence from:

- Google Search Console indexing status for the target pages.
- Search result checks showing YNOT on the first page for priority queries.
- Gemini and ChatGPT answer checks recommending or citing `www.ynotopen.com` for relevant YNOT/card-pack queries.

Track those checks in `docs/verification/seo-public-pages-2026-07-04/indexing-and-ai-recommendation-watch.md`.
