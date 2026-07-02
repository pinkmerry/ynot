import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AdminGate } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import {
  AdminFrame,
  AdminIcon,
  AdminPill,
} from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SEO, GEO, AEO Control Room | YNOT Admin",
  description:
    "Internal YNOT visibility dashboard for search, AI answer, crawl, and entity-proof work.",
  robots: {
    index: false,
    follow: false,
  },
};

const visibilityRows = [
  {
    query: "ynotopen",
    status: "#1",
    tone: "win",
    route: "/",
    note: "Defend with consistent YNOT Open entity signals.",
  },
  {
    query: "ynot tcg",
    status: "#1",
    tone: "win",
    route: "/help/ynot-tcg-lucky-draw-thailand",
    note: "Already winning branded TCG intent.",
  },
  {
    query: "ynot",
    status: "Not top 10",
    tone: "watch",
    route: "/ynot",
    note: "Ambiguous against music, festival, downloader, and studio entities.",
  },
  {
    query: "pokemon card",
    status: "Not top 10",
    tone: "build",
    route: "/pokemon-card",
    note: "Official publisher and large retail surfaces dominate the head term.",
  },
  {
    query: "one piece card",
    status: "Not top 10",
    tone: "build",
    route: "/one-piece-card",
    note: "Target local Y-Pack and online pack-opening variants first.",
  },
  {
    query: "trading card marketplace Thailand",
    status: "Not top 10",
    tone: "build",
    route: "/trading-card-marketplace-thailand",
    note: "Needs live public marketplace inventory and partner links.",
  },
] as const;

const pillars = [
  {
    label: "SEO",
    title: "Search visibility",
    icon: "search" as const,
    summary:
      "Public route map, titles, H1/H2 hierarchy, sitemap, robots, and crawl links now point at the strongest YNOT ranking targets.",
    wins: [
      "Static Pokemon and One Piece pack catalog routes",
      "Visible internal links from homepage and footer",
      "Public answer pages mapped to one intent each",
    ],
  },
  {
    label: "GEO",
    title: "AI answer grounding",
    icon: "globe" as const,
    summary:
      "The site now exposes crawlable source indexes, answer pages, proof links, and llms files so answer systems can cite the right YNOT pages.",
    wins: [
      "OAI-SearchBot remains allowed on public pages",
      "llms.txt and llms-full.txt summarize canonical answers",
      "Source links connect public claims to evidence",
    ],
  },
  {
    label: "AEO",
    title: "Answer engine clarity",
    icon: "sparkles" as const,
    summary:
      "FAQ, Article, Product, Offer, Brand, Organization, AboutPage, and WebSite schema now describe what YNOT is and what it is not.",
    wins: [
      "Exact YNOT disambiguation page",
      "Organization schema with official social identity",
      "Event proof attached through subjectOf schema",
    ],
  },
] as const;

const shippedWork = [
  {
    phase: "Foundation",
    title: "Crawl boundary and metadata",
    detail:
      "Separated public ranking pages from private app routes, tightened robots, and kept sitemap entries focused on crawlable public pages.",
  },
  {
    phase: "Entity",
    title: "YNOT identity proof",
    detail:
      "Added /ynot as the canonical exact-match identity page with official Instagram and public event proof.",
  },
  {
    phase: "Category",
    title: "Pokemon and One Piece hubs",
    detail:
      "Reframed broad franchise pages around truthful Y-Pack, reward-management, and Thailand pack-opening intent.",
  },
  {
    phase: "Marketplace",
    title: "SNKRDUNK / StockX adjacent intent",
    detail:
      "Added competitor-aware answer content without claiming YNOT is a full public marketplace before listings are crawlable.",
  },
  {
    phase: "Structure",
    title: "Semantic headings and links",
    detail:
      "Moved visual section labels into real H2 headings and added durable homepage/footer crawl paths.",
  },
  {
    phase: "Proof",
    title: "Live retest and Cloudflare deploy",
    detail:
      "Verified production on the Puppeteer Cloudflare account and confirmed new proof links are live on www and workers.dev.",
  },
] as const;

const routeMap = [
  ["/ynot", "Exact YNOT entity, official site, disambiguation"],
  ["/pokemon-card", "Pokemon card Y-Pack and Thailand pack-opening intent"],
  ["/one-piece-card", "One Piece card Y-Pack and Thailand pack-opening intent"],
  ["/packs/pokemon", "Static Pokemon pack catalog route"],
  ["/packs/one-piece", "Static One Piece pack catalog route"],
  ["/trading-card-marketplace-thailand", "Marketplace and competitor-adjacent intent"],
  ["/help/open-one-piece-card-packs-online-thailand", "Direct One Piece online pack-opening answer"],
  ["/llms-full.txt", "AI source index and full answer map"],
] as const;

const nextActions = [
  "Submit the priority URLs in Google Search Console URL Inspection.",
  "Update Instagram bio/name and event captions to say YNOT Open - Thailand TCG Y-Packs.",
  "Ask event partners and card communities to link to /ynot, /pokemon-card, or /one-piece-card.",
  "Preserve old event posts as dated proof; add new weekly event evidence without replacing stable pages.",
  "Launch crawlable marketplace inventory before pushing hard on StockX, SNKRDUNK, and marketplace head terms.",
] as const;

const guardrails = [
  "Do not keyword-stuff broad Pokemon or One Piece pages.",
  "Do not claim official franchise database, tournament, or rules authority.",
  "Do not expose private customer/account/admin surfaces for crawl.",
  "Do not rotate away old event proof; stack dated proof over time.",
] as const;

