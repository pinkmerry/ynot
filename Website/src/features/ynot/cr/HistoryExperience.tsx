"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type {
  YnotAddress,
  YnotCollectionItem,
} from "../types";
import {
  isCompleteShippingAddress,
  missingShippingAddressFields,
} from "../address-utils";
import { QuantityBadge } from "../QuantityBadge";
import { CoinPip, Ico, formatCoins } from "./Icons";
import { Modal, PageHead, useToast } from "./UiKit";

type TabKey = "collection" | "shipped" | "converted";
type TierKey = "rainbow" | "gold" | "silver" | "bronze";
type StatusKey = "owned" | "shipped" | "converted";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function statusBucket(status: YnotCollectionItem["status"]): StatusKey | null {
  if (status === "owned") return "owned";
  if (status === "shipped" || status === "shipping_requested") return "shipped";
  if (status === "exchanged" || status === "exchange_requested")
    return "converted";
  return null;
}

function deriveTier(item: YnotCollectionItem): TierKey {
  const sourceTier = item.sourcePrizeTier;
  if (
    sourceTier === "rainbow" ||
    sourceTier === "gold" ||
    sourceTier === "silver" ||
    sourceTier === "bronze"
  ) {
    return sourceTier;
  }
  const grade = (item.cardGrade ?? "").toLowerCase();
  const tier = (item.cardPrizeCategory ?? "").toLowerCase();
  if (grade.includes("rainbow") || tier.includes("rainbow")) return "rainbow";
  if (grade.includes("gold") || tier.includes("gold")) return "gold";
  if (grade.includes("silver") || tier.includes("silver")) return "silver";
  return "bronze";
}

