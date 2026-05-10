# Verification: YNOTT Repo And Deployment Topology Alignment

Date: 2026-05-10

## Claim

The project is now aligned under the YNOTT naming and deployment topology so future agents can distinguish YNOTT Website work from YNOTT LIFF work.

## Local folder

- Local project folder renamed to: `/Users/pinkmerry/Project X/YNOTT`
- Git root remains the project parent folder.
- Source areas:
  - `Website/` — YNOTT Website Next.js app and shared runtime.
  - `Line LIFF/` — YNOTT LIFF settings/reference/compatibility area.
  - `Database/` — Supabase migrations and DB verification.

## GitHub

- Repository renamed to: `pinkmerry/ynott`
- Local `origin` remote now points to `https://github.com/pinkmerry/ynott.git`
- Repository description: `YNOTT website and LINE LIFF platform`
- Repository is not archived.

## Vercel

| Surface | Project | Root Directory | Git repo |
| --- | --- | --- | --- |
| YNOTT Website | `ynott-website` | `Website` | `pinkmerry/ynott` |
| YNOTT LIFF | `ynott-line-liff` | `Website` | `pinkmerry/ynott` |

The LIFF project root was changed from `.` to `Website`; this is the key fix for Vercel build failures caused by building from the repository root.

## Agent guidance added

- Root `AGENTS.md` now explains repo/deployment topology and lane selection.
- `Website/AGENTS.md` now identifies Website as YNOTT Website.
- `Line LIFF/AGENTS.md` now identifies LIFF ownership and shared runtime touchpoints.
- README/status docs were updated to use YNOTT naming and project IDs.

## Verification

- `git remote -v` shows `origin -> https://github.com/pinkmerry/ynott.git`.
- `vercel project inspect ynott-website` shows Root Directory `Website`.
- `vercel project inspect ynott-line-liff` shows Root Directory `Website`.
- Local `npm run lint` passed after docs/agent changes.
- Local `npm run build` passed from `Website/`.

## Remaining note

The LIFF project still builds the shared `Website/` app until a separate LIFF app is intentionally extracted. This is expected and documented to prevent agents from treating `Line LIFF/` as a buildable Next.js app root.
