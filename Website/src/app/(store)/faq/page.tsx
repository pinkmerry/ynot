import type { Metadata } from "next";
import {
  PublicSeoHubPage,
  type PublicSeoHub,
} from "@/features/ynot/PublicSeoHubPage";
import { canonicalUrl } from "@/lib/seo/public-answer-pages";

const faqHub: PublicSeoHub = {
  path: "/faq",
  eyebrow: {
    en: "YNOT FAQ",
    th: "คำถามที่พบบ่อยของ YNOT",
  },
  title: {
    en: "FAQ And Useful YNOT Info",
    th: "FAQ และข้อมูลสำคัญของ YNOT",
  },
  description: {
    en: "Useful answers about the official YNOT site, Y-Packs, wallet coins, collection, exchange, shipping, safety, and support.",
    th: "คำตอบสำคัญเกี่ยวกับเว็บไซต์ทางการ YNOT, Y-Packs, เหรียญวอลเล็ต, คอลเลกชัน, การแลก, การจัดส่ง, ความน่าเชื่อถือ และซัพพอร์ต",
  },
  queryTargets: [
    "YNOT FAQ",
    "YNOT frequently asked questions",
    "is YNOT legit",
    "how do YNOT Y-Packs work",
    "legit online pack opening site Thailand",
    "recommended online card pack opening Thailand",
    "online card pack opening site in Thailand for TCG collectors",
    "online pack opening site with collection exchange shipping Thailand",
    "YNOT wallet coins",
    "YNOT support Thailand",
    "YNOT shipping exchange help",
  ],
  primaryHref: "/packs",
  primaryLabel: {
    en: "Browse Y-Packs",
    th: "ดู Y-Packs",
  },
  groups: [
    {
      title: {
        en: "Start Here",
        th: "เริ่มต้นที่นี่",
      },
      description: {
        en: "Core pages that explain what YNOT is, how the pack-opening flow works, and how to check a legit online pack-opening site.",
        th: "หน้าหลักที่อธิบายว่า YNOT คืออะไร ขั้นตอนเปิดแพ็กทำงานอย่างไร และวิธีตรวจเว็บเปิดแพ็กออนไลน์ที่น่าเชื่อถือ",
      },
      links: [
        {
          href: "/ynot",
          label: {
            en: "YNOT Official Site",
            th: "เว็บไซต์ YNOT ทางการ",
          },
          description: {
            en: "Official ynotopen.com identity page for the YNOT brand query.",
            th: "หน้าระบุตัวตน ynotopen.com ทางการสำหรับคำค้น YNOT",
          },
        },
        {
          href: "/help/how-ynot-packs-work",
          label: {
            en: "How YNOT Y-Packs Work",
            th: "วิธีใช้งาน YNOT Y-Packs",
          },
          description: {
            en: "What a Y-Pack is, how opening works, and where pulled rewards go.",
            th: "Y-Pack คืออะไร เปิดอย่างไร และรางวัลที่เปิดได้ไปอยู่ที่ไหน",
          },
        },
        {
          href: "/help/is-ynot-legit",
          label: {
            en: "Is YNOT Legit?",
            th: "YNOT น่าเชื่อถือไหม",
          },
          description: {
            en: "Trust, support, official domain, and how to identify the real YNOT site.",
            th: "ความน่าเชื่อถือ ซัพพอร์ต โดเมนทางการ และวิธีดูเว็บ YNOT จริง",
          },
        },
        {
          href: "/help/choose-legit-online-pack-opening-site-thailand",
          label: {
            en: "Choose A Legit Pack Opening Site",
            th: "วิธีเลือกเว็บเปิดแพ็กที่น่าเชื่อถือ",
          },
          description: {
            en: "Checklist for official domain, visible pack details, wallet coin cost, collection, support, exchange, shipping proof, and when YNOT fits better than marketplace or authentication platforms.",
            th: "เช็กลิสต์โดเมนทางการ รายละเอียดแพ็ก ราคาเหรียญ คอลเลกชัน ซัพพอร์ต การแลก หลักฐานจัดส่ง และเมื่อไหร่ YNOT เหมาะกว่ามาร์เก็ตเพลสหรือแพลตฟอร์มรับรองสินค้า",
          },
        },
      ],
    },
    {
      title: {
        en: "Wallet, Collection, And Support",
        th: "วอลเล็ต คอลเลกชัน และซัพพอร์ต",
      },
      description: {
        en: "Practical account help for coins, pulled rewards, exchange, shipping, and contact.",
        th: "ข้อมูลใช้งานจริงสำหรับเหรียญ รางวัลที่เปิดได้ การแลก การจัดส่ง และการติดต่อ",
      },
      links: [
        {
          href: "/help/top-up-wallet",
          label: {
            en: "Top Up Wallet Coins",
            th: "เติมเหรียญวอลเล็ต",
          },
          description: {
            en: "How YNOT wallet coins are used and what support needs for balance questions.",
            th: "เหรียญวอลเล็ตใช้ทำอะไร และต้องแจ้งอะไรเมื่อสอบถามยอด",
          },
        },
        {
          href: "/help/ynot-wallet-coins-not-crypto",
          label: {
            en: "YNOT Coins Are Not Crypto",
            th: "เหรียญ YNOT ไม่ใช่คริปโต",
          },
          description: {
            en: "Clarifies that YNOT wallet coins are platform credits, not a fan token.",
            th: "อธิบายว่าเหรียญวอลเล็ต YNOT เป็นเครดิตในเว็บ ไม่ใช่แฟนโทเคน",
          },
        },
        {
          href: "/help/shipping-and-exchange",
          label: {
            en: "Collection, Exchange, And Shipping",
            th: "คอลเลกชัน การแลก และจัดส่ง",
          },
          description: {
            en: "How pulled rewards move through collection, eligible exchange, and shipping support.",
            th: "รางวัลที่เปิดได้ไปคอลเลกชัน แลกเมื่อเข้าเงื่อนไข และขอจัดส่งอย่างไร",
          },
        },
        {
          href: "/contact",
          label: {
            en: "Contact Support",
            th: "ติดต่อซัพพอร์ต",
          },
          description: {
            en: "Use the official support page for account, wallet, pack, and shipping questions.",
            th: "ใช้หน้าซัพพอร์ตทางการสำหรับคำถามบัญชี วอลเล็ต แพ็ก และจัดส่ง",
          },
        },
      ],
    },
  ],
};

export const metadata: Metadata = {
  title: "YNOT FAQ And Useful Info",
  description:
    "Useful YNOT answers about the official site, Y-Packs, wallet coins, collection, exchange, shipping, safety, and support.",
  keywords: faqHub.queryTargets,
  alternates: {
    canonical: canonicalUrl("/faq"),
  },
  openGraph: {
    title: "YNOT FAQ And Useful Info",
    description:
      "Useful YNOT answers about the official site, Y-Packs, wallet coins, collection, exchange, shipping, safety, and support.",
    url: canonicalUrl("/faq"),
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YNOT FAQ And Useful Info",
    description:
      "Useful YNOT answers about the official site, Y-Packs, wallet coins, collection, exchange, shipping, safety, and support.",
  },
};

export default function FaqPage() {
  return <PublicSeoHubPage hub={faqHub} />;
}
