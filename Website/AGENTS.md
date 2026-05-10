<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# YNOTT Website Instructions

This folder is **YNOTT Website**.

Use it for:
- normal website routes and pages;
- admin/customer UI;
- Next.js API routes;
- Supabase Auth/web sessions;
- wallet, top-up, gacha, collection, ranking, exchange, shipping, profile, admin controls;
- shared runtime code that LIFF currently also depends on.

Important distinction:
- `Website/` is the Next.js app root for Vercel builds.
- `Line LIFF/` is the LIFF integration/reference area, not the current Next.js app root.
- Preserve LIFF compatibility when editing shared LINE/session/lucky-draw code.

Vercel expectation:
- Website project: `ynott-website`, Root Directory `Website`.
- LIFF project: `ynott-line-liff`, Root Directory `Website` until a separate LIFF app is intentionally extracted.
