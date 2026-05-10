<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repo and deployment topology

**Single source of truth:** `https://github.com/pinkmerry/lucky-draw-liff` (this repo). The repo `pinkmerry/ynot-lucky-draw-platform` is **archived** — never push there.

The `Website/` directory is one Next.js app deployed by **two independent Vercel projects** off the same `main` branch:

- Vercel `ynot-lucky-draw-platform` → `www.ynottcg.com` (normal website)
- Vercel `lucky-draw-liff` → `liff.ynottcg.com` (LINE LIFF)

Both connect to `pinkmerry/lucky-draw-liff`, branch `main`, root directory `Website`. A single `git push` to `main` triggers both deploys; runtime is independent. Hostname-based middleware switches LIFF vs. website behavior.

**Do not** add a `ynot` git remote, do not push to `ynot-lucky-draw-platform`, and do not maintain mirror branches. See `README.md` for the full map.
