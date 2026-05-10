# YNOTT LIFF Instructions

This folder is **YNOTT LIFF**.

Use it for:
- LINE Console and LIFF setup notes;
- LINE rich-menu URL decisions;
- `liff.ynottcg.com` ownership;
- LIFF compatibility references and original design material.

Current architecture:
- LIFF-compatible runtime code still lives in `../Website/src`.
- The LIFF Vercel project should build from root directory `Website` until/unless a dedicated LIFF app is created.
- Do not move LIFF traffic to `www.ynottcg.com` unless the intended flow is normal website login.

Before changing LIFF behavior, inspect both this folder and the shared code under `../Website/src/app/api/line`, `../Website/src/lib/line`, and `../Website/src/features/lucky-draw`.
