<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `Website/node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# YNOTT Agent Instructions

## Repo and deployment topology

This repository is the **YNOTT** project. It contains the production website plus the shared database source of truth:

```text
YNOTT/
├── Website/       YNOTT Website: normal web app, customer/admin UI, API routes, shared Next.js runtime
└── Database/      Supabase migrations, schema docs, backup/restore evidence, RLS/RPC plans
```

### How to decide what you are working on

- If the task mentions **website**, `www.ynotopen.com`, admin pages, customer web pages, wallet, gacha, collection, exchange, shipping, auth, or Next.js code: work in `Website/` and treat it as **YNOTT Website**.
- If the task mentions **LINE login**, LINE OAuth, account connect/linking, or `/api/line/*`: work in `Website/`; this is normal website LINE Login, not a separate LIFF app.
- If the task mentions **LIFF**, LINE rich menu, LINE Console, or `liff.ynotopen.com`: treat LIFF as retired for now. A future LIFF app must be intentionally recreated instead of reusing a removed folder or deploy target.
- If the task mentions **Supabase**, migrations, backups, RLS, RPCs, or production DB gates: work in `Database/` plus any related verification scripts in `Website/tools/verification/`.

### Cloudflare Worker

The active production web surface builds from `Website/` and deploys to Cloudflare Workers.

- **YNOTT Website**: Cloudflare Worker `ynott-website`, domains `www.ynotopen.com`, `ynotopen.com`, and fallback URL `https://ynott-website.puppeteer-55b.workers.dev`.
- **LINE Login**: remains part of the website through `Website/src/app/api/line/*` and the website Worker.
- **YNOTT LIFF**: no active folder, Worker, deploy script, or production route exists for now.

### Old names are retired

Do **not** use old local/repo/Vercel names for new work:

- old local folder `Lucky Draw/` has been removed;
- old GitHub repo names `pinkmerry/lucky-draw-liff` and `pinkmerry/ynot-lucky-draw-platform` are not active sources;
- old Vercel project/alias names `lucky-draw-liff` and `ynot-lucky-draw-platform` are not active deployment targets;
- old aliases `lucky-draw-liff.vercel.app` and `ynot-lucky-draw-platform.vercel.app` have been removed.

Use only `YNOTT/`, `pinkmerry/ynot`, and `ynott-website` for active website work.

### Safety

- Do not apply production Supabase migrations until Phase 1 backup/PITR and restore-drill gates are satisfied.
- Do not merge/push production-breaking topology changes unless the Cloudflare Worker config and website build are verified.
- Keep LINE Login separate from LIFF cleanup: normal web traffic and LINE OAuth callbacks go through `www.ynotopen.com`; any future LIFF traffic should use `liff.ynotopen.com` only after a new setup exists.
