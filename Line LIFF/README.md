# Line LIFF

This folder is for the LINE LIFF side of the Lucky Draw project.

## Current state

The existing LIFF-compatible runtime is still preserved inside the Website app because the normal website and LINE paths currently share the same Next.js/Supabase backend code.

Key LINE/LIFF-related code paths:

- `../Website/src/app/api/line/session/route.ts` — legacy LIFF session creation endpoint.
- `../Website/src/app/api/line/login/start/route.ts` — normal website LINE login start route.
- `../Website/src/app/api/line/callback/route.ts` — LINE OAuth callback/linking route.
- `../Website/src/lib/line/` — LINE OAuth/session/linking helpers.
- `../Website/src/features/lucky-draw/` — legacy Lucky Draw customer/admin shell kept for compatibility.

## Design/reference files

Original Lucky Draw UI/reference files are stored in:

- `design-references/UX:UI Design/`

## Rule

Do not break LIFF compatibility while building the normal website. The website and LIFF should continue to align to the same Supabase profile/admin/order/payment data model.
## Production URL ownership

- Intended LIFF URL: `https://liff.ynottcg.com`
- Temporary LIFF fallback: `https://lucky-draw-liff.vercel.app`
- Normal website URL: `https://www.ynottcg.com`

The LIFF Vercel project owns `liff.ynottcg.com`, but public DNS is still pending. Add this Squarespace DNS record before switching LINE Console/rich-menu URLs to the LIFF subdomain:

```text
A liff.ynottcg.com 76.76.21.21
```

Do not point LINE rich-menu/LIFF endpoint URLs at the normal website domain unless the intended action is normal web login rather than LIFF.
