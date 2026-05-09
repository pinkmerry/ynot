export type PhaseReadinessState = "local-ready" | "external-gated" | "pilot-gated";

export type PhaseReadinessItem = {
  phase: number;
  title: string;
  shortGoal: string;
  localhostStatus: PhaseReadinessState;
  ownerCanTest: string[];
  localhostLinks: { label: string; href: string }[];
  evidenceNeeded: string[];
  externalGate: string;
  docPath: string;
};

export const phaseReadinessItems: PhaseReadinessItem[] = [
  {
    phase: 1,
    title: "Production Data Inventory + Backup",
    shortGoal: "Confirm live Supabase/LIFF state and capture restore-ready backup evidence before migration.",
    localhostStatus: "external-gated",
    ownerCanTest: [
      "Read the Phase 1 checklist and confirm it matches the database safety expectations.",
      "Open the local app and confirm write-heavy flows still fail safely when not logged in.",
    ],
    localhostLinks: [
      { label: "Local home", href: "/" },
      { label: "Local login", href: "/login" },
      { label: "Local admin gate", href: "/admin" },
    ],
    evidenceNeeded: ["Production Supabase ref", "Full database backup", "Storage backup/export plan", "Restore drill or restore command"],
    externalGate: "Requires Supabase SQL/backup access. No production mutation is safe from localhost.",
    docPath: "docs/plans/production-phases/phase-1-production-data-inventory-backup.md",
  },
  {
    phase: 2,
    title: "Staging Supabase + Preview Deployment",
    shortGoal: "Apply website migrations to isolated staging and point a Vercel preview at staging only.",
    localhostStatus: "external-gated",
    ownerCanTest: [
      "Confirm the local migration files are present and local UI still builds.",
      "Use localhost as visual/navigation proof, not as staging database proof.",
    ],
    localhostLinks: [
      { label: "Mystery packs", href: "/" },
      { label: "Campaign admin", href: "/admin/campaigns" },
      { label: "Readiness console", href: "/local-readiness" },
    ],
    evidenceNeeded: ["Staging Supabase ref", "Migration apply output", "RLS/grant checks", "Preview deployment URL"],
    externalGate: "Requires staging Supabase/project or branch and Vercel preview envs.",
    docPath: "docs/plans/production-phases/phase-2-staging-supabase-preview.md",
  },
  {
    phase: 3,
    title: "Provider + Identity + Owner/Admin Verification",
    shortGoal: "Verify email, Google, LINE, LIFF session truth, owner/admin access, and non-admin denial.",
    localhostStatus: "local-ready",
    ownerCanTest: [
      "Open Login and Sign Up pages.",
      "Open Profile to inspect LINE connect/personal-info UX.",
      "Open Admin while logged out and confirm it does not expose admin operations.",
    ],
    localhostLinks: [
      { label: "Login", href: "/login" },
      { label: "Sign Up", href: "/signup" },
      { label: "Profile", href: "/profile" },
      { label: "Admin gate", href: "/admin" },
    ],
    evidenceNeeded: ["Provider callback matrix", "profiles/user_identities rows", "server-backed LINE profile/session", "admin_users row"],
    externalGate: "Real provider success requires Google/LINE dashboard settings and Supabase Auth config.",
    docPath: "docs/plans/production-phases/phase-3-provider-identity-owner-admin.md",
  },
  {
    phase: 4,
    title: "Wallet + Manual Payment + Admin QA",
    shortGoal: "Prove top-up, slip upload, admin approve/reject, ledger, and no double credit.",
    localhostStatus: "local-ready",
    ownerCanTest: [
      "Open Wallet and inspect the manual bank/QR slip upload UX.",
      "Open Admin Settings and Top-ups to inspect the admin payment workflow gate.",
      "Logged-out/API smoke should fail safely instead of creating money state.",
    ],
    localhostLinks: [
      { label: "Wallet", href: "/wallet" },
      { label: "Admin settings", href: "/admin/settings" },
      { label: "Admin top-ups", href: "/admin/top-ups" },
    ],
    evidenceNeeded: ["top_up_requests rows", "payment_slips row/object", "wallet_accounts before/after", "coin_ledger idempotency proof"],
    externalGate: "Positive approval/reject testing requires migrated staging DB and admin login.",
    docPath: "docs/plans/production-phases/phase-4-wallet-payment-admin-qa.md",
  },
  {
    phase: 5,
    title: "Gacha + Collection + Exchange + Shipping QA",
    shortGoal: "Prove full customer operations from pack open to collection, exchange, shipping, and admin processing.",
    localhostStatus: "local-ready",
    ownerCanTest: [
      "Open pack detail/open pages and inspect customer flow.",
      "Open Collection, Exchange, Shipping, Ranking pages.",
      "Open admin Campaigns/Prizes/Exchange/Shipping pages to inspect operation surfaces.",
    ],
    localhostLinks: [
      { label: "Mystery packs", href: "/" },
      { label: "Campaign admin", href: "/admin/campaigns" },
      { label: "Collection", href: "/collection" },
      { label: "Exchange", href: "/exchange" },
      { label: "Shipping", href: "/shipping" },
      { label: "Admin campaigns", href: "/admin/campaigns" },
      { label: "Admin prizes", href: "/admin/prizes" },
    ],
    evidenceNeeded: ["gacha_opens/items", "collection_items", "exchange_orders/items", "shipping_requests/items", "audit events"],
    externalGate: "Positive mutation reconciliation requires migrated staging DB, wallet balance, and admin login.",
    docPath: "docs/plans/production-phases/phase-5-gacha-collection-exchange-shipping-qa.md",
  },
  {
    phase: 6,
    title: "Production Preflight",
    shortGoal: "Run final backup/env/provider/migration/deploy checks before controlled production smoke.",
    localhostStatus: "external-gated",
    ownerCanTest: [
      "Use localhost route/build checks as release-candidate confidence only.",
      "Review the preflight doc and verify every go/no-go line is understandable.",
    ],
    localhostLinks: [
      { label: "Home smoke", href: "/" },
      { label: "Wallet smoke", href: "/wallet" },
      { label: "Admin smoke", href: "/admin" },
    ],
    evidenceNeeded: ["Fresh backup", "Production env/provider matrix", "Migration output", "RLS/RPC/schema checks", "Vercel deployment ID"],
    externalGate: "Requires owner go/no-go, production Supabase SQL access, provider dashboards, and Vercel deploy authority.",
    docPath: "docs/plans/production-phases/phase-6-production-preflight.md",
  },
  {
    phase: 7,
    title: "Production Smoke + Limited Pilot",
    shortGoal: "Run one narrow internal production pilot and produce go/no-go evidence before public launch.",
    localhostStatus: "pilot-gated",
    ownerCanTest: [
      "Use localhost to rehearse the exact pilot path: login, wallet, pack, collection, exchange, shipping, admin.",
      "Review which parts still need real production row/log evidence.",
    ],
    localhostLinks: [
      { label: "Login", href: "/login" },
      { label: "Wallet", href: "/wallet" },
      { label: "Mystery packs", href: "/" },
      { label: "Collection", href: "/collection" },
      { label: "Shipping", href: "/shipping" },
    ],
    evidenceNeeded: ["Production route smoke", "Pilot login success", "Ledger/gacha/exchange/shipping row IDs", "Log review", "GO/NO-GO decision"],
    externalGate: "Requires completed Phase 6 and intentionally limited production pilot scope.",
    docPath: "docs/plans/production-phases/phase-7-production-smoke-limited-pilot.md",
  },
];

export const adminContentStudioLocalSummary = {
  current: [
    "Admin campaign/card/prize/payment/user/exchange/shipping pages exist and are server-gated.",
    "Storefront home now shows only Pokemon and One Piece as requested.",
    "Dynamic category/media CMS is planned but not applied to production yet.",
  ],
  future: [
    "Add store_categories and media_assets in a staged migration after backup/staging gates.",
    "Enhance admin to create categories, upload/select images, draft/preview/publish packs, and audit content changes.",
    "Keep finance/admin operations separate from future content-editor permissions if role split is needed.",
  ],
  docPath: "docs/plans/admin-content-studio-future-proofing.md",
};
