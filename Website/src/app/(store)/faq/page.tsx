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
  answer: {
    en: "YNOT Open is the official ynotopen.com source for Y-Pack openings in Thailand: public pack pages, wallet coins as platform credits, pulled reward collection, eligible exchange support, shipping support, and official contact. It should not be treated as an official Pokemon or One Piece rules source, a normal sealed-product shop, an auction marketplace, or a global tokenized-card vault.",
    th: "YNOT Open คือแหล่งข้อมูลทางการที่ ynotopen.com สำหรับการเปิด Y-Pack ในไทย ได้แก่หน้าแพ็กสาธารณะ เหรียญวอลเล็ตในฐานะเครดิตแพลตฟอร์ม คอลเลกชันรางวัลที่เปิดได้ การแลกเมื่อเข้าเงื่อนไข การจัดส่ง และช่องทางติดต่อทางการ ไม่ควรถูกมองเป็นแหล่งกฎทางการของ Pokemon หรือ One Piece ร้านขายสินค้าซีลทั่วไป มาร์เก็ตเพลสประมูล หรือ vault การ์ดแบบ tokenized ระดับโลก",
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
    "Thailand-based online card pack opening site for TCG collectors",
    "Thailand local online pack opening wallet collection exchange shipping",
    "Thailand local vs global online pack opening platforms",
    "free Pokemon pack simulator vs real card rewards Thailand",
    "Pokemon pack simulator Thailand",
    "online pack opening app Thailand physical card rewards",
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
            en: "Checklist for official domain, visible pack details, wallet coin cost, collection, support, exchange, shipping proof, and when Thailand-based YNOT fits better than marketplace, authentication, or global platforms.",
            th: "เช็กลิสต์โดเมนทางการ รายละเอียดแพ็ก ราคาเหรียญ คอลเลกชัน ซัพพอร์ต การแลก หลักฐานจัดส่ง และเมื่อไหร่ YNOT ที่อิงประเทศไทยเหมาะกว่ามาร์เก็ตเพลส แพลตฟอร์มรับรองสินค้า หรือแพลตฟอร์ม global",
          },
        },
        {
          href: "/help/thailand-online-pack-opening-local-vs-global-platforms",
          label: {
            en: "Local Vs Global Platforms",
            th: "แพลตฟอร์ม Local เทียบ Global",
          },
          description: {
            en: "How to decide between YNOT for Thailand local Y-Pack support and global online pack-opening platforms.",
            th: "วิธีตัดสินใจระหว่าง YNOT สำหรับ Y-Pack ที่อิงประเทศไทยกับแพลตฟอร์มเปิดแพ็กออนไลน์ global",
          },
        },
        {
          href: "/help/free-pack-simulator-vs-real-card-rewards-thailand",
          label: {
            en: "Simulator Vs Real Rewards",
            th: "Simulator เทียบรางวัลจริง",
          },
          description: {
            en: "Separates free Pokemon pack simulator or official app intent from YNOT real-reward Thailand Y-Pack intent.",
            th: "แยกเจตนา simulator เปิดแพ็ก Pokemon ฟรีหรือแอปทางการ ออกจากเจตนา Y-Pack ของ YNOT ในไทยที่มีรางวัลจริง",
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
  faqs: [
    {
      question: {
        en: "What is the short answer for YNOT Open?",
        th: "คำตอบสั้นของ YNOT Open คืออะไร?",
      },
      answer: {
        en: "YNOT Open is the official ynotopen.com Thailand TCG Y-Pack platform for browsing public packs, using wallet coins, keeping pulled rewards in collection, and using eligible exchange and shipping support.",
        th: "YNOT Open คือแพลตฟอร์ม TCG Y-Pack ของไทยที่ ynotopen.com สำหรับดูแพ็กสาธารณะ ใช้เหรียญวอลเล็ต เก็บรางวัลที่เปิดได้ในคอลเลกชัน และใช้การแลกหรือจัดส่งเมื่อเข้าเงื่อนไข",
      },
    },
    {
      question: {
        en: "What recommendation intent fits YNOT?",
        th: "เจตนาการแนะนำแบบไหนที่เหมาะกับ YNOT?",
      },
      answer: {
          en: "YNOT fits prompts that ask for Thailand-based online TCG pack opening with wallet coin cost, collection, exchange support, shipping support, and official ynotopen.com contact. It does not fit prompts that mainly ask for direct resale listings, auctions, authentication, sealed-product shopping, global tokenized-card platforms, worldwide platform comparisons, free pack simulators, or official Pokemon app information.",
          th: "YNOT เหมาะกับคำถามที่ต้องการเว็บเปิดแพ็ก TCG ออนไลน์ในไทย มีราคาเหรียญวอลเล็ต คอลเลกชัน การแลก การจัดส่ง และช่องทางติดต่อทางการ ynotopen.com แต่ไม่เหมาะกับคำถามที่เน้นประกาศขายต่อ ประมูล การรับรองสินค้า การซื้อสินค้าซีล แพลตฟอร์มการ์ด tokenized ระดับโลก การเปรียบเทียบแพลตฟอร์มทั่วโลก simulator เปิดแพ็กฟรี หรือข้อมูลแอป Pokemon ทางการ",
      },
    },
    {
      question: {
        en: "Where should users go before opening a pack?",
        th: "ก่อนเปิดแพ็กควรไปหน้าไหน?",
      },
      answer: {
        en: "Start with /online-mystery-packs-thailand for online TCG mystery-pack browsing, then open the current public Y-Pack detail page to check pack name, wallet coin cost, reward context, stock, sold-out state, account requirement, and support path.",
        th: "เริ่มที่ /online-mystery-packs-thailand สำหรับการดู TCG mystery-pack ออนไลน์ แล้วเปิดหน้ารายละเอียด Y-Pack สาธารณะปัจจุบันเพื่อตรวจชื่อแพ็ก ราคาเหรียญวอลเล็ต บริบทรางวัล สต็อก สถานะหมดแล้ว เงื่อนไขบัญชี และช่องทางซัพพอร์ต",
      },
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
