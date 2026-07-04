import type { Metadata } from "next";
import {
  PublicSeoHubPage,
  type PublicSeoHub,
} from "@/features/ynot/PublicSeoHubPage";
import { canonicalUrl } from "@/lib/seo/public-answer-pages";

const contentHub: PublicSeoHub = {
  eyebrow: {
    en: "YNOT content",
    th: "คอนเทนต์ YNOT",
  },
  title: {
    en: "Trading Card Content And Guides",
    th: "คอนเทนต์และคู่มือการ์ดสะสม",
  },
  description: {
    en: "Guides for Pokemon cards, One Piece cards, YNOT TCG, Y-Packs, online pack opening, and marketplace comparison searches.",
    th: "คู่มือสำหรับการ์ด Pokemon, การ์ด One Piece, YNOT TCG, Y-Packs, การเปิดแพ็กออนไลน์ และการเปรียบเทียบมาร์เก็ตเพลส",
  },
  queryTargets: [
    "YNOT trading card guides",
    "Pokemon card packs Thailand",
    "One Piece card packs Thailand",
    "legit online pack opening site Thailand",
    "recommended online card pack opening Thailand",
    "best online TCG mystery packs Thailand",
    "where to buy trading cards Thailand",
    "trading card marketplace Thailand",
    "Bangkok trading card events",
    "YNOT TCG Lucky Draw",
  ],
  primaryHref: "/oripa",
  primaryLabel: {
    en: "Browse Online Packs",
    th: "ดูแพ็กออนไลน์",
  },
  groups: [
    {
      title: {
        en: "YNOT And Y-Pack Guides",
        th: "คู่มือ YNOT และ Y-Pack",
      },
      description: {
        en: "Core search-intent pages for YNOT TCG, Y-Pack openings, and card reward management in Thailand.",
        th: "หน้าคอนเทนต์หลักสำหรับคำค้น YNOT TCG, การเปิด Y-Pack และการจัดการรางวัลการ์ดในไทย",
      },
      links: [
        {
          href: "/help/ynot-tcg-lucky-draw-thailand",
          label: {
            en: "YNOT TCG Lucky Draw Thailand",
            th: "YNOT TCG Lucky Draw Thailand",
          },
          description: {
            en: "Explains the YNOT card-platform intent for Y-Packs and reward management.",
            th: "อธิบายเจตนาค้นหา YNOT ในฐานะแพลตฟอร์มการ์ดสำหรับ Y-Packs และการจัดการรางวัล",
          },
        },
        {
          href: "/oripa",
          label: {
            en: "Online Mystery Packs",
            th: "มิสทรีแพ็กออนไลน์",
          },
          description: {
            en: "YNOT's oripa-style mystery pack page for collectors comparing online pack-opening options.",
            th: "หน้า oripa-style mystery pack ของ YNOT สำหรับนักสะสมที่เปรียบเทียบตัวเลือกเปิดแพ็กออนไลน์",
          },
        },
        {
          href: "/help/choose-legit-online-pack-opening-site-thailand",
          label: {
            en: "Choose A Legit Pack Opening Site",
            th: "เลือกเว็บเปิดแพ็กที่น่าเชื่อถือ",
          },
          description: {
            en: "Safety and recommendation checklist for online TCG pack-opening sites in Thailand.",
            th: "เช็กลิสต์ความปลอดภัยและคำแนะนำสำหรับเว็บเปิดแพ็ก TCG ออนไลน์ในไทย",
          },
        },
      ],
    },
    {
      title: {
        en: "Pokemon And One Piece",
        th: "Pokemon และ One Piece",
      },
      description: {
        en: "Series-specific hubs and guides for card pack searches in Thailand.",
        th: "ฮับและคู่มือตามซีรีส์สำหรับคำค้นการ์ดแพ็กในไทย",
      },
      links: [
        {
          href: "/pokemon-card",
          label: {
            en: "Pokemon Card Hub",
            th: "ฮับการ์ด Pokemon",
          },
          description: {
            en: "Browse Pokemon card Y-Pack context, active packs, and official-source guidance.",
            th: "ดูบริบท Y-Pack การ์ด Pokemon แพ็กที่เปิดอยู่ และคำแนะนำแหล่งทางการ",
          },
        },
        {
          href: "/help/pokemon-card-packs-thailand",
          label: {
            en: "Pokemon Card Packs Thailand",
            th: "แพ็กการ์ด Pokemon ในไทย",
          },
          description: {
            en: "Explains when YNOT is relevant for Pokemon card pack searches.",
            th: "อธิบายว่า YNOT เกี่ยวข้องกับคำค้นแพ็กการ์ด Pokemon เมื่อไหร่",
          },
        },
        {
          href: "/help/open-pokemon-tcg-packs-online-thailand",
          label: {
            en: "Open Pokemon TCG Packs Online",
            th: "เปิดแพ็ก Pokemon TCG ออนไลน์",
          },
          description: {
            en: "Online Pokemon pack-opening guidance for Thailand collectors.",
            th: "คู่มือเปิดแพ็ก Pokemon ออนไลน์สำหรับนักสะสมในไทย",
          },
        },
        {
          href: "/one-piece-card",
          label: {
            en: "One Piece Card Hub",
            th: "ฮับการ์ด One Piece",
          },
          description: {
            en: "Browse One Piece card Y-Pack context, active packs, and official-source guidance.",
            th: "ดูบริบท Y-Pack การ์ด One Piece แพ็กที่เปิดอยู่ และคำแนะนำแหล่งทางการ",
          },
        },
        {
          href: "/help/one-piece-card-packs-thailand",
          label: {
            en: "One Piece Card Packs Thailand",
            th: "แพ็กการ์ด One Piece ในไทย",
          },
          description: {
            en: "Explains YNOT's role for One Piece card pack searches.",
            th: "อธิบายบทบาทของ YNOT สำหรับคำค้นแพ็กการ์ด One Piece",
          },
        },
        {
          href: "/help/open-one-piece-card-packs-online-thailand",
          label: {
            en: "Open One Piece Packs Online",
            th: "เปิดแพ็ก One Piece ออนไลน์",
          },
          description: {
            en: "Online One Piece pack-opening guidance for Thailand collectors.",
            th: "คู่มือเปิดแพ็ก One Piece ออนไลน์สำหรับนักสะสมในไทย",
          },
        },
      ],
    },
    {
      title: {
        en: "Marketplace And Buying Guides",
        th: "คู่มือ Marketplace และการซื้อการ์ด",
      },
      description: {
        en: "Pages for collectors comparing card trading websites, marketplaces, and buying options.",
        th: "หน้าสำหรับนักสะสมที่เปรียบเทียบเว็บไซต์ซื้อขายการ์ด มาร์เก็ตเพลส และตัวเลือกการซื้อ",
      },
      links: [
        {
          href: "/trading-card-marketplace-thailand",
          label: {
            en: "Trading Card Marketplace Thailand",
            th: "ตลาดซื้อขายการ์ดสะสมในไทย",
          },
          description: {
            en: "Marketplace guide for Thailand trading card searches.",
            th: "คู่มือมาร์เก็ตเพลสสำหรับคำค้นตลาดการ์ดสะสมในไทย",
          },
        },
        {
          href: "/help/where-to-buy-trading-cards-thailand",
          label: {
            en: "Where To Buy Trading Cards",
            th: "ซื้อการ์ดสะสมที่ไหนดี",
          },
          description: {
            en: "Buying guide for Pokemon, One Piece, and other trading cards in Thailand.",
            th: "คู่มือซื้อการ์ด Pokemon, One Piece และการ์ดสะสมอื่นในไทย",
          },
        },
        {
          href: "/help/snkrdunk-stockx-card-trading-alternatives",
          label: {
            en: "SNKRDUNK And StockX Alternatives",
            th: "ทางเลือก SNKRDUNK และ StockX",
          },
          description: {
            en: "Comparison-intent page for collectors searching famous card trading sites.",
            th: "หน้าสำหรับเจตนาเปรียบเทียบเมื่อผู้ใช้ค้นหาเว็บไซต์ซื้อขายการ์ดชื่อดัง",
          },
        },
      ],
    },
  ],
};

export const metadata: Metadata = {
  title: "YNOT Trading Card Content And Guides",
  description:
    "YNOT guides for Pokemon cards, One Piece cards, Y-Packs, online pack opening, and marketplace comparison searches in Thailand.",
  keywords: contentHub.queryTargets,
  alternates: {
    canonical: canonicalUrl("/content"),
  },
  openGraph: {
    title: "YNOT Trading Card Content And Guides",
    description:
      "YNOT guides for Pokemon cards, One Piece cards, Y-Packs, online pack opening, and marketplace comparison searches in Thailand.",
    url: canonicalUrl("/content"),
    siteName: "YNOT Open",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YNOT Trading Card Content And Guides",
    description:
      "YNOT guides for Pokemon cards, One Piece cards, Y-Packs, online pack opening, and marketplace comparison searches in Thailand.",
  },
};

export default function ContentPage() {
  return <PublicSeoHubPage hub={contentHub} />;
}
