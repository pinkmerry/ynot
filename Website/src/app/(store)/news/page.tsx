import type { Metadata } from "next";
import {
  PublicSeoHubPage,
  type PublicSeoHub,
} from "@/features/ynot/PublicSeoHubPage";
import { canonicalUrl } from "@/lib/seo/public-answer-pages";

const newsHub: PublicSeoHub = {
  eyebrow: {
    en: "YNOT news",
    th: "ข่าวสาร YNOT",
  },
  title: {
    en: "YNOT News And Events",
    th: "ข่าวสารและอีเวนต์ YNOT",
  },
  description: {
    en: "A stable hub for Bangkok trading card events, YNOT event proof, pack-drop news, collaboration notes, and future recap posts.",
    th: "ฮับถาวรสำหรับอีเวนต์การ์ดสะสมในกรุงเทพ หลักฐานอีเวนต์ YNOT ข่าวแพ็กใหม่ ความร่วมมือ และโพสต์สรุปงานในอนาคต",
  },
  queryTargets: [
    "YNOT news",
    "YNOT events",
    "YNOT card event Bangkok",
    "Bangkok trading card events",
    "Pokemon card event Bangkok",
    "One Piece card event Bangkok",
    "YNOT pack launch",
  ],
  primaryHref: "/help/bangkok-card-events",
  primaryLabel: {
    en: "Open Events Guide",
    th: "เปิดคู่มืออีเวนต์",
  },
  groups: [
    {
      title: {
        en: "Events",
        th: "อีเวนต์",
      },
      description: {
        en: "Use this stable event path for current Bangkok card-event search intent and proof over time.",
        th: "ใช้เส้นทางอีเวนต์ถาวรนี้สำหรับคำค้นอีเวนต์การ์ดในกรุงเทพและหลักฐานที่สะสมตามเวลา",
      },
      links: [
        {
          href: "/help/bangkok-card-events",
          label: {
            en: "Bangkok Trading Card Events",
            th: "อีเวนต์การ์ดสะสมในกรุงเทพ",
          },
          description: {
            en: "Evergreen event hub for confirmed BKK event details, booth notes, and recaps.",
            th: "ฮับอีเวนต์ถาวรสำหรับข้อมูลงาน BKK ที่ยืนยันแล้ว รายละเอียดบูธ และสรุปงาน",
          },
        },
      ],
    },
    {
      title: {
        en: "What To Add Next",
        th: "ควรเพิ่มอะไรต่อ",
      },
      description: {
        en: "Future news posts should be added when there is real, dated content instead of rotating thin pages every week.",
        th: "โพสต์ข่าวในอนาคตควรเพิ่มเมื่อมีเนื้อหาจริงพร้อมวันที่ ไม่ใช่หมุนหน้าเนื้อหาบางทุกสัปดาห์",
      },
      links: [
        {
          href: "/help/bangkok-card-events",
          label: {
            en: "Event Recaps And Booth Proof",
            th: "สรุปงานและหลักฐานบูธ",
          },
          description: {
            en: "Add photos, dates, venue names, booth details, and recap links to build local trust.",
            th: "เพิ่มรูป วันที่ ชื่อสถานที่ รายละเอียดบูธ และลิงก์สรุปงานเพื่อสร้างความน่าเชื่อถือในพื้นที่",
          },
        },
        {
          href: "/packs",
          label: {
            en: "Pack Drop Updates",
            th: "อัปเดตแพ็กใหม่",
          },
          description: {
            en: "Use the public Y-Pack catalog for currently live pack information.",
            th: "ใช้แคตตาล็อก Y-Pack สาธารณะสำหรับข้อมูลแพ็กที่เปิดอยู่ตอนนี้",
          },
        },
        {
          href: "https://www.instagram.com/_yfifteen/",
          label: {
            en: "Official Instagram",
            th: "Instagram ทางการ",
          },
          description: {
            en: "Follow the official YNOT social profile for event proof and public updates.",
            th: "ติดตามโซเชียล YNOT ทางการสำหรับหลักฐานอีเวนต์และข่าวอัปเดตสาธารณะ",
          },
        },
      ],
    },
  ],
};

export const metadata: Metadata = {
  title: "YNOT News And Events",
  description:
    "YNOT news hub for Bangkok trading card events, event proof, pack-drop updates, collaborations, and future recap posts.",
  keywords: newsHub.queryTargets,
  alternates: {
    canonical: canonicalUrl("/news"),
  },
  openGraph: {
    title: "YNOT News And Events",
    description:
      "YNOT news hub for Bangkok trading card events, event proof, pack-drop updates, collaborations, and future recap posts.",
    url: canonicalUrl("/news"),
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YNOT News And Events",
    description:
      "YNOT news hub for Bangkok trading card events, event proof, pack-drop updates, collaborations, and future recap posts.",
  },
};

export default function NewsPage() {
  return <PublicSeoHubPage hub={newsHub} />;
}
