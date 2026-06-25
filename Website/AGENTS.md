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
- website LINE Login and account linking routes.

Important distinction:
- `Website/` is the Next.js app root and the active Cloudflare Worker source.
- LINE Login remains active through `src/app/api/line/*` and `src/lib/line/*`.
- The separate LIFF folder, Worker, and deploy scripts are retired for now.
- Do not remove website LINE Login when removing or avoiding LIFF-specific work.

Cloudflare expectation:
- Website Worker: `ynott-website`, source directory `Website`.
- No active LIFF Worker should be deployed from this app.
- Do not use retired Vercel names/aliases `ynot-lucky-draw-platform`, `lucky-draw-liff`, `ynot-lucky-draw-platform.vercel.app`, or `lucky-draw-liff.vercel.app`.
