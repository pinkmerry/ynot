import type { LocalizedCopy } from "./i18n";

export type PhaseReadinessState = "local-ready" | "external-gated" | "pilot-gated";

type Copy = LocalizedCopy<string>;

function copy(en: string, th: string): Copy {
  return { en, th };
}

export type PhaseReadinessItem = {
  phase: number;
  title: Copy;
  shortGoal: Copy;
  localhostStatus: PhaseReadinessState;
  ownerCanTest: Copy[];
  localhostLinks: { label: Copy; href: string }[];
  evidenceNeeded: Copy[];
  externalGate: Copy;
  docPath: string;
};

export const phaseReadinessItems: PhaseReadinessItem[] = [
  {
    phase: 1,
    title: copy("Production Data Inventory + Backup", "ตรวจข้อมูลโปรดักชันและแบ็กอัพ"),
    shortGoal: copy(
      "Confirm live Supabase/LIFF state and capture restore-ready backup evidence before migration.",
      "ตรวจสถานะ Supabase/LIFF จริงและเก็บหลักฐานแบ็กอัพที่พร้อมกู้คืนก่อนทำไมเกรชัน",
    ),
    localhostStatus: "external-gated",
    ownerCanTest: [
      copy(
        "Read the Phase 1 checklist and confirm it matches the database safety expectations.",
        "อ่านเช็กลิสต์ Phase 1 และยืนยันว่าตรงกับความปลอดภัยของฐานข้อมูลที่ต้องการ",
      ),
      copy(
        "Open the local app and confirm write-heavy flows still fail safely when not logged in.",
        "เปิดแอป local และยืนยันว่า flow ที่เขียนข้อมูลเยอะยังปฏิเสธอย่างปลอดภัยเมื่อไม่ได้ล็อกอิน",
      ),
    ],
    localhostLinks: [
      { label: copy("Local home", "หน้าแรก local"), href: "/" },
      { label: copy("Local login", "ล็อกอิน local"), href: "/login" },
      { label: copy("Local admin gate", "ประตูแอดมิน local"), href: "/admin" },
    ],
    evidenceNeeded: [
      copy("Production Supabase ref", "Supabase ref ของโปรดักชัน"),
      copy("Full database backup", "แบ็กอัพฐานข้อมูลครบชุด"),
      copy("Storage backup/export plan", "แผนแบ็กอัพหรือ export storage"),
      copy("Restore drill or restore command", "ทดสอบกู้คืนหรือคำสั่งกู้คืน"),
    ],
    externalGate: copy(
      "Requires Supabase SQL/backup access. No production mutation is safe from localhost.",
      "ต้องมีสิทธิ์ Supabase SQL/backup และไม่ควรแก้ข้อมูลโปรดักชันจาก localhost",
    ),
    docPath: "docs/plans/production-phases/phase-1-production-data-inventory-backup.md",
  },
  {
    phase: 2,
    title: copy("Staging Supabase + Preview Deployment", "Staging Supabase และ Preview Deployment"),
    shortGoal: copy(
      "Apply website migrations to isolated staging and point a Vercel preview at staging only.",
      "นำ migration ของเว็บไซต์ไปรันบน staging ที่แยกออกมา และให้ preview ชี้ไป staging เท่านั้น",
    ),
    localhostStatus: "external-gated",
    ownerCanTest: [
      copy(
        "Confirm the local migration files are present and local UI still builds.",
        "ยืนยันว่าไฟล์ migration ในเครื่องครบและ UI local ยัง build ได้",
      ),
      copy(
        "Use localhost as visual/navigation proof, not as staging database proof.",
        "ใช้ localhost ตรวจภาพและ navigation เท่านั้น ไม่ใช่หลักฐานฐานข้อมูล staging",
      ),
    ],
    localhostLinks: [
      { label: copy("Mystery packs", "Y-Packs"), href: "/" },
      { label: copy("Campaign admin", "แอดมินแคมเปญ"), href: "/admin/campaigns" },
      { label: copy("Readiness console", "คอนโซลความพร้อม"), href: "/local-readiness" },
    ],
    evidenceNeeded: [
      copy("Staging Supabase ref", "Supabase ref ของ staging"),
      copy("Migration apply output", "ผลลัพธ์การ apply migration"),
      copy("RLS/grant checks", "ผลตรวจ RLS/grant"),
      copy("Preview deployment URL", "URL preview deployment"),
    ],
    externalGate: copy(
      "Requires staging Supabase/project or branch and Vercel preview envs.",
      "ต้องมี Supabase staging/project หรือ branch และ env สำหรับ Vercel preview",
    ),
    docPath: "docs/plans/production-phases/phase-2-staging-supabase-preview.md",
  },
  {
    phase: 3,
    title: copy("Provider + Identity + Owner/Admin Verification", "ตรวจ Provider, ตัวตน และสิทธิ์ Owner/Admin"),
    shortGoal: copy(
      "Verify email, Google, LINE, LIFF session truth, owner/admin access, and non-admin denial.",
      "ตรวจ email, Google, LINE, LIFF session, สิทธิ์ owner/admin และการปฏิเสธ non-admin",
    ),
    localhostStatus: "local-ready",
    ownerCanTest: [
      copy("Open Login and Sign Up pages.", "เปิดหน้า Login และ Sign Up"),
      copy(
        "Open Profile to inspect LINE connect/personal-info UX.",
        "เปิด Profile เพื่อตรวจ UX การเชื่อม LINE และข้อมูลส่วนตัว",
      ),
      copy(
        "Open Admin while logged out and confirm it does not expose admin operations.",
        "เปิด Admin ตอนยังไม่ล็อกอินและยืนยันว่าไม่เผยงานแอดมิน",
      ),
    ],
    localhostLinks: [
      { label: copy("Login", "เข้าสู่ระบบ"), href: "/login" },
      { label: copy("Sign Up", "สมัครสมาชิก"), href: "/signup" },
      { label: copy("Profile", "โปรไฟล์"), href: "/profile" },
      { label: copy("Admin gate", "ประตูแอดมิน"), href: "/admin" },
    ],
    evidenceNeeded: [
      copy("Provider callback matrix", "ตาราง callback ของ provider"),
      copy("profiles/user_identities rows", "แถว profiles/user_identities"),
      copy("server-backed LINE profile/session", "LINE profile/session จาก server"),
      copy("admin_users row", "แถว admin_users"),
    ],
    externalGate: copy(
      "Real provider success requires Google/LINE dashboard settings and Supabase Auth config.",
      "การใช้งาน provider จริงต้องตั้งค่า Google/LINE dashboard และ Supabase Auth ให้ถูกต้อง",
    ),
    docPath: "docs/plans/production-phases/phase-3-provider-identity-owner-admin.md",
  },
  {
    phase: 4,
    title: copy("Wallet + Manual Payment + Admin QA", "Wallet, การชำระเงิน manual และ Admin QA"),
    shortGoal: copy(
      "Prove top-up, slip upload, admin approve/reject, ledger, and no double credit.",
      "พิสูจน์ top-up, อัปโหลดสลิป, แอดมินอนุมัติ/ปฏิเสธ, ledger และไม่มีการเติมซ้ำ",
    ),
    localhostStatus: "local-ready",
    ownerCanTest: [
      copy(
        "Open Wallet and inspect the manual bank/QR slip upload UX.",
        "เปิด Wallet และตรวจ UX การโอน/QR/อัปโหลดสลิป",
      ),
      copy(
        "Open Admin Settings and Top-ups to inspect the admin payment workflow gate.",
        "เปิด Admin Settings และ Top-ups เพื่อตรวจ gate งานชำระเงินของแอดมิน",
      ),
      copy(
        "Logged-out/API smoke should fail safely instead of creating money state.",
        "smoke ตอน logout/API ต้องปฏิเสธอย่างปลอดภัย ไม่สร้างสถานะเงิน",
      ),
    ],
    localhostLinks: [
      { label: copy("Wallet", "กระเป๋าเหรียญ"), href: "/wallet" },
      { label: copy("Admin settings", "ตั้งค่าแอดมิน"), href: "/admin/settings" },
      { label: copy("Admin top-ups", "เติมเหรียญแอดมิน"), href: "/admin/top-ups" },
    ],
    evidenceNeeded: [
      copy("top_up_requests rows", "แถว top_up_requests"),
      copy("payment_slips row/object", "แถว/ไฟล์ payment_slips"),
      copy("wallet_accounts before/after", "wallet_accounts ก่อน/หลัง"),
      copy("coin_ledger idempotency proof", "หลักฐาน coin_ledger ว่าไม่เติมซ้ำ"),
    ],
    externalGate: copy(
      "Positive approval/reject testing requires migrated staging DB and admin login.",
      "การทดสอบอนุมัติ/ปฏิเสธจริงต้องมี staging DB ที่ migrate แล้วและล็อกอินแอดมิน",
    ),
    docPath: "docs/plans/production-phases/phase-4-wallet-payment-admin-qa.md",
  },
  {
    phase: 5,
    title: copy("Gacha + Collection + Exchange + Shipping QA", "QA เปิดแพ็ก, คอลเลกชัน, แลกเหรียญ และจัดส่ง"),
    shortGoal: copy(
      "Prove full customer operations from pack open to collection, exchange, shipping, and admin processing.",
      "พิสูจน์ flow ลูกค้าตั้งแต่เปิดแพ็กถึงคอลเลกชัน แลกเหรียญ จัดส่ง และงานแอดมิน",
    ),
    localhostStatus: "local-ready",
    ownerCanTest: [
      copy("Open pack detail/open pages and inspect customer flow.", "เปิดหน้ารายละเอียด/เปิดแพ็กและตรวจ flow ลูกค้า"),
      copy("Open Collection, Exchange, Shipping, Ranking pages.", "เปิดหน้า Collection, Exchange, Shipping, Ranking"),
      copy(
        "Open admin Campaigns/Prizes/Exchange/Shipping pages to inspect operation surfaces.",
        "เปิดหน้าแอดมิน Campaigns/Prizes/Exchange/Shipping เพื่อตรวจพื้นที่ทำงาน",
      ),
    ],
    localhostLinks: [
      { label: copy("Mystery packs", "Y-Packs"), href: "/" },
      { label: copy("Campaign admin", "แอดมินแคมเปญ"), href: "/admin/campaigns" },
      { label: copy("Collection", "คอลเลกชัน"), href: "/collection" },
      { label: copy("Exchange", "แลกเหรียญ"), href: "/exchange" },
      { label: copy("Shipping", "จัดส่ง"), href: "/shipping" },
      { label: copy("Admin campaigns", "แคมเปญแอดมิน"), href: "/admin/campaigns" },
      { label: copy("Admin prizes", "รางวัลแอดมิน"), href: "/admin/prizes" },
    ],
    evidenceNeeded: [
      copy("gacha_opens/items", "gacha_opens/items"),
      copy("collection_items", "collection_items"),
      copy("exchange_orders/items", "exchange_orders/items"),
      copy("shipping_requests/items", "shipping_requests/items"),
      copy("audit events", "audit events"),
    ],
    externalGate: copy(
      "Positive mutation reconciliation requires migrated staging DB, wallet balance, and admin login.",
      "การ reconcile mutation จริงต้องมี staging DB ที่ migrate แล้ว ยอดเหรียญ และล็อกอินแอดมิน",
    ),
    docPath: "docs/plans/production-phases/phase-5-gacha-collection-exchange-shipping-qa.md",
  },
  {
    phase: 6,
    title: copy("Production Preflight", "ตรวจความพร้อมก่อนโปรดักชัน"),
    shortGoal: copy(
      "Run final backup/env/provider/migration/deploy checks before controlled production smoke.",
      "ตรวจ backup/env/provider/migration/deploy รอบสุดท้ายก่อน smoke โปรดักชันแบบควบคุม",
    ),
    localhostStatus: "external-gated",
    ownerCanTest: [
      copy(
        "Use localhost route/build checks as release-candidate confidence only.",
        "ใช้ route/build checks บน localhost เป็นความมั่นใจของ release candidate เท่านั้น",
      ),
      copy(
        "Review the preflight doc and verify every go/no-go line is understandable.",
        "อ่านเอกสาร preflight และยืนยันว่า go/no-go ทุกข้อเข้าใจง่าย",
      ),
    ],
    localhostLinks: [
      { label: copy("Home smoke", "Smoke หน้าแรก"), href: "/" },
      { label: copy("Wallet smoke", "Smoke กระเป๋าเหรียญ"), href: "/wallet" },
      { label: copy("Admin smoke", "Smoke แอดมิน"), href: "/admin" },
    ],
    evidenceNeeded: [
      copy("Fresh backup", "แบ็กอัพล่าสุด"),
      copy("Production env/provider matrix", "ตาราง env/provider โปรดักชัน"),
      copy("Migration output", "ผลลัพธ์ migration"),
      copy("RLS/RPC/schema checks", "ผลตรวจ RLS/RPC/schema"),
      copy("Vercel deployment ID", "Vercel deployment ID"),
    ],
    externalGate: copy(
      "Requires owner go/no-go, production Supabase SQL access, provider dashboards, and Vercel deploy authority.",
      "ต้องมี owner go/no-go, สิทธิ์ Supabase SQL โปรดักชัน, provider dashboards และสิทธิ์ deploy",
    ),
    docPath: "docs/plans/production-phases/phase-6-production-preflight.md",
  },
  {
    phase: 7,
    title: copy("Production Smoke + Limited Pilot", "Smoke โปรดักชันและ Pilot จำกัดวง"),
    shortGoal: copy(
      "Run one narrow internal production pilot and produce go/no-go evidence before public launch.",
      "รัน pilot โปรดักชันภายในวงเล็กและทำหลักฐาน go/no-go ก่อนเปิดสาธารณะ",
    ),
    localhostStatus: "pilot-gated",
    ownerCanTest: [
      copy(
        "Use localhost to rehearse the exact pilot path: login, wallet, pack, collection, exchange, shipping, admin.",
        "ใช้ localhost ซ้อมเส้นทาง pilot จริง: login, wallet, pack, collection, exchange, shipping, admin",
      ),
      copy(
        "Review which parts still need real production row/log evidence.",
        "ทบทวนส่วนที่ยังต้องใช้หลักฐาน row/log จากโปรดักชันจริง",
      ),
    ],
    localhostLinks: [
      { label: copy("Login", "เข้าสู่ระบบ"), href: "/login" },
      { label: copy("Wallet", "กระเป๋าเหรียญ"), href: "/wallet" },
      { label: copy("Mystery packs", "Y-Packs"), href: "/" },
      { label: copy("Collection", "คอลเลกชัน"), href: "/collection" },
      { label: copy("Shipping", "จัดส่ง"), href: "/shipping" },
    ],
    evidenceNeeded: [
      copy("Production route smoke", "Smoke route โปรดักชัน"),
      copy("Pilot login success", "ล็อกอิน pilot สำเร็จ"),
      copy("Ledger/gacha/exchange/shipping row IDs", "row IDs ของ ledger/gacha/exchange/shipping"),
      copy("Log review", "ตรวจ log"),
      copy("GO/NO-GO decision", "การตัดสินใจ GO/NO-GO"),
    ],
    externalGate: copy(
      "Requires completed Phase 6 and intentionally limited production pilot scope.",
      "ต้องทำ Phase 6 เสร็จและจำกัดขอบเขต pilot โปรดักชันอย่างตั้งใจ",
    ),
    docPath: "docs/plans/production-phases/phase-7-production-smoke-limited-pilot.md",
  },
];

