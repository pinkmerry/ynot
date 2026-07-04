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
- `verify:seo-live` can validate localhost or production public SEO pages, sitemap, robots, `llms.txt`, and private-route boundaries.

## Verification Plan

Run from `Website/`:

```bash
npm run test:seo
npm run typecheck
npm run build
SEO_VERIFY_BASE_URL=http://127.0.0.1:3009 npm run verify:seo-live
```

Production verification should be run after an SEO-only deploy. Until that deploy happens, live production may still fail the new verifier because the new metadata and visible query sections are not on `www.ynotopen.com` yet.