function cardSeries(item: YnotCollectionItem): string {
  return (item.cardSeries ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function seriesLabel(series: string): string {
  if (series === "pokemon") return "Pokemon";
  if (series === "one_piece") return "One Piece";
  return series.replace(/_/g, " ");
}

function statusLabel(bucket: StatusKey): string {
  if (bucket === "owned") return "Owned";
  if (bucket === "shipped") return "Shipped";
  return "Converted";
}

function collectionDisplayCode(item: YnotCollectionItem): string {
  return item.cardCode ?? item.serialNo ?? "Collection reward";
}

type EnrichedItem = YnotCollectionItem & {
  bucket: StatusKey;
  tier: TierKey;
  series: string;
  acquiredLabel: string;
  sellValueCoins: number;
};

function enrich(item: YnotCollectionItem): EnrichedItem | null {
  const bucket = statusBucket(item.status);
  if (!bucket) return null;
  const tier = deriveTier(item);
  return {
    ...item,
    bucket,
    tier,
    series: cardSeries(item),
    acquiredLabel: new Date(item.acquiredAt).toLocaleDateString(),
    sellValueCoins: item.convertCoinValue ?? 0,
  };
}

export type HistoryExperienceProps = {
  collection: YnotCollectionItem[];
  addresses: YnotAddress[];
};

export function HistoryExperience({
  collection,
  addresses,
}: HistoryExperienceProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("collection");
  const [seriesFilter, setSeriesFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addressRows, setAddressRows] = useState(addresses);
  const [sellOpen, setSellOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const enriched = useMemo(() => {
    const list: EnrichedItem[] = [];
    for (const item of collection) {
      const enrichedItem = enrich(item);
      if (enrichedItem) list.push(enrichedItem);
    }
    return list;
  }, [collection]);

  const byTab: Record<TabKey, EnrichedItem[]> = useMemo(() => {
    return {
      collection: enriched.filter((c) => c.bucket === "owned"),
      shipped: enriched.filter((c) => c.bucket === "shipped"),
      converted: enriched.filter((c) => c.bucket === "converted"),
    };
  }, [enriched]);

  const visibleCards = useMemo(() => {
    return byTab[tab]
      .filter(
        (c) => seriesFilter === "all" || c.series === seriesFilter,
      )
      .filter((c) => {
        if (!search.trim()) return true;
        const needle = search.toLowerCase();
        return (
          c.cardName.toLowerCase().includes(needle) ||
          (c.cardCode ?? "").toLowerCase().includes(needle)
        );
      });
  }, [byTab, tab, seriesFilter, search]);

  const seriesOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of enriched) {
      if (item.series) set.add(item.series);
    }
    return Array.from(set).sort();
  }, [enriched]);

  function toggleSelect(id: string, bucket: StatusKey) {
    if (bucket !== "owned") {
      toast("error", "Only owned cards can be selected for actions.");
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleAddressSaved(address: YnotAddress) {
    setAddressRows((current) => {
      const withoutCurrent = current
        .filter((row) => row.id !== address.id)
        .map((row) => (address.isDefault ? { ...row, isDefault: false } : row));
      return address.isDefault
        ? [address, ...withoutCurrent]
        : [...withoutCurrent, address];
    });
  }

  function selectAll() {
    const owned = visibleCards
      .filter((c) => c.bucket === "owned")
      .map((c) => c.id);
    setSelected(new Set(owned));
  }

  const selectedCards = enriched.filter((c) => selected.has(c.id) && c.bucket === "owned");
  const sellTotal = selectedCards.reduce(
    (sum, c) => sum + (c.sellValueCoins ?? 0),
    0,
  );

  function submitSell() {
    if (!selectedCards.length) return;
    const ids = selectedCards.map((c) => c.id);
    startSubmit(async () => {
      try {
        const response = await fetch("/api/ynot/collection/convert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ collectionItemIds: ids }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Conversion request failed.",
          );
        }
        toast("success", `Submitted ${ids.length} card${ids.length === 1 ? "" : "s"} for conversion.`);
        setSellOpen(false);
        clearSelection();
        window.location.assign("/profile");
      } catch (error) {
        toast(
          "error",
          error instanceof Error ? error.message : "Conversion request failed.",
        );
      }
    });
  }

  function submitShip(addressId: string) {
    if (!selectedCards.length || !addressId) return;
    const ids = selectedCards.map((c) => c.id);
    startSubmit(async () => {
      try {
        const response = await fetch("/api/ynot/shipping", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            addressId,
            collectionItemIds: ids,
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Shipping request failed.",
          );
        }
        toast("success", `Shipping requested for ${ids.length} card${ids.length === 1 ? "" : "s"}.`);
        setShipOpen(false);
        clearSelection();
        window.location.assign("/profile");
      } catch (error) {
        toast(
          "error",
          error instanceof Error ? error.message : "Shipping request failed.",
        );
      }
    });
  }

  return (
    <div className="cr-page">
      <PageHead
        eyebrow="Collection"
        title="My collection"
        lead="Cards you own, ship, or sell back to coins."
        actions={
          <Link className="cr-btn cr-btn-primary" href="/packs">
            <Ico name="sparkle" size={14} /> Open another pack
          </Link>
        }
      />

      <div className="cr-stack cr-collection-workspace">
          <div className="cr-tabs" role="tablist">
            <button
              type="button"
              className={`cr-tab ${tab === "collection" ? "active" : ""}`}
              onClick={() => {
                setTab("collection");
                clearSelection();
              }}
            >
              My collection <span className="count">{byTab.collection.length}</span>
            </button>
            <button
              type="button"
              className={`cr-tab ${tab === "shipped" ? "active" : ""}`}
              onClick={() => {
                setTab("shipped");
                clearSelection();
              }}
            >
              Shipped <span className="count">{byTab.shipped.length}</span>
            </button>
            <button
              type="button"
              className={`cr-tab ${tab === "converted" ? "active" : ""}`}
              onClick={() => {
                setTab("converted");
                clearSelection();
              }}
            >
              Converted <span className="count">{byTab.converted.length}</span>
            </button>
          </div>

          <div className="cr-toolbar" style={{ gap: 8 }}>
            <div className="cr-row" style={{ gap: 4 }}>
              <button
                type="button"
                className={`cr-btn cr-btn-sm ${
                  seriesFilter === "all" ? "cr-btn-primary" : "cr-btn-ghost"
                }`}
                onClick={() => setSeriesFilter("all")}
              >
                All series
              </button>
              {seriesOptions.map((series) => (
                <button
                  key={series}
                  type="button"
                  className={`cr-btn cr-btn-sm ${
                    seriesFilter === series ? "cr-btn-primary" : "cr-btn-ghost"
                  }`}
                  onClick={() => setSeriesFilter(series)}
                >
                  {seriesLabel(series)}
              </button>
            ))}
          </div>
            <span style={{ flex: 1 }} />
            <div className="cr-search" style={{ maxWidth: 220 }}>
              <Ico name="search" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search card name…"
                aria-label="Search cards"
              />
            </div>
          </div>

          {tab === "collection" && visibleCards.length > 0 && (
            <div className="cr-row" style={{ gap: 10, padding: "0 4px" }}>
              <small className="cr-mute" style={{ fontSize: 12 }}>
                Tap cards to select. Selected cards can be{" "}
                <strong style={{ color: "var(--cr-ink)" }}>sold for coins</strong>{" "}
                or shipped to you.
              </small>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="cr-btn cr-btn-ghost cr-btn-sm"
                onClick={selectAll}
              >
                Select all
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  className="cr-btn cr-btn-ghost cr-btn-sm"
                  onClick={clearSelection}
                >
                  Clear ({selected.size})
                </button>
              )}
            </div>
          )}

          {visibleCards.length === 0 ? (
            <div
              className="cr-section"
              style={{ padding: 60, textAlign: "center" }}
            >
              <strong
                style={{ display: "block", fontSize: 14, marginBottom: 6 }}
              >
                Nothing here yet
              </strong>
              <small className="cr-mute">
                {tab === "collection"
                  ? "Open a pack to start your collection."
                  : tab === "shipped"
                    ? "Request shipping on owned cards to see them here."
                    : "Sell owned cards back to coins to see them here."}
              </small>
              {tab === "collection" && (
                <Link
                  className="cr-btn cr-btn-primary"
                  href="/packs"
                  style={{ marginTop: 14 }}
                >
                  <Ico name="sparkle" size={14} /> Open a pack
                </Link>
              )}
            </div>
          ) : (
            <div
              className="cr-collection-grid"
              style={{ paddingBottom: selected.size > 0 ? 80 : 12 }}
            >
              {visibleCards.map((card) => (
                <CollectionTile
                  key={card.id}
                  card={card}
                  selected={selected.has(card.id)}
                  selectable={card.bucket === "owned"}
                  onToggle={() => toggleSelect(card.id, card.bucket)}
                />
              ))}
            </div>
          )}

          {selected.size > 0 && (
            <div className="cr-bulk-bar">
              <span className="count">{selected.size}</span>
              <span
                style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}
              >
                card{selected.size === 1 ? "" : "s"} selected
              </span>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                · sell value{" "}
                <strong style={{ opacity: 1 }}>
                  <CoinPip size={11} /> {formatCoins(sellTotal)}
                </strong>
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                onClick={clearSelection}
              >
                <Ico name="x" size={12} /> Clear
              </button>
              <button
                type="button"
                className="cr-btn cr-btn-sm"
                onClick={() => setShipOpen(true)}
              >
                <Ico name="truck" size={12} /> Request shipping
              </button>
              <button
                type="button"
                className="cr-btn cr-btn-mint cr-btn-sm"
                onClick={() => setSellOpen(true)}
              >
                <Ico name="swap" size={12} /> Sell for{" "}
                {formatCoins(sellTotal)} coins
              </button>
            </div>
          )}
      </div>

      <Modal
        open={sellOpen}
        onClose={() => {
          if (!submitting) setSellOpen(false);
        }}
        eyebrow="Confirm"
        title={`Sell ${selectedCards.length} card${
          selectedCards.length === 1 ? "" : "s"
        } back to coins?`}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="cr-btn"
              onClick={() => setSellOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-mint"
              onClick={submitSell}
              disabled={submitting}
            >
              <Ico name="check" size={14} />{" "}
              {submitting
                ? "Submitting…"
                : `Sell for ${formatCoins(sellTotal)} coins`}
            </button>
          </>
        }
      >
        <div className="cr-stack" style={{ gap: 14 }}>
          <p className="cr-lead" style={{ margin: 0 }}>
            Converting cards is <strong>permanent</strong>. Admin reviews the
            request and the coins land in your wallet once approved.
          </p>
          <div
            style={{
              maxHeight: 280,
              overflowY: "auto",
              border: "1px solid var(--cr-line)",
              borderRadius: "var(--cr-r-md)",
            }}
          >
            {selectedCards.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr auto",
                  gap: 10,
                  padding: "10px 14px",
                  borderTop: i ? "1px solid var(--cr-line-soft)" : 0,
                  alignItems: "center",
                }}
              >
                <div
                  className={`cr-coll-art ${c.tier}`}
                  style={{
                    aspectRatio: "3 / 4",
                    width: 44,
                    borderRadius: 6,
                    borderBottom: 0,
                  }}
                >
                  {c.imageUrl ? (
                    <Image
                      className="cr-coll-art-img"
                      src={c.imageUrl}
                      alt={c.cardName}
                      fill
                      sizes="44px"
                      unoptimized
                    />
                  ) : null}
                  <span
                    className="cr-coll-code"
                    style={{
                      left: 4,
                      bottom: 4,
                      maxWidth: 36,
                      fontSize: 7,
                      padding: "2px 4px",
                    }}
                  >
                    {c.cardCode ?? "—"}
                  </span>
                </div>
                <div
                  className="cr-stack"
                  style={{ gap: 2, minWidth: 0 }}
                >
                  <strong style={{ fontSize: 12.5 }}>{c.cardName}</strong>
                  <small className="cr-mute" style={{ fontSize: 11 }}>
                    {c.tier} · {collectionDisplayCode(c)}
                  </small>
                </div>
                <strong
                  className="cr-tnum"
                  style={{ color: "var(--cr-coin-ink)", fontSize: 13 }}
                >
                  <CoinPip size={11} /> +{formatCoins(c.sellValueCoins)}
                </strong>
              </div>
            ))}
          </div>
          <div
            style={{
              background: "var(--cr-mint-soft)",
              padding: "12px 16px",
              borderRadius: "var(--cr-r-md)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--cr-mint)" }}>
              You&apos;ll receive (after approval)
            </span>
            <strong
              className="cr-tnum"
              style={{ fontSize: 18, color: "var(--cr-mint)" }}
            >
              <CoinPip size={14} /> {formatCoins(sellTotal)} coins
            </strong>
          </div>
        </div>
      </Modal>

      <ShipModal
        open={shipOpen}
        addresses={addressRows}
        cards={selectedCards}
        submitting={submitting}
        onAddressSaved={handleAddressSaved}
        onClose={() => {
          if (!submitting) setShipOpen(false);
        }}
        onConfirm={submitShip}
      />
    </div>
  );
}

