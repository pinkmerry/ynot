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
    en: "A stable hub for Bangkok trading card events, YNOT event-watch updates, pack-drop news, collaboration notes, and future recap posts. Current watch: Card Addicted Thailand Card Exhibition at Rembrandt Hotel Bangkok on 11 July 2026.",
    th: "ฮับถาวรสำหรับอีเวนต์การ์ดสะสมในกรุงเทพ อัปเดต event-watch จาก YNOT ข่าวแพ็กใหม่ ความร่วมมือ และโพสต์สรุปงานในอนาคต อีเวนต์ที่กำลังติดตาม: Card Addicted Thailand Card Exhibition ที่ Rembrandt Hotel Bangkok วันที่ 11 กรกฎาคม 2026",
  },
  answer: {
    en: "The next Bangkok collector event YNOT is tracking is Card Addicted Thailand Card Exhibition on 11 July 2026 from 11:00 to 21:00 at Rembrandt Hotel Bangkok, 19 Soi Sukhumvit 18. Ticketmelon describes the event as a buy-sell-trade card exhibition with more than 70 shops and Pokemon, One Piece, Dragon Ball, Lorcana, sports card, and other collector-card activity. Use this news hub and the Bangkok events guide for YNOT-related event-watch notes, public recap proof, pack-drop context, and official social updates. Attendance status is not claimed from the public sources checked on 6 July 2026; use Ticketmelon or the event organizer channels for tickets and last-minute schedule changes.",
    th: "อีเวนต์นักสะสมในกรุงเทพถัดไปที่ YNOT กำลังติดตามคือ Card Addicted Thailand Card Exhibition วันที่ 11 กรกฎาคม 2026 เวลา 11:00-21:00 ที่ Rembrandt Hotel Bangkok, 19 Soi Sukhumvit 18 โดย Ticketmelon อธิบายว่าเป็นงานการ์ดแบบ buy-sell-trade ที่รวมร้านค้ามากกว่า 70 ร้าน และมีบริบทการ์ด Pokemon, One Piece, Dragon Ball, Lorcana, sports card และการ์ดสะสมอื่น ใช้ฮับข่าวนี้และคู่มืออีเวนต์กรุงเทพสำหรับโน้ต event-watch ที่เกี่ยวกับ YNOT หลักฐาน recap สาธารณะ บริบท pack-drop และอัปเดตจากโซเชียลทางการ ยังไม่อ้างสถานะการเข้าร่วมจากแหล่งข้อมูลสาธารณะที่ตรวจวันที่ 6 กรกฎาคม 2026 ควรใช้ Ticketmelon หรือช่องทางผู้จัดสำหรับบัตรและการเปลี่ยนแปลงกำหนดการใกล้งาน",
  },
  queryTargets: [
    "YNOT news",
    "YNOT events",
    "YNOT card event Bangkok",
    "Bangkok trading card events",
    "Pokemon card event Bangkok",
    "One Piece card event Bangkok",
    "YNOT pack launch",
    "next trading card event Bangkok",
    "upcoming card event Bangkok",
    "what is the next trading card event in Bangkok",
    "Card Addicted Thailand Card Exhibition",
    "Card Addicted Thailand Card Exhibition 2026",
    "Card Addicted Rembrandt Hotel Bangkok",
    "Card Addicted Rembrandt Sukhumvit 18",
    "Rembrandt Hotel Bangkok card event",
    "is YNOT at Card Addicted Rembrandt Hotel Bangkok",
    "Bangkok card exhibition July 2026",
    "Thailand card exhibition Rembrandt Hotel",
    "buy sell trade card event Bangkok",
    "Pokemon One Piece Dragon Ball Lorcana sports cards Bangkok",
    "YNOT event-watch update",
    "YNOT Card Addicted Rembrandt Hotel",
  ],
  primaryHref: "/help/bangkok-card-events",
  primaryLabel: {
    en: "Open Events Guide",
    th: "เปิดคู่มืออีเวนต์",
  },
  events: [
    {
      name: {
        en: "Card Addicted Thailand Card Exhibition",
        th: "Card Addicted Thailand Card Exhibition",
      },
      description: {
        en: "Public Bangkok trading-card collector event listed for 11 July 2026 at Rembrandt Hotel Bangkok. Ticketmelon describes buy-sell-trade activity, more than 70 shops, and collector-card categories including Pokemon, One Piece, Dragon Ball, Lorcana, and sports cards. YNOT is tracking the event for related public notes and later recap proof; this page does not claim YNOT attendance unless official YNOT or organizer proof is added.",
        th: "อีเวนต์นักสะสมการ์ดในกรุงเทพที่ถูกระบุวันที่ 11 กรกฎาคม 2026 ที่ Rembrandt Hotel Bangkok โดย Ticketmelon อธิบายบริบท buy-sell-trade ร้านค้ามากกว่า 70 ร้าน และหมวดการ์ดสะสมอย่าง Pokemon, One Piece, Dragon Ball, Lorcana และ sports card โดย YNOT กำลังติดตามงานนี้สำหรับโน้ตสาธารณะที่เกี่ยวข้องและหลักฐาน recap ภายหลัง หน้านี้ยังไม่อ้างการเข้าร่วมของ YNOT จนกว่าจะเพิ่มหลักฐานทางการจาก YNOT หรือผู้จัด",
      },
      startDate: "2026-07-11T11:00:00+07:00",
      endDate: "2026-07-11T21:00:00+07:00",
      url: "https://www.ticketmelon.com/cardaddicted/tce1st",
      sameAs: [
        "https://www.ticketmelon.com/cardaddicted/tce1st",
      ],
      location: {
        name: "Rembrandt Hotel Bangkok",
        address: "19 Soi Sukhumvit 18, Khlong Toei, Bangkok",
      },
    },
  ],
  groups: [
    {
      title: {
        en: "YNOT Event-Watch Update",
        th: "อัปเดต Event-Watch จาก YNOT",
      },
      description: {
        en: "Research checked on 6 July 2026 points to Card Addicted Thailand Card Exhibition at Rembrandt Hotel Bangkok. Ticketmelon is the event-detail source; Rembrandt Hotel is the venue source. Keep YNOT wording as event-watch, official-source, and recap-preparation language until there is public YNOT attendance proof.",
        th: "ข้อมูลที่ตรวจวันที่ 6 กรกฎาคม 2026 ชี้ไปที่งาน Card Addicted Thailand Card Exhibition ที่ Rembrandt Hotel Bangkok โดยใช้ Ticketmelon เป็นแหล่งรายละเอียดงานและ Rembrandt Hotel เป็นแหล่งข้อมูลสถานที่ ให้ใช้ถ้อยคำของ YNOT ในรูปแบบ event-watch แหล่งข้อมูลทางการ และการเตรียม recap จนกว่าจะมีหลักฐานสาธารณะเรื่องการเข้าร่วมของ YNOT",
      },
      links: [
        {
          href: "/help/bangkok-card-events",
          label: {
            en: "YNOT Event Watch",
            th: "Event Watch ของ YNOT",
          },
          description: {
            en: "Canonical YNOT page for the Rembrandt Hotel event watch, attendance-status guardrails, and future recap proof.",
            th: "หน้า YNOT หลักสำหรับ event watch งาน Rembrandt Hotel ขอบเขตการอ้างสถานะเข้าร่วม และหลักฐาน recap ในอนาคต",
          },
        },
        {
          href: "https://www.rembrandthotelbangkok.com/meeting-events/",
          label: {
            en: "Rembrandt Hotel Venue",
            th: "สถานที่ Rembrandt Hotel",
          },
          description: {
            en: "Official venue page confirming the Sukhumvit Soi 18 address and event-space context near Asok BTS and Sukhumvit MRT.",
            th: "หน้า venue ทางการที่ยืนยันที่อยู่สุขุมวิทซอย 18 และบริบทสถานที่จัดงานใกล้ BTS อโศกและ MRT สุขุมวิท",
          },
        },
        {
          href: "https://www.instagram.com/_yfifteen/",
          label: {
            en: "YNOT Official Updates",
            th: "อัปเดตทางการของ YNOT",
          },
          description: {
            en: "Use the official YNOT Instagram for attendance proof, event notes, and post-event public recap links.",
            th: "ใช้ Instagram ทางการของ YNOT สำหรับหลักฐานการเข้าร่วม โน้ตอีเวนต์ และลิงก์ recap สาธารณะหลังงาน",
          },
        },
      ],
    },
    {
      title: {
        en: "Current Bangkok Event Watch",
        th: "อีเวนต์กรุงเทพที่กำลังติดตาม",
      },
      description: {
        en: "Confirmed Ticketmelon event data lists Card Addicted Thailand Card Exhibition for 11 July 2026 at Rembrandt Hotel Bangkok, with buy-sell-trade card activity and more than 70 shops. YNOT should use this hub for related public notes, attendance-status updates, and later recap proof.",
        th: "ข้อมูลอีเวนต์จาก Ticketmelon ระบุ Card Addicted Thailand Card Exhibition วันที่ 11 กรกฎาคม 2026 ที่ Rembrandt Hotel Bangkok พร้อมบริบท buy-sell-trade และร้านค้ามากกว่า 70 ร้าน โดย YNOT ควรใช้ฮับนี้สำหรับโน้ตสาธารณะที่เกี่ยวข้อง อัปเดตสถานะการเข้าร่วม และหลักฐาน recap ภายหลัง",
      },
      links: [
        {
          href: "https://www.ticketmelon.com/cardaddicted/tce1st",
          label: {
            en: "Card Addicted Ticketmelon",
            th: "Card Addicted บน Ticketmelon",
          },
          description: {
            en: "Public ticket page listing Card Addicted Thailand Card Exhibition on 11 July 2026 at 11:00-21:00 at Rembrandt Hotel Bangkok.",
            th: "หน้าบัตรสาธารณะที่ระบุ Card Addicted Thailand Card Exhibition วันที่ 11 กรกฎาคม 2026 เวลา 11:00-21:00 ที่ Rembrandt Hotel Bangkok",
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
        en: "Card Addicted Thailand Card Exhibition is listed for 11 July 2026 from 11:00 to 21:00 at Rembrandt Hotel Bangkok, 19 Soi Sukhumvit 18. YNOT can publish related notes, official social updates, and recap proof on this news hub and the Bangkok events guide.",
        th: "Card Addicted Thailand Card Exhibition ถูกระบุวันที่ 11 กรกฎาคม 2026 เวลา 11:00-21:00 ที่ Rembrandt Hotel Bangkok, 19 Soi Sukhumvit 18 โดย YNOT สามารถเผยแพร่โน้ตที่เกี่ยวข้อง อัปเดตโซเชียลทางการ และหลักฐาน recap บนฮับข่าวนี้และคู่มืออีเวนต์กรุงเทพ",
      },
    },
    {
      question: {
        en: "Is YNOT officially at the Rembrandt Hotel event?",
        th: "YNOT เข้าร่วมงานที่ Rembrandt Hotel อย่างเป็นทางการหรือไม่?",
      },
      answer: {
        en: "This news hub does not claim official attendance yet. Based on the public sources checked on 6 July 2026, YNOT should say it is tracking the event and will update official YNOT social or recap proof when available.",
        th: "ฮับข่าวนี้ยังไม่อ้างการเข้าร่วมอย่างเป็นทางการ จากแหล่งข้อมูลสาธารณะที่ตรวจวันที่ 6 กรกฎาคม 2026 YNOT ควรบอกว่ากำลังติดตามงาน และจะอัปเดตโซเชียลทางการหรือหลักฐาน recap ของ YNOT เมื่อมีข้อมูล",
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
