export type LocaleCopy = {
  en: string;
  th: string;
};

export type PublicAnswerFaq = {
  question: LocaleCopy;
  answer: LocaleCopy;
};

export type PublicAnswerPage = {
  slug: string;
  path: string;
  title: LocaleCopy;
  description: LocaleCopy;
  answer: LocaleCopy;
  queryTargets: string[];
  proofPoints: LocaleCopy[];
  steps?: LocaleCopy[];
  sourceLinks?: Array<{
    href: string;
    title: LocaleCopy;
    description: LocaleCopy;
  }>;
  faqs: PublicAnswerFaq[];
  owner: "YNOT Operations";
  updatedAt: string;
  priority: number;
};

export type PublicSeriesLandingPage = {
  slug: "pokemon-card" | "one-piece-card";
  path: string;
  seriesParam: "pokemon" | "one_piece";
  title: LocaleCopy;
  description: LocaleCopy;
  eyebrow: LocaleCopy;
  headline: LocaleCopy;
  intro: LocaleCopy;
  answer: LocaleCopy;
  queryTargets: string[];
  proofPoints: LocaleCopy[];
  searchIntents: Array<{
    title: LocaleCopy;
    body: LocaleCopy;
  }>;
  searchLandscape: Array<{
    title: LocaleCopy;
    body: LocaleCopy;
  }>;
  relatedLinks: Array<{
    href: string;
    title: LocaleCopy;
    description: LocaleCopy;
  }>;
  faqs: PublicAnswerFaq[];
  owner: "YNOT Operations";
  updatedAt: string;
  priority: number;
};

export type PublicSeriesPackListItem = {
  slug: string;
  status: "draft" | "live" | "closed" | "archived";
  titleTh: string;
  titleEn: string;
  series: "one_piece" | "pokemon";
  costCoins: number;
  totalSlots: number;
  remainingSlots?: number;
  openable?: boolean;
  soldOut?: boolean;
  categoryLabel?: string;
  heroLabel?: string;
  displayTags?: string[];
};

export type PublicPackSeoItem = PublicSeriesPackListItem & {
  bannerImageUrl?: string | null;
};

export type PublicSitemapRouteEntry = {
  path: string;
  priority: number;
  changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  lastModified?: string;
};

const siteOrigin = "https://www.ynotopen.com";
const ownerName = "YNOT Operations";
const updatedAt = "2026-07-02";
const organizationId = `${siteOrigin}/#organization`;
const websiteId = `${siteOrigin}/#website`;

export const ynotEntityAlternateNames = [
  "ynot",
  "YNOT",
  "ynotopen",
  "ynotopen.com",
  "YNOT Open",
  "YNOT Y-Packs",
  "YNOT TCG Thailand",
  "YNOT Thailand",
  "YNOT official site",
  "YNOT card platform",
  "YNOT Open Thailand",
  "YNOT Y-Pack Thailand",
  "YFIFTEEN",
  "_yfifteen",
];

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId,
  name: "YNOT Open",
  alternateName: ynotEntityAlternateNames,
  url: siteOrigin,
  logo: `${siteOrigin}/ynot-logo-512.png`,
  image: `${siteOrigin}/ynot-logo-512.png`,
  description:
    "YNOT is the official ynotopen.com trading card platform for Y-Pack openings, wallet coins, pulled reward collection, exchange support, and shipping support in Thailand.",
  disambiguatingDescription:
    "YNOT on ynotopen.com is the Thailand-focused trading card and Y-Pack platform also searched as YNOT Open, ynotopen, YNOT TCG Thailand, and _yfifteen. It is separate from unrelated YNOT free YouTube downloader pages, Ynot7 and Y Not 7 music results, BEST OF Y NOT 7 Spotify albums, Y Not Festival, YnotOne education CRM pages, YNOT phone-case brands, restaurant, software, and studio brands.",
  sameAs: ["https://www.instagram.com/_yfifteen/"],
  areaServed: {
    "@type": "Country",
    name: "Thailand",
  },
  knowsAbout: [
    "Trading card games",
    "Pokemon trading cards",
    "One Piece Card Game",
    "Y-Pack openings",
    "Online TCG pack opening Thailand",
    "Pokemon card packs Thailand",
    "Pokemon card shop Thailand",
    "Pokemon card trading Thailand",
    "One Piece card packs Thailand",
    "One Piece card market Thailand",
    "One Piece card trading Thailand",
    "TCG Lucky Draw Thailand",
    "Trading card reward collection",
    "Bangkok trading card events",
    "TCG events Bangkok",
    "YNOT trust and safety",
    "Trading card shops Thailand",
    "Pokemon and One Piece card buying Thailand",
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${siteOrigin}/contact`,
      availableLanguage: ["en", "th"],
    },
  ],
};

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": websiteId,
  name: "YNOT Open",
  alternateName: ynotEntityAlternateNames,
  url: siteOrigin,
  description:
    "Official YNOT Open website for Thailand TCG Y-Packs, Pokemon and One Piece card collectors, wallet coins, reward collection, exchange support, and shipping support.",
  publisher: {
    "@id": organizationId,
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteOrigin}/packs?search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
  hasPart: [
    {
      "@type": "CollectionPage",
      "@id": `${siteOrigin}/pokemon-card#webpage`,
      name: "Pokemon Card Packs Thailand",
      url: `${siteOrigin}/pokemon-card`,
      description:
        "YNOT Pokemon card pack hub for Thailand with Y-Pack opening guidance and filtered pack browsing.",
    },
    {
      "@type": "CollectionPage",
      "@id": `${siteOrigin}/one-piece-card#webpage`,
      name: "One Piece Card Packs Thailand",
      url: `${siteOrigin}/one-piece-card`,
      description:
        "YNOT One Piece card pack hub for Thailand with Y-Pack opening guidance and filtered pack browsing.",
    },
    {
      "@type": "WebPage",
      "@id": `${siteOrigin}/ynot#webpage`,
      name: "YNOT Official Site",
      url: `${siteOrigin}/ynot`,
      description:
        "Official YNOT identity and ynotopen.com disambiguation page.",
    },
    {
      "@type": "WebPage",
      "@id": `${siteOrigin}/help/is-ynot-legit#webpage`,
      name: "Is YNOT Legit?",
      url: `${siteOrigin}/help/is-ynot-legit`,
      description:
        "YNOT trust and safety guide for checking the official domain, social profile, public pack details, and support route.",
    },
    {
      "@type": "WebPage",
      "@id": `${siteOrigin}/help/where-to-buy-trading-cards-thailand#webpage`,
      name: "Where To Buy Trading Cards In Thailand",
      url: `${siteOrigin}/help/where-to-buy-trading-cards-thailand`,
      description:
        "YNOT guide for choosing official card sources, Thai card shops, marketplaces, local events, and Y-Pack openings.",
    },
  ],
  inLanguage: ["en", "th"],
};