function CollectionTile({
  card,
  selected,
  selectable,
  onToggle,
}: {
  card: EnrichedItem;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const label = statusLabel(card.bucket);
  return (
    <div
      className={`cr-coll-card ${selected ? "selected" : ""}`}
      data-disabled={!selectable}
      onClick={selectable ? onToggle : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={(e) => {
        if (selectable && e.key === "Enter") onToggle();
      }}
    >
      <div className={`cr-coll-art ${card.tier}`}>
        {card.imageUrl ? (
          <Image
            className="cr-coll-art-img"
            src={card.imageUrl}
            alt={card.cardName}
            fill
            sizes="(max-width: 760px) 45vw, 180px"
            unoptimized
          />
        ) : null}
        <span className="cr-coll-tier">{card.tier.toUpperCase()}</span>
        <QuantityBadge quantity={card.bundleQuantity} />
        <span className={`cr-coll-status ${card.bucket}`}>{label}</span>
        <span className="cr-coll-code">
          {collectionDisplayCode(card)}
        </span>
        {selectable && (
          <span className="cr-coll-check">
            {selected ? <Ico name="check" size={14} /> : <Ico name="plus" size={14} />}
          </span>
        )}
      </div>
      <div className="cr-coll-body">
        <strong>{card.cardName}</strong>
        {card.cardGrade ? (
          <small className="cr-mute" style={{ marginTop: 2 }}>
            {card.cardGrade}
          </small>
        ) : null}
        {card.bucket === "owned" && card.sellValueCoins > 0 && (
          <span className="price">
            <CoinPip size={10} /> Sell for {formatCoins(card.sellValueCoins)}
          </span>
        )}
        {card.bucket === "shipped" && (
          <small className="cr-mute" style={{ marginTop: 4 }}>
            Shipped {card.acquiredLabel}
          </small>
        )}
        {card.bucket === "converted" && card.sellValueCoins > 0 && (
          <span className="price">
            +{formatCoins(card.sellValueCoins)} returned
          </span>
        )}
      </div>
    </div>
  );
}

function ShipModal({
  open,
  addresses,
  cards,
  submitting,
  onAddressSaved,
  onClose,
  onConfirm,
}: {
  open: boolean;
  addresses: YnotAddress[];
  cards: EnrichedItem[];
  submitting: boolean;
  onAddressSaved: (address: YnotAddress) => void;
  onClose: () => void;
  onConfirm: (addressId: string) => void;
}) {
  const defaultAddress =
    addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [addressId, setAddressId] = useState<string>(defaultAddress?.id ?? "");
  const [addingAddress, setAddingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: "Home",
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    subdistrict: "",
    district: "",
    province: "",
    postalCode: "",
    country: "Thailand",
    deliveryNote: "",
    isDefault: addresses.length === 0,
  });
  const [addressMessage, setAddressMessage] = useState("");
  const [addressSavePending, setAddressSavePending] = useState(false);
  const selectedAddress = addresses.find((address) => address.id === addressId);

  function updateAddressField(key: keyof typeof newAddress, value: string | boolean) {
    setNewAddress((current) => ({ ...current, [key]: value }));
  }

  async function saveAddress() {
    if (addressSavePending) return;
    setAddressMessage("");
    setAddressSavePending(true);
    try {
      const response = await fetch("/api/ynot/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...newAddress,
          isDefault: addresses.length === 0 ? true : newAddress.isDefault,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Could not save address.",
        );
      }
      const address =
        isRecord(payload) && isRecord(payload.address)
          ? (payload.address as YnotAddress)
          : null;
      if (!address) throw new Error("Address could not be saved.");
      onAddressSaved(address);
      setAddressId(address.id);
      setAddingAddress(false);
      setNewAddress({
        label: "Home",
        recipientName: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        subdistrict: "",
        district: "",
        province: "",
        postalCode: "",
        country: "Thailand",
        deliveryNote: "",
        isDefault: false,
      });
      setAddressMessage("Address saved and selected.");
    } finally {
      setAddressSavePending(false);
    }
  }

  function handleClose() {
    if (addressSavePending) return;
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow="Confirm"
      title={`Ship ${cards.length} card${cards.length === 1 ? "" : "s"} to your address`}
      size="md"
      footer={
        <>
          <button
            type="button"
            className="cr-btn"
            onClick={handleClose}
            disabled={addressSavePending || submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            onClick={() => onConfirm(addressId)}
            disabled={addressSavePending || submitting || !isCompleteShippingAddress(selectedAddress)}
          >
            <Ico name="truck" size={14} />{" "}
            {submitting ? "Submitting…" : "Request shipping"}
          </button>
        </>
      }
    >
      <div className="cr-stack" style={{ gap: 14 }}>
        <p className="cr-lead" style={{ margin: 0 }}>
          Cards will leave your stash and arrive within 3–5 working days inside
          Thailand.
        </p>

        <div className="cr-stack" style={{ gap: 10 }}>
          <div className="cr-row" style={{ gap: 10, alignItems: "center" }}>
            <span className="cr-eyebrow">Ship to</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="cr-btn cr-btn-primary cr-btn-sm"
              onClick={() => setAddingAddress((current) => !current)}
              disabled={submitting || addressSavePending}
            >
              <Ico name="plus" size={12} /> Add a new address
            </button>
          </div>

          {addresses.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                border: "1px dashed var(--cr-line-strong)",
                borderRadius: "var(--cr-r-md)",
                background: "var(--cr-paper-2)",
              }}
            >
              <strong style={{ display: "block", marginBottom: 6 }}>
                No shipping address saved
              </strong>
              <small className="cr-mute">
                Add one here and it will be selected for this request.
              </small>
            </div>
          ) : (
            addresses.map((a) => {
              const missingFields = missingShippingAddressFields(a);
              const complete = missingFields.length === 0;
              return (
                <label
                  key={a.id}
                  className={`cr-addr-card ${addressId === a.id ? "default" : ""}`}
                  style={{
                    cursor: complete ? "pointer" : "not-allowed",
                    opacity: complete ? 1 : 0.62,
                  }}
                >
                  <input
                    type="radio"
                    name="ship-addr"
                    checked={addressId === a.id}
                    disabled={!complete || submitting || addressSavePending}
                    onChange={() => setAddressId(a.id)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{a.label}</h4>
                    {a.recipientName && (
                      <div className="lines">
                        <strong style={{ color: "var(--cr-ink)" }}>
                          {a.recipientName}
                        </strong>
                        {a.phone ? ` · ${a.phone}` : ""}
                      </div>
                    )}
                    <div className="lines">{a.addressLine1}</div>
                    {a.addressLine2 && <div className="lines">{a.addressLine2}</div>}
                    <div className="lines">
                      {[a.subdistrict, a.district, a.province, a.postalCode]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    {!complete && (
                      <small className="cr-mute">
                        Missing {missingFields.join(", ")}
                      </small>
                    )}
                    {a.deliveryNote && <small className="cr-mute">{a.deliveryNote}</small>}
                  </div>
                  {a.isDefault && <span className="cr-pill cr-pill-ink">Default</span>}
                </label>
              );
            })
          )}

          {addingAddress && (
            <div className="cr-section" style={{ padding: 14 }}>
              <div className="cr-grid-2">
                <label className="cr-field">
                  <span>Label</span>
                  <input value={newAddress.label} onChange={(e) => updateAddressField("label", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span>Recipient name</span>
                  <input value={newAddress.recipientName} onChange={(e) => updateAddressField("recipientName", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span>Phone</span>
                  <input value={newAddress.phone} onChange={(e) => updateAddressField("phone", e.target.value)} />
                </label>
                <label className="cr-field cr-field-full">
                  <span>Address line 1</span>
                  <input value={newAddress.addressLine1} onChange={(e) => updateAddressField("addressLine1", e.target.value)} />
                </label>
                <label className="cr-field cr-field-full">
                  <span>Address line 2</span>
                  <input value={newAddress.addressLine2} onChange={(e) => updateAddressField("addressLine2", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span>Subdistrict</span>
                  <input value={newAddress.subdistrict} onChange={(e) => updateAddressField("subdistrict", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span>District</span>
                  <input value={newAddress.district} onChange={(e) => updateAddressField("district", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span>Province</span>
                  <input value={newAddress.province} onChange={(e) => updateAddressField("province", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span>Postal code</span>
                  <input value={newAddress.postalCode} onChange={(e) => updateAddressField("postalCode", e.target.value)} />
                </label>
                <label className="cr-field">
                  <span>Country</span>
                  <input value={newAddress.country} onChange={(e) => updateAddressField("country", e.target.value)} />
                </label>
              </div>
              <label className="cr-row" style={{ gap: 8, marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={newAddress.isDefault}
                  disabled={addresses.length === 0 || addressSavePending}
                  onChange={(e) => updateAddressField("isDefault", e.target.checked)}
                />
                <span className="cr-mute">Make this my default shipping address</span>
              </label>
              <div className="cr-row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  className="cr-btn cr-btn-primary cr-btn-sm"
                  disabled={addressSavePending || submitting}
                  onClick={() => {
                    void saveAddress().catch((error) => {
                      setAddressMessage(error instanceof Error ? error.message : "Could not save address.");
                    });
                  }}
                >
                  {addressSavePending ? "Saving…" : "Save and use this address"}
                </button>
              </div>
            </div>
          )}

          {addressMessage && <small className="cr-mute">{addressMessage}</small>}
        </div>
      </div>
    </Modal>
  );
}
