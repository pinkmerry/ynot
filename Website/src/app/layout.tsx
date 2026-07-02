import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Thai_Looped,
  Inter,
  Noto_Sans_Thai,
  Prompt,
} from "next/font/google";
import { PreferenceHydrator } from "@/features/ynot/PreferenceHydrator";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plexThai = IBM_Plex_Sans_Thai_Looped({
  variable: "--font-plex-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
});

// Sasom-style: Noto Sans Thai for clean loopless Thai rendering paired with Inter.
const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700", "800"],
});


export const metadata: Metadata = {
  metadataBase: new URL("https://www.ynotopen.com"),
  title: {
    default: "YNOT Open · Thailand TCG Y-Packs Online",
    template: "%s | YNOT",
  },
  description:
    "YNOT Open is a Thailand TCG Y-Pack and card trading site for Pokemon and One Piece collectors, wallet coins, pulled rewards, exchange, and shipping support.",
  applicationName: "YNOT",
  alternates: {
    canonical: "https://www.ynotopen.com",
  },
  openGraph: {
    title: "YNOT Open · Thailand TCG Y-Packs Online",
    description:
      "Browse public Y-Packs, open with YNOT wallet coins, and manage Pokemon, One Piece, and other trading card rewards through collection, exchange, and shipping flows.",
    url: "https://www.ynotopen.com",
    siteName: "YNOT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YNOT Open · Thailand TCG Y-Packs Online",
    description:
      "Open digital TCG Y-Packs online in Thailand and manage pulled Pokemon, One Piece, and other card rewards with YNOT.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-ynot-theme="light"
      data-ynot-language="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${plexThai.variable} ${plexSans.variable} ${notoThai.variable} ${prompt.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PreferenceHydrator />
        {children}
      </body>
    </html>
  );
}