function toneLabel(tone: (typeof visibilityRows)[number]["tone"]) {
  if (tone === "win") return "Winning";
  if (tone === "watch") return "Needs authority";
  return "Build next";
}

export default async function AdminSeoPage() {
  const data = await getYnotDashboardSlice({ wallet: false });

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/seo"
        trail={["Admin", "Platform", "SEO"]}
        eyebrow="Visibility system"
        title="SEO, GEO, AEO control room"
        desc="A clean summary of the ranking, AI-answer, crawl, schema, and off-site proof work already shipped for YNOT Open."
        actions={
          <>
            <Link className="btn" href="/sitemap.xml" prefetch={false}>
              <AdminIcon name="globe" />
              Sitemap
            </Link>
            <Link className="btn btn-primary" href="/llms-full.txt" prefetch={false}>
              <AdminIcon name="sparkles" />
              AI source index
            </Link>
          </>
        }
      >
        <div className="seo-cockpit">
          <section className="seo-hero-panel" aria-labelledby="seo-hero-title">
            <div className="seo-hero-copy">
              <span className="seo-overline">Last organized · July 2, 2026</span>
              <h2 id="seo-hero-title">One place for search, answer engines, and brand proof.</h2>
              <p>
                The work is now grouped into a simple operating system: what ranks,
                what shipped, which URLs own each intent, and what has to happen
                off-site before the next ranking jump.
              </p>
              <div className="seo-hero-actions">
                <Link href="/ynot" className="seo-primary-link" prefetch={false}>
                  View canonical YNOT page
                  <AdminIcon name="chev-r" />
                </Link>
                <span className="seo-live-proof">
                  <AdminIcon name="check" />
                  Live on Puppeteer Cloudflare
                </span>
              </div>
            </div>
            <div className="seo-hero-visual" aria-label="YNOT card pack visual">
              <Image
                src="/ynot-pack-psa-cards.avif"
                alt="YNOT trading card pack and graded card visual"
                fill
                sizes="(max-width: 760px) 100vw, 420px"
                priority
              />
            </div>
          </section>

          <section className="seo-status-grid" aria-label="Current visibility status">
            <div className="seo-status-card seo-status-card-strong">
              <span>Branded wins</span>
              <strong>2</strong>
              <p>ynotopen and ynot tcg are already position 1 in current checks.</p>
            </div>
            <div className="seo-status-card">
              <span>Public targets</span>
              <strong>12+</strong>
              <p>Priority URLs now exist across brand, category, marketplace, and help intent.</p>
            </div>
            <div className="seo-status-card">
              <span>AI surfaces</span>
              <strong>2</strong>
              <p>llms.txt and llms-full.txt expose canonical answers for AI search.</p>
            </div>
            <div className="seo-status-card">
              <span>Main blocker</span>
              <strong>Links</strong>
              <p>Exact ynot and broad card terms need recrawl plus off-site authority.</p>
            </div>
          </section>

          <section className="seo-section">
            <div className="seo-section-head">
              <span>Current rank picture</span>
              <h3>Where we stand now</h3>
            </div>
            <div className="seo-rank-list">
              {visibilityRows.map((row) => (
                <div className="seo-rank-row" key={row.query}>
                  <div>
                    <span className="seo-query">{row.query}</span>
                    <p>{row.note}</p>
                  </div>
                  <Link href={row.route} prefetch={false}>
                    {row.route}
                  </Link>
                  <span className={`seo-result-pill ${row.tone}`}>
                    {toneLabel(row.tone)} · {row.status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="seo-pillar-grid" aria-label="SEO GEO AEO pillars">
            {pillars.map((pillar) => (
              <article className="seo-pillar" key={pillar.label}>
                <div className="seo-pillar-icon">
                  <AdminIcon name={pillar.icon} />
                </div>
                <span>{pillar.label}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.summary}</p>
                <ul>
                  {pillar.wins.map((win) => (
                    <li key={win}>{win}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <section className="seo-section">
            <div className="seo-section-head">
              <span>Done</span>
              <h3>What we already shipped</h3>
            </div>
            <div className="seo-timeline">
              {shippedWork.map((item, index) => (
                <article className="seo-timeline-item" key={item.title}>
                  <div className="seo-timeline-index">{index + 1}</div>
                  <div>
                    <span>{item.phase}</span>
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="seo-split-grid">
            <div className="seo-section">
              <div className="seo-section-head">
                <span>URL ownership</span>
                <h3>One intent, one page</h3>
              </div>
              <div className="seo-route-list">
                {routeMap.map(([path, intent]) => (
                  <Link href={path} key={path} prefetch={false}>
                    <code>{path}</code>
                    <span>{intent}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="seo-section">
              <div className="seo-section-head">
                <span>Next</span>
                <h3>What improves results fastest</h3>
              </div>
              <ol className="seo-action-list">
                {nextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
            </div>
          </section>

          <section className="seo-section seo-guardrail-section">
            <div className="seo-section-head">
              <span>Guardrails</span>
              <h3>Keep this clean</h3>
            </div>
            <div className="seo-guardrail-grid">
              {guardrails.map((item) => (
                <div className="seo-guardrail" key={item}>
                  <AdminIcon name="shield" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="seo-evidence-strip" aria-label="Verification evidence">
            <AdminPill kind="live">Verified</AdminPill>
            <span>Cloudflare account: puppeteer@yfifteen.com</span>
            <span>Worker: ynott-website</span>
            <span>Routes: ynotopen.com and www.ynotopen.com</span>
          </section>
        </div>
      </AdminFrame>
    </AdminGate>
  );
}