export const adminContentStudioLocalSummary = {
  current: [
    copy(
      "Admin campaign/card/prize/payment/user/exchange/shipping pages exist and are server-gated.",
      "หน้าแอดมิน campaign/card/prize/payment/user/exchange/shipping มีแล้วและถูก gate ฝั่ง server",
    ),
    copy(
      "Storefront home now shows only Pokemon and One Piece as requested.",
      "หน้าแรก storefront แสดงเฉพาะ Pokemon และ One Piece ตามที่ขอ",
    ),
    copy(
      "Dynamic category/media CMS is planned but not applied to production yet.",
      "Dynamic category/media CMS อยู่ในแผน แต่ยังไม่ได้ใช้กับโปรดักชัน",
    ),
  ],
  future: [
    copy(
      "Add store_categories and media_assets in a staged migration after backup/staging gates.",
      "เพิ่ม store_categories และ media_assets ด้วย staged migration หลังผ่าน backup/staging gates",
    ),
    copy(
      "Enhance admin to create categories, upload/select images, draft/preview/publish packs, and audit content changes.",
      "เพิ่มความสามารถให้แอดมินสร้างหมวดหมู่ อัปโหลด/เลือกรูป draft/preview/publish pack และ audit การแก้ content",
    ),
    copy(
      "Keep finance/admin operations separate from future content-editor permissions if role split is needed.",
      "แยกงานการเงิน/แอดมินออกจากสิทธิ์ content editor ในอนาคตถ้าต้องแบ่ง role",
    ),
  ],
  docPath: "docs/plans/admin-content-studio-future-proofing.md",
};
