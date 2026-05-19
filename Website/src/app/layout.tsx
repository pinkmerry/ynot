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
import "./globals.css";

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
  title: "YNOT · TCG Lucky Draw",
  description: "YNOT TCG production lucky-draw site with wallet, gacha, collection, exchange, shipping, and admin operations.",
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
      data-ynot-language="th"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${plexThai.variable} ${plexSans.variable} ${notoThai.variable} ${prompt.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
