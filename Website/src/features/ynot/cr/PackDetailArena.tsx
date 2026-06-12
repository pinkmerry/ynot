"use client";

/**
 * PackDetailArena — the real /packs/[slug] experience in the arenaclub.com
 * "slab pack" layout: full-bleed hero banner, fanned prize carousel + buy
 * panel (right), and an "Available slabs" section grouped by tier with hit
 * rates. Uses the REAL open-pack flow (quantity, balance/stock checks,
 * confirm modal, gacha navigation) ported from PackDetailExperience.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { YnotCampaign, YnotLastPrizePreview, YnotPrizePreview } from "../types";
import { normalizeOpenQuantityOptions } from "../open-quantity";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { Modal, useToast } from "./UiKit";


type TierKey = "rainbow" | "gold" | "silver" | "bronze";
const TIER_NAME: Record<TierKey, string> = {
  rainbow: "GRAND PRIZE",
  gold: "FIRST PRIZE",
  silver: "SECOND PRIZE",
  bronze: "THIRD PRIZE",
};
const LAST_PRIZE_NAME = "LAST PRIZE";
const LAST_PRIZE_ACCENT = "#e0683a";
const TIER_ACCENT: Record<TierKey, string> = {
  rainbow: "#8b5cf6",
  gold: "#e0ad3a",
  silver: "#9aa6b2",
  bronze: "#cf8a52",
};
const TIER_ORDER: TierKey[] = ["rainbow", "gold", "silver", "bronze"];
const SERIES_LABEL: Record<string, string> = {
  pokemon: "Pokemon",
  one_piece: "One Piece",
};

function tierOf(p: YnotPrizePreview): TierKey {
  const dt = (p.displayTier ?? "").toLowerCase();
  if (dt === "rainbow" || dt === "gold" || dt === "silver" || dt === "bronze") {
    return dt;
  }
  if (p.tier === "high" && (p.rank ?? 99) <= 3) return "rainbow";
  if (p.tier === "high") return "gold";
  if (p.tier === "normal" && (p.rank ?? 99) <= 6) return "silver";
  return "bronze";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatRate(p: number): string {
  if (p <= 0) return "—";
  if (p >= 1) return `${p.toFixed(0)}%`;
  if (p >= 0.1) return `${p.toFixed(1)}%`;
  return `${p.toFixed(2)}%`;
}

type Slab = {
  key: string;
  name: string;
  img: string | null;
  grade: string | null;
  code: string | null;
  year: number | null;
  brand: string | null;
  tier: TierKey;
  units: number;
};

export type PackDetailArenaProps = {
  campaign: YnotCampaign;
  balanceCoins: number;
};

export function PackDetailArena({ campaign, balanceCoins }: PackDetailArenaProps) {
  const router = useRouter();
  const { toast } = useToast();

  // The floating bottom dock duplicates the right buy panel, so only show it
  // once the buy panel has scrolled out of view (true persistent-buy fallback).
  const buyPanelRef = useRef<HTMLElement | null>(null);
  const [dockVisible, setDockVisible] = useState(false);
  useEffect(() => {
    const el = buyPanelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) =>
      setDockVisible(!entry.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ----- real open-pack state/logic (ported from PackDetailExperience) -----
  const openQty = normalizeOpenQuantityOptions(campaign.openQuantityOptions);
  const [rawQty, setQty] = useState<number>(openQty[0] ?? 1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistClosing, setChecklistClosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // "All" sets qty to the live remaining count, which isn't in openQty
  const remainingNow = campaign.remainingSlots ?? campaign.totalSlots;
  const qty = openQty.includes(rawQty) || rawQty === remainingNow ? rawQty : (openQty[0] ?? 1);

  // FoG-style drawer: play the slide-out animation before unmounting
  function closeChecklist() {
    setChecklistClosing(true);
    window.setTimeout(() => {
      setChecklistOpen(false);
      setChecklistClosing(false);
    }, 240);
  }
  useEffect(() => {
    if (!checklistOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChecklist();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [checklistOpen]);

  const remaining = campaign.remainingSlots ?? campaign.totalSlots;
  const totalCost = campaign.costCoins * qty;
  const soldOut = campaign.soldOut || remaining <= 0;
  const enoughCoins = balanceCoins >= totalCost;
  const enoughStock = remaining >= qty;
  const openable = Boolean(campaign.openable);
  const unavailableReason = openable ? "" : "This pack is not ready to open yet.";

  function tryOpen() {
    if (!openable) return toast("error", unavailableReason);
    if (!enoughStock) return toast("error", `Only ${remaining} packs left.`);
    if (!enoughCoins) return toast("error", "Top up to open this many.");
    setConfirmOpen(true);
  }
  function confirmAndOpen() {
    setSubmitting(true);
    router.push(`/gacha/${campaign.slug}/open?qty=${qty}&auto=1`);
  }

  // Last prize is starved by the detail page's server subrequest budget, so
  // fetch it client-side when the server projection didn't include it.
  const [fetchedLastPrize, setFetchedLastPrize] =
    useState<YnotLastPrizePreview | null>(null);
  useEffect(() => {
    if (campaign.lastPrizePreview || !campaign.hasLastPrize) return;
    let active = true;
    fetch(`/api/ynot/packs/${encodeURIComponent(campaign.slug)}/last-prize`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: unknown) => {
        if (!active) return;
        const preview =
          payload && typeof payload === "object" && "lastPrizePreview" in payload
            ? (payload as { lastPrizePreview: YnotLastPrizePreview | null }).lastPrizePreview
            : null;
        if (preview) setFetchedLastPrize(preview);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [campaign.lastPrizePreview, campaign.hasLastPrize, campaign.slug]);
  const lastPrize = campaign.lastPrizePreview ?? fetchedLastPrize;

  // ----- slabs (real prize lineup) -----
  const slabs = useMemo<Slab[]>(() => {
    const byKey = new Map<string, Slab>();
    for (const p of campaign.prizeLineup ?? []) {
      const key = (p.cardCode?.trim() || p.cardName.trim().toLowerCase()) + "|" + (p.cardImageUrl ?? "");
      const units = typeof p.availableUnits === "number" ? p.availableUnits : typeof p.totalUnits === "number" ? p.totalUnits : 1;
      const existing = byKey.get(key);
      if (existing) { existing.units += units; continue; }
      byKey.set(key, {
        key,
        name: p.cardName,
        img: p.cardImageUrl ?? null,
        grade: p.cardGrade ?? null,
        code: p.cardCode?.trim() || null,
        year: p.cardReleaseYear ?? null,
        brand: p.cardBrand ?? null,
        tier: tierOf(p),
        units: Math.max(1, units),
      });
    }
    return [...byKey.values()].sort(
      (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
    );
  }, [campaign.prizeLineup]);

  const totalUnits = slabs.reduce((s, x) => s + x.units, 0) || 1;
  const rateOf = (s: Slab) => (s.units / totalUnits) * 100;
  const grouped = useMemo(() => {
    const g: Record<TierKey, Slab[]> = { rainbow: [], gold: [], silver: [], bronze: [] };
    for (const s of slabs) g[s.tier].push(s);
    return g;
  }, [slabs]);
  const presentTiers = TIER_ORDER.filter((t) => grouped[t].length > 0);

  // Arena-style card lightbox — click a slab to inspect it big
  const [lightbox, setLightbox] = useState<Slab | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox]);

  const [center, setCenter] = useState(0);
  const n = slabs.length;
  const move = (d: number) => setCenter((c) => n ? ((c + d) % n + n) % n : 0);
  const title = campaign.titleTh || campaign.titleEn;
  const seriesLabel = SERIES_LABEL[campaign.series] ?? campaign.series;

  const offsets = [-2, -1, 0, 1, 2];

  return (
    <div className="ac-root">

      <main className="ac-main">
        {/* LEFT — fanned carousel */}
        <section className="ac-stage-col">
          <div className="ac-stage">
            {n > 1 && (
              <button className="ac-arrow ac-prev" onClick={() => move(-1)} aria-label="previous">‹</button>
            )}
            <div className="ac-fan">
              {offsets.map((o) => {
                if (!n) return null;
                const idx = ((center + o) % n + n) % n;
                const s = slabs[idx];
                const abs = Math.abs(o);
                const style: CSSProperties = {
                  transform: `translateX(${o * 96}px) rotate(${o * 7}deg) scale(${1 - abs * 0.13})`,
                  zIndex: 10 - abs,
                  opacity: abs >= 2 ? 0.55 : 1,
                  filter: o === 0 ? "none" : "brightness(0.92)",
                };
                return (
                  <div className={`ac-fan-card${o === 0 ? " is-center" : ""}`} style={style} key={o}>
                    {s.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.img} alt={s.name} />
                    ) : (
                      <span className="ac-fan-ph">{initials(s.name)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {n > 1 && (
              <button className="ac-arrow ac-next" onClick={() => move(1)} aria-label="next">›</button>
            )}
            {n > 0 && <span className="ac-rate-badge">{formatRate(rateOf(slabs[center]))}</span>}
          </div>
          {n > 0 && (
            <div className="ac-center-name">
              {slabs[center].name}
              <span className="ac-center-tier" style={{ color: TIER_ACCENT[slabs[center].tier] }}>
                {TIER_NAME[slabs[center].tier]}
              </span>
            </div>
          )}
        </section>

        {/* RIGHT — buy panel (real open flow) */}
        <aside className="ac-buy" ref={buyPanelRef}>
          <div className="ac-buy-sub">
            {seriesLabel}{soldOut ? " · Sold out" : ""}
          </div>
          <h1 className="ac-buy-title">{title}</h1>
          <div className="ac-price">
            {/* styled-jsx can't scope into CoinMark, so position inline (measured: optical
                center of digits sits ~4px above the coin's baseline position) */}
            <span style={{ display: "inline-flex", transform: "translateY(-3.5px)" }}>
              <CoinPip size={18} />
            </span>{" "}
            {formatCoins(campaign.costCoins)} <small>/ pack</small>
            {slabs.length > 0 && (
              <button type="button" className="ac-checklist-link" onClick={() => setChecklistOpen(true)}>
                Checklist
              </button>
            )}
          </div>
          {!soldOut && campaign.totalSlots > 0 && (
            <div
              className="ac-valbar"
              aria-label={`Remaining ${remaining} of ${campaign.totalSlots}`}
            >
              <div className="ac-valbar-top">
                <span>Remaining</span>
                <strong>{formatCoins(remaining)} / {formatCoins(campaign.totalSlots)}</strong>
              </div>
              <div className="ac-valbar-track">
                <div
                  className="ac-valbar-fill"
                  style={{ width: `${Math.max(2, (remaining / campaign.totalSlots) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {!soldOut && openQty.length > 0 && (
            <>
              <div className="ac-qty-row">
                {openQty.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`ac-qty-btn${qty === q ? " on" : ""}`}
                    onClick={() => setQty(q)}
                    disabled={remaining < q}
                    title={remaining < q ? `Only ${remaining} packs left` : ""}
                  >
                    ×{q}
                  </button>
                ))}
                {/* open-all option, shown as the live remaining count so it
                    stays in the ×N language; hidden when it would duplicate
                    an existing option. DISABLED until the backend accepts it:
                    the open API caps quantity at 1–100 and the RPC only allows
                    values in open_quantity_options, so this button can only
                    produce errors in production for now */}
                {false && remaining > 0 && !openQty.includes(remaining) && (
                  <button
                    type="button"
                    className={`ac-qty-btn${qty === remaining ? " on" : ""}`}
                    onClick={() => setQty(remaining)}
                    title={`Open all ${remaining} packs`}
                  >
                    ×{formatCoins(remaining)}
                  </button>
                )}
              </div>
              <div className="ac-total-row">
                <span>Total</span>
                <strong>
                  {/* same optical-centering trick as the price row above */}
                  <span style={{ display: "inline-flex", transform: "translateY(-1.75px)" }}>
                    <CoinPip size={14} />
                  </span>{" "}
                  {formatCoins(totalCost)}
                </strong>
              </div>
            </>
          )}

          {/* open / buy button — same decision tree as the real dock */}
          {soldOut ? (
            <button
              type="button"
              className="ac-buynow ac-buynow-muted"
              onClick={() => toast("info", "We'll notify you when this pack restocks")}
            >
              Notify me
            </button>
          ) : !openable ? (
            <button type="button" className="ac-buynow ac-buynow-muted" disabled title={unavailableReason}>
              Not ready
            </button>
          ) : (
            <button type="button" className="ac-buynow" onClick={tryOpen} disabled={submitting}>
              Open now
            </button>
          )}
        </aside>
      </main>

      {/* ===== AVAILABLE SLABS ===== */}
      {slabs.length > 0 && (
        <section className="ac-slabs">
          {presentTiers.map((tier) => {
            const items = grouped[tier];
            return (
              <div className="ac-tier" key={tier}>
                <div className="ac-tier-head">
                  <h3>{TIER_NAME[tier]}</h3>
                </div>
                <div className="ac-grid">
                  {items.map((s) => (
                    <button
                      type="button"
                      className="ac-slab"
                      key={s.key}
                      onClick={() => setLightbox(s)}
                      style={{ ["--accent"]: TIER_ACCENT[tier] } as CSSProperties}
                    >
                      <div className="ac-slab-art">
                        {s.img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.img} alt={s.name} />
                        ) : (
                          <span className="ac-fan-ph">{initials(s.name)}</span>
                        )}
                      </div>
                      {/* Arena-style 3-line block: release year + brand / SKU name / model code */}
                      {(() => {
                        const headline = [s.year, s.brand ? (SERIES_LABEL[s.brand] ?? s.brand) : null]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <>
                            <div className="ac-slab-name">{headline || s.name}</div>
                            {headline && <div className="ac-slab-sub">{s.name}</div>}
                            {s.code && <div className="ac-slab-sub">#{s.code}</div>}
                          </>
                        );
                      })()}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {lastPrize && (
            <div className="ac-tier">
              <div className="ac-tier-head">
                <h3>{LAST_PRIZE_NAME}</h3>
                <span className="ac-muted">Bonus for whoever opens the final pack</span>
              </div>
              <div className="ac-grid">
                <div
                  className="ac-slab"
                  style={{ ["--accent"]: LAST_PRIZE_ACCENT, cursor: "default" } as CSSProperties}
                >
                  <div className="ac-slab-art">
                    {lastPrize.cardImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lastPrize.cardImageUrl} alt={lastPrize.cardName} />
                    ) : (
                      <span className="ac-fan-ph">{initials(lastPrize.cardName)}</span>
                    )}
                  </div>
                  <div className="ac-slab-name">{lastPrize.cardName}</div>
                  {lastPrize.cardCode && <div className="ac-slab-sub">#{lastPrize.cardCode}</div>}
                  <div className="ac-slab-sub">Final pack bonus</div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===== sticky open dock (real) — only once the buy panel scrolls away ===== */}
      {openQty.length > 0 && !soldOut && dockVisible && (
        <div className="cr-dock" role="region" aria-label="Open this pack">
          <div className="cr-dock-pack">
            <div className="cr-stack" style={{ gap: 3, minWidth: 0 }}>
              <span className="cr-mute" style={{ fontSize: 11, fontWeight: 500, lineHeight: 1 }}>{seriesLabel}</span>
              <strong style={{ fontSize: 13.5, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</strong>
              {campaign.totalSlots > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ flex: 1, height: 6, background: "#eae7e1", overflow: "hidden", minWidth: 40 }}>
                    <div style={{ height: "100%", width: `${Math.max(2, (remaining / campaign.totalSlots) * 100)}%`, background: "#1a1a1a" }} />
                  </div>
                  <small className="cr-mute" style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatCoins(remaining)} / {formatCoins(campaign.totalSlots)}</small>
                </div>
              )}
            </div>
          </div>
          <div className="cr-dock-qty">
            {openQty.map((q) => (
              <button key={q} type="button" className={`cr-dock-qty-btn ${qty === q ? "active" : ""}`} onClick={() => setQty(q)} disabled={remaining < q} title={remaining < q ? `Only ${remaining} packs left` : `Open ${q} pack${q === 1 ? "" : "s"}`}>
                ×{q}
              </button>
            ))}
          </div>
          <div className="cr-dock-cta">
            <div className="cr-dock-total">
              <small>Total</small>
              <strong className="cr-tnum"><CoinPip size={13} /> {formatCoins(totalCost)}</strong>
            </div>
            {!openable ? (
              <button type="button" className="cr-btn cr-btn-lg" disabled title={unavailableReason}>
                <Ico name="bell" size={14} /> Not ready
              </button>
            ) : (
              <button type="button" className="cr-btn cr-btn-primary cr-btn-lg" onClick={tryOpen} disabled={submitting}>
                <Ico name="sparkle" size={14} /> Open {qty} pack{qty === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
      )}
      {soldOut && dockVisible && (
        <div className="cr-dock" role="region" aria-label="Pack sold out" style={{ borderColor: "var(--cr-line-strong)", background: "var(--cr-paper-2)" }}>
          <div className="cr-dock-pack">
            <div className="cr-stack" style={{ gap: 2 }}>
              <small className="cr-eyebrow" style={{ fontSize: 9.5 }}>Sold out</small>
              <strong style={{ fontSize: 13.5 }}>{title}</strong>
              <small className="cr-mute" style={{ fontSize: 11 }}>We&apos;ll alert you when restocked</small>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="cr-btn cr-btn-lg" onClick={() => toast("info", "We'll notify you when this pack restocks")}>
            <Ico name="bell" size={14} /> Notify me
          </button>
        </div>
      )}

      {/* ===== confirm modal (real) ===== */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        eyebrow="Confirm"
        title={`Open ${title}`}
        size="md"
        footer={
          <>
            <button type="button" className="cr-btn" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-primary"
              onClick={confirmAndOpen}
              disabled={submitting || !enoughCoins || !enoughStock}
            >
              <CoinPip size={14} /> Spend {formatCoins(totalCost)} coins
            </button>
          </>
        }
      >
        <div className="cr-stack" style={{ gap: 16, padding: "4px 0" }}>
          <div>
            <span className="cr-eyebrow" style={{ display: "block", marginBottom: 8, textAlign: "center" }}>
              How many?
            </span>
            <div className="cr-dock-qty" style={{ margin: "0 auto", width: "fit-content" }}>
              {openQty.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`cr-dock-qty-btn ${qty === q ? "active" : ""}`}
                  onClick={() => setQty(q)}
                  disabled={remaining < q}
                >
                  ×{q}
                </button>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--cr-bg-soft)", border: "1px solid var(--cr-line)", borderRadius: "var(--cr-r-md)", padding: "14px 16px" }}>
            <div className="cr-row" style={{ justifyContent: "space-between", padding: "3px 0" }}>
              <span className="cr-mute" style={{ fontSize: 12.5 }}>Total cost</span>
              <strong className="cr-tnum" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CoinPip size={13} /> {formatCoins(totalCost)}
              </strong>
            </div>
            <div className="cr-row" style={{ justifyContent: "space-between", padding: "3px 0" }}>
              <span className="cr-mute" style={{ fontSize: 12.5 }}>Your balance</span>
              <strong className="cr-tnum">{formatCoins(balanceCoins)}c</strong>
            </div>
            <div className="cr-row" style={{ justifyContent: "space-between", padding: "3px 0" }}>
              <span className="cr-mute" style={{ fontSize: 12.5 }}>Balance after open</span>
              <strong className="cr-tnum" style={{ color: enoughCoins ? "var(--cr-ink)" : "var(--cr-rose)" }}>
                {formatCoins(balanceCoins - totalCost)}c
              </strong>
            </div>
          </div>
        </div>
      </Modal>

      {/* ===== slab pack checklist — FoG-style right-slide drawer ===== */}
      {checklistOpen && (
        <div
          className={`ac-drawer-backdrop${checklistClosing ? " closing" : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeChecklist();
          }}
        >
          <aside
            className={`ac-drawer${checklistClosing ? " closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Checklist"
          >
            <div className="ac-drawer-head">
              <span>Checklist</span>
              <button type="button" className="ac-drawer-x" onClick={closeChecklist} aria-label="Close">
                <span className="ac-drawer-x-icon" aria-hidden="true" />
              </button>
            </div>
            <div className="ac-drawer-body">
              <div className="ac-cl-body">
                <p className="ac-cl-note">This list updates whenever a pack is opened.</p>
                {presentTiers.map((tier) => (
                  <div className="ac-cl-section" key={tier}>
                    <div className="ac-cl-tier" style={{ color: TIER_ACCENT[tier] }}>{TIER_NAME[tier]}</div>
                    {grouped[tier].map((s) => (
                      <div className="ac-cl-row" key={s.key}>
                        <strong>{s.name}</strong>
                        {s.grade ? <span className="ac-cl-grade">{s.grade}</span> : null}
                        <span className="ac-cl-rate">{formatRate(rateOf(s))}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ===== Arena-style card lightbox ===== */}
      {lightbox && (
        <div
          className="ac-lightbox-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightbox(null);
          }}
        >
          <div className="ac-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.name}>
            <button type="button" className="ac-lightbox-x" onClick={() => setLightbox(null)} aria-label="Close">
              <span className="ac-drawer-x-icon" aria-hidden="true" />
            </button>
            {lightbox.img ? (
              <div className="ac-lightbox-card">
                {/* card + reflection rotate together inside ONE animated
                    wrapper, so the mirror can never fall out of sync */}
                <div className="ac-lightbox-turn">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ac-lightbox-main" src={lightbox.img} alt={lightbox.name} />
                  <div className="ac-lightbox-refl-clip" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="ac-lightbox-refl" src={lightbox.img} alt="" />
                  </div>
                </div>
              </div>
            ) : (
              <span className="ac-fan-ph">{initials(lightbox.name)}</span>
            )}
          </div>
        </div>
      )}

      <style jsx>{baseCss}</style>
    </div>
  );
}

const baseCss = `
  .ac-root {
    --ink: #0e1116; --muted: #6b7280; --line: #e5e7eb; --green: #05a66b; --green-hover: #048f5c;
    color: var(--ink); font-family: Helvetica, Arial, var(--font-inter), sans-serif;
    -webkit-font-smoothing: antialiased; padding-bottom: 0;
  }
  /* HERO */
  .ac-hero {
    position: relative; width: 100vw; left: 50%; right: 50%;
    margin-left: -50vw; margin-right: -50vw;
    aspect-ratio: 4 / 1; min-height: 220px; max-height: 440px;
    overflow: hidden; background: #0e1116;
  }
  .ac-hero-media { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ac-hero-ph { position: absolute; inset: 0; background: linear-gradient(120deg, #cfe0f5 0%, #e7dcf0 45%, #f7d8c9 100%); }

  /* proportional columns (~3/4 : 1/4) — 1065:360 is the tuned full-width design,
     kept as a ratio so both columns scale together on narrower windows */
  .ac-main { display: grid; grid-template-columns: 1065fr 360fr; gap: 25px; max-width: 1450px; margin: 0 auto; padding: 50px 0 25px; align-items: start; }
  /* fan stage */
  .ac-stage { position: relative; aspect-ratio: 2 / 1; border-radius: 20px; overflow: hidden; background: linear-gradient(135deg, #f8c7a6 0%, #eed6c5 38%, #cfe0f5 100%); display: flex; align-items: center; justify-content: center; }
  .ac-fan { position: relative; width: 280px; height: 380px; }
  .ac-fan-card { position: absolute; inset: 0; margin: auto; width: 230px; height: 322px; border-radius: 12px; overflow: hidden; transition: transform 0.35s cubic-bezier(.2,.7,.2,1), opacity 0.35s ease; display: flex; align-items: center; justify-content: center; background: #fff; box-shadow: 0 18px 36px rgba(0,0,0,0.28); }
  .ac-fan-card.is-center { box-shadow: 0 26px 50px rgba(0,0,0,0.4); }
  .ac-fan-card img { width: 100%; height: 100%; object-fit: contain; }
  .ac-fan-ph { font-size: 42px; font-weight: 800; color: var(--muted); }
  .ac-arrow { position: absolute; top: 50%; transform: translateY(-50%); z-index: 20; width: 42px; height: 42px; border-radius: 50%; border: none; cursor: pointer; background: rgba(255,255,255,0.85); color: #111; font-size: 22px; box-shadow: 0 4px 12px rgba(0,0,0,0.18); }
  .ac-prev { left: 16px; } .ac-next { right: 16px; }
  .ac-arrow:hover { background: #fff; }
  .ac-rate-badge { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 20; background: rgba(17,17,17,0.78); color: #fff; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; }
  .ac-center-name { text-align: center; margin-top: 12px; font-weight: 800; font-size: 16px; display: flex; gap: 10px; justify-content: center; align-items: center; }
  .ac-center-tier { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; }

  /* buy panel */
  /* 532.5px = the 2:1 stage's height — bottom edges line up; content can
     still push the panel taller if it overflows. Flex column so the
     transaction cluster (qty / total / open) sinks to the bottom edge
     while the info block stays up top. */
  /* aspect-ratio 360:532.5 keeps the panel's height equal to the stage's
     (stage = 2:1 of a column 1065/360 wider), so their bottoms stay aligned
     at every window width */
  .ac-buy { border: 1px solid var(--line); border-radius: 18px; padding: 35px 25px 25px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); aspect-ratio: 360 / 532.5; display: flex; flex-direction: column; }
  /* sold-out / not-ready states render the button right after the price */
  .ac-price + .ac-buynow { margin-top: auto; }
  /* Fear-of-God scale/weight (our font): fluid vw title (like FoG 1.5625vw) + small eyebrow */
  .ac-buy-title { color: #000000; font-size: clamp(22px, 1.5625vw, 34px); font-weight: 400; margin: 0 0 5px; letter-spacing: 0; line-height: 1.2; }
  /* FoG vendor-eyebrow style (ESSENTIALS): 12px uppercase, tracked, ink, regular weight */
  .ac-buy-sub { color: #000000; font-size: 12px; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0; }
  /* Fear-of-God style: charcoal fill on bone, sharp corners, tracked uppercase label */
  /* REMAINING sits with the transaction cluster — its auto top margin
     carries the panel's breathing space, and "136 / 138" lands right
     above the ×136 open-all button */
  .ac-valbar { margin: auto 0 25px; }
  .ac-valbar-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
  .ac-valbar-top span { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #757575; font-weight: 600; }
  .ac-valbar-top strong { color: #757575; font-weight: 600; font-size: 12px; font-variant-numeric: tabular-nums; }
  .ac-valbar-track { height: 15px; background: #eae7e1; overflow: hidden; }
  .ac-valbar-fill { height: 100%; background: #1a1a1a; transition: width 0.3s ease; }
  .ac-price { display: flex; align-items: baseline; gap: 7px; font-size: 26px; font-weight: 800; margin-bottom: 18px; color: #000; }
  .ac-price small { font-size: 11px; font-weight: 400; color: #757575; letter-spacing: 0.1em; text-transform: uppercase; }
  .ac-qty-label { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .ac-qty-row { display: flex; gap: 10px; margin-bottom: 30px; }
  .ac-qty-btn { flex: 1; height: 38px; border: 1px solid var(--line); background: #fff; font-size: 15px; font-weight: 800; cursor: pointer; color: var(--ink); }
  .ac-qty-btn:hover:not(:disabled) { border-color: #b9c0c8; }
  .ac-qty-btn.on { background: var(--ink); color: #fff; border-color: var(--ink); }
  .ac-qty-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .ac-total-row { display: flex; align-items: baseline; justify-content: space-between; font-size: 14px; padding: 10px 5px; }
  .ac-total-row span { font-size: 11px; color: #757575; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
  .ac-total-row strong { display: inline-flex; align-items: baseline; gap: 6px; font-size: 16px; }
  .ac-wallet { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; }
  .ac-wallet-ico { width: 34px; height: 34px; border-radius: 8px; background: #f3f4f6; }
  .ac-wallet-label { font-size: 13.5px; font-weight: 700; }
  .ac-muted { color: var(--muted); font-size: 12px; }
  .ac-tier-head .ac-muted { font-size: 11px; color: #757575; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
  .ac-buynow { width: 100%; height: 48px; border: none; border-radius: 12px; background: var(--green); color: #fff; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; justify-content: center; text-decoration: none; }
  .ac-buynow:hover:not(:disabled) { background: var(--green-hover); }
  .ac-buynow:disabled { opacity: 0.5; cursor: not-allowed; }
  .ac-buynow-muted { background: #2a2f36; }
  .ac-buynow-gold { background: var(--cr-gold, #d9a022); }
  .ac-checklist-link { margin-left: auto; background: none; border: none; padding: 0; font-family: inherit; font-size: 10px; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; color: #000; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; text-decoration-color: #757575; }
  .ac-checklist-link:hover { text-decoration-color: #000; }
  /* checklist rows — YFIFTEEN filter-row language: tall airy rows, tracked
     uppercase regular-weight text, #e5e7eb hairlines, monochrome */
  .ac-cl-body { max-height: none; padding-right: 0; }
  .ac-cl-note { color: #757575; font-size: 11px; letter-spacing: 0.02em; margin: 14px 0 2px; }
  .ac-cl-section { margin: 0; }
  .ac-cl-tier { font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; padding: 22px 0 8px; }
  .ac-cl-row { display: flex; align-items: baseline; gap: 12px; padding: 15px 0; border-bottom: 1px solid #e5e7eb; }
  .ac-cl-row strong { flex: 1; font-size: 12px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: #000; min-width: 0; }
  .ac-cl-grade { color: #757575; font-size: 11px; letter-spacing: 0.04em; white-space: nowrap; }
  .ac-cl-rate { font-size: 12px; font-weight: 400; color: #000; font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* right-slide drawer — YFIFTEEN filter-drawer pattern (w-11/12 max-w-md,
     hairline left + header borders, small tracked title, square corners) */
  .ac-drawer-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.35); display: flex; justify-content: flex-end; animation: ac-fade-in 0.24s ease; }
  .ac-drawer-backdrop.closing { animation: ac-fade-out 0.24s ease forwards; }
  .ac-drawer { position: relative; width: 91.6667%; max-width: 448px; height: 100%; background: #fff; border-left: 1px solid #e5e7eb; display: flex; flex-direction: column; animation: ac-slide-in 0.3s cubic-bezier(0.22, 0.61, 0.36, 1); }
  .ac-drawer.closing { animation: ac-slide-out 0.24s ease forwards; }
  .ac-drawer-head { display: flex; align-items: center; min-height: 82px; padding: 0 42px; flex-shrink: 0; }
  .ac-drawer-head span { font-size: 12px; font-weight: 500; letter-spacing: 1.8px; text-transform: uppercase; color: #000; }
  .ac-drawer-x { position: absolute; top: 27.5px; right: 42px; width: 13px; height: 16px; display: inline-flex; align-items: center; justify-content: center; background: none; border: none; padding: 0; cursor: pointer; color: #000; }
  .ac-drawer-x:hover { opacity: 0.55; }
  .ac-drawer-x-icon { display: block; width: 14px; height: 14px; background: currentColor; -webkit-mask: url("data:image/svg+xml,%3Csvg%20width='24'%20height='26'%20viewBox='0%200%2024%2026'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3E%3Cpath%20d='M23%201.07617L1%2025.1516'%20stroke='black'%20stroke-linejoin='round'/%3E%3Cpath%20d='M1%201.07617L23%2025.1516'%20stroke='black'%20stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat; mask: url("data:image/svg+xml,%3Csvg%20width='24'%20height='26'%20viewBox='0%200%2024%2026'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3E%3Cpath%20d='M23%201.07617L1%2025.1516'%20stroke='black'%20stroke-linejoin='round'/%3E%3Cpath%20d='M1%201.07617L23%2025.1516'%20stroke='black'%20stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat; }
  .ac-drawer-body { flex: 1; overflow-y: auto; padding: 0 42px 30px; }
  .ac-drawer-body .ac-cl-body { max-height: none; padding-right: 0; }
  /* Arena-style card lightbox + the Courtyard turntable sway (see
     PackDetailExperience .cr-feat-turn — flat scans, so sway not real 360) */
  .ac-lightbox-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; animation: ac-fade-in 0.2s ease; }
  /* K4 stage: every technique together on bright mint — medium vignette,
     skylight from the top (::before), white halo behind the card (::after),
     and a very faint glass reflection swaying along below. An invisible
     spacer above the card balances the reflection's height so the card
     itself sits dead-center in the panel. */
  /* panel is a fixed 3:4 portrait; inner zones are percentages of its
     height (19% spacer / 62% card / 19% reflection) so the card stays
     dead-center at any screen size */
  .ac-lightbox { --lbw: min(600px, 90vw, 64.5vh); --lbh: calc(var(--lbw) * 4 / 3); position: relative; overflow: hidden; background: radial-gradient(95% 75% at 50% 42%, #f4fcf4 0%, #ebf8eb 45%, #cde4ce 78%, #afcdb1 100%); padding: 24px; width: var(--lbw); height: var(--lbh); display: flex; align-items: center; justify-content: center; animation: ac-pop 0.28s ease; }
  .ac-lightbox::before { content: ""; position: absolute; inset: 0; background: radial-gradient(66% 46% at 50% -8%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0) 70%); }
  .ac-lightbox::after { content: ""; position: absolute; width: 64%; height: 54%; left: 18%; top: 17%; border-radius: 50%; background: #fff; filter: blur(44px); opacity: 0.95; }
  /* perspective only reaches DIRECT children, so it lives on each image's
     immediate parent — without it rotateY degrades into a width squeeze */
  .ac-lightbox-card { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; height: 100%; width: 100%; perspective: 800px; }
  .ac-lightbox-card::before { content: ""; height: calc((var(--lbh) - 48px) * 0.103); flex-shrink: 0; }
  /* the ONE animated element — card and reflection ride inside it */
  .ac-lightbox-turn { display: flex; flex-direction: column; align-items: center; align-self: stretch; animation: ac-card-turn 7s ease-in-out infinite; }
  .ac-lightbox-main { display: block; height: calc((var(--lbh) - 48px) * 0.794); max-width: 100%; object-fit: contain; filter: drop-shadow(0 14px 14px rgba(13, 20, 17, 0.2)); }
  /* the clip runs through the panel's bottom padding (negative margin) so
     the reflection bleeds all the way to the bottom edge; the mask is tuned
     to hit zero right at that edge — no cut line */
  .ac-lightbox-refl-clip { height: calc((var(--lbh) - 48px) * 0.103 - 2px + 24px); overflow: hidden; margin-top: 2px; margin-bottom: -24px; align-self: stretch; }
  .ac-lightbox-refl { display: block; margin: 0 auto; height: calc((var(--lbh) - 48px) * 0.794); max-width: 100%; object-fit: contain; transform: scaleY(-1); opacity: 0.28; filter: blur(1px); -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 19%); mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 19%); }
  /* courtyard.io-style display sway (user-tuned ±21°) + a soft 7px float;
     the reflection runs the same path inside flipped (scaleY(-1)) space, so
     the same translateY reads as the mirror-correct opposite direction */
  @keyframes ac-card-turn {
    0%, 100% { transform: rotateY(21deg) translateY(0); }
    50% { transform: rotateY(-21deg) translateY(-7px); }
  }
  @keyframes ac-pop {
    from { transform: scale(0.97); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ac-lightbox, .ac-lightbox-turn { animation: none; }
  }
  .ac-lightbox-x { position: absolute; top: 14px; right: 14px; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; background: none; border: none; padding: 0; cursor: pointer; color: #000; z-index: 3; }
  .ac-lightbox .ac-fan-ph { position: relative; z-index: 2; }
  .ac-lightbox-x:hover { opacity: 0.55; }

  @keyframes ac-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes ac-slide-out { from { transform: translateX(0); } to { transform: translateX(100%); } }
  @keyframes ac-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ac-fade-out { from { opacity: 1; } to { opacity: 0; } }

  /* available slabs */
  .ac-slabs { max-width: 1450px; margin: 0 auto; padding: 0 0 50px; }
  .ac-slabs-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .ac-slabs-head h2 { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.01em; }
  .ac-tier { margin-bottom: 50px; }
  .ac-tier-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 16px; }
  .ac-tier-head h3 { font-size: clamp(16px, 1.05vw, 24px); font-weight: 600; line-height: 1.2; letter-spacing: 0.04em; margin: 0; color: #000; }
  /* FoG collection-grid gaps: row gap double the column gap */
  .ac-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 50px 25px; }
  .ac-slab { background: #fff; border: none; border-radius: 14px; padding: 0; cursor: pointer; text-align: left; transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .ac-slab:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0,0,0,0.1); }
  /* FoG-style card: full-width 3:4 image block, height follows the ratio,
     text lines sit below */
  .ac-slab-art { aspect-ratio: 3 / 4; width: 100%; height: auto; margin: 0 0 10px; border-radius: 10px; overflow: hidden; background: #f5f5f5; display: flex; align-items: center; justify-content: center; }
  .ac-slab-art img { width: 100%; height: 100%; object-fit: contain; padding: 6%; }
  .ac-slab-name { font-size: 14px; font-weight: 800; color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Arena-style gray info lines under the card name (grade / card number) */
  .ac-slab-sub { font-size: 14px; color: #000; font-weight: 400; margin-top: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* below 1200px the side-by-side panel gets too cramped (price wraps, qty
     buttons squeeze past the matched height), so stack it under the stage
     early; card-grid/typography keep desktop styling until the 920px cut */
  @media (max-width: 1199px) {
    .ac-main { grid-template-columns: 1fr; }
    .ac-buy { aspect-ratio: auto; }
  }

  @media (max-width: 920px) {
    .ac-main { grid-template-columns: 1fr; }
    /* on mobile the panel no longer sits beside the stage, so drop the
       height-matching and let it hug its content */
    .ac-buy { padding-top: 25px; }
    /* tighter, uniform vertical rhythm on mobile */
    .ac-price, .ac-valbar, .ac-qty-row { margin-bottom: 18px; }
    .ac-hero { aspect-ratio: 16 / 9; }
    /* FoG mobile grid: 2 cards per row (minmax(0,1fr) so long names can't
       blow the track wider than the screen) */
    .ac-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12.5px; }
    .ac-tier { margin-bottom: 30px; }
    .ac-slab-name, .ac-slab-sub { font-size: 12px; }
    .ac-drawer-head { padding: 0 28px; }
    .ac-drawer-x { right: 28px; }
    .ac-drawer-body { padding: 0 28px 30px; }
  }

  /* square corners (arena aesthetic) */
  .ac-root :where(*) { border-radius: 0; }
`;