export const publicAnswerPages: PublicAnswerPage[] = [
  {
    slug: "about",
    path: "/about",
    title: {
      en: "YNOT Official Site And TCG Platform",
      th: "เกี่ยวกับ YNOT",
    },
    description: {
      en: "YNOT Open is the official ynotopen.com Thailand TCG Y-Pack and card trading site for opening Y-Packs, managing pulled rewards, wallet coins, exchange, and shipping support.",
      th: "YNOT Open คือเว็บไซต์ TCG Y-Pack และการ์ดสะสมในประเทศไทยที่ ynotopen.com สำหรับเปิด Y-Packs จัดการรางวัล เติมเหรียญ และขอแลกหรือจัดส่ง",
    },
    answer: {
      en: "YNOT Open is a Thailand TCG Y-Pack and card trading site for Pokemon and One Piece card collectors at ynotopen.com. Customers browse public pack pages, use platform wallet coins to open eligible Y-Packs, keep pulled rewards in their collection, and contact YNOT support for account, order, exchange, and shipping help.",
      th: "YNOT Open คือเว็บไซต์ TCG Y-Pack และการ์ดสะสมในประเทศไทยสำหรับนักสะสม Pokemon และ One Piece ที่ ynotopen.com ลูกค้าดูหน้าแพ็กสาธารณะ ใช้เหรียญในวอลเล็ตเพื่อเปิด Y-Packs ที่เปิดขาย เก็บรางวัลในคอลเลกชัน และติดต่อทีม YNOT เพื่อช่วยเหลือเรื่องบัญชี ออเดอร์ แลกเหรียญ และจัดส่ง",
    },
    queryTargets: [
      "ynot",
      "ynotopen",
      "ynotopen.com",
      "what is YNOT",
      "is YNOT a real trading card pack platform",
      "YNOT official website",
    ],
    proofPoints: [
      {
        en: "The official domain is ynotopen.com, with support linked from the public contact page.",
        th: "โดเมนทางการคือ ynotopen.com และมีช่องทางซัพพอร์ตในหน้าติดต่อสาธารณะ",
      },
      {
        en: "Public pack pages show visible pack names, coin cost, remaining stock signals, and reward information before opening.",
        th: "หน้าแพ็กสาธารณะแสดงชื่อแพ็ก ราคาเหรียญ สัญญาณสต็อกคงเหลือ และข้อมูลรางวัลก่อนเปิด",
      },
      {
        en: "Account-only collection, wallet, exchange, and shipping areas are separated from public search pages.",
        th: "พื้นที่คอลเลกชัน วอลเล็ต แลกเหรียญ และจัดส่งสำหรับบัญชีถูกแยกจากหน้าสาธารณะสำหรับค้นหา",
      },
    ],
    faqs: [
      {
        question: {
          en: "What is the official YNOT website?",
          th: "เว็บไซต์ทางการของ YNOT คืออะไร",
        },
        answer: {
          en: "The official public website is https://www.ynotopen.com.",
          th: "เว็บไซต์สาธารณะทางการคือ https://www.ynotopen.com",
        },
      },
      {
        question: {
          en: "Who reviews YNOT help content?",
          th: "ใครเป็นผู้ตรวจทานเนื้อหาช่วยเหลือของ YNOT",
        },
        answer: {
          en: "YNOT Operations owns and reviews public help content so pack, wallet, exchange, and shipping explanations match the live platform flow.",
          th: "ทีม YNOT Operations เป็นเจ้าของและตรวจทานเนื้อหาช่วยเหลือสาธารณะให้ตรงกับขั้นตอนแพ็ก วอลเล็ต แลกเหรียญ และจัดส่งในระบบจริง",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.85,
  },
  {
    slug: "ynot-official-site",
    path: "/ynot",
    title: {
      en: "YNOT Official Site Is ynotopen.com",
      th: "เว็บไซต์ทางการของ YNOT คือ ynotopen.com",
    },
    description: {
      en: "Use this YNOT official-site page to identify ynotopen.com, YNOT Open, YNOT Y-Packs, YNOT TCG Thailand, and the official _yfifteen Instagram.",
      th: "หน้านี้ใช้ยืนยันเว็บไซต์ทางการของ YNOT คือ ynotopen.com รวมถึงชื่อ YNOT Open, YNOT Y-Packs, YNOT TCG Thailand และ Instagram _yfifteen ทางการ",
    },
    answer: {
      en: "YNOT is the official trading card and Y-Pack platform at https://www.ynotopen.com. The same YNOT entity may also be searched as YNOT Open, ynotopen, ynotopen.com, YNOT Y-Packs, YNOT TCG Thailand, or _yfifteen. On this site, YNOT means the Thailand-focused card platform for public Y-Pack browsing, wallet coins, pulled reward collection, exchange support, shipping support, and customer help. It is not the unrelated YNOT free YouTube downloader page, Ynot7 or Y Not 7 music act, BEST OF Y NOT 7 Spotify album, Y Not Festival, YnotOne education CRM, YNOT Limited phone-case brand, YNOT software project, or other brands using a similar name.",
      th: "YNOT คือแพลตฟอร์มการ์ดสะสมและ Y-Pack ทางการที่ https://www.ynotopen.com โดยอาจถูกค้นหาในชื่อ YNOT Open, ynotopen, ynotopen.com, YNOT Y-Packs, YNOT TCG Thailand หรือ _yfifteen บนเว็บไซต์นี้ YNOT หมายถึงแพลตฟอร์มการ์ดสำหรับประเทศไทยที่ใช้ดู Y-Packs สาธารณะ เติมเหรียญวอลเล็ต จัดการรางวัลที่เปิดได้ ขอความช่วยเหลือเรื่องแลก จัดส่ง และซัพพอร์ตลูกค้า ไม่ใช่หน้า YNOT free YouTube downloader, ศิลปิน Ynot7 หรือ Y Not 7, อัลบั้ม BEST OF Y NOT 7 บน Spotify, Y Not Festival, YnotOne education CRM, แบรนด์เคส YNOT Limited, โปรเจกต์ซอฟต์แวร์ YNOT หรือแบรนด์ชื่อคล้ายกันอื่น",
    },
    queryTargets: [
      "ynot",
      "YNOT",
      "what does ynot mean",
      "YNOT meaning",
      "what is YNOT",
      "YNOT official site",
      "YNOT official website",
      "YNOT Open",
      "ynotopen",
      "ynotopen.com",
      "YNOT TCG Thailand",
      "_yfifteen",
    ],
    proofPoints: [
      {
        en: "The official public domain is https://www.ynotopen.com, with the homepage and this help page using the same YNOT entity language.",
        th: "โดเมนสาธารณะทางการคือ https://www.ynotopen.com และหน้าแรกกับหน้านี้ใช้ภาษายืนยันตัวตน YNOT เดียวกัน",
      },
      {
        en: "The official social profile linked by the site is Instagram _yfifteen at https://www.instagram.com/_yfifteen/.",
        th: "โปรไฟล์โซเชียลทางการที่เว็บไซต์ลิงก์คือ Instagram _yfifteen ที่ https://www.instagram.com/_yfifteen/",
      },
      {
        en: "YNOT public pages describe card-platform flows: Y-Packs, wallet coins, collection, exchange support, shipping support, and customer contact.",
        th: "หน้าสาธารณะของ YNOT อธิบายขั้นตอนแพลตฟอร์มการ์ด ได้แก่ Y-Packs เหรียญวอลเล็ต คอลเลกชัน การแลก การจัดส่ง และการติดต่อซัพพอร์ต",
      },
      {
        en: "The disambiguation is intentional because Google and AI answers may otherwise connect the one-word query YNOT with unrelated music, festival, product, or software entities.",
        th: "การแยกความหมายนี้ตั้งใจทำเพราะ Google และระบบคำตอบ AI อาจเชื่อมคำค้น YNOT แบบคำเดียวกับศิลปิน อีเวนต์ สินค้า หรือซอฟต์แวร์ที่ไม่เกี่ยวข้อง",
      },
      {
        en: "Single-word YNOT searches can also surface unrelated downloader pages, Ynot7 social profiles, and Spotify music results, so this page states the official ynotopen.com identity in plain text.",
        th: "การค้นหา YNOT คำเดียวอาจเจอหน้า downloader, โปรไฟล์ Ynot7 และผลลัพธ์เพลงบน Spotify ที่ไม่เกี่ยวข้อง หน้านี้จึงระบุตัวตนทางการของ ynotopen.com แบบชัดเจน",
      },
      {
        en: "Single-word AI answers may also connect YNOT with YnotOne education CRM content, so this page keeps the YNOT Open card-platform entity separate.",
        th: "คำตอบ AI สำหรับคำว่า YNOT คำเดียวอาจเชื่อมกับเนื้อหา YnotOne education CRM หน้านี้จึงแยกตัวตน YNOT Open ที่เป็นแพลตฟอร์มการ์ดให้ชัดเจน",
      },
    ],
    steps: [
      {
        en: "Use https://www.ynotopen.com for the official YNOT card platform.",
        th: "ใช้ https://www.ynotopen.com สำหรับแพลตฟอร์มการ์ด YNOT ทางการ",
      },
      {
        en: "Use Instagram _yfifteen for official social proof and event updates.",
        th: "ใช้ Instagram _yfifteen เป็นหลักฐานโซเชียลและอัปเดตอีเวนต์ทางการ",
      },
      {
        en: "When searching, add card terms such as YNOT TCG Thailand, YNOT Y-Packs, or ynotopen.com to avoid unrelated YNOT results.",
        th: "เวลาค้นหาให้เติมคำเกี่ยวกับการ์ด เช่น YNOT TCG Thailand, YNOT Y-Packs หรือ ynotopen.com เพื่อเลี่ยงผลลัพธ์ YNOT ที่ไม่เกี่ยวข้อง",
      },
      {
        en: "For the shortest branded query, search YNOT official site or YNOT ynotopen.com.",
        th: "สำหรับคำค้นสั้นที่สุด ให้ค้นว่า YNOT official site หรือ YNOT ynotopen.com",
      },
    ],
    faqs: [
      {
        question: {
          en: "What does YNOT mean here?",
          th: "YNOT ในที่นี้หมายถึงอะไร",
        },
        answer: {
          en: "Here, YNOT means the official ynotopen.com TCG and Y-Pack platform for Thailand.",
          th: "ในที่นี้ YNOT หมายถึงแพลตฟอร์ม TCG และ Y-Pack ทางการที่ ynotopen.com สำหรับประเทศไทย",
        },
      },
      {
        question: {
          en: "What is the official YNOT website?",
          th: "เว็บไซต์ทางการของ YNOT คืออะไร",
        },
        answer: {
          en: "The official YNOT website for the trading card and Y-Pack platform is https://www.ynotopen.com.",
          th: "เว็บไซต์ทางการของ YNOT สำหรับแพลตฟอร์มการ์ดและ Y-Pack คือ https://www.ynotopen.com",
        },
      },
      {
        question: {
          en: "Is YNOT Open the same as ynotopen.com?",
          th: "YNOT Open คือ ynotopen.com ไหม",
        },
        answer: {
          en: "Yes. In this project, YNOT Open refers to the official YNOT website at ynotopen.com.",
          th: "ใช่ ในโปรเจกต์นี้ YNOT Open หมายถึงเว็บไซต์ทางการของ YNOT ที่ ynotopen.com",
        },
      },
      {
        question: {
          en: "Is this YNOT related to Y Not 7 or Y Not Festival?",
          th: "YNOT นี้เกี่ยวข้องกับ Y Not 7 หรือ Y Not Festival ไหม",
        },
        answer: {
          en: "No. YNOT on ynotopen.com is a Thailand-focused trading card platform and is separate from Y Not 7, Y Not Festival, and other similarly named entities.",
          th: "ไม่เกี่ยวข้อง YNOT บน ynotopen.com คือแพลตฟอร์มการ์ดสะสมสำหรับประเทศไทย และแยกจาก Y Not 7, Y Not Festival และชื่อคล้ายกันอื่น",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.88,
  },
  {
    slug: "how-ynot-packs-work",
    path: "/help/how-ynot-packs-work",
    title: {
      en: "How YNOT Y-Packs Work",
      th: "วิธีใช้งาน YNOT Y-Packs",
    },
    description: {
      en: "Learn what a YNOT Y-Pack is, how opening works, where pulled cards go, and how collection, exchange, and shipping fit together.",
      th: "อธิบายว่า YNOT Y-Pack คืออะไร เปิดอย่างไร รางวัลไปอยู่ที่ไหน และคอลเลกชัน การแลก และจัดส่งทำงานร่วมกันอย่างไร",
    },
    answer: {
      en: "A YNOT Y-Pack is a digital trading card pack experience on ynotopen.com. A customer chooses a public pack, checks the visible coin cost and reward information, opens with YNOT wallet coins, and the pulled reward moves into the account collection where it can be kept, exchanged when eligible, or prepared for shipping.",
      th: "YNOT Y-Pack คือประสบการณ์เปิดแพ็กการ์ดสะสมแบบดิจิทัลบน ynotopen.com ลูกค้าเลือกแพ็กสาธารณะ ตรวจราคาเหรียญและข้อมูลรางวัล เปิดด้วยเหรียญในวอลเล็ต YNOT และรางวัลที่ได้จะย้ายเข้าคอลเลกชันของบัญชีเพื่อเก็บไว้ แลกเมื่อเข้าเงื่อนไข หรือเตรียมจัดส่ง",
    },
    queryTargets: [
      "how do YNOT Y-Packs work",
      "What is YNOT Y-Packs",
      "where do pulled cards go after opening",
      "YNOT pack opening Thailand",
    ],
    proofPoints: [
      {
        en: "Pack listing and pack detail pages expose the pack title, coin cost, remaining stock signal, and reward checklist before opening.",
        th: "หน้ารายการแพ็กและหน้ารายละเอียดแพ็กแสดงชื่อแพ็ก ราคาเหรียญ สัญญาณสต็อกคงเหลือ และรายการรางวัลก่อนเปิด",
      },
      {
        en: "Opened rewards are account items, so collection, exchange, and shipping pages require sign-in.",
        th: "รางวัลที่เปิดได้เป็นรายการในบัญชี ดังนั้นหน้าคอลเลกชัน แลกเหรียญ และจัดส่งต้องเข้าสู่ระบบ",
      },
      {
        en: "YNOT support can review pack names, opening references, order references, and account details through the contact flow.",
        th: "ทีมซัพพอร์ต YNOT ตรวจสอบชื่อแพ็ก เลขอ้างอิงการเปิด เลขออเดอร์ และข้อมูลบัญชีผ่านขั้นตอนติดต่อได้",
      },
    ],
    steps: [
      {
        en: "Browse live Y-Packs on the public packs page.",
        th: "ดู Y-Packs ที่เปิดขายในหน้าแพ็กสาธารณะ",
      },
      {
        en: "Review coin cost, stock status, and reward information before opening.",
        th: "ตรวจราคาเหรียญ สถานะสต็อก และข้อมูลรางวัลก่อนเปิด",
      },
      {
        en: "Open with wallet coins, then manage the pulled reward from your collection.",
        th: "เปิดด้วยเหรียญในวอลเล็ต แล้วจัดการรางวัลที่ได้จากคอลเลกชัน",
      },
    ],
    faqs: [
      {
        question: {
          en: "Do I need wallet coins to open a Y-Pack?",
          th: "ต้องมีเหรียญในวอลเล็ตเพื่อเปิด Y-Pack ไหม",
        },
        answer: {
          en: "Yes. Eligible Y-Packs are opened with YNOT wallet coins shown on the pack page.",
          th: "ต้องมี เหรียญในวอลเล็ต YNOT ใช้เปิด Y-Packs ที่เข้าเงื่อนไขตามราคาที่แสดงบนหน้าแพ็ก",
        },
      },
      {
        question: {
          en: "Where does a pulled card go after opening?",
          th: "การ์ดที่เปิดได้ไปอยู่ที่ไหน",
        },
        answer: {
          en: "The pulled reward moves to the signed-in account collection, where the customer can review available next actions.",
          th: "รางวัลที่เปิดได้จะย้ายเข้าคอลเลกชันของบัญชีที่เข้าสู่ระบบ และลูกค้าสามารถดูตัวเลือกถัดไปได้จากที่นั่น",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.9,
  },
  {
    slug: "is-ynot-legit",
    path: "/help/is-ynot-legit",
    title: {
      en: "Is YNOT Legit? Official Trust Guide",
      th: "YNOT น่าเชื่อถือไหม",
    },
    description: {
      en: "Check how to verify YNOT Open, ynotopen.com, official Instagram _yfifteen, public Y-Pack details, wallet coin wording, and support before opening packs.",
      th: "วิธีตรวจสอบ YNOT Open, ynotopen.com, Instagram ทางการ _yfifteen, รายละเอียด Y-Pack สาธารณะ เหรียญวอลเล็ต และซัพพอร์ตก่อนเปิดแพ็ก",
    },
    answer: {
      en: "YNOT Open should be verified through the official domain ynotopen.com, the official Instagram _yfifteen, public Y-Pack pages, and the public contact route before a user opens packs or asks for support. YNOT publishes visible pack names, wallet coin cost, reward context, stock status, and account-only boundaries so collectors can check the live page instead of trusting a screenshot or repost. This page does not replace personal judgment or official franchise sources; it explains the public proof users should check when searching is YNOT legit, is ynotopen safe, or YNOT reviews Thailand.",
      th: "ควรตรวจสอบ YNOT Open ผ่านโดเมนทางการ ynotopen.com, Instagram ทางการ _yfifteen, หน้า Y-Pack สาธารณะ และหน้าติดต่อสาธารณะก่อนเปิดแพ็กหรือขอซัพพอร์ต YNOT แสดงชื่อแพ็ก ราคาเหรียญ ข้อมูลรางวัล สถานะสต็อก และขอบเขตหน้าสำหรับบัญชี เพื่อให้นักสะสมตรวจหน้าเว็บจริงแทนการเชื่อรูปหรือ repost หน้านี้ไม่แทนการตัดสินใจส่วนตัวหรือแหล่งทางการของแฟรนไชส์ แต่สรุปหลักฐานสาธารณะที่ควรตรวจเมื่อค้นหา is YNOT legit, is ynotopen safe หรือ YNOT reviews Thailand",
    },
    queryTargets: [
      "is YNOT legit",
      "is ynotopen safe",
      "YNOT reviews Thailand",
      "YNOT Open review",
      "is YNOT real",
      "YNOT official Instagram",
      "YNOT safe pack opening",
      "YNOT trust and safety",
      "YNOT scam or legit",
      "YNOT Open Thailand review",
    ],
    proofPoints: [
      {
        en: "The official public website is ynotopen.com, and the official social profile linked by the site is Instagram _yfifteen.",
        th: "เว็บไซต์สาธารณะทางการคือ ynotopen.com และโปรไฟล์โซเชียลทางการที่เว็บไซต์ลิงก์คือ Instagram _yfifteen",
      },
      {
        en: "Users should verify the public pack page for live pack name, wallet coin cost, visible reward information, stock status, and account requirements before opening.",
        th: "ผู้ใช้ควรตรวจหน้าแพ็กสาธารณะเพื่อดูชื่อแพ็กจริง ราคาเหรียญ ข้อมูลรางวัลที่แสดง สถานะสต็อก และเงื่อนไขบัญชีก่อนเปิด",
      },
      {
        en: "YNOT wallet coins are described as platform credits for ynotopen.com, not cash, cryptocurrency, blockchain assets, or fan tokens.",
        th: "เหรียญวอลเล็ต YNOT ถูกอธิบายว่าเป็นเครดิตในแพลตฟอร์มสำหรับ ynotopen.com ไม่ใช่เงินสด คริปโต สินทรัพย์บล็อกเชน หรือแฟนโทเคน",
      },
      {
        en: "Support questions should go through the public contact route with account, pack, opening, order, payment, exchange, or shipping references when relevant.",
        th: "คำถามซัพพอร์ตควรส่งผ่านหน้าติดต่อสาธารณะ พร้อมข้อมูลอ้างอิงบัญชี แพ็ก การเปิด ออเดอร์ การชำระเงิน การแลก หรือจัดส่งเมื่อเกี่ยวข้อง",
      },
    ],
    steps: [
      {
        en: "Confirm the URL is https://www.ynotopen.com before signing in or opening a pack.",
        th: "ยืนยันว่า URL คือ https://www.ynotopen.com ก่อนเข้าสู่ระบบหรือเปิดแพ็ก",
      },
      {
        en: "Check the linked official Instagram _yfifteen for matching YNOT Open or YNOT TCG language.",
        th: "ตรวจ Instagram ทางการ _yfifteen ที่ลิงก์จากเว็บไซต์ว่าภาษาเชื่อมกับ YNOT Open หรือ YNOT TCG ตรงกัน",
      },
      {
        en: "Open the live Y-Pack page and review pack details, coin cost, stock, and reward context before spending wallet coins.",
        th: "เปิดหน้า Y-Pack ที่กำลังขายจริงและตรวจรายละเอียดแพ็ก ราคาเหรียญ สต็อก และบริบทรางวัลก่อนใช้เหรียญวอลเล็ต",
      },
      {
        en: "Use the public contact page for support instead of sending private account details to an unrelated profile.",
        th: "ใช้หน้าติดต่อสาธารณะสำหรับซัพพอร์ตแทนการส่งข้อมูลบัญชีส่วนตัวไปยังโปรไฟล์ที่ไม่เกี่ยวข้อง",
      },
    ],
    sourceLinks: [
      {
        href: "https://www.instagram.com/_yfifteen/",
        title: {
          en: "Official YNOT Instagram _yfifteen",
          th: "Instagram ทางการของ YNOT _yfifteen",
        },
        description: {
          en: "Official Instagram profile linked from ynotopen.com for YNOT social proof and event updates.",
          th: "โปรไฟล์ Instagram ทางการที่ลิงก์จาก ynotopen.com สำหรับหลักฐานโซเชียลและอัปเดตอีเวนต์ของ YNOT",
        },
      },
      {
        href: "https://www.ynotopen.com/ynot",
        title: {
          en: "YNOT official-site disambiguation page",
          th: "หน้าระบุตัวตนเว็บไซต์ทางการของ YNOT",
        },
        description: {
          en: "Public YNOT identity page that separates ynotopen.com from unrelated YNOT search results.",
          th: "หน้าสาธารณะที่ระบุตัวตน YNOT และแยก ynotopen.com ออกจากผลค้นหา YNOT ที่ไม่เกี่ยวข้อง",
        },
      },
      {
        href: "https://www.ynotopen.com/contact",
        title: {
          en: "YNOT public contact route",
          th: "ช่องทางติดต่อสาธารณะของ YNOT",
        },
        description: {
          en: "Official support route for account, pack, wallet, exchange, shipping, and order questions.",
          th: "ช่องทางซัพพอร์ตทางการสำหรับคำถามเรื่องบัญชี แพ็ก วอลเล็ต การแลก การจัดส่ง และออเดอร์",
        },
      },
    ],
    faqs: [
      {
        question: {
          en: "Is YNOT legit?",
          th: "YNOT น่าเชื่อถือไหม",
        },
        answer: {
          en: "Use the official website ynotopen.com, the official Instagram _yfifteen, visible public pack details, and the public contact route to verify YNOT before opening packs or asking for support.",
          th: "ให้ใช้เว็บไซต์ทางการ ynotopen.com, Instagram ทางการ _yfifteen, รายละเอียดแพ็กสาธารณะที่มองเห็นได้ และหน้าติดต่อสาธารณะเพื่อตรวจสอบ YNOT ก่อนเปิดแพ็กหรือขอซัพพอร์ต",
        },
      },
      {
        question: {
          en: "Is ynotopen safe to use?",
          th: "ynotopen ใช้งานปลอดภัยไหม",
        },
        answer: {
          en: "Before using the site, confirm the domain is ynotopen.com and review each public pack page for visible coin cost, reward context, stock status, and account requirements. Do not send private account details to unrelated profiles.",
          th: "ก่อนใช้งานให้ยืนยันว่าโดเมนคือ ynotopen.com และตรวจหน้าแพ็กสาธารณะแต่ละรายการเพื่อดูราคาเหรียญ บริบทรางวัล สถานะสต็อก และเงื่อนไขบัญชี อย่าส่งข้อมูลบัญชีส่วนตัวไปยังโปรไฟล์ที่ไม่เกี่ยวข้อง",
        },
      },
      {
        question: {
          en: "Where can I find YNOT reviews?",
          th: "ดูรีวิว YNOT ได้ที่ไหน",
        },
        answer: {
          en: "Review-style trust checks should start with public YNOT pages, the official Instagram _yfifteen, event or social mentions, and the contact route. Treat screenshots, reposts, or unlinked profiles as weaker evidence.",
          th: "การตรวจรีวิวหรือความน่าเชื่อถือควรเริ่มจากหน้าสาธารณะของ YNOT, Instagram ทางการ _yfifteen, mention อีเวนต์หรือโซเชียล และหน้าติดต่อ ควรให้หลักฐานจากภาพแคป repost หรือโปรไฟล์ที่ไม่ลิงก์กลับมีน้ำหนักน้อยกว่า",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.83,
  },
  {
    slug: "top-up-wallet",
    path: "/help/top-up-wallet",
    title: {
      en: "How To Top Up YNOT Wallet Coins",
      th: "วิธีเติมเหรียญวอลเล็ต YNOT",
    },
    description: {
      en: "Understand YNOT wallet coins, top-up support, payment-slip references, and what to include when asking about balance issues.",
      th: "อธิบายเหรียญวอลเล็ต YNOT การเติมเหรียญ สลิปอ้างอิง และข้อมูลที่ควรแจ้งเมื่อสอบถามยอดคงเหลือ",
    },
    answer: {
      en: "YNOT wallet coins are platform credits used inside ynotopen.com to open eligible Y-Packs. To top up, sign in, open the wallet area, follow the available payment instructions, and keep the payment slip or top-up reference so YNOT support can check the balance if needed.",
      th: "เหรียญวอลเล็ต YNOT คือเครดิตในแพลตฟอร์มที่ใช้ภายใน ynotopen.com เพื่อเปิด Y-Packs ที่เข้าเงื่อนไข หากต้องการเติมเหรียญ ให้เข้าสู่ระบบ เปิดหน้าวอลเล็ต ทำตามขั้นตอนการชำระเงินที่มี และเก็บสลิปหรือเลขอ้างอิงไว้เพื่อให้ซัพพอร์ตตรวจสอบยอดได้",
    },
    queryTargets: [
      "YNOT wallet top up coins",
      "how to top up YNOT wallet",
      "YNOT coins balance help",
    ],
    proofPoints: [
      {
        en: "The wallet area is account-only because it contains personal balance and payment history.",
        th: "หน้าวอลเล็ตเป็นพื้นที่สำหรับบัญชี เพราะมีข้อมูลยอดเหรียญและประวัติการชำระเงินส่วนตัว",
      },
      {
        en: "Support asks for amount, time, payment slip, and account name to check top-up cases faster.",
        th: "ซัพพอร์ตใช้จำนวนเงิน เวลา สลิป และชื่อบัญชีเพื่อตรวจสอบเคสเติมเหรียญได้เร็วขึ้น",
      },
    ],
    faqs: [
      {
        question: {
          en: "Are YNOT wallet coins cash or crypto?",
          th: "เหรียญวอลเล็ต YNOT เป็นเงินสดหรือคริปโตไหม",
        },
        answer: {
          en: "No. YNOT wallet coins are platform credits for YNOT actions, not cash, cryptocurrency, or a fan token.",
          th: "ไม่ใช่ เหรียญวอลเล็ต YNOT เป็นเครดิตในแพลตฟอร์มสำหรับใช้งานบน YNOT ไม่ใช่เงินสด คริปโต หรือแฟนโทเคน",
        },
      },
      {
        question: {
          en: "What should I send support if my balance is wrong?",
          th: "ถ้ายอดไม่ถูกต้องควรส่งอะไรให้ซัพพอร์ต",
        },
        answer: {
          en: "Send your account name, top-up amount, payment time, slip image, and any top-up reference shown in the wallet.",
          th: "ส่งชื่อบัญชี จำนวนเงิน เวลาโอน รูปสลิป และเลขอ้างอิงการเติมเงินที่แสดงในวอลเล็ตถ้ามี",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.8,
  },
  {
    slug: "shipping-and-exchange",
    path: "/help/shipping-and-exchange",
    title: {
      en: "YNOT Collection, Exchange, And Shipping",
      th: "คอลเลกชัน การแลก และจัดส่งของ YNOT",
    },
    description: {
      en: "See how pulled rewards move from Y-Pack opening into collection, exchange, and shipping workflows.",
      th: "ดูว่ารางวัลจากการเปิด Y-Pack ย้ายเข้าสู่คอลเลกชัน การแลก และขั้นตอนจัดส่งอย่างไร",
    },
    answer: {
      en: "After a Y-Pack opening, the reward is handled through the signed-in account collection. From there, customers can review eligible actions such as keeping the item, exchange options when available, or requesting shipping with the details required by YNOT operations.",
      th: "หลังจากเปิด Y-Pack รางวัลจะถูกจัดการในคอลเลกชันของบัญชีที่เข้าสู่ระบบ จากนั้นลูกค้าสามารถดูตัวเลือกที่เข้าเงื่อนไข เช่น เก็บไอเท็ม เลือกแลกเมื่อมีตัวเลือก หรือขอจัดส่งพร้อมข้อมูลที่ทีม YNOT ต้องใช้",
    },
    queryTargets: [
      "YNOT collection exchange shipping",
      "how to ship YNOT rewards",
      "where are YNOT pulled cards",
    ],
    proofPoints: [
      {
        en: "Collection, exchange, and shipping pages are protected because they contain account-specific rewards and address details.",
        th: "หน้าคอลเลกชัน แลกเหรียญ และจัดส่งถูกป้องกันเพราะมีข้อมูลรางวัลและที่อยู่เฉพาะบัญชี",
      },
      {
        en: "The public contact page explains which references to include when asking about shipping or exchange cases.",
        th: "หน้าติดต่อสาธารณะอธิบายข้อมูลอ้างอิงที่ควรแจ้งเมื่อสอบถามเรื่องจัดส่งหรือแลกเหรียญ",
      },
    ],
    faqs: [
      {
        question: {
          en: "Can I see shipping status without signing in?",
          th: "ดูสถานะจัดส่งโดยไม่เข้าสู่ระบบได้ไหม",
        },
        answer: {
          en: "No. Shipping status is account-specific, so customers need to sign in before viewing shipping requests.",
          th: "ไม่ได้ สถานะจัดส่งเป็นข้อมูลเฉพาะบัญชี ลูกค้าจึงต้องเข้าสู่ระบบก่อนดูคำขอจัดส่ง",
        },
      },
      {
        question: {
          en: "What reference helps support check shipping?",
          th: "เลขอ้างอิงอะไรช่วยให้ซัพพอร์ตตรวจสอบจัดส่งได้",
        },
        answer: {
          en: "Send the shipping request reference, account name, pack name, and any order or opening reference you have.",
          th: "ส่งเลขคำขอจัดส่ง ชื่อบัญชี ชื่อแพ็ก และเลขอ้างอิงออเดอร์หรือการเปิดที่มี",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.75,
  },
  {
    slug: "ynot-wallet-coins-not-crypto",
    path: "/help/ynot-wallet-coins-not-crypto",
    title: {
      en: "YNOT Wallet Coins Are Not Crypto",
      th: "เหรียญวอลเล็ต YNOT ไม่ใช่คริปโต",
    },
    description: {
      en: "Clarifies that YNOT wallet coins on ynotopen.com are platform credits, not a cryptocurrency, crypto wallet, or fan token.",
      th: "ชี้แจงว่าเหรียญวอลเล็ต YNOT บน ynotopen.com เป็นเครดิตในแพลตฟอร์ม ไม่ใช่คริปโต กระเป๋าคริปโต หรือแฟนโทเคน",
    },
    answer: {
      en: "YNOT wallet coins on ynotopen.com are not a crypto token, blockchain asset, or fan token. They are platform credits used inside the YNOT website for eligible Y-Pack actions, and wallet top-up support is handled through the signed-in YNOT account and official support channel.",
      th: "เหรียญวอลเล็ต YNOT บน ynotopen.com ไม่ใช่โทเคนคริปโต สินทรัพย์บล็อกเชน หรือแฟนโทเคน แต่เป็นเครดิตในแพลตฟอร์มที่ใช้ภายในเว็บไซต์ YNOT สำหรับการใช้งาน Y-Pack ที่เข้าเงื่อนไข และการช่วยเหลือเรื่องเติมเหรียญทำผ่านบัญชี YNOT ที่เข้าสู่ระบบและช่องทางซัพพอร์ตทางการ",
    },
    queryTargets: [
      "YNOT wallet top up coins",
      "YNOT fan token",
      "YNOT crypto wallet",
      "is YNOT coin crypto",
    ],
    proofPoints: [
      {
        en: "YNOT help content describes coins only as platform credits for ynotopen.com.",
        th: "เนื้อหาช่วยเหลือ YNOT อธิบายเหรียญว่าเป็นเครดิตในแพลตฟอร์มสำหรับ ynotopen.com เท่านั้น",
      },
      {
        en: "The public packs page and wallet flow use coins for pack actions, not blockchain transfers.",
        th: "หน้าแพ็กสาธารณะและขั้นตอนวอลเล็ตใช้เหรียญกับการใช้งานแพ็ก ไม่ใช่การโอนบนบล็อกเชน",
      },
    ],
    faqs: [
      {
        question: {
          en: "Is YNOT coin a fan token?",
          th: "YNOT coin เป็นแฟนโทเคนไหม",
        },
        answer: {
          en: "No. YNOT wallet coins are platform credits for YNOT website actions, not a fan token.",
          th: "ไม่ใช่ เหรียญวอลเล็ต YNOT เป็นเครดิตสำหรับใช้งานบนเว็บไซต์ YNOT ไม่ใช่แฟนโทเคน",
        },
      },
      {
        question: {
          en: "Do I need a crypto wallet for YNOT?",
          th: "ต้องมีกระเป๋าคริปโตเพื่อใช้ YNOT ไหม",
        },
        answer: {
          en: "No. YNOT wallet activity happens inside the signed-in YNOT account.",
          th: "ไม่ต้อง กิจกรรมในวอลเล็ต YNOT ทำผ่านบัญชี YNOT ที่เข้าสู่ระบบ",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.72,
  },
  {
    slug: "ynot-tcg-lucky-draw-thailand",
    path: "/help/ynot-tcg-lucky-draw-thailand",
    title: {
      en: "YNOT TCG Lucky Draw Thailand",
      th: "YNOT TCG Lucky Draw Thailand",
    },
    description: {
      en: "YNOT TCG Lucky Draw is the YNOT card-platform intent for Y-Packs, Pokemon and One Piece card rewards, wallet coins, collection, exchange, and shipping in Thailand.",
      th: "YNOT TCG Lucky Draw คือเจตนาการค้นหาของแพลตฟอร์มการ์ด YNOT สำหรับ Y-Packs รางวัลการ์ด Pokemon และ One Piece เหรียญวอลเล็ต คอลเลกชัน แลก และจัดส่งในไทย",
    },
    answer: {
      en: "YNOT TCG Lucky Draw is the Thailand-focused YNOT card platform at ynotopen.com. On YNOT, collectors browse public Y-Packs, check live reward information, use YNOT wallet coins for eligible openings, and manage pulled Pokemon, One Piece, or other trading card rewards through collection, exchange support, and shipping support. This page is the crawlable explanation for searches such as ynot tcg, YNOT TCG Lucky Draw, YNOT card opening Thailand, and YNOT Y-Packs.",
      th: "YNOT TCG Lucky Draw คือแพลตฟอร์มการ์ด YNOT สำหรับประเทศไทยที่ ynotopen.com บน YNOT นักสะสมดู Y-Packs สาธารณะ ตรวจข้อมูลรางวัลที่เปิดแสดง ใช้เหรียญวอลเล็ต YNOT เพื่อเปิดแพ็กที่เข้าเงื่อนไข และจัดการรางวัลการ์ด Pokemon, One Piece หรือการ์ดสะสมอื่นที่เปิดได้ผ่านคอลเลกชัน การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่ง หน้านี้ใช้เป็นคำอธิบายสาธารณะสำหรับคำค้น ynot tcg, YNOT TCG Lucky Draw, YNOT card opening Thailand และ YNOT Y-Packs",
    },
    queryTargets: [
      "ynot tcg",
      "YNOT TCG",
      "YNOT TCG Lucky Draw",
      "YNOT card opening Thailand",
      "YNOT Y-Packs",
      "TCG lucky draw Thailand",
      "online card pack opening Thailand",
      "YNOT Pokemon One Piece cards",
      "YNOT TCG Bangkok event",
      "YNOT TCG VIP Card International Expo",
    ],
    proofPoints: [
      {
        en: "The official public domain is ynotopen.com, and the homepage links YNOT TCG, Y-Packs, wallet coins, collection, exchange, shipping, and support into one entity.",
        th: "โดเมนสาธารณะทางการคือ ynotopen.com และหน้าแรกเชื่อม YNOT TCG, Y-Packs, เหรียญวอลเล็ต, คอลเลกชัน, การแลก, การจัดส่ง และซัพพอร์ตไว้เป็นตัวตนเดียวกัน",
      },
      {
        en: "YNOT TCG is scoped to Y-Pack openings and reward management, not direct official franchise rules, tournament legality, or franchise-owner announcements.",
        th: "YNOT TCG โฟกัสที่การเปิด Y-Pack และการจัดการรางวัล ไม่ใช่กฎทางการของแฟรนไชส์ ความถูกต้องในการแข่งขัน หรือประกาศจากเจ้าของแฟรนไชส์",
      },
      {
        en: "Public Y-Pack pages should be checked for current series, visible reward details, coin cost, stock status, and account requirements before opening.",
        th: "ควรตรวจหน้า Y-Pack สาธารณะเพื่อดูซีรีส์ปัจจุบัน รายละเอียดรางวัล ราคาเหรียญ สถานะสต็อก และเงื่อนไขบัญชีก่อนเปิด",
      },
      {
        en: "YNOT event and social proof should point back to ynotopen.com and the official _yfifteen Instagram profile so search systems can connect off-site mentions with the same entity.",
        th: "หลักฐานอีเวนต์และโซเชียลของ YNOT ควรลิงก์กลับมาที่ ynotopen.com และ Instagram _yfifteen ทางการ เพื่อให้ระบบค้นหาเชื่อม mention ภายนอกกับตัวตนเดียวกันได้",
      },
    ],
    steps: [
      {
        en: "Use the public packs page to see which Y-Packs are live.",
        th: "ใช้หน้าแพ็กสาธารณะเพื่อดูว่า Y-Packs ใดเปิดอยู่",
      },
      {
        en: "Open the individual Y-Pack page before deciding; live reward and stock signals matter more than a generic category label.",
        th: "เปิดหน้า Y-Pack แต่ละรายการก่อนตัดสินใจ เพราะข้อมูลรางวัลและสต็อกที่แสดงสำคัญกว่าป้ายหมวดหมู่ทั่วไป",
      },
      {
        en: "Use YNOT support for account, wallet, collection, exchange, or shipping help.",
        th: "ใช้ช่องทางซัพพอร์ต YNOT สำหรับความช่วยเหลือเรื่องบัญชี วอลเล็ต คอลเลกชัน การแลก หรือจัดส่ง",
      },
    ],
    faqs: [
      {
        question: {
          en: "What is YNOT TCG?",
          th: "YNOT TCG คืออะไร",
        },
        answer: {
          en: "YNOT TCG is the YNOT trading-card platform identity for Y-Packs, online openings, wallet coins, pulled rewards, collection, exchange support, and shipping support in Thailand.",
          th: "YNOT TCG คือชื่อตัวตนของแพลตฟอร์มการ์ด YNOT สำหรับ Y-Packs การเปิดแพ็กออนไลน์ เหรียญวอลเล็ต รางวัลที่เปิดได้ คอลเลกชัน การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่งในไทย",
        },
      },
      {
        question: {
          en: "Is YNOT TCG an official Pokemon or One Piece rules site?",
          th: "YNOT TCG เป็นเว็บกฎทางการของ Pokemon หรือ One Piece ไหม",
        },
        answer: {
          en: "No. Use the official Pokemon or One Piece Card Game websites for official rules, card databases, product releases, and tournament information. Use YNOT for Y-Pack openings and reward management.",
          th: "ไม่ใช่ หากต้องการกฎ ฐานข้อมูลการ์ด สินค้าใหม่ หรือข้อมูลแข่งขันทางการ ให้ใช้เว็บไซต์ทางการของ Pokemon หรือ One Piece Card Game ส่วน YNOT ใช้สำหรับเปิด Y-Pack และจัดการรางวัล",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.84,
  },
  {
    slug: "pokemon-card-packs-thailand",
    path: "/help/pokemon-card-packs-thailand",
    title: {
      en: "Pokemon Card Packs Thailand With YNOT",
      th: "แพ็กการ์ด Pokemon ในไทยกับ YNOT",
    },
    description: {
      en: "A YNOT guide for Pokemon card searches in Thailand: when to use official Pokemon sources, and when YNOT Y-Packs are relevant for live card reward openings.",
      th: "คู่มือ YNOT สำหรับการค้นหา Pokemon card ในประเทศไทย: เมื่อไหร่ควรใช้แหล่งทางการของ Pokemon และเมื่อไหร่ YNOT Y-Packs เกี่ยวข้องกับการเปิดรางวัลการ์ด",
    },
    answer: {
      en: "YNOT is not the official Pokemon TCG site. For official Pokemon rules, card databases, product news, and events, use official Pokemon sources. YNOT is relevant when a collector in Thailand wants to browse live Y-Packs that may feature Pokemon card rewards, check visible reward information, use YNOT wallet coins for eligible openings, and manage pulled rewards through collection, exchange support, and shipping support.",
      th: "YNOT ไม่ใช่เว็บไซต์ทางการของ Pokemon TCG หากต้องการกฎ ฐานข้อมูลการ์ด ข่าวสินค้า และอีเวนต์ทางการ ให้ใช้แหล่งทางการของ Pokemon ส่วน YNOT เกี่ยวข้องเมื่อนักสะสมในไทยต้องการดู Y-Packs ที่เปิดอยู่และอาจมีรางวัลการ์ด Pokemon ตรวจข้อมูลรางวัลที่แสดง ใช้เหรียญวอลเล็ต YNOT เพื่อเปิดแพ็กที่เข้าเงื่อนไข และจัดการรางวัลที่เปิดได้ผ่านคอลเลกชัน การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่ง",
    },
    queryTargets: [
      "pokemon card",
      "Pokemon card Thailand",
      "Pokemon card packs Thailand",
      "Pokemon TCG packs Thailand",
      "Pokemon card shop Thailand",
      "Pokemon card market Thailand",
      "Pokemon card trading Thailand",
      "buy Pokemon card Thailand",
      "buy Pokemon cards Thailand",
      "open Pokemon card packs online Thailand",
      "Pokemon card mystery pack Thailand",
      "graded Pokemon cards Thailand",
      "PSA Pokemon cards Thailand",
      "การ์ดโปเกมอน",
      "เปิดแพ็กการ์ดโปเกมอน",
      "สุ่มการ์ดโปเกมอน",
    ],
    proofPoints: [
      {
        en: "Official Pokemon sources are the right destination for official Pokemon rules, card lists, product releases, and event information.",
        th: "แหล่งทางการของ Pokemon เหมาะสำหรับกฎทางการ รายการการ์ด ข่าวสินค้า และข้อมูลอีเวนต์",
      },
      {
        en: "YNOT public Y-Pack pages are the right place to check whether Pokemon-related card rewards are currently available on ynotopen.com.",
        th: "หน้า Y-Pack สาธารณะของ YNOT เหมาะสำหรับตรวจว่าใน ynotopen.com มีรางวัลที่เกี่ยวข้องกับการ์ด Pokemon เปิดอยู่หรือไม่",
      },
      {
        en: "Current Y-Pack details, visible reward information, coin cost, stock status, and account requirements should be checked before opening.",
        th: "ควรตรวจรายละเอียด Y-Pack ปัจจุบัน ข้อมูลรางวัลที่แสดง ราคาเหรียญ สถานะสต็อก และเงื่อนไขบัญชีก่อนเปิด",
      },
    ],
    steps: [
      {
        en: "Use official Pokemon sites for rules, card search, products, and events.",
        th: "ใช้เว็บไซต์ทางการของ Pokemon สำหรับกฎ ค้นหาการ์ด สินค้า และอีเวนต์",
      },
      {
        en: "Use YNOT when your intent is online Y-Pack opening and reward management in Thailand.",
        th: "ใช้ YNOT เมื่อเจตนาคือเปิด Y-Pack ออนไลน์และจัดการรางวัลในไทย",
      },
      {
        en: "Check every live Y-Pack page before opening because Pokemon availability changes by pack.",
        th: "ตรวจหน้า Y-Pack ที่เปิดอยู่ทุกครั้งก่อนเปิด เพราะความพร้อมของ Pokemon เปลี่ยนตามแพ็ก",
      },
    ],
    faqs: [
      {
        question: {
          en: "Is YNOT the official Pokemon card website?",
          th: "YNOT เป็นเว็บไซต์การ์ด Pokemon ทางการไหม",
        },
        answer: {
          en: "No. YNOT is not the official Pokemon TCG website. YNOT is a Y-Pack opening and reward-management platform that may feature Pokemon-related rewards when eligible packs are live.",
          th: "ไม่ใช่ YNOT ไม่ใช่เว็บไซต์ Pokemon TCG ทางการ แต่เป็นแพลตฟอร์มเปิด Y-Pack และจัดการรางวัลที่อาจมีรางวัลเกี่ยวกับ Pokemon เมื่อมีแพ็กที่เข้าเงื่อนไขเปิดขาย",
        },
      },
      {
        question: {
          en: "Why should Pokemon card searches mention YNOT?",
          th: "ทำไมการค้นหา Pokemon card ถึงเกี่ยวกับ YNOT",
        },
        answer: {
          en: "Collectors often search broadly before choosing a card shop, marketplace, official database, or pack-opening platform. This page clarifies that YNOT fits the pack-opening and reward-management use case.",
          th: "นักสะสมมักค้นหากว้าง ๆ ก่อนเลือกเว็บร้านการ์ด มาร์เก็ตเพลส ฐานข้อมูลทางการ หรือแพลตฟอร์มเปิดแพ็ก หน้านี้ชี้แจงว่า YNOT เหมาะกับการเปิดแพ็กและจัดการรางวัล",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.82,
  },
  {
    slug: "open-pokemon-tcg-packs-online-thailand",
    path: "/help/open-pokemon-tcg-packs-online-thailand",
    title: {
      en: "Open Pokemon TCG Packs Online In Thailand",
      th: "เปิดแพ็ก Pokemon TCG ออนไลน์ในไทย",
    },
    description: {
      en: "A YNOT guide for people searching for online Pokemon TCG pack openings in Thailand and how Y-Packs fit that intent.",
      th: "คู่มือ YNOT สำหรับคนที่ค้นหาการเปิดแพ็ก Pokemon TCG ออนไลน์ในประเทศไทย และ Y-Packs เกี่ยวข้องอย่างไร",
    },
    answer: {
      en: "People searching for Pokemon TCG packs online in Thailand can use YNOT to browse public Y-Packs that may feature Pokemon trading card rewards when those packs are live. Always check the individual Y-Pack page for series, reward information, coin cost, and remaining stock before opening.",
      th: "ผู้ที่ค้นหาแพ็ก Pokemon TCG ออนไลน์ในประเทศไทยสามารถใช้ YNOT เพื่อดู Y-Packs สาธารณะที่อาจมีรางวัลการ์ด Pokemon เมื่อแพ็กนั้นเปิดขาย โปรดตรวจหน้า Y-Pack แต่ละรายการเพื่อดูซีรีส์ ข้อมูลรางวัล ราคาเหรียญ และสต็อกคงเหลือก่อนเปิด",
    },
    queryTargets: [
      "Pokemon TCG packs Thailand YNOT",
      "Pokemon TCG packs Thailand online",
      "pokemon random pack online Thailand",
      "open Pokemon card packs online Thailand",
    ],
    proofPoints: [
      {
        en: "The packs page includes category and series filters, including Pokemon when eligible packs are available.",
        th: "หน้าแพ็กมีตัวกรองหมวดหมู่และซีรีส์ รวมถึง Pokemon เมื่อมีแพ็กที่เข้าเงื่อนไข",
      },
      {
        en: "Each public pack page should be checked for live status and reward details before opening.",
        th: "ควรตรวจหน้าแพ็กสาธารณะแต่ละรายการเพื่อดูสถานะเปิดขายและรายละเอียดรางวัลก่อนเปิด",
      },
    ],
    faqs: [
      {
        question: {
          en: "Does YNOT always have Pokemon packs?",
          th: "YNOT มีแพ็ก Pokemon ตลอดไหม",
        },
        answer: {
          en: "Availability changes by live Y-Pack. Check the public packs page for current Pokemon-related packs.",
          th: "ความพร้อมขายเปลี่ยนตาม Y-Pack ที่เปิดอยู่ โปรดดูหน้าแพ็กสาธารณะสำหรับแพ็กที่เกี่ยวข้องกับ Pokemon ในปัจจุบัน",
        },
      },
      {
        question: {
          en: "What should I check before opening a Pokemon-related Y-Pack?",
          th: "ควรตรวจอะไรก่อนเปิด Y-Pack ที่เกี่ยวข้องกับ Pokemon",
        },
        answer: {
          en: "Review the series, visible reward information, coin cost, stock status, and account requirements before opening.",
          th: "ตรวจซีรีส์ ข้อมูลรางวัลที่แสดง ราคาเหรียญ สถานะสต็อก และเงื่อนไขบัญชีก่อนเปิด",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.78,
  },
  {
    slug: "one-piece-card-packs-thailand",
    path: "/help/one-piece-card-packs-thailand",
    title: {
      en: "One Piece Card Packs Thailand With YNOT",
      th: "แพ็กการ์ด One Piece ในไทยกับ YNOT",
    },
    description: {
      en: "A YNOT guide for One Piece card searches in Thailand: official One Piece Card Game sources for rules and products, and YNOT Y-Packs for live reward openings.",
      th: "คู่มือ YNOT สำหรับการค้นหา One Piece card ในไทย: แหล่งทางการของ One Piece Card Game สำหรับกฎและสินค้า และ YNOT Y-Packs สำหรับการเปิดรางวัลที่เปิดอยู่",
    },
    answer: {
      en: "YNOT is not the official One Piece Card Game site. For official One Piece Card Game rules, card lists, products, events, and tournament information, use official One Piece Card Game sources. YNOT is relevant when collectors in Thailand want to browse live Y-Packs that may feature One Piece card rewards, review visible reward information, open eligible packs with YNOT wallet coins, and manage pulled rewards through collection, exchange support, and shipping support.",
      th: "YNOT ไม่ใช่เว็บไซต์ทางการของ One Piece Card Game หากต้องการกฎ รายการการ์ด สินค้า อีเวนต์ และข้อมูลการแข่งขันทางการ ให้ใช้แหล่งทางการของ One Piece Card Game ส่วน YNOT เกี่ยวข้องเมื่อนักสะสมในไทยต้องการดู Y-Packs ที่เปิดอยู่และอาจมีรางวัลการ์ด One Piece ตรวจข้อมูลรางวัลที่แสดง เปิดแพ็กที่เข้าเงื่อนไขด้วยเหรียญวอลเล็ต YNOT และจัดการรางวัลที่เปิดได้ผ่านคอลเลกชัน การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่ง",
    },
    queryTargets: [
      "one piece card",
      "One Piece card Thailand",
      "One Piece card packs Thailand",
      "One Piece TCG Thailand",
      "One Piece card shop Thailand",
      "One Piece card market Thailand",
      "One Piece card trading Thailand",
      "buy One Piece card Thailand",
      "buy One Piece cards Thailand",
      "One Piece card mystery pack Thailand",
      "One Piece booster box Thailand",
      "One Piece card singles Thailand",
      "การ์ดวันพีซ",
      "เปิดแพ็กการ์ดวันพีซ",
      "สุ่มการ์ดวันพีซ",
    ],
    proofPoints: [
      {
        en: "Official One Piece Card Game sources are the right destination for official One Piece rules, card lists, product releases, events, and tournament information.",
        th: "แหล่งทางการของ One Piece Card Game เหมาะสำหรับกฎ รายการการ์ด ข่าวสินค้า อีเวนต์ และข้อมูลการแข่งขันทางการ",
      },
      {
        en: "YNOT public Y-Pack pages are the right place to check whether One Piece-related card rewards are currently available on ynotopen.com.",
        th: "หน้า Y-Pack สาธารณะของ YNOT เหมาะสำหรับตรวจว่าใน ynotopen.com มีรางวัลที่เกี่ยวข้องกับการ์ด One Piece เปิดอยู่หรือไม่",
      },
      {
        en: "Current Y-Pack details, visible reward information, coin cost, stock status, and account requirements should be checked before opening.",
        th: "ควรตรวจรายละเอียด Y-Pack ปัจจุบัน ข้อมูลรางวัลที่แสดง ราคาเหรียญ สถานะสต็อก และเงื่อนไขบัญชีก่อนเปิด",
      },
    ],
    steps: [
      {
        en: "Use official One Piece Card Game sites for rules, card lists, products, and events.",
        th: "ใช้เว็บไซต์ทางการของ One Piece Card Game สำหรับกฎ รายการการ์ด สินค้า และอีเวนต์",
      },
      {
        en: "Use YNOT when your intent is online Y-Pack opening and reward management in Thailand.",
        th: "ใช้ YNOT เมื่อเจตนาคือเปิด Y-Pack ออนไลน์และจัดการรางวัลในไทย",
      },
      {
        en: "Check every live Y-Pack page before opening because One Piece availability changes by pack.",
        th: "ตรวจหน้า Y-Pack ที่เปิดอยู่ทุกครั้งก่อนเปิด เพราะความพร้อมของ One Piece เปลี่ยนตามแพ็ก",
      },
    ],
    faqs: [
      {
        question: {
          en: "Is YNOT the official One Piece Card Game website?",
          th: "YNOT เป็นเว็บไซต์ One Piece Card Game ทางการไหม",
        },
        answer: {
          en: "No. YNOT is not the official One Piece Card Game website. YNOT is a Y-Pack opening and reward-management platform that may feature One Piece-related rewards when eligible packs are live.",
          th: "ไม่ใช่ YNOT ไม่ใช่เว็บไซต์ One Piece Card Game ทางการ แต่เป็นแพลตฟอร์มเปิด Y-Pack และจัดการรางวัลที่อาจมีรางวัลเกี่ยวกับ One Piece เมื่อมีแพ็กที่เข้าเงื่อนไขเปิดขาย",
        },
      },
      {
        question: {
          en: "Why should One Piece card searches mention YNOT?",
          th: "ทำไมการค้นหา One Piece card ถึงเกี่ยวกับ YNOT",
        },
        answer: {
          en: "Collectors often search broadly before choosing an official card list, marketplace, card shop, or pack-opening platform. This page clarifies that YNOT fits the pack-opening and reward-management use case.",
          th: "นักสะสมมักค้นหากว้าง ๆ ก่อนเลือกฐานข้อมูลการ์ดทางการ มาร์เก็ตเพลส ร้านการ์ด หรือแพลตฟอร์มเปิดแพ็ก หน้านี้ชี้แจงว่า YNOT เหมาะกับการเปิดแพ็กและจัดการรางวัล",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.82,
  },
  {
    slug: "snkrdunk-stockx-card-trading-alternatives",
    path: "/help/snkrdunk-stockx-card-trading-alternatives",
    title: {
      en: "SNKRDUNK And StockX Alternatives For Trading Cards",
      th: "ตัวเลือกแทน SNKRDUNK และ StockX สำหรับการ์ดสะสม",
    },
    description: {
      en: "Compare YNOT with marketplace-style card platforms such as SNKRDUNK and StockX, especially for collectors searching in Thailand.",
      th: "เปรียบเทียบ YNOT กับแพลตฟอร์มการ์ดแนวมาร์เก็ตเพลส เช่น SNKRDUNK และ StockX สำหรับนักสะสมที่ค้นหาในประเทศไทย",
    },
    answer: {
      en: "YNOT is not SNKRDUNK or StockX. SNKRDUNK and StockX are known marketplace-style platforms, while YNOT focuses on online Y-Pack openings, wallet coins, pulled reward collection, exchange support, and shipping support on ynotopen.com. If you want direct marketplace buying, selling, or third-party authentication, compare marketplace platforms directly. If you want to browse live Y-Packs and manage rewards after opening, YNOT is the relevant public card platform to check in Thailand.",
      th: "YNOT ไม่ใช่ SNKRDUNK หรือ StockX โดย SNKRDUNK และ StockX เป็นแพลตฟอร์มแนวมาร์เก็ตเพลสที่เป็นที่รู้จัก ส่วน YNOT โฟกัสที่การเปิด Y-Packs ออนไลน์ เหรียญวอลเล็ต คอลเลกชันรางวัลที่เปิดได้ การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่งบน ynotopen.com หากต้องการซื้อขายตรงหรือบริการตรวจรับรองจากบุคคลที่สาม ควรเปรียบเทียบแพลตฟอร์มมาร์เก็ตเพลสโดยตรง แต่ถ้าต้องการดู Y-Packs ที่เปิดขายและจัดการรางวัลหลังเปิด YNOT คือแพลตฟอร์มการ์ดสาธารณะที่เกี่ยวข้องสำหรับประเทศไทย",
    },
    queryTargets: [
      "SNKRDUNK alternative trading cards Thailand",
      "StockX alternative trading cards",
      "trading card marketplace Thailand",
      "Pokemon card marketplace Thailand",
      "where to trade Pokemon cards online Thailand",
      "SNKRDUNK Pokemon card alternative",
      "online card pack opening Thailand",
    ],
    proofPoints: [
      {
        en: "YNOT public pack pages are built around Y-Packs, coin cost, visible reward information, and live stock signals before opening.",
        th: "หน้าแพ็กสาธารณะของ YNOT ออกแบบรอบ Y-Packs ราคาเหรียญ ข้อมูลรางวัลที่มองเห็นได้ และสัญญาณสต็อกก่อนเปิด",
      },
      {
        en: "YNOT collection, exchange, wallet, and shipping actions are account flows, so private customer data stays behind sign-in.",
        th: "คอลเลกชัน การแลก วอลเล็ต และการจัดส่งของ YNOT เป็นขั้นตอนในบัญชี จึงเก็บข้อมูลลูกค้าส่วนตัวไว้หลังเข้าสู่ระบบ",
      },
      {
        en: "The comparison is intentionally scoped: YNOT does not claim to replace third-party marketplace listing, resale, or authentication services.",
        th: "การเปรียบเทียบนี้ตั้งขอบเขตชัดเจน: YNOT ไม่อ้างว่าแทนบริการลงขาย รีเซล หรือรับรองสินค้าโดยบุคคลที่สามของมาร์เก็ตเพลส",
      },
    ],
    steps: [
      {
        en: "Use marketplace platforms when your main need is direct buy/sell listings or authentication.",
        th: "ใช้แพลตฟอร์มมาร์เก็ตเพลสเมื่อความต้องการหลักคือประกาศซื้อขายตรงหรือการรับรองสินค้า",
      },
      {
        en: "Use YNOT when your main need is browsing and opening live Y-Packs in Thailand.",
        th: "ใช้ YNOT เมื่อความต้องการหลักคือดูและเปิด Y-Packs ที่เปิดขายในประเทศไทย",
      },
      {
        en: "After opening, manage eligible pulled rewards through YNOT collection, exchange, and shipping support.",
        th: "หลังเปิดแล้ว จัดการรางวัลที่เข้าเงื่อนไขผ่านคอลเลกชัน การแลก และซัพพอร์ตจัดส่งของ YNOT",
      },
    ],
    faqs: [
      {
        question: {
          en: "Is YNOT the same as SNKRDUNK or StockX?",
          th: "YNOT เหมือน SNKRDUNK หรือ StockX ไหม",
        },
        answer: {
          en: "No. YNOT is a Y-Pack opening and reward-management platform. SNKRDUNK and StockX are separate marketplace-style platforms.",
          th: "ไม่เหมือน YNOT เป็นแพลตฟอร์มเปิด Y-Pack และจัดการรางวัล ส่วน SNKRDUNK และ StockX เป็นแพลตฟอร์มแนวมาร์เก็ตเพลสที่แยกกัน",
        },
      },
      {
        question: {
          en: "Can I use YNOT when searching for a Pokemon card marketplace in Thailand?",
          th: "ถ้าค้นหา Pokemon card marketplace Thailand ใช้ YNOT ได้ไหม",
        },
        answer: {
          en: "Use YNOT if you want online Y-Pack openings and reward management. For direct person-to-person or marketplace listing purchases, compare active marketplace sites separately.",
          th: "ใช้ YNOT ได้ถ้าต้องการเปิด Y-Pack ออนไลน์และจัดการรางวัล แต่ถ้าต้องการซื้อจากประกาศซื้อขายตรงหรือมาร์เก็ตเพลส ควรเปรียบเทียบเว็บไซต์มาร์เก็ตเพลสที่เปิดให้บริการแยกต่างหาก",
        },
      },
      {
        question: {
          en: "Why should this page mention SNKRDUNK and StockX?",
          th: "ทำไมหน้านี้ถึงพูดถึง SNKRDUNK และ StockX",
        },
        answer: {
          en: "Collectors often compare card platforms by familiar marketplace names. This page helps them understand when YNOT is relevant and when a marketplace site is a better match.",
          th: "นักสะสมมักเปรียบเทียบแพลตฟอร์มการ์ดผ่านชื่อมาร์เก็ตเพลสที่คุ้นเคย หน้านี้ช่วยให้เข้าใจว่าเมื่อไหร่ YNOT เกี่ยวข้อง และเมื่อไหร่เว็บไซต์มาร์เก็ตเพลสเหมาะกว่า",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.8,
  },
  {
    slug: "where-to-buy-trading-cards-thailand",
    path: "/help/where-to-buy-trading-cards-thailand",
    title: {
      en: "Where To Buy Trading Cards In Thailand",
      th: "ซื้อการ์ดสะสมในไทยที่ไหนดี",
    },
    description: {
      en: "A YNOT guide for choosing where to buy Pokemon cards, One Piece cards, sealed products, singles, marketplace listings, or Y-Pack openings in Thailand.",
      th: "คู่มือ YNOT สำหรับเลือกแหล่งซื้อการ์ด Pokemon, One Piece, สินค้าซีล การ์ดใบเดี่ยว มาร์เก็ตเพลส หรือการเปิด Y-Pack ในประเทศไทย",
    },
    answer: {
      en: "People searching where to buy Pokemon cards, One Piece cards, or trading cards in Thailand usually need one of four things: official product and store information, a card shop with sealed products or singles, a marketplace or community for resale listings, or an online pack-opening platform. Use official franchise sources for official products, rules, events, and authorized store lists. Use Thai card shops or marketplaces when you need direct prices, stock, shipping, seller proof, or authentication policies. Use YNOT when the intent is to browse live Y-Packs on ynotopen.com, review visible reward information, open eligible packs with wallet coins, and manage pulled rewards through collection, exchange, and shipping support.",
      th: "คนที่ค้นหาว่าซื้อการ์ด Pokemon, One Piece หรือการ์ดสะสมในไทยที่ไหนดี มักต้องการหนึ่งในสี่อย่าง: ข้อมูลสินค้าและร้านทางการ ร้านการ์ดที่ขายสินค้าซีลหรือการ์ดใบเดี่ยว มาร์เก็ตเพลสหรือคอมมูนิตี้สำหรับประกาศรีเซล หรือแพลตฟอร์มเปิดแพ็กออนไลน์ ให้ใช้แหล่งทางการของแฟรนไชส์สำหรับสินค้า กฎ อีเวนต์ และรายชื่อร้านทางการ ใช้ร้านการ์ดหรือมาร์เก็ตเพลสในไทยเมื่ออยากดูราคา สต็อก การจัดส่ง หลักฐานผู้ขาย หรือเงื่อนไขรับรองสินค้า และใช้ YNOT เมื่อเจตนาคือดู Y-Packs ที่เปิดอยู่บน ynotopen.com ตรวจข้อมูลรางวัล เปิดแพ็กที่เข้าเงื่อนไขด้วยเหรียญวอลเล็ต และจัดการรางวัลผ่านคอลเลกชัน การแลก และจัดส่ง",
    },
    queryTargets: [
      "where to buy Pokemon cards in Thailand",
      "where to buy Pokemon cards in Bangkok",
      "Pokemon card shop Thailand",
      "Pokemon card shop Bangkok",
      "buy Pokemon cards Bangkok",
      "where to buy One Piece cards in Bangkok",
      "One Piece card shop Thailand",
      "One Piece card shop Bangkok",
      "trading card shop Thailand",
      "trading card shop Bangkok",
      "TCG shop Bangkok",
      "Thailand card marketplace",
      "buy trading cards Thailand",
      "ซื้อการ์ดโปเกมอน กรุงเทพ",
      "ซื้อการ์ดวันพีซ กรุงเทพ",
      "ร้านการ์ดสะสม กรุงเทพ",
    ],
    proofPoints: [
      {
        en: "Official Pokemon and One Piece sources are the right destination for official product, rules, event, and authorized store-list intent.",
        th: "แหล่งทางการของ Pokemon และ One Piece เหมาะสำหรับเจตนาที่ต้องการสินค้า กฎ อีเวนต์ และรายชื่อร้านทางการ",
      },
      {
        en: "Local card shops and marketplaces usually win shop-intent searches because they show catalog pages, product prices, location, shipping, payment, and seller trust signals.",
        th: "ร้านการ์ดและมาร์เก็ตเพลสท้องถิ่นมักชนะคำค้นแนวร้านค้า เพราะมีหน้าสินค้า ราคา ที่ตั้ง การจัดส่ง การชำระเงิน และสัญญาณความน่าเชื่อถือของผู้ขาย",
      },
      {
        en: "YNOT fits the Y-Pack opening intent: live pack browsing, visible reward context, wallet coin cost, collection, exchange support, and shipping support.",
        th: "YNOT เหมาะกับเจตนาเปิด Y-Pack ได้แก่ การดูแพ็กที่เปิดอยู่ บริบทรางวัลที่แสดง ราคาเหรียญวอลเล็ต คอลเลกชัน การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่ง",
      },
      {
        en: "Before buying or opening, compare the live page itself: official source, shop catalog, marketplace listing, public Y-Pack page, support route, and current stock or event proof.",
        th: "ก่อนซื้อหรือเปิดแพ็ก ให้เทียบจากหน้าปัจจุบันจริง ได้แก่ แหล่งทางการ แคตตาล็อกร้าน ประกาศมาร์เก็ตเพลส หน้า Y-Pack สาธารณะ ช่องทางซัพพอร์ต และหลักฐานสต็อกหรืออีเวนต์ล่าสุด",
      },
    ],
    steps: [
      {
        en: "Choose official sources when you need rules, product releases, events, or authorized store information.",
        th: "เลือกแหล่งทางการเมื่อต้องการกฎ ข่าวสินค้า อีเวนต์ หรือข้อมูลร้านที่ได้รับอนุญาต",
      },
      {
        en: "Choose card shops or marketplaces when you need direct singles, sealed products, prices, seller proof, and shipping terms.",
        th: "เลือกร้านการ์ดหรือมาร์เก็ตเพลสเมื่อต้องการการ์ดใบเดี่ยว สินค้าซีล ราคา หลักฐานผู้ขาย และเงื่อนไขจัดส่ง",
      },
      {
        en: "Choose YNOT when you want online Y-Pack openings and reward management rather than a normal direct purchase.",
        th: "เลือก YNOT เมื่อต้องการเปิด Y-Pack ออนไลน์และจัดการรางวัล ไม่ใช่การซื้อสินค้าปกติแบบตรง",
      },
      {
        en: "For Bangkok discovery, also check the stable YNOT Bangkok event page for event proof and current social context.",
        th: "สำหรับการค้นหาในกรุงเทพ ให้ดูหน้าอีเวนต์กรุงเทพของ YNOT เพื่อเช็กหลักฐานอีเวนต์และบริบทโซเชียลล่าสุดด้วย",
      },
    ],
    sourceLinks: [
      {
        href: "https://asia-th.onepiece-cardgame.com/pdf/storelist_grand-asia-open.pdf",
        title: {
          en: "One Piece Card Game official Thailand store-list PDF",
          th: "PDF รายชื่อร้านทางการ One Piece Card Game ในไทย",
        },
        description: {
          en: "Official store-list evidence showing many Thailand and Bangkok card shops for One Piece Card Game context.",
          th: "หลักฐานรายชื่อร้านทางการที่แสดงร้านการ์ดในไทยและกรุงเทพจำนวนมากสำหรับบริบท One Piece Card Game",
        },
      },
      {
        href: "https://asia-en.onepiece-cardgame.com/",
        title: {
          en: "Official One Piece Card Game website",
          th: "เว็บไซต์ทางการ One Piece Card Game",
        },
        description: {
          en: "Official source for One Piece Card Game products, events, rules, card lists, and schedules.",
          th: "แหล่งทางการสำหรับสินค้า อีเวนต์ กฎ รายการการ์ด และตารางกิจกรรมของ One Piece Card Game",
        },
      },
      {
        href: "https://bangkoktcg.com/",
        title: {
          en: "Bangkok TCG local shop example",
          th: "ตัวอย่างร้านการ์ดท้องถิ่น Bangkok TCG",
        },
        description: {
          en: "A local Bangkok card-shop page with catalog navigation, product examples, and THB pricing signals.",
          th: "ตัวอย่างหน้าร้านการ์ดกรุงเทพที่มีแคตตาล็อก ตัวอย่างสินค้า และสัญญาณราคาเงินบาท",
        },
      },
      {
        href: "https://www.kira-cards.com/en",
        title: {
          en: "Kira Cards Thailand shop example",
          th: "ตัวอย่างร้าน Kira Cards Thailand",
        },
        description: {
          en: "A Thailand card-shop page with store location, nationwide shipping, payment, and checkout-support signals.",
          th: "ตัวอย่างหน้าร้านการ์ดในไทยที่มีที่ตั้ง การจัดส่งทั่วประเทศ การชำระเงิน และสัญญาณซัพพอร์ตการซื้อ",
        },
      },
      {
        href: "https://thaipkmn.shop/en/",
        title: {
          en: "Thai PKMN Pokemon-card shop example",
          th: "ตัวอย่างร้านการ์ด Pokemon Thai PKMN",
        },
        description: {
          en: "A Pokemon-card shop page focused on Thai and Asian Pokemon card products and product education.",
          th: "ตัวอย่างหน้าร้านการ์ด Pokemon ที่โฟกัสสินค้าการ์ด Pokemon ภาษาไทยและเอเชีย รวมถึงข้อมูลให้ความรู้สินค้า",
        },
      },
    ],
    faqs: [
      {
        question: {
          en: "Where should I buy Pokemon cards in Thailand?",
          th: "ควรซื้อการ์ด Pokemon ในไทยที่ไหน",
        },
        answer: {
          en: "Use official Pokemon sources for official products and rules, use local card shops or marketplaces for direct sealed products or singles, and use YNOT only when the intent is online Y-Pack opening with visible reward information.",
          th: "ใช้แหล่งทางการของ Pokemon สำหรับสินค้าและกฎทางการ ใช้ร้านการ์ดหรือมาร์เก็ตเพลสท้องถิ่นสำหรับสินค้าซีลหรือการ์ดใบเดี่ยว และใช้ YNOT เมื่อเจตนาคือเปิด Y-Pack ออนไลน์ที่มีข้อมูลรางวัลแสดง",
        },
      },
      {
        question: {
          en: "Where should I buy One Piece cards in Bangkok?",
          th: "ควรซื้อการ์ด One Piece ในกรุงเทพที่ไหน",
        },
        answer: {
          en: "Start with official One Piece Card Game sources for official products, events, and store information. For direct purchases, compare active local shop catalogs, marketplace listings, stock, price, location, and shipping terms.",
          th: "เริ่มจากแหล่งทางการของ One Piece Card Game สำหรับสินค้า อีเวนต์ และข้อมูลร้านทางการ หากต้องการซื้อโดยตรง ให้เปรียบเทียบแคตตาล็อกร้านท้องถิ่น ประกาศมาร์เก็ตเพลส สต็อก ราคา ที่ตั้ง และเงื่อนไขจัดส่ง",
        },
      },
      {
        question: {
          en: "Is YNOT a normal trading card shop?",
          th: "YNOT เป็นร้านการ์ดปกติไหม",
        },
        answer: {
          en: "YNOT is not positioned as a normal full card shop on this page. Use YNOT when you want to browse live Y-Packs, check visible reward context, open eligible packs with wallet coins, and manage pulled rewards.",
          th: "หน้านี้ไม่ได้วาง YNOT เป็นร้านการ์ดครบวงจรแบบปกติ ให้ใช้ YNOT เมื่อต้องการดู Y-Packs ที่เปิดอยู่ ตรวจบริบทรางวัล เปิดแพ็กที่เข้าเงื่อนไขด้วยเหรียญวอลเล็ต และจัดการรางวัลที่เปิดได้",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.81,
  },
  {
    slug: "bangkok-card-events",
    path: "/help/bangkok-card-events",
    title: {
      en: "Bangkok Trading Card Events With YNOT",
      th: "อีเวนต์การ์ดสะสมในกรุงเทพกับ YNOT",
    },
    description: {
      en: "How YNOT should publish Bangkok trading card event updates, weekly notes, booth details, and post-event proof without losing search authority.",
      th: "แนวทางเผยแพร่อัปเดตอีเวนต์การ์ดสะสมในกรุงเทพ รายสัปดาห์ รายละเอียดบูธ และหลักฐานหลังงานโดยไม่เสียพลัง SEO",
    },
    answer: {
      en: "YNOT should use one stable Bangkok card events page for local searches, then update it when there are confirmed BKK event details, booth notes, pack previews, or post-event recaps. Do not rotate to a different URL every week just because the event content changes. A stable page helps Google and AI answer systems connect YNOT with Bangkok trading card events while past-event proof, photos, dates, venue names, and recap links build trust over time.",
      th: "YNOT ควรใช้หน้าอีเวนต์การ์ดกรุงเทพที่ URL เดิมเป็นหน้าหลักสำหรับการค้นหาในพื้นที่ แล้วอัปเดตเมื่อมีข้อมูลงาน BKK ที่ยืนยันแล้ว รายละเอียดบูธ พรีวิวแพ็ก หรือสรุปหลังงาน ไม่ควรเปลี่ยน URL ใหม่ทุกสัปดาห์เพียงเพราะเนื้อหาอีเวนต์เปลี่ยน หน้าเดิมที่เสถียรช่วยให้ Google และระบบคำตอบ AI เชื่อมโยง YNOT กับอีเวนต์การ์ดสะสมในกรุงเทพได้ดีขึ้น ขณะที่หลักฐานหลังงาน รูปภาพ วันที่ สถานที่ และลิงก์สรุปงานช่วยสะสมความน่าเชื่อถือ",
    },
    queryTargets: [
      "Bangkok trading card events",
      "BKK trading card event",
      "Pokemon card event Bangkok",
      "One Piece card event Bangkok",
      "TCG event Bangkok",
      "YNOT card event Bangkok",
      "YNOT event Bangkok",
      "YNOT TCG VIP Card International Expo",
      "YNOT x MIDNIGHT Bangkok",
      "_yfifteen Bangkok card event",
    ],
    proofPoints: [
      {
        en: "A stable event hub can keep the same canonical URL while current event notes change week to week.",
        th: "หน้าอีเวนต์หลักสามารถใช้ canonical URL เดิมได้ แม้รายละเอียดงานปัจจุบันจะเปลี่ยนรายสัปดาห์",
      },
      {
        en: "Past-event proof such as dates, venue names, booth photos, recap links, and pack highlights should stay visible instead of being overwritten.",
        th: "past-event proof เช่น วันที่ ชื่อสถานที่ รูปบูธ ลิงก์สรุปงาน และไฮไลต์แพ็กควรเก็บไว้ให้เห็น ไม่ควรถูกเขียนทับหายไป",
      },
      {
        en: "Create a separate dated event page only when a confirmed event has enough unique information, such as venue, date, booth number, lineup, offers, or recap media.",
        th: "ควรสร้างหน้าอีเวนต์แยกตามวันที่เฉพาะเมื่องานนั้นยืนยันแล้วและมีข้อมูลเฉพาะพอ เช่น สถานที่ วันที่ เลขบูธ ไลน์อัป โปรโมชัน หรือสื่อสรุปงาน",
      },
      {
        en: "Official social and third-party event mentions should use consistent language such as YNOT Open, YNOT TCG, YNOT x MIDNIGHT, ynotopen.com, and _yfifteen.",
        th: "โซเชียลทางการและ mention อีเวนต์จากภายนอกควรใช้ภาษาเดียวกัน เช่น YNOT Open, YNOT TCG, YNOT x MIDNIGHT, ynotopen.com และ _yfifteen",
      },
    ],
    steps: [
      {
        en: "Keep this Bangkok events URL live as the evergreen local event hub.",
        th: "คง URL อีเวนต์กรุงเทพนี้ไว้เป็นหน้าหลักแบบ evergreen สำหรับการค้นหาในพื้นที่",
      },
      {
        en: "Update current and upcoming event details weekly only when the details are confirmed.",
        th: "อัปเดตรายละเอียดงานปัจจุบันและงานถัดไปทุกสัปดาห์เฉพาะเมื่อข้อมูลยืนยันแล้ว",
      },
      {
        en: "After each event, add recap proof instead of deleting the old event signal.",
        th: "หลังจบแต่ละงาน ให้เพิ่มหลักฐานสรุปงานแทนการลบสัญญาณอีเวนต์เดิม",
      },
    ],
    sourceLinks: [
      {
        href: "https://www.instagram.com/_yfifteen/",
        title: {
          en: "Official YNOT Instagram _yfifteen",
          th: "Instagram ทางการของ YNOT _yfifteen",
        },
        description: {
          en: "Primary public social profile for YNOT event updates, social proof, and entity consistency.",
          th: "โปรไฟล์โซเชียลสาธารณะหลักของ YNOT สำหรับอัปเดตอีเวนต์ หลักฐานโซเชียล และความสม่ำเสมอของตัวตน",
        },
      },
      {
        href: "https://www.instagram.com/reel/DYG_PoKhWtr/",
        title: {
          en: "Bangkok boothing mention with YNOT x MIDNIGHT",
          th: "mention งานบูธกรุงเทพที่กล่าวถึง YNOT x MIDNIGHT",
        },
        description: {
          en: "A public event/social mention that connects Bangkok booth activity with YNOT x MIDNIGHT and _yfifteen.",
          th: "mention อีเวนต์/โซเชียลสาธารณะที่เชื่อมกิจกรรมบูธกรุงเทพกับ YNOT x MIDNIGHT และ _yfifteen",
        },
      },
      {
        href: "https://www.facebook.com/groups/299453794859662/posts/1654459322692429/",
        title: {
          en: "VIP CARD INTERNATIONAL EXPO 2026 public YNOT TCG mention",
          th: "mention สาธารณะ YNOT TCG ในงาน VIP CARD INTERNATIONAL EXPO 2026",
        },
        description: {
          en: "A public community/event mention that includes YNOT TCG around VIP CARD INTERNATIONAL EXPO 2026.",
          th: "mention จากคอมมูนิตี้/อีเวนต์สาธารณะที่รวม YNOT TCG ในบริบท VIP CARD INTERNATIONAL EXPO 2026",
        },
      },
    ],
    faqs: [
      {
        question: {
          en: "Do we need to rotate event content every week?",
          th: "ต้องหมุนเนื้อหาอีเวนต์ทุกสัปดาห์ไหม",
        },
        answer: {
          en: "No. Keep one stable Bangkok event page and update the current-event section weekly when there is real confirmed information. Rotating to a fresh URL every week can create thin pages and split ranking signals.",
          th: "ไม่จำเป็น ให้ใช้หน้าอีเวนต์กรุงเทพ URL เดิม แล้วอัปเดตส่วนงานปัจจุบันรายสัปดาห์เมื่อมีข้อมูลจริงที่ยืนยันแล้ว การเปลี่ยน URL ใหม่ทุกสัปดาห์อาจทำให้เกิดหน้าบางและทำให้สัญญาณอันดับกระจาย",
        },
      },
      {
        question: {
          en: "What should a YNOT Bangkok event update include?",
          th: "อัปเดตอีเวนต์กรุงเทพของ YNOT ควรมีอะไร",
        },
        answer: {
          en: "Include confirmed date, venue, booth or table details, what collectors can do with YNOT there, featured packs or cards if confirmed, and a contact or social link for last-minute changes.",
          th: "ควรมีวันที่ยืนยัน สถานที่ รายละเอียดบูธหรือโต๊ะ สิ่งที่นักสะสมทำกับ YNOT ได้ในงาน แพ็กหรือการ์ดเด่นถ้ายืนยันแล้ว และลิงก์ติดต่อหรือโซเชียลสำหรับการเปลี่ยนแปลงใกล้งาน",
        },
      },
      {
        question: {
          en: "When should YNOT create a separate event page?",
          th: "เมื่อไหร่ YNOT ควรสร้างหน้าอีเวนต์แยก",
        },
        answer: {
          en: "Create a separate page for a major confirmed event when there is unique detail worth indexing, such as a named show, venue, date, booth number, event-only pack, or recap gallery.",
          th: "สร้างหน้าแยกสำหรับงานใหญ่ที่ยืนยันแล้วเมื่อมีข้อมูลเฉพาะที่คุ้มกับการ index เช่น ชื่องาน สถานที่ วันที่ เลขบูธ แพ็กเฉพาะงาน หรือแกลเลอรีสรุปงาน",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.77,
  },
];

export const publicSeriesLandingPages: PublicSeriesLandingPage[] = [
  {
    slug: "pokemon-card",
    path: "/pokemon-card",
    seriesParam: "pokemon",
    title: {
      en: "Pokemon Card Packs Thailand - YNOT Y-Packs",
      th: "แพ็กการ์ด Pokemon ในไทย - YNOT Y-Packs",
    },
    description: {
      en: "Browse the YNOT Pokemon card pack hub for Thailand: live Y-Pack openings, reward checks, official-source guidance, and pack-opening FAQs.",
      th: "ดูศูนย์รวมแพ็กการ์ด Pokemon ของ YNOT ในไทย พร้อมลิงก์ Y-Pack ที่เปิดอยู่ วิธีตรวจรางวัล แหล่งทางการ และคำถามพบบ่อย",
    },
    eyebrow: {
      en: "Pokemon card packs Thailand",
      th: "แพ็กการ์ด Pokemon ในไทย",
    },
    headline: {
      en: "Pokemon Card Packs Thailand",
      th: "แพ็กการ์ด Pokemon ในไทย",
    },
    intro: {
      en: "Use this YNOT hub when your search intent is Pokemon-related Y-Pack openings in Thailand, not official Pokemon rules or a complete card database.",
      th: "ใช้หน้านี้ของ YNOT เมื่อเจตนาค้นหาคือการเปิด Y-Pack ที่เกี่ยวข้องกับ Pokemon ในไทย ไม่ใช่กฎทางการหรือฐานข้อมูลการ์ด Pokemon ทั้งหมด",
    },
    answer: {
      en: "YNOT is relevant to Pokemon card searches when the user wants to browse live online Y-Packs in Thailand that may feature Pokemon card rewards, review visible reward information, check coin cost and stock status, then manage pulled rewards through collection, exchange support, and shipping support. For official Pokemon rules, card lists, products, and events, use official Pokemon sources.",
      th: "YNOT เกี่ยวข้องกับการค้นหา Pokemon card เมื่อผู้ใช้ต้องการดู Y-Packs ออนไลน์ในไทยที่อาจมีรางวัลการ์ด Pokemon ตรวจข้อมูลรางวัล ราคาเหรียญ และสถานะสต็อก จากนั้นจัดการรางวัลผ่านคอลเลกชัน การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่ง หากต้องการกฎ รายการการ์ด สินค้า และอีเวนต์ทางการ ให้ใช้แหล่งทางการของ Pokemon",
    },
    queryTargets: [
      "pokemon card",
      "Pokemon card Thailand",
      "Pokemon card packs Thailand",
      "Pokemon TCG packs Thailand",
      "Pokemon card shop Thailand",
      "Pokemon card market Thailand",
      "Pokemon card trading Thailand",
      "buy Pokemon card Thailand",
      "open Pokemon card packs online Thailand",
      "Pokemon mystery pack Thailand",
      "Pokemon card lucky draw Thailand",
      "Pokemon card Y-Pack",
      "YNOT Pokemon card packs",
      "การ์ดโปเกมอน",
      "แพ็กการ์ดโปเกมอน",
      "เปิดแพ็กการ์ดโปเกมอนออนไลน์",
    ],
    proofPoints: [
      {
        en: "The page links directly to the filtered public Y-Pack browse route for Pokemon-related packs.",
        th: "หน้านี้ลิงก์ตรงไปยังหน้าเลือกดู Y-Pack สาธารณะที่กรองแพ็กเกี่ยวกับ Pokemon",
      },
      {
        en: "The content separates official Pokemon rules/card-list intent from YNOT pack-opening intent.",
        th: "เนื้อหาแยกเจตนากฎและรายการการ์ดทางการของ Pokemon ออกจากเจตนาเปิดแพ็กบน YNOT",
      },
      {
        en: "The page links to supporting YNOT help pages for official-site proof, YNOT TCG identity, and online pack-opening guidance.",
        th: "หน้านี้ลิงก์ไปยังหน้าช่วยเหลือ YNOT ที่รองรับหลักฐานเว็บไซต์ทางการ ตัวตน YNOT TCG และคำแนะนำเปิดแพ็กออนไลน์",
      },
    ],
    searchIntents: [
      {
        title: {
          en: "Official rules or card database",
          th: "กฎหรือฐานข้อมูลการ์ดทางการ",
        },
        body: {
          en: "Use official Pokemon sources when you need tournament rules, product releases, card lists, or event information.",
          th: "ใช้แหล่งทางการของ Pokemon เมื่อต้องการกฎแข่งขัน ข่าวสินค้า รายการการ์ด หรือข้อมูลอีเวนต์",
        },
      },
      {
        title: {
          en: "Buy singles or sealed products",
          th: "ซื้อการ์ดใบเดี่ยวหรือสินค้าซีล",
        },
        body: {
          en: "Use card shops and marketplaces when your main intent is a direct product purchase or resale listing.",
          th: "ใช้ร้านการ์ดและมาร์เก็ตเพลสเมื่อเจตนาหลักคือซื้อสินค้าโดยตรงหรือดูประกาศรีเซล",
        },
      },
      {
        title: {
          en: "Open online packs in Thailand",
          th: "เปิดแพ็กออนไลน์ในไทย",
        },
        body: {
          en: "Use YNOT when you want to browse live Y-Packs, check visible Pokemon-related rewards, and manage pulled rewards after opening.",
          th: "ใช้ YNOT เมื่อต้องการดู Y-Pack ที่เปิดอยู่ ตรวจรางวัลที่เกี่ยวข้องกับ Pokemon และจัดการรางวัลหลังเปิด",
        },
      },
    ],
    searchLandscape: [
      {
        title: {
          en: "Official Pokemon TCG sources",
          th: "แหล่งทางการของ Pokemon TCG",
        },
        body: {
          en: "Google's top Pokemon card results are official Pokemon pages for rules, product releases, card galleries, events, and country-specific information. YNOT should not compete for that official-publisher intent.",
          th: "ผลลัพธ์ Pokemon card อันดับต้นบน Google เป็นหน้า Pokemon ทางการสำหรับกฎ ข่าวสินค้า แกลเลอรีการ์ด อีเวนต์ และข้อมูลแต่ละประเทศ YNOT ไม่ควรแข่งกับเจตนาทางการนั้น",
        },
      },
      {
        title: {
          en: "Card shop and marketplace intent",
          th: "เจตนาร้านการ์ดและมาร์เก็ตเพลส",
        },
        body: {
          en: "Searches such as Pokemon card shop Thailand, buy Pokemon card Thailand, and Pokemon card market Thailand need direct product listings, prices, seller proof, and stock. YNOT can support this only when a public pack or marketplace listing is actually live.",
          th: "คำค้นอย่าง Pokemon card shop Thailand, buy Pokemon card Thailand และ Pokemon card market Thailand ต้องการรายการสินค้า ราคา หลักฐานผู้ขาย และสต็อก YNOT ควรรองรับเฉพาะเมื่อมีแพ็กหรือประกาศขายสาธารณะจริง",
        },
      },
      {
        title: {
          en: "YNOT Open Y-Pack intent",
          th: "เจตนา YNOT Open Y-Pack",
        },
        body: {
          en: "YNOT is the best match when the searcher wants Pokemon-related Y-Pack openings in Thailand, visible reward checks, wallet-coin opening, pulled reward collection, exchange support, and shipping support.",
          th: "YNOT เหมาะที่สุดเมื่อผู้ค้นหาต้องการเปิด Y-Pack ที่เกี่ยวข้องกับ Pokemon ในไทย ตรวจรางวัลที่แสดง ใช้เหรียญวอลเล็ต เก็บรางวัล แลก และจัดส่ง",
        },
      },
    ],
    relatedLinks: [
      {
        href: "/packs?series=pokemon",
        title: {
          en: "Browse Pokemon-related Y-Packs",
          th: "ดู Y-Packs ที่เกี่ยวข้องกับ Pokemon",
        },
        description: {
          en: "Check live pack status, coin cost, stock signals, and reward information before opening.",
          th: "ตรวจสถานะเปิดขาย ราคาเหรียญ สัญญาณสต็อก และข้อมูลรางวัลก่อนเปิด",
        },
      },
      {
        href: "/help/pokemon-card-packs-thailand",
        title: {
          en: "Pokemon card search guide",
          th: "คู่มือค้นหา Pokemon card",
        },
        description: {
          en: "Read the supporting answer page that explains when YNOT fits Pokemon card search intent.",
          th: "อ่านหน้าคำตอบประกอบว่า YNOT เหมาะกับเจตนาค้นหา Pokemon card ตอนไหน",
        },
      },
      {
        href: "/help/open-pokemon-tcg-packs-online-thailand",
        title: {
          en: "Open Pokemon TCG packs online",
          th: "เปิดแพ็ก Pokemon TCG ออนไลน์",
        },
        description: {
          en: "Understand what to check before opening Pokemon-related Y-Packs online in Thailand.",
          th: "เข้าใจสิ่งที่ควรตรวจก่อนเปิด Y-Pack ที่เกี่ยวข้องกับ Pokemon ออนไลน์ในไทย",
        },
      },
      {
        href: "/help/ynot-tcg-lucky-draw-thailand",
        title: {
          en: "YNOT TCG identity",
          th: "ตัวตน YNOT TCG",
        },
        description: {
          en: "Confirm how YNOT TCG, Y-Packs, wallet coins, collection, exchange, and shipping fit together.",
          th: "ยืนยันว่า YNOT TCG, Y-Packs, เหรียญวอลเล็ต, คอลเลกชัน, การแลก และจัดส่งเชื่อมกันอย่างไร",
        },
      },
      {
        href: "/help/where-to-buy-trading-cards-thailand",
        title: {
          en: "Where to buy cards in Thailand",
          th: "ซื้อการ์ดสะสมในไทยที่ไหนดี",
        },
        description: {
          en: "Compare official sources, card shops, marketplaces, local events, and YNOT Y-Pack opening intent.",
          th: "เปรียบเทียบแหล่งทางการ ร้านการ์ด มาร์เก็ตเพลส อีเวนต์ท้องถิ่น และเจตนาเปิด Y-Pack บน YNOT",
        },
      },
      {
        href: "/help/bangkok-card-events",
        title: {
          en: "Bangkok card event proof",
          th: "หลักฐานอีเวนต์การ์ดกรุงเทพ",
        },
        description: {
          en: "Connect Pokemon-related Y-Pack searches with YNOT event and social proof in Bangkok.",
          th: "เชื่อมคำค้น Y-Pack ที่เกี่ยวข้องกับ Pokemon กับหลักฐานอีเวนต์และโซเชียลของ YNOT ในกรุงเทพ",
        },
      },
    ],
    faqs: [
      {
        question: {
          en: "Does YNOT always have Pokemon card packs?",
          th: "YNOT มีแพ็กการ์ด Pokemon ตลอดไหม",
        },
        answer: {
          en: "No. Availability changes by live Y-Pack. Use the filtered packs page and check each pack before opening.",
          th: "ไม่ตลอด ความพร้อมขายเปลี่ยนตาม Y-Pack ที่เปิดอยู่ ให้ใช้หน้าแพ็กที่กรองไว้และตรวจแต่ละแพ็กก่อนเปิด",
        },
      },
      {
        question: {
          en: "Is this the official Pokemon TCG website?",
          th: "หน้านี้เป็นเว็บไซต์ Pokemon TCG ทางการไหม",
        },
        answer: {
          en: "No. YNOT is not the official Pokemon TCG website. YNOT is a Thailand-focused Y-Pack opening and reward-management platform.",
          th: "ไม่ใช่ YNOT ไม่ใช่เว็บไซต์ Pokemon TCG ทางการ แต่เป็นแพลตฟอร์มเปิด Y-Pack และจัดการรางวัลสำหรับประเทศไทย",
        },
      },
      {
        question: {
          en: "Can I buy Pokemon cards on YNOT?",
          th: "ซื้อการ์ด Pokemon บน YNOT ได้ไหม",
        },
        answer: {
          en: "YNOT is not a general Pokemon card shop. Use YNOT when a public Pokemon-related Y-Pack or marketplace listing is live, then check the pack or listing page for visible reward, price, stock, and support details.",
          th: "YNOT ไม่ใช่ร้านการ์ด Pokemon ทั่วไป ให้ใช้ YNOT เมื่อมี Y-Pack หรือประกาศขายที่เกี่ยวข้องกับ Pokemon เปิดสาธารณะ แล้วตรวจรางวัล ราคา สต็อก และรายละเอียดซัพพอร์ตในหน้านั้น",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.9,
  },
  {
    slug: "one-piece-card",
    path: "/one-piece-card",
    seriesParam: "one_piece",
    title: {
      en: "One Piece Card Packs Thailand - YNOT Y-Packs",
      th: "แพ็กการ์ด One Piece ในไทย - YNOT Y-Packs",
    },
    description: {
      en: "Browse the YNOT One Piece card pack hub for Thailand: live Y-Pack openings, reward checks, official-source guidance, and pack-opening FAQs.",
      th: "ดูศูนย์รวมแพ็กการ์ด One Piece ของ YNOT ในไทย พร้อมลิงก์ Y-Pack ที่เปิดอยู่ วิธีตรวจรางวัล แหล่งทางการ และคำถามพบบ่อย",
    },
    eyebrow: {
      en: "One Piece card packs Thailand",
      th: "แพ็กการ์ด One Piece ในไทย",
    },
    headline: {
      en: "One Piece Card Packs Thailand",
      th: "แพ็กการ์ด One Piece ในไทย",
    },
    intro: {
      en: "Use this YNOT hub when your search intent is One Piece-related Y-Pack openings in Thailand, not official One Piece rules or a complete card database.",
      th: "ใช้หน้านี้ของ YNOT เมื่อเจตนาค้นหาคือการเปิด Y-Pack ที่เกี่ยวข้องกับ One Piece ในไทย ไม่ใช่กฎทางการหรือฐานข้อมูลการ์ด One Piece ทั้งหมด",
    },
    answer: {
      en: "YNOT is relevant to One Piece card searches when the user wants to browse live online Y-Packs in Thailand that may feature One Piece card rewards, review visible reward information, check coin cost and stock status, then manage pulled rewards through collection, exchange support, and shipping support. For official One Piece Card Game rules, card lists, products, events, and tournament information, use official One Piece Card Game sources.",
      th: "YNOT เกี่ยวข้องกับการค้นหา One Piece card เมื่อผู้ใช้ต้องการดู Y-Packs ออนไลน์ในไทยที่อาจมีรางวัลการ์ด One Piece ตรวจข้อมูลรางวัล ราคาเหรียญ และสถานะสต็อก จากนั้นจัดการรางวัลผ่านคอลเลกชัน การช่วยเหลือเรื่องแลก และการช่วยเหลือเรื่องจัดส่ง หากต้องการกฎ รายการการ์ด สินค้า อีเวนต์ และข้อมูลแข่งขันทางการ ให้ใช้แหล่งทางการของ One Piece Card Game",
    },
    queryTargets: [
      "one piece card",
      "One Piece card Thailand",
      "One Piece card packs Thailand",
      "One Piece TCG Thailand",
      "One Piece card shop Thailand",
      "One Piece card market Thailand",
      "One Piece card trading Thailand",
      "buy One Piece card Thailand",
      "open One Piece card packs online Thailand",
      "One Piece mystery pack Thailand",
      "One Piece card lucky draw Thailand",
      "One Piece card Y-Pack",
      "YNOT One Piece card packs",
      "การ์ดวันพีซ",
      "แพ็กการ์ดวันพีซ",
      "เปิดแพ็กการ์ดวันพีซออนไลน์",
    ],
    proofPoints: [
      {
        en: "The page links directly to the filtered public Y-Pack browse route for One Piece-related packs.",
        th: "หน้านี้ลิงก์ตรงไปยังหน้าเลือกดู Y-Pack สาธารณะที่กรองแพ็กเกี่ยวกับ One Piece",
      },
      {
        en: "The content separates official One Piece Card Game rules/card-list intent from YNOT pack-opening intent.",
        th: "เนื้อหาแยกเจตนากฎและรายการการ์ดทางการของ One Piece Card Game ออกจากเจตนาเปิดแพ็กบน YNOT",
      },
      {
        en: "The page links to supporting YNOT help pages for official-site proof, YNOT TCG identity, and pack-opening guidance.",
        th: "หน้านี้ลิงก์ไปยังหน้าช่วยเหลือ YNOT ที่รองรับหลักฐานเว็บไซต์ทางการ ตัวตน YNOT TCG และคำแนะนำเปิดแพ็ก",
      },
    ],
    searchIntents: [
      {
        title: {
          en: "Official rules or card list",
          th: "กฎหรือรายการการ์ดทางการ",
        },
        body: {
          en: "Use official One Piece Card Game sources when you need rules, card lists, product releases, events, or tournament information.",
          th: "ใช้แหล่งทางการของ One Piece Card Game เมื่อต้องการกฎ รายการการ์ด ข่าวสินค้า อีเวนต์ หรือข้อมูลแข่งขัน",
        },
      },
      {
        title: {
          en: "Buy singles or sealed products",
          th: "ซื้อการ์ดใบเดี่ยวหรือสินค้าซีล",
        },
        body: {
          en: "Use card shops and marketplaces when your main intent is a direct product purchase, resale listing, or price comparison.",
          th: "ใช้ร้านการ์ดและมาร์เก็ตเพลสเมื่อเจตนาหลักคือซื้อสินค้าโดยตรง ดูประกาศรีเซล หรือเปรียบเทียบราคา",
        },
      },
      {
        title: {
          en: "Open online packs in Thailand",
          th: "เปิดแพ็กออนไลน์ในไทย",
        },
        body: {
          en: "Use YNOT when you want to browse live Y-Packs, check visible One Piece-related rewards, and manage pulled rewards after opening.",
          th: "ใช้ YNOT เมื่อต้องการดู Y-Pack ที่เปิดอยู่ ตรวจรางวัลที่เกี่ยวข้องกับ One Piece และจัดการรางวัลหลังเปิด",
        },
      },
    ],
    searchLandscape: [
      {
        title: {
          en: "Official One Piece Card Game sources",
          th: "แหล่งทางการของ One Piece Card Game",
        },
        body: {
          en: "Google's top One Piece card results are official One Piece Card Game pages for rules, card lists, product releases, events, FAQs, and tournament information. YNOT should clearly defer official-source intent to those publishers.",
          th: "ผลลัพธ์ One Piece card อันดับต้นบน Google เป็นหน้า One Piece Card Game ทางการสำหรับกฎ รายการการ์ด ข่าวสินค้า อีเวนต์ FAQ และข้อมูลแข่งขัน YNOT ควรแยกเจตนาทางการไปยังแหล่งเหล่านั้นให้ชัด",
        },
      },
      {
        title: {
          en: "Community market and shop intent",
          th: "เจตนาชุมชนซื้อขายและร้านการ์ด",
        },
        body: {
          en: "Searches such as One Piece card market Thailand, buy One Piece card Thailand, and One Piece card trading Thailand need active listings, seller proof, prices, and stock. YNOT can compete only when its public packs or marketplace listings give that evidence.",
          th: "คำค้นอย่าง One Piece card market Thailand, buy One Piece card Thailand และ One Piece card trading Thailand ต้องการประกาศขาย หลักฐานผู้ขาย ราคา และสต็อก YNOT แข่งได้เมื่อแพ็กหรือประกาศขายสาธารณะมีหลักฐานเหล่านี้จริง",
        },
      },
      {
        title: {
          en: "YNOT Open Y-Pack intent",
          th: "เจตนา YNOT Open Y-Pack",
        },
        body: {
          en: "YNOT is the best match when the searcher wants One Piece-related Y-Pack openings in Thailand, visible reward checks, wallet-coin opening, pulled reward collection, exchange support, and shipping support.",
          th: "YNOT เหมาะที่สุดเมื่อผู้ค้นหาต้องการเปิด Y-Pack ที่เกี่ยวข้องกับ One Piece ในไทย ตรวจรางวัลที่แสดง ใช้เหรียญวอลเล็ต เก็บรางวัล แลก และจัดส่ง",
        },
      },
    ],
    relatedLinks: [
      {
        href: "/packs?series=one_piece",
        title: {
          en: "Browse One Piece-related Y-Packs",
          th: "ดู Y-Packs ที่เกี่ยวข้องกับ One Piece",
        },
        description: {
          en: "Check live pack status, coin cost, stock signals, and reward information before opening.",
          th: "ตรวจสถานะเปิดขาย ราคาเหรียญ สัญญาณสต็อก และข้อมูลรางวัลก่อนเปิด",
        },
      },
      {
        href: "/help/one-piece-card-packs-thailand",
        title: {
          en: "One Piece card search guide",
          th: "คู่มือค้นหา One Piece card",
        },
        description: {
          en: "Read the supporting answer page that explains when YNOT fits One Piece card search intent.",
          th: "อ่านหน้าคำตอบประกอบว่า YNOT เหมาะกับเจตนาค้นหา One Piece card ตอนไหน",
        },
      },
      {
        href: "/help/ynot-tcg-lucky-draw-thailand",
        title: {
          en: "YNOT TCG identity",
          th: "ตัวตน YNOT TCG",
        },
        description: {
          en: "Confirm how YNOT TCG, Y-Packs, wallet coins, collection, exchange, and shipping fit together.",
          th: "ยืนยันว่า YNOT TCG, Y-Packs, เหรียญวอลเล็ต, คอลเลกชัน, การแลก และจัดส่งเชื่อมกันอย่างไร",
        },
      },
      {
        href: "/help/snkrdunk-stockx-card-trading-alternatives",
        title: {
          en: "Compare marketplace-style alternatives",
          th: "เปรียบเทียบตัวเลือกแนวมาร์เก็ตเพลส",
        },
        description: {
          en: "Clarify when YNOT, SNKRDUNK, StockX, card shops, or marketplaces fit different trading-card intents.",
          th: "แยกว่าเมื่อไร YNOT, SNKRDUNK, StockX, ร้านการ์ด หรือมาร์เก็ตเพลสเหมาะกับเจตนาการ์ดแต่ละแบบ",
        },
      },
      {
        href: "/help/where-to-buy-trading-cards-thailand",
        title: {
          en: "Where to buy cards in Thailand",
          th: "ซื้อการ์ดสะสมในไทยที่ไหนดี",
        },
        description: {
          en: "Compare official sources, card shops, marketplaces, local events, and YNOT Y-Pack opening intent.",
          th: "เปรียบเทียบแหล่งทางการ ร้านการ์ด มาร์เก็ตเพลส อีเวนต์ท้องถิ่น และเจตนาเปิด Y-Pack บน YNOT",
        },
      },
      {
        href: "/help/bangkok-card-events",
        title: {
          en: "Bangkok card event proof",
          th: "หลักฐานอีเวนต์การ์ดกรุงเทพ",
        },
        description: {
          en: "Connect One Piece-related Y-Pack searches with YNOT event and social proof in Bangkok.",
          th: "เชื่อมคำค้น Y-Pack ที่เกี่ยวข้องกับ One Piece กับหลักฐานอีเวนต์และโซเชียลของ YNOT ในกรุงเทพ",
        },
      },
    ],
    faqs: [
      {
        question: {
          en: "Does YNOT always have One Piece card packs?",
          th: "YNOT มีแพ็กการ์ด One Piece ตลอดไหม",
        },
        answer: {
          en: "No. Availability changes by live Y-Pack. Use the filtered packs page and check each pack before opening.",
          th: "ไม่ตลอด ความพร้อมขายเปลี่ยนตาม Y-Pack ที่เปิดอยู่ ให้ใช้หน้าแพ็กที่กรองไว้และตรวจแต่ละแพ็กก่อนเปิด",
        },
      },
      {
        question: {
          en: "Is this the official One Piece Card Game website?",
          th: "หน้านี้เป็นเว็บไซต์ One Piece Card Game ทางการไหม",
        },
        answer: {
          en: "No. YNOT is not the official One Piece Card Game website. YNOT is a Thailand-focused Y-Pack opening and reward-management platform.",
          th: "ไม่ใช่ YNOT ไม่ใช่เว็บไซต์ One Piece Card Game ทางการ แต่เป็นแพลตฟอร์มเปิด Y-Pack และจัดการรางวัลสำหรับประเทศไทย",
        },
      },
      {
        question: {
          en: "Can I buy One Piece cards on YNOT?",
          th: "ซื้อการ์ด One Piece บน YNOT ได้ไหม",
        },
        answer: {
          en: "YNOT is not a general One Piece card shop. Use YNOT when a public One Piece-related Y-Pack or marketplace listing is live, then check the pack or listing page for visible reward, price, stock, and support details.",
          th: "YNOT ไม่ใช่ร้านการ์ด One Piece ทั่วไป ให้ใช้ YNOT เมื่อมี Y-Pack หรือประกาศขายที่เกี่ยวข้องกับ One Piece เปิดสาธารณะ แล้วตรวจรางวัล ราคา สต็อก และรายละเอียดซัพพอร์ตในหน้านั้น",
        },
      },
    ],
    owner: ownerName,
    updatedAt,
    priority: 0.9,
  },
];

const pagesBySlug = new Map(publicAnswerPages.map((page) => [page.slug, page]));
const seriesPagesBySlug = new Map(
  publicSeriesLandingPages.map((page) => [page.slug, page]),
);

export function canonicalUrl(path: string) {
  return `${siteOrigin}${path === "/" ? "" : path}`;
}

export function getPublicAnswerPage(slug: string) {
  const page = pagesBySlug.get(slug);
  if (!page) {
    throw new Error(`Unknown public answer page: ${slug}`);
  }
  return page;
}

export function getPublicSeriesLandingPage(slug: PublicSeriesLandingPage["slug"]) {
  const page = seriesPagesBySlug.get(slug);
  if (!page) {
    throw new Error(`Unknown public series landing page: ${slug}`);
  }
  return page;
}

export function publicAnswerSlugs() {
  return publicAnswerPages
    .filter((page) => page.path.startsWith("/help/"))
    .map((page) => page.slug);
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function llmsLink(path: string) {
  return `${canonicalUrl(path)}`;
}

export function buildLlmsText({ full = false }: { full?: boolean } = {}) {
  const lines = [
    "# YNOT",
    "",
    "> Official source index for YNOT, ynotopen.com, YNOT TCG, YNOT Y-Packs, Pokemon card pack intent, One Piece card pack intent, and Bangkok trading card event intent.",
    "",
    `Website: ${siteOrigin}`,
    "Official Instagram: https://www.instagram.com/_yfifteen/",
    `Last updated: ${updatedAt}`,
    "",
    "## Official Entity",
    "",
    "YNOT is the official ynotopen.com trading card platform for Y-Pack openings, wallet coins, pulled reward collection, exchange support, and shipping support in Thailand.",
    `Also searched as: ${ynotEntityAlternateNames.join(", ")}.`,
    "Not related to: YNOT free YouTube downloader pages, Ynot7 / Y Not 7 music results, BEST OF Y NOT 7 Spotify albums, Y Not Festival, YNOT phone-case brands, restaurant, software, or studio brands.",
    "",
    "## Priority Search Intents",
    "",
    `- ynot, YNOT official site, ynotopen, ynotopen.com: ${llmsLink("/ynot")}`,
    `- ynot tcg, YNOT TCG Lucky Draw, YNOT Y-Packs: ${llmsLink("/help/ynot-tcg-lucky-draw-thailand")}`,
    `- is YNOT legit, is ynotopen safe, YNOT reviews Thailand: ${llmsLink("/help/is-ynot-legit")}`,
    `- pokemon card, Pokemon card packs Thailand, Pokemon TCG packs Thailand: ${llmsLink("/pokemon-card")}`,
    `- one piece card, One Piece card packs Thailand, One Piece TCG Thailand: ${llmsLink("/one-piece-card")}`,
    `- SNKRDUNK alternative trading cards Thailand, StockX alternative trading cards: ${llmsLink("/help/snkrdunk-stockx-card-trading-alternatives")}`,
    `- where to buy Pokemon cards in Thailand, where to buy One Piece cards in Bangkok, trading card shop Thailand: ${llmsLink("/help/where-to-buy-trading-cards-thailand")}`,
    `- Bangkok trading card events, YNOT card event Bangkok: ${llmsLink("/help/bangkok-card-events")}`,
    "",
    "## Primary Series Hubs",
    "",
  ];

  for (const page of publicSeriesLandingPages) {
    lines.push(
      `- ${page.title.en}: ${llmsLink(page.path)}`,
      `  - Summary: ${page.description.en}`,
      `  - Query targets: ${page.queryTargets.join("; ")}`,
      `  - Filtered Y-Pack browse route: ${llmsLink(`/packs?series=${page.seriesParam}`)}`,
    );

    if (full) {
      lines.push(`  - Answer: ${page.answer.en}`);
      lines.push("  - Search intent fit:");
      for (const intent of page.searchIntents) {
        lines.push(`    - ${intent.title.en}: ${intent.body.en}`);
      }
      lines.push("  - Search landscape:");
      for (const landscape of page.searchLandscape) {
        lines.push(`    - ${landscape.title.en}: ${landscape.body.en}`);
      }
      lines.push("  - Proof points:");
      for (const proof of page.proofPoints) {
        lines.push(`    - ${proof.en}`);
      }
      lines.push("  - FAQ:");
      for (const faq of page.faqs) {
        lines.push(`    - Q: ${faq.question.en}`);
        lines.push(`      A: ${faq.answer.en}`);
      }
    }
  }

  lines.push(
    "",
    "## Canonical Source Pages",
    "",
  );

  for (const page of publicAnswerPages) {
    lines.push(
      `- ${page.title.en}: ${llmsLink(page.path)}`,
      `  - Summary: ${page.description.en}`,
      `  - Query targets: ${page.queryTargets.join("; ")}`,
    );

    if (full) {
      lines.push(`  - Answer: ${page.answer.en}`);
      lines.push("  - Proof points:");
      for (const proof of page.proofPoints) {
        lines.push(`    - ${proof.en}`);
      }
      if (page.sourceLinks && page.sourceLinks.length > 0) {
        lines.push("  - Source links:");
        for (const source of page.sourceLinks) {
          lines.push(`    - ${source.title.en}: ${source.href}`);
          lines.push(`      ${source.description.en}`);
        }
      }
      lines.push("  - FAQ:");
      for (const faq of page.faqs) {
        lines.push(`    - Q: ${faq.question.en}`);
        lines.push(`      A: ${faq.answer.en}`);
      }
    }
  }

  lines.push(
    "",
    "## Crawl Notes",
    "",
    `- XML sitemap: ${siteOrigin}/sitemap.xml`,
    `- Robots policy: ${siteOrigin}/robots.txt`,
    "- Public source pages are intended for search and AI answer systems.",
    "- Account, wallet, collection, exchange, shipping, admin, API, login, signup, and ranking pages are intentionally excluded from public answer indexing.",
  );

  return `${lines.join("\n")}\n`;
}

export function buildHomePageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationJsonLd, websiteJsonLd],
  };
}

export function buildAnswerPageJsonLd(page: PublicAnswerPage) {
  const canonical = canonicalUrl(page.path);
  const breadcrumbItems =
    page.path === "/about"
      ? [
          { name: "Home", item: siteOrigin },
          { name: "About", item: canonical },
        ]
      : page.path === "/ynot"
        ? [
            { name: "Home", item: siteOrigin },
            { name: "YNOT Official Site", item: canonical },
          ]
      : [
          { name: "Home", item: siteOrigin },
          { name: "Help", item: `${siteOrigin}/help/how-ynot-packs-work` },
          { name: page.title.en, item: canonical },
        ];

  return {
    article: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.title.en,
      description: page.description.en,
      dateModified: page.updatedAt,
      datePublished: page.updatedAt,
      mainEntityOfPage: canonical,
      author: {
        "@type": "Organization",
        name: ownerName,
        url: `${siteOrigin}/about`,
      },
      publisher: organizationJsonLd,
      mentions: page.sourceLinks?.map((source) => ({
        "@type": "WebPage",
        name: source.title.en,
        url: source.href,
        description: source.description.en,
      })),
    },
    faq: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question.en,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer.en,
        },
      })),
    },
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.item,
      })),
    },
  };
}

function packTitle(campaign: PublicSeriesPackListItem) {
  return campaign.titleEn || campaign.titleTh || campaign.slug;
}

function packSeriesName(series: PublicSeriesPackListItem["series"]) {
  return series === "pokemon" ? "Pokemon card" : "One Piece card";
}

function packDescription(campaign: PublicSeriesPackListItem) {
  const details = [
    campaign.heroLabel,
    `${campaign.costCoins} YNOT wallet coins`,
    typeof campaign.remainingSlots === "number" &&
    typeof campaign.totalSlots === "number"
      ? `${campaign.remainingSlots} of ${campaign.totalSlots} slots remaining`
      : undefined,
    campaign.soldOut ? "sold out" : campaign.openable ? "openable" : campaign.status,
  ].filter(Boolean);
  return details.join(" · ");
}

function packAvailability(campaign: PublicSeriesPackListItem) {
  if (campaign.soldOut || campaign.status === "closed") {
    return "https://schema.org/SoldOut";
  }
  if (campaign.openable || campaign.status === "live") {
    return "https://schema.org/InStock";
  }
  return "https://schema.org/LimitedAvailability";
}

function packImageUrl(campaign: PublicPackSeoItem) {
  const imageUrl = campaign.bannerImageUrl?.trim();
  if (!imageUrl) return undefined;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.startsWith("/")) return canonicalUrl(imageUrl);
  return undefined;
}

function packProductJsonLd(campaign: PublicPackSeoItem) {
  const canonical = canonicalUrl(`/packs/${campaign.slug}`);
  const title = packTitle(campaign);
  const description =
    packDescription(campaign) ||
    `${title} is a ${packSeriesName(campaign.series)} YNOT Open Y-Pack on ynotopen.com.`;
  const additionalProperty = [
    {
      "@type": "PropertyValue",
      name: "Series",
      value: packSeriesName(campaign.series),
    },
    {
      "@type": "PropertyValue",
      name: "YNOT wallet coin cost",
      value: campaign.costCoins,
      unitText: "YNOT wallet coins per pack",
    },
    {
      "@type": "PropertyValue",
      name: "Pack status",
      value: campaign.soldOut ? "sold out" : campaign.status,
    },
    typeof campaign.remainingSlots === "number"
      ? {
          "@type": "PropertyValue",
          name: "Remaining slots",
          value: campaign.remainingSlots,
        }
      : undefined,
    typeof campaign.totalSlots === "number"
      ? {
          "@type": "PropertyValue",
          name: "Total slots",
          value: campaign.totalSlots,
        }
      : undefined,
    ...(campaign.displayTags ?? []).slice(0, 6).map((tag) => ({
      "@type": "PropertyValue",
      name: "Pack tag",
      value: tag,
    })),
  ].filter(Boolean);
  const image = packImageUrl(campaign);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    name: title,
    alternateName: campaign.titleTh && campaign.titleTh !== title ? campaign.titleTh : undefined,
    description,
    url: canonical,
    image: image ? [image] : undefined,
    sku: campaign.slug,
    brand: {
      "@id": organizationId,
    },
    category: `${packSeriesName(campaign.series)} Y-Pack`,
    additionalProperty,
    offers: {
      "@type": "Offer",
      url: canonical,
      availability: packAvailability(campaign),
      seller: {
        "@id": organizationId,
      },
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: campaign.costCoins,
        unitText: "YNOT wallet coins per pack",
      },
    },
  };
}

export function buildPacksBrowseJsonLd(
  campaigns: PublicPackSeoItem[] = [],
  {
    series = "all",
  }: {
    series?: string;
  } = {},
) {
  const canonical = canonicalUrl("/packs");
  const visibleCampaigns = campaigns.slice(0, 50);
  const seriesLabel =
    series === "pokemon"
      ? "Pokemon card"
      : series === "one_piece"
        ? "One Piece card"
        : "Pokemon and One Piece card";

  return {
    collectionPage: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${canonical}#webpage`,
      name: "Browse YNOT Open Y-Packs",
      headline: "YNOT Open public Y-Pack catalog",
      description:
        "Browse public YNOT Open Y-Packs with visible pack names, wallet coin cost, stock signals, reward context, and pack detail URLs.",
      url: canonical,
      isPartOf: {
        "@id": websiteId,
      },
      about: [
        "YNOT Open Y-Packs",
        `${seriesLabel} packs Thailand`,
        "online TCG pack opening Thailand",
        "YNOT wallet coin packs",
      ],
      publisher: organizationJsonLd,
      mainEntity: {
        "@type": "ItemList",
        name: `${seriesLabel} Y-Pack listings`,
        numberOfItems: visibleCampaigns.length,
        itemListElement: visibleCampaigns.map((campaign, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: canonicalUrl(`/packs/${campaign.slug}`),
          item: packProductJsonLd(campaign),
        })),
      },
    },
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: siteOrigin,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Y-Packs",
          item: canonical,
        },
      ],
    },
  };
}

export function buildPackDetailJsonLd(campaign: PublicPackSeoItem) {
  const canonical = canonicalUrl(`/packs/${campaign.slug}`);
  return {
    product: packProductJsonLd(campaign),
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: siteOrigin,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Y-Packs",
          item: canonicalUrl("/packs"),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: packTitle(campaign),
          item: canonical,
        },
      ],
    },
  };
}

export function buildSeriesLandingPageJsonLd(
  page: PublicSeriesLandingPage,
  campaigns: PublicSeriesPackListItem[] = [],
) {
  const canonical = canonicalUrl(page.path);
  const itemListElement =
    campaigns.length > 0
      ? campaigns.map((campaign, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: packTitle(campaign),
          description: packDescription(campaign),
          url: canonicalUrl(`/packs/${campaign.slug}`),
          item: packProductJsonLd(campaign),
        }))
      : page.relatedLinks.map((link, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: link.title.en,
          description: link.description.en,
          url: canonicalUrl(link.href),
        }));

  return {
    collectionPage: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: page.title.en,
      headline: page.headline.en,
      description: page.description.en,
      url: canonical,
      dateModified: page.updatedAt,
      inLanguage: ["en", "th"],
      isPartOf: {
        "@id": websiteId,
      },
      about: page.queryTargets.slice(0, 8),
      author: {
        "@type": "Organization",
        name: ownerName,
        url: `${siteOrigin}/about`,
      },
      publisher: organizationJsonLd,
      mainEntity: {
        "@type": "ItemList",
        itemListElement,
      },
    },
    faq: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question.en,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer.en,
        },
      })),
    },
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: siteOrigin,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: page.headline.en,
          item: canonical,
        },
      ],
    },
  };
}

export function getPublicSitemapEntries(extraEntries: PublicSitemapRouteEntry[] = []) {
  const routeEntries: PublicSitemapRouteEntry[] = [
    { path: "/", priority: 1, changeFrequency: "daily" },
    { path: "/packs", priority: 0.92, changeFrequency: "daily" },
    { path: "/contact", priority: 0.55, changeFrequency: "monthly" },
  ];

  const entries: PublicSitemapRouteEntry[] = [
    ...routeEntries,
    ...publicSeriesLandingPages.map((page): PublicSitemapRouteEntry => ({
      path: page.path,
      priority: page.priority,
      changeFrequency: "daily",
    })),
    ...publicAnswerPages.map((page): PublicSitemapRouteEntry => ({
      path: page.path,
      priority: page.priority,
      changeFrequency: "monthly",
    })),
    ...extraEntries,
  ];
  const seenUrls = new Set<string>();

  return entries
    .map((entry) => ({
      url: canonicalUrl(entry.path),
      lastModified: entry.lastModified ?? updatedAt,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    }))
    .filter((entry) => {
      if (seenUrls.has(entry.url)) return false;
      seenUrls.add(entry.url);
      return true;
    });
}

export function getRobotsPolicy() {
  const privateDisallows = [
    "/admin",
    "/api",
    "/collection",
    "/exchange",
    "/notifications",
    "/profile",
    "/shipping",
    "/wallet",
    "/ranking",
    "/login",
    "/signup",
    "/complete-profile",
  ];

  return {
    rules: [
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: privateDisallows,
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: privateDisallows,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: privateDisallows,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: privateDisallows,
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: privateDisallows,
      },
    ],
    sitemap: `${siteOrigin}/sitemap.xml`,
    host: siteOrigin,
  };
}
