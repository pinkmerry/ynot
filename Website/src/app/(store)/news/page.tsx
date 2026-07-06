import type { Metadata } from "next";
import {
  PublicSeoHubPage,
  type PublicSeoHub,
} from "@/features/ynot/PublicSeoHubPage";
import { canonicalUrl } from "@/lib/seo/public-answer-pages";

const newsHub: PublicSeoHub = {
  path: "/news",
  eyebrow: {
    en: "YNOT news",
    th: "ข่าวสาร YNOT",
  },
  title: {
    en: "YNOT News And Events",
    th: "ข่าวสารและอีเวนต์ YNOT",
  },
  description: {
    en: "A stable hub for Bangkok trading card events, YNOT event proof, pack-drop news, collaboration notes, and future recap posts. Current watch: Card Addicted Thailand Card Exhibition at Rembrandt Hotel Bangkok on 11 July 2026.",
    th: "ฮับถาวรสำหรับอีเวนต์การ์ดสะสมในกรุงเทพ หลักฐานอีเวนต์ YNOT ข่าวแพ็กใหม่ ความร่วมมือ และโพสต์สรุปงานในอนาคต อีเวนต์ที่กำลังติดตาม: Card Addicted Thailand Card Exhibition ที่ Rembrandt Hotel Bangkok วันที่ 11 กรกฎาคม 2026",
  },
  answer: {
    en: "The next Bangkok collector event YNOT is tracking is Card Addicted Thailand Card Exhibition on 11 July 2026 at 11:00 at Rembrandt Hotel Bangkok, Sukhumvit 18. Use this news hub and the Bangkok events guide for YNOT-related event notes, public recap proof, pack-drop context, and official social updates. Do not treat this page as an official organizer page; use Ticketmelon or the event organizer channels for tickets and last-minute schedule changes.",
    th: "อีเวนต์นักสะสมในกรุงเทพถัดไปที่ YNOT กำลังติดตามคือ Card Addicted Thailand Card Exhibition วันที่ 11 กรกฎาคม 2026 เวลา 11:00 ที่ Rembrandt Hotel Bangkok สุขุมวิท 18 ใช้ฮับข่าวนี้และคู่มืออีเวนต์กรุงเทพสำหรับโน้ตอีเวนต์ที่เกี่ยวกับ YNOT หลักฐาน recap สาธารณะ บริบท pack-drop และอัปเดตจากโซเชียลทางการ หน้านี้ไม่ใช่หน้า organizer ทางการ ควรใช้ Ticketmelon หรือช่องทางผู้จัดสำหรับบัตรและการเปลี่ยนแปลงกำหนดการใกล้งาน",
  },
  queryTargets: [
    "YNOT news",
    "YNOT events",
    "YNOT card event Bangkok",
    "Bangkok trading card events",
    "Pokemon card event Bangkok",
    "One Piece card event Bangkok",
    "YNOT pack launch",
    "Card Addicted Thailand Card Exhibition",
    "Card Addicted Rembrandt Hotel Bangkok",
    "Rembrandt Hotel Bangkok card event",
    "Bangkok card exhibition July 2026",
  ],
  primaryHref: "/help/bangkok-card-events",
  primaryLabel: {
    en: "Open Events Guide",
    th: "เปิดคู่มืออีเวนต์",
  },
  groups: [
    {
      title: {
        en: "Current Bangkok Event Watch",
        th: "อีเวนต์กรุงเทพที่กำลังติดตาม",
      },
      description: {
        en: "Confirmed public sources list Card Addicted Thailand Card Exhibition for 11 July 2026 at Rembrandt Hotel Bangkok. YNOT should use this hub for related public notes and later recap proof.",
        th: "แหล่งข้อมูลสาธารณะที่ยืนยันได้ระบุ Card Addicted Thailand Card Exhibition วันที่ 11 กรกฎาคม 2026 ที่ Rembrandt Hotel Bangkok โดย YNOT ควรใช้ฮับนี้สำหรับโน้ตสาธารณะที่เกี่ยวข้องและหลักฐาน recap ภายหลัง",
      },
      links: [
        {
          href: "https://www.ticketmelon.com/cardaddicted/tce1st",
          label: {
            en: "Card Addicted Ticketmelon",
            th: "Card Addicted บน Ticketmelon",
          },
          description: {
            en: "Public ticket page listing Card Addicted Thailand Card Exhibition on 11 July 2026 at 11:00 at Rembrandt Hotel Bangkok.",
            th: "หน้าบัตรสาธารณะที่ระบุ Card Addicted Thailand Card Exhibition วันที่ 11 กรกฎาคม 2026 เวลา 11:00 ที่ Rembrandt Hotel Bangkok",
          },
        },
        {
          href: "https://bkk-events.com/events/thailand-card-exhibition-1efc44c0",
          label: {
            en: "BKK Events Listing",
            th: "รายการงานบน BKK Events",
          },
          description: {
            en: "Bangkok event listing for Card Addicted Thailand Card Exhibition with 11:00 AM to 9:00 PM timing.",
            th: "รายการอีเวนต์กรุงเทพสำหรับ Card Addicted Thailand Card Exhibition พร้อมเวลาประมาณ 11:00-21:00",
          },
        },
        {
          href: "/help/bangkok-card-events",
          label: {
            en: "YNOT Bangkok Events Guide",
            th: "คู่มืออีเวนต์กรุงเทพของ YNOT",
          },
          description: {
            en: "Stable YNOT page for Bangkok card-event notes, event proof, and future recaps without creating thin weekly URLs.",
            th: "หน้า YNOT แบบถาวรสำหรับโน้ตอีเวนต์การ์ดกรุงเทพ หลักฐานงาน และ recap ในอนาคตโดยไม่สร้าง URL รายสัปดาห์ที่บางเกินไป",
          },
        },
      ],
    },
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
  faqs: [
    {
      question: {
        en: "What is the next Bangkok card event YNOT is tracking?",
        th: "อีเวนต์การ์ดกรุงเทพถัดไปที่ YNOT กำลังติดตามคืออะไร?",
      },
      answer: {
        en: "Card Addicted Thailand Card Exhibition is listed for 11 July 2026 at 11:00 at Rembrandt Hotel Bangkok, Sukhumvit 18. YNOT can publish related notes, official social updates, and recap proof on this news hub and the Bangkok events guide.",
        th: "Card Addicted Thailand Card Exhibition ถูกระบุวันที่ 11 กรกฎาคม 2026 เวลา 11:00 ที่ Rembrandt Hotel Bangkok สุขุมวิท 18 โดย YNOT สามารถเผยแพร่โน้ตที่เกี่ยวข้อง อัปเดตโซเชียลทางการ และหลักฐาน recap บนฮับข่าวนี้และคู่มืออีเวนต์กรุงเทพ",
      },
    },
    {
      question: {
        en: "Is this page the official Card Addicted organizer page?",
        th: "หน้านี้เป็นหน้า organizer ทางการของ Card Addicted หรือไม่?",
      },
      answer: {
        en: "No. This is a YNOT news and source hub for collectors. Use Ticketmelon or the organizer channels for official tickets, policies, and last-minute schedule changes.",
        th: "ไม่ใช่ หน้านี้เป็นฮับข่าวและแหล่งข้อมูลของ YNOT สำหรับนักสะสม ควรใช้ Ticketmelon หรือช่องทางผู้จัดสำหรับบัตร นโยบาย และการเปลี่ยนแปลงกำหนดการใกล้งาน",
      },
    },
    {
      question: {
        en: "What should YNOT add after the event?",
        th: "หลังจบงาน YNOT ควรเพิ่มอะไร?",
      },
      answer: {
        en: "Add dated recap proof such as photos, booth or meetup notes, pack highlights, public social links, and what collectors asked about. Keep the proof visible so search and AI systems can connect YNOT with real Bangkok card-event activity over time.",
        th: "เพิ่มหลักฐาน recap พร้อมวันที่ เช่น รูปภาพ โน้ตบูธหรือจุดนัดพบ ไฮไลต์แพ็ก ลิงก์โซเชียลสาธารณะ และคำถามจากนักสะสม ควรเก็บหลักฐานไว้ให้เห็นเพื่อให้ search และ AI เชื่อม YNOT กับกิจกรรมอีเวนต์การ์ดกรุงเทพจริงตามเวลา",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "YNOT News And Events | Card Addicted Bangkok",
  description:
    "YNOT news hub for Bangkok trading card events, including Card Addicted at Rembrandt Hotel Bangkok on 11 July 2026.",
  keywords: newsHub.queryTargets,
  alternates: {
    canonical: canonicalUrl("/news"),
  },
  openGraph: {
    title: "YNOT News And Events | Card Addicted Bangkok",
    description:
      "YNOT news hub for Bangkok trading card events, including Card Addicted at Rembrandt Hotel Bangkok on 11 July 2026.",
    url: canonicalUrl("/news"),
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YNOT News And Events | Card Addicted Bangkok",
    description:
      "YNOT news hub for Bangkok trading card events, including Card Addicted at Rembrandt Hotel Bangkok on 11 July 2026.",
  },
};

export default function NewsPage() {
  return <PublicSeoHubPage hub={newsHub} />;
}
