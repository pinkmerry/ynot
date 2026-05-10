<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `Website/node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# YNOTT Agent Instructions

## Repo and deployment topology

This repository is the **YNOTT** project. It contains two product surfaces plus the shared database source of truth:

```text
YNOTT/
├── Website/       YNOTT Website: normal web app, customer/admin UI, API routes, shared Next.js runtime
├── Line LIFF/     YNOTT LIFF: LINE channel/rich-menu/LIFF integration notes and compatibility references
└── Database/      Supabase migrations, schema docs, backup/restore evidence, RLS/RPC plans
```

### How to decide what you are working on

- If the task mentions **website**, `www.ynottcg.com`, admin pages, customer web pages, wallet, gacha, collection, exchange, shipping, auth, or Next.js code: work in `Website/` and treat it as **YNOTT Website**.
- If the task mentions **LIFF**, LINE rich menu, LINE Console, `liff.ynottcg.com`, LINE login/session compatibility, or LIFF-specific routing: inspect `Line LIFF/` first, then update shared code in `Website/` only when needed to preserve LIFF behavior.
- If the task mentions **Supabase**, migrations, backups, RLS, RPCs, or production DB gates: work in `Database/` plus any related verification scripts in `Website/tools/verification/`.

### Vercel projects

Both Vercel projects are expected to build from repo root with **Root Directory = `Website`** unless/until LIFF is extracted into a separate app.

- **YNOTT Website**: Vercel project `ynott-website`, domains `www.ynottcg.com` and `ynottcg.com`.
- **YNOTT LIFF**: Vercel project `ynott-line-liff`, domain `liff.ynottcg.com`, fallback URL `https://ynott-line-liff.vercel.app`.

Do not point the LIFF project root at `.`. That causes Vercel build failures because the Next.js app lives in `Website/`.

### Old names are retired

Do **not** use old local/repo/Vercel names for new work:

- old local folder `Lucky Draw/` has been removed;
- old GitHub repo names `pinkmerry/lucky-draw-liff` and `pinkmerry/ynot-lucky-draw-platform` are not active sources;
- old Vercel project/alias names `lucky-draw-liff` and `ynot-lucky-draw-platform` are not active deployment targets;
- old aliases `lucky-draw-liff.vercel.app` and `ynot-lucky-draw-platform.vercel.app` have been removed.

Use only `YNOTT/`, `pinkmerry/ynott`, `ynott-website`, and `ynott-line-liff`.

### Safety

- Do not apply production Supabase migrations until Phase 1 backup/PITR and restore-drill gates are satisfied.
- Do not merge/push production-breaking topology changes unless Vercel root/source settings are verified.
- Keep Website and LIFF URL ownership separate: normal web traffic goes to `www.ynottcg.com`; LINE LIFF traffic goes to `liff.ynottcg.com`.
