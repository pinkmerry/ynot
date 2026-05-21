"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { CardCatalogItem, ProfileInfo } from "@/lib/lucky-draw/types";
import type {
  YnotAddress,
  YnotApprovalStatus,
  YnotCampaign,
  YnotCategory,
  YnotCollectionItem,
  YnotExchangeOrder,
  YnotGachaOpenResult,
  YnotOwnerApprovalRequest,
  YnotPaymentMethod,
  YnotPrizePoolItem,
  YnotPrizePreview,
  YnotRandomLogicMode,
  YnotShippingRequest,
  YnotTierAnimation,
} from "./types";
import { GachaRevealOverlay } from "./GachaRevealOverlay";
import {
  defaultOpenQuantityOptions,
  normalizeOpenQuantityOptions,
} from "./open-quantity";
import {
  prizeCategoryLabel,
  prizeCategoryOptions,
  prizeCategoryValue,
  isRandomPsa10PrizeCard,
  prizeSourceType,
  type PrizeCategory,
} from "./prize-category";
import {
  canPrizeDisplayTierUseRandomPsa10,
  dbTierForPrizeDisplayTier,
  prizeDisplayTierConfig,
  prizeDisplayTierLabel,
  prizeDisplayTierOptions,
  prizeDisplayTierOrder,
  prizeDisplayTierValue,
  type PrizeDisplayTier,
} from "./prize-tier";

const coinPackages = [
  { label: "Starter", amountThb: 100, coins: 100 },
  { label: "Player", amountThb: 500, coins: 550 },
  { label: "Collector", amountThb: 1000, coins: 1150 },
  { label: "Whale", amountThb: 3000, coins: 3600 },
];

export class AdminRequestError extends Error {
  code?: string;
  detail?: string | null;
  blockers?: string[];
  status: number;

  constructor(
    message: string,
    options: {
      blockers?: string[];
      code?: string;
      detail?: string | null;
      status: number;
    },
  ) {
    super(message);
    this.name = "AdminRequestError";
    this.blockers = options.blockers;
    this.code = options.code;
    this.detail = options.detail;
    this.status = options.status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function requestErrorMessage(payload: unknown) {
  if (!isRecord(payload)) return "Request failed.";
  return (
    stringValue(payload.error) ||
    stringArrayValue(payload.blockers)?.[0] ||
    stringValue(payload.detail) ||
    stringValue(payload.code) ||
    "Request failed."
  );
}

async function requestJson(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminRequestError(requestErrorMessage(payload), {
      blockers: isRecord(payload) ? stringArrayValue(payload.blockers) : undefined,
      code: isRecord(payload) ? stringValue(payload.code) || undefined : undefined,
      detail: isRecord(payload) ? stringValue(payload.detail) || null : null,
      status: response.status,
    });
  }
  return payload;
}

async function postJson(url: string, body: unknown) {
  return requestJson(url, body, "POST");
}

async function patchJson(url: string, body: unknown) {
  return requestJson(url, body, "PATCH");
}

export function AdminRouteLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  const router = useRouter();

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    router.push(href);

    window.setTimeout(() => {
      // Production admin click probes saw route interception without navigation; keep a hard same-origin fallback.
      const target = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (
        target.pathname !== current.pathname ||
        target.search !== current.search ||
        target.hash !== current.hash
      ) {
        window.location.assign(target.href);
      }
    }, 350);
  }

  return (
    <a className={className} href={href} onClick={navigate}>
      {children}
    </a>
  );
}

const emptyProfileInfo: ProfileInfo = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  country: "Thailand",
  deliveryNote: "",
};

type ProfilePayload = {
  error?: string;
  displayName?: string;
  profile?: ProfileInfo;
};

const customerTagOptions = [
  "PSA10",
  "New Exclusive",
  "Manga",
  "High Value",
  "Shipping Ready",
  "Sealed",
  "Console",
  "Store Credit",
] as const;

function defaultCustomerTags(
  series: YnotCampaign["series"] = "pokemon",
): string[] {
  return series === "pokemon"
    ? ["PSA10", "New Exclusive"]
    : ["Manga", "New Exclusive"];
}

function normalizeCustomerTags(
  tags: string[] | undefined,
  series: YnotCampaign["series"] = "pokemon",
) {
  const source = tags?.length ? tags : defaultCustomerTags(series);
  const cleaned = source
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
  return cleaned.length ? cleaned : defaultCustomerTags(series);
}

function toggleCustomerTag(current: string[], tag: string) {
  if (current.includes(tag)) {
    const next = current.filter((candidate) => candidate !== tag);
    return next.length ? next : current;
  }
  return [...current, tag].slice(0, 4);
}

function approvalStatusLabel(status: YnotApprovalStatus) {
  const labels: Record<YnotApprovalStatus, string> = {
    not_submitted: "Not submitted",
    pending_review: "Pending owner review",
    approved: "Approved",
    rejected: "Rejected",
    changes_requested: "Changes requested",
  };
  return labels[status];
}

function inferredApprovalStatus(
  status: YnotCampaign["status"],
): YnotApprovalStatus {
  return status === "live" || status === "closed" || status === "archived"
    ? "approved"
    : "not_submitted";
}

function formatApprovalDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function countLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

const randomLogicChoices: Array<{
  value: YnotRandomLogicMode;
  label: string;
  description: string;
}> = [
  {
    value: "pure_random",
    label: "Pure random",
    description: "Every available prize unit has the same chance.",
  },
  {
    value: "weighted_templates",
    label: "Weighted high tier",
    description: "Owner can favor configured prize templates by weight.",
  },
  {
    value: "inventory_gated",
    label: "30% sold unlock",
    description: "High-tier pool starts locked, then opens after the sold checkpoint.",
  },
];

function ownerLogicSummary(
  logicMode: YnotRandomLogicMode,
  soldPct: number,
) {
  const roundedSoldPct = Math.round(soldPct);
  if (logicMode === "weighted_templates") {
    return [
      "Weight changes odds across the full prize pool immediately.",
      "Higher weight means more chance; weight 0 removes that prize from the random pool.",
      "Sold unlock fields are ignored in this mode.",
    ];
  }
  if (logicMode === "inventory_gated") {
    const unlockStatus =
      roundedSoldPct >= 30
        ? `This pack is ${roundedSoldPct}% sold; prizes with unlock checkpoints at or below ${roundedSoldPct}% can now enter the pool.`
        : `This pack is ${roundedSoldPct}% sold; prizes above this sold percentage stay hidden and cannot drop yet.`;
    return [
      unlockStatus,
      "The sold unlock gate runs before weighting, so locked high-tier prizes stay only in Postgres before the checkpoint.",
      "After unlock, those prizes join the weighted database pool and their configured weights still control odds.",
    ];
  }
  return [
    "Every available prize unit has the same chance.",
    "Stored weights are ignored in pure random mode.",
    "Sold unlock fields are ignored in pure random mode.",
  ];
}

function prizeAvailableUnitCount(prize: YnotPrizePreview) {
  return Math.max(
    0,
    Math.round(Number(prize.availableUnits ?? prize.totalUnits ?? 1) || 0),
  );
}

function effectivePrizeWeight(
  prize: YnotPrizePreview,
  logicMode: YnotRandomLogicMode,
) {
  if (logicMode === "pure_random") return 1;
  return Math.max(0, Number(prize.weight ?? 1) || 0);
}

function effectivePrizeUnlockAtSoldPct(
  prize: YnotPrizePreview,
  logicMode: YnotRandomLogicMode,
) {
  if (logicMode !== "inventory_gated") return 0;
  return Math.min(100, Math.max(0, Number(prize.unlockAtSoldPct ?? 0) || 0));
}

function usesPrizeWeight(logicMode: YnotRandomLogicMode) {
  return logicMode !== "pure_random";
}

function usesPrizeUnlock(logicMode: YnotRandomLogicMode) {
  return logicMode === "inventory_gated";
}

function ownerPrizeOddsLabel(
  prize: YnotPrizePreview,
  lineup: YnotPrizePreview[],
  soldPct: number,
  logicMode: YnotRandomLogicMode,
) {
  const unlockAtSoldPct = effectivePrizeUnlockAtSoldPct(prize, logicMode);
  const weight = effectivePrizeWeight(prize, logicMode);
  const availableUnits = prizeAvailableUnitCount(prize);
  if (availableUnits <= 0) return "Sold out";
  if (unlockAtSoldPct > soldPct) return `Locked until ${unlockAtSoldPct}%`;
  if (weight <= 0) return "Disabled";
  const prizeOddsWeight = availableUnits * weight;
  const eligibleWeight = lineup.reduce((sum, candidate) => {
    const candidateWeight = effectivePrizeWeight(candidate, logicMode);
    const candidateUnits = prizeAvailableUnitCount(candidate);
    if (candidateUnits <= 0 || candidateWeight <= 0) return sum;
    if (effectivePrizeUnlockAtSoldPct(candidate, logicMode) > soldPct) {
      return sum;
    }
    return sum + candidateUnits * candidateWeight;
  }, 0);
  if (eligibleWeight <= 0) return "No eligible pool";
  return `${((prizeOddsWeight / eligibleWeight) * 100).toFixed(1)}%`;
}

function prizePreviewDisplayTier(prize: YnotPrizePreview) {
  if (prize.displayTier) return prizeDisplayTierValue(prize.displayTier);
  if (prize.displayGroup) return prizeDisplayTierValue(prize.displayGroup);
  if (prize.tier === "high" && prize.rank <= 3) return "rainbow";
  if (prize.tier === "high") return "gold";
  return "bronze";
}

function prizePreviewTierRank(prize: YnotPrizePreview) {
  return Math.max(1, Math.round(Number(prize.tierRank ?? prize.rank) || 1));
}

function AdminField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="admin-field">
      <span>
        {label}
        {required && <span aria-label="required"> *</span>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function TopUpForm({
  paymentMethods,
}: {
  paymentMethods: YnotPaymentMethod[];
}) {
  const [packageIndex, setPackageIndex] = useState(1);
  const [paymentMethodId, setPaymentMethodId] = useState(
    paymentMethods[0]?.id ?? "",
  );
  const [slip, setSlip] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selected = coinPackages[packageIndex] ?? coinPackages[0];

  function submit() {
    startTransition(async () => {
      try {
        setMessage("");
        if (!slip) throw new Error("Upload your bank/QR transfer slip first.");
        const form = new FormData();
        form.set("paymentMethodId", paymentMethodId);
        form.set("amountThb", String(selected.amountThb));
        form.set("coinAmount", String(selected.coins));
        form.set("customerNote", note);
        form.set("slip", slip);
        const response = await fetch("/api/ynot/wallet", {
          method: "POST",
          body: form,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            isRecord(payload)
              ? stringValue(payload.error) || "Top-up request failed."
              : "Top-up request failed.",
          );
        const topUp = isRecord(payload) && isRecord(payload.topUp)
          ? payload.topUp
          : null;
        const publicCode = topUp ? stringValue(topUp.publicCode) : "";
        setMessage(
          `Top-up ${publicCode || "request"} created for admin review.`,
        );
        setSlip(null);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Top-up request failed.",
        );
      }
    });
  }

  return (
    <section className="soft-card topup-slip-card">
      <h3 className="text-lg font-black">Upload transfer slip</h3>
      <p className="txt-s mt-2">
        Manual bank transfer and QR slip upload stay first. Admin confirms
        before coins are credited.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {coinPackages.map((pkg, index) => (
          <button
            key={pkg.label}
            className={`${index === packageIndex ? "gold-button" : "plain-button"} rounded-2xl px-4 py-3 text-left text-sm font-black`}
            onClick={() => setPackageIndex(index)}
            type="button"
          >
            {pkg.label}
            <br />
            <span className="text-xs font-bold opacity-75">
              ฿{pkg.amountThb.toLocaleString()} = {pkg.coins.toLocaleString()}{" "}
              coins
            </span>
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-bold">
        Payment method
        <select
          className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4"
          value={paymentMethodId}
          onChange={(event) => setPaymentMethodId(event.target.value)}
        >
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-sm font-bold">
        Slip image
        <input
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
          accept="image/jpeg,image/png,image/webp"
          type="file"
          onChange={(event) => setSlip(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className="mt-4 block text-sm font-bold">
        Note
        <textarea
          className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button
        className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black"
        disabled={isPending || !paymentMethods.length}
        onClick={submit}
        type="button"
      >
        {isPending ? "Submitting..." : "Create top-up for admin review"}
      </button>
      {message && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">
          {message}
        </p>
      )}
    </section>
  );
}

export function GachaOpenPanel({
  campaign,
  authenticated,
  initialQuantity = 1,
  tierAnimations,
}: {
  campaign: YnotCampaign;
  authenticated: boolean;
  initialQuantity?: number;
  tierAnimations?: YnotTierAnimation[];
}) {
  const router = useRouter();
  const openQuantityOptions = normalizeOpenQuantityOptions(
    campaign.openQuantityOptions,
  );
  const initialOption = openQuantityOptions.includes(initialQuantity)
    ? initialQuantity
    : openQuantityOptions[0];
  const [quantity, setQuantity] = useState(initialOption);
  const [message, setMessage] = useState("");
  const [revealResult, setRevealResult] = useState<YnotGachaOpenResult | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const remainingOpenUnits = Math.min(
    campaign.remainingSlots ?? Number.POSITIVE_INFINITY,
    campaign.availablePrizeUnits ?? Number.POSITIVE_INFINITY,
  );
  const selectedCost = campaign.costCoins * quantity;

  function quantityDisabled(option: number) {
    return Number.isFinite(remainingOpenUnits) && option > remainingOpenUnits;
  }

  function fireOpen(targetQuantity: number) {
    startTransition(async () => {
      try {
        setMessage("");
        const payload = await postJson("/api/ynot/gacha/open", {
          campaignId: campaign.id,
          quantity: targetQuantity,
          idempotencyKey: crypto.randomUUID(),
        });
        const result = (payload?.result ?? null) as YnotGachaOpenResult | null;
        if (result && Array.isArray(result.items)) {
          setRevealResult(result);
        } else {
          setMessage("Open succeeded but no items were returned.");
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not open gacha.",
        );
      }
    });
  }

  function open() {
    fireOpen(quantity);
  }

  function handleRevealClose() {
    setRevealResult(null);
    router.push("/collection");
  }

  function handleOpenAgain() {
    setRevealResult(null);
    fireOpen(quantity);
  }
  if (campaign.demo) {
    return (
      <section className="soft-card open-sequence-card phone-surface">
        <p className="sequence-label">{"// CONFIRM SEQUENCE"}</p>
        <div className="open-pack-cube">
          <span>⚡ GOLD</span>
        </div>
        <h3>Pokemon · Gold Collection</h3>
        <p>10 CARDS · {(campaign.costCoins * 10).toLocaleString()} COIN</p>
        <a
          className="primary-action open-start"
          href={authenticated ? "/wallet" : "/login"}
        >
          &gt;&gt; START PULL
        </a>
        <a className="open-cancel" href={`/gacha/${campaign.slug}`}>
          [ CANCEL ]
        </a>
      </section>
    );
  }
  if (!campaign.openable) {
    return (
      <section className="soft-card open-sequence-card phone-surface">
        <p className="sequence-label">{"// PACK NOT OPENABLE"}</p>
        <div className="open-pack-cube">
          <span>HOLD</span>
        </div>
        <h3>{campaign.titleEn}</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This pack is waiting for prize inventory, owner approval, or remaining
          stock before customers can pull.
        </p>
        <a className="primary-action open-start mt-4" href="/wallet">
          Top up wallet
        </a>
        <a className="open-cancel" href={`/gacha/${campaign.slug}`}>
          [ CANCEL ]
        </a>
      </section>
    );
  }
  return (
    <section className="soft-card open-sequence-card phone-surface">
      <p className="sequence-label">{"// CONFIRM SEQUENCE"}</p>
      <div className="open-pack-cube">
        <span>⚡ GOLD</span>
      </div>
      <h3>{campaign.titleEn}</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Choose how many packs to open. Current cost:{" "}
        {selectedCost.toLocaleString()} coins.
      </p>
      <div className="open-quantity-grid" role="group" aria-label="Open quantity">
        {openQuantityOptions.map((option) => {
          const disabled = quantityDisabled(option);
          return (
            <button
              aria-pressed={quantity === option}
              className={quantity === option ? "active" : ""}
              disabled={disabled}
              key={option}
              onClick={() => setQuantity(option)}
              type="button"
            >
              <strong>Open {option}</strong>
              <span>{(campaign.costCoins * option).toLocaleString()} coins</span>
            </button>
          );
        })}
      </div>
      {!authenticated ? (
        <a className="primary-action open-start mt-4" href="/login">
          &gt;&gt; START PULL
        </a>
      ) : (
        <button
          className="primary-action open-start mt-4 w-full"
          disabled={isPending || quantityDisabled(quantity)}
          onClick={open}
          type="button"
        >
          {isPending ? "Opening..." : `>> START ${quantity} PULL${quantity === 1 ? "" : "S"}`}
        </button>
      )}
      <a className="open-cancel" href={`/gacha/${campaign.slug}`}>
        [ CANCEL ]
      </a>
      {message && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">
          {message}
        </p>
      )}
      {revealResult && (
        <GachaRevealOverlay
          key={revealResult.openId}
          result={revealResult}
          quantity={quantity}
          tierAnimations={tierAnimations}
          isPending={isPending}
          onClose={handleRevealClose}
          onOpenAgain={handleOpenAgain}
        />
      )}
    </section>
  );
}

export function AddressForm({ addresses }: { addresses: YnotAddress[] }) {
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      try {
        await postJson("/api/ynot/addresses", {
          recipientName,
          phone,
          addressLine1,
          district,
          province,
          postalCode,
          isDefault: !addresses.length,
        });
        setMessage("Address saved. Refresh to see it in your saved addresses.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Address could not be saved.",
        );
      }
    });
  }
  return (
    <section className="soft-card address-card">
      <h3 className="text-lg font-black">Saved shipping address</h3>
      <div className="saved-address-list mt-5 grid gap-3">
        {addresses.map((address) => (
          <div
            key={address.id}
            className="saved-address-card rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm"
          >
            <p className="font-black">
              {address.label} {address.isDefault ? "· default" : ""}
            </p>
            <p className="text-[var(--muted)]">
              {address.addressLine1}, {address.district}, {address.province}{" "}
              {address.postalCode}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          placeholder="Recipient name"
          value={recipientName}
          onChange={(event) => setRecipientName(event.target.value)}
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          placeholder="Phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <input
        className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4"
        placeholder="Address line 1"
        value={addressLine1}
        onChange={(event) => setAddressLine1(event.target.value)}
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          placeholder="District"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          placeholder="Province"
          value={province}
          onChange={(event) => setProvince(event.target.value)}
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          placeholder="Postal code"
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
        />
      </div>
      <button
        className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black"
        disabled={isPending}
        onClick={submit}
        type="button"
      >
        {isPending ? "Saving..." : "Save address"}
      </button>
      {message && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">
          {message}
        </p>
      )}
    </section>
  );
}

export function PersonalInfoForm({
  lineHref,
  googleConnectHref,
  emailConnectHref,
  loginMethod,
  accountType,
}: {
  lineHref: string;
  googleConnectHref?: string;
  emailConnectHref?: string;
  loginMethod: string;
  accountType: string;
}) {
  const [draft, setDraft] = useState<ProfileInfo>(emptyProfileInfo);
  const [displayName, setDisplayName] = useState("YNOTT Customer");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const response = await fetch("/api/lucky-draw/profile", {
          cache: "no-store",
        });
        const payload = (await response
          .json()
          .catch(() => null)) as ProfilePayload | null;
        if (!active) return;
        if (!response.ok) throw new Error(payload?.error ?? "Profile failed.");
        setDraft({ ...emptyProfileInfo, ...payload?.profile });
        setDisplayName(payload?.displayName ?? "YNOTT Customer");
        setLoaded(true);
      } catch (error) {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "Profile could not be loaded.",
        );
        setLoaded(true);
      }
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  function updateDraft(patch: Partial<ProfileInfo>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function save() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/lucky-draw/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        });
        const payload = (await response
          .json()
          .catch(() => null)) as ProfilePayload | null;
        if (!response.ok) throw new Error(payload?.error ?? "Profile failed.");
        setDraft({ ...emptyProfileInfo, ...payload?.profile });
        setDisplayName(payload?.displayName ?? displayName);
        setMessage("Personal info saved.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Personal info could not be saved.",
        );
      }
    });
  }

  return (
    <section className="profile-panel personal-info-form-panel">
      <div className="profile-section-head">
        <span>Personal details</span>
        <strong>Name, phone, and default delivery info</strong>
      </div>
      <div className="personal-info-summary">
        <div>
          <span>Display name</span>
          <strong>{displayName}</strong>
        </div>
        <div>
          <span>Login method</span>
          <strong>{loginMethod}</strong>
        </div>
        <div>
          <span>Account type</span>
          <strong>{accountType}</strong>
        </div>
      </div>
      <div className="personal-info-form-grid" aria-busy={!loaded || isPending}>
        <label className="personal-info-field">
          <span>Full name</span>
          <input
            autoComplete="name"
            disabled={!loaded}
            value={draft.fullName}
            onChange={(event) => updateDraft({ fullName: event.target.value })}
            placeholder="Your full name"
          />
        </label>
        <label className="personal-info-field">
          <span>Phone</span>
          <input
            autoComplete="tel"
            disabled={!loaded}
            inputMode="tel"
            value={draft.phone}
            onChange={(event) => updateDraft({ phone: event.target.value })}
            placeholder="Phone number"
          />
        </label>
        <label className="personal-info-field wide">
          <span>Address line 1</span>
          <input
            autoComplete="address-line1"
            disabled={!loaded}
            value={draft.addressLine1}
            onChange={(event) =>
              updateDraft({ addressLine1: event.target.value })
            }
            placeholder="House, building, street"
          />
        </label>
        <label className="personal-info-field wide">
          <span>Address line 2</span>
          <input
            autoComplete="address-line2"
            disabled={!loaded}
            value={draft.addressLine2}
            onChange={(event) =>
              updateDraft({ addressLine2: event.target.value })
            }
            placeholder="Floor, room, landmark"
          />
        </label>
        <label className="personal-info-field">
          <span>Subdistrict</span>
          <input
            autoComplete="address-level3"
            disabled={!loaded}
            value={draft.subdistrict}
            onChange={(event) =>
              updateDraft({ subdistrict: event.target.value })
            }
            placeholder="Subdistrict"
          />
        </label>
        <label className="personal-info-field">
          <span>District</span>
          <input
            autoComplete="address-level2"
            disabled={!loaded}
            value={draft.district}
            onChange={(event) => updateDraft({ district: event.target.value })}
            placeholder="District"
          />
        </label>
        <label className="personal-info-field">
          <span>Province</span>
          <input
            autoComplete="address-level1"
            disabled={!loaded}
            value={draft.province}
            onChange={(event) => updateDraft({ province: event.target.value })}
            placeholder="Province"
          />
        </label>
        <label className="personal-info-field">
          <span>Postal code</span>
          <input
            autoComplete="postal-code"
            disabled={!loaded}
            inputMode="numeric"
            value={draft.postalCode}
            onChange={(event) =>
              updateDraft({ postalCode: event.target.value })
            }
            placeholder="Postal code"
          />
        </label>
        <label className="personal-info-field">
          <span>Country</span>
          <input
            autoComplete="country-name"
            disabled={!loaded}
            value={draft.country}
            onChange={(event) => updateDraft({ country: event.target.value })}
            placeholder="Country"
          />
        </label>
        <label className="personal-info-field wide">
          <span>Delivery note</span>
          <textarea
            disabled={!loaded}
            value={draft.deliveryNote}
            onChange={(event) =>
              updateDraft({ deliveryNote: event.target.value })
            }
            placeholder="Anything the shipping team should know"
            rows={4}
          />
        </label>
      </div>
      <div className="personal-info-actions">
        {process.env.NEXT_PUBLIC_ENABLE_LINE_LOGIN === "true" && (
          <a href={lineHref}>Connect / reconnect LINE</a>
        )}
        {googleConnectHref && (
          <a href={googleConnectHref}>Connect Google / Gmail</a>
        )}
        {emailConnectHref && <a href={emailConnectHref}>Create email login</a>}
        <button disabled={!loaded || isPending} onClick={save} type="button">
          {isPending ? "Saving..." : "Save personal info"}
        </button>
      </div>
      {message && <p className="profile-form-message">{message}</p>}
    </section>
  );
}

export function CollectionActionPanel({
  collection,
  addresses = [],
}: {
  collection: YnotCollectionItem[];
  addresses?: YnotAddress[];
}) {
  const ownedItems = useMemo(
    () => collection.filter((item) => item.status === "owned"),
    [collection],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function submit(kind: "exchange" | "shipping") {
    startTransition(async () => {
      try {
        setMessage("");
        if (!selected.length)
          throw new Error("Select at least one owned card.");
        const payload =
          kind === "exchange"
            ? await postJson("/api/ynot/exchange", {
                collectionItemIds: selected,
                idempotencyKey: crypto.randomUUID(),
              })
            : await postJson("/api/ynot/shipping", {
                collectionItemIds: selected,
                addressId,
                idempotencyKey: crypto.randomUUID(),
              });
        setMessage(
          `${kind === "exchange" ? "Exchange" : "Shipping"} request ${payload.result?.publicCode ?? "created"}.`,
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Request failed.");
      }
    });
  }
  return (
    <section className="soft-card collection-action-bar">
      <h3 className="text-lg font-black">Collection actions</h3>
      <div className="mt-4 grid max-h-80 gap-2 overflow-auto">
        {ownedItems.length ? (
          ownedItems.map((item) => (
            <label
              key={item.id}
              className={`collection-select-row ${selected.includes(item.id) ? "selected" : ""}`}
            >
              <input
                checked={selected.includes(item.id)}
                type="checkbox"
                onChange={() => toggle(item.id)}
              />
              <span className="collection-mini-art" />
              <span>
                {item.cardName}
                <em>{item.serialNo}</em>
              </span>
              <strong>{selected.includes(item.id) ? "✓" : ""}</strong>
            </label>
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm font-bold text-[var(--muted)]">
            No owned cards yet. Open a live pack before requesting exchange or
            shipping.
          </div>
        )}
      </div>
      {addresses.length ? (
        <select
          className="mt-4 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4"
          value={addressId}
          onChange={(event) => setAddressId(event.target.value)}
        >
          {addresses.map((address) => (
            <option key={address.id} value={address.id}>
              {address.label} · {address.addressLine1}
            </option>
          ))}
        </select>
      ) : (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">
          Save a shipping address first. Raw address IDs are not required for
          normal customer use.
        </p>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="plain-button rounded-2xl px-4 py-3 text-sm font-black"
          disabled={isPending}
          type="button"
          onClick={() => submit("exchange")}
        >
          Redeem coin
        </button>
        <button
          className="gold-button rounded-2xl px-4 py-3 text-sm font-black"
          disabled={isPending || !addressId}
          type="button"
          onClick={() => submit("shipping")}
        >
          Request ship →
        </button>
      </div>
      {message && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">
          {message}
        </p>
      )}
    </section>
  );
}

export function AdminTopUpActions({ topUpId }: { topUpId: string }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        const response = await fetch("/api/ynot/admin/top-ups", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topUpId, action, note }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "Review failed.");
        setMessage(`${action} complete.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review failed.");
      }
    });
  }
  return (
    <div className="mt-2 grid gap-2">
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        placeholder="Admin note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="gold-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          onClick={() => submit("approve")}
          type="button"
        >
          Approve
        </button>
        <button
          className="danger-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          onClick={() => submit("reject")}
          type="button"
        >
          Reject
        </button>
      </div>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}

export function AdminPaymentMethodForm() {
  const [code, setCode] = useState("main-transfer");
  const [displayName, setDisplayName] = useState("Main bank / PromptPay");
  const [type, setType] = useState<"bank_transfer" | "promptpay_qr">(
    "promptpay_qr",
  );
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [promptpayId, setPromptpayId] = useState("");
  const [instructions, setInstructions] = useState(
    "Transfer manually and upload slip for admin review.",
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      try {
        await postJson("/api/ynot/admin/payment-methods", {
          code,
          displayName,
          type,
          bankName,
          accountName,
          accountNumber,
          promptpayId,
          instructions,
          isActive: true,
        });
        setMessage("Payment method saved.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Payment method could not be saved.",
        );
      }
    });
  }
  return (
    <section className="admin-panel admin-form-panel soft-card">
      <div className="admin-form-head">
        <span>Payment settings</span>
        <h3>Payment method settings</h3>
        <p>
          Manage the bank or PromptPay details customers see before uploading a
          transfer slip.
        </p>
      </div>
      <div className="admin-form-grid">
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Code"
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Display name"
        />
        <select
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "bank_transfer" | "promptpay_qr")
          }
        >
          <option value="promptpay_qr">PromptPay QR</option>
          <option value="bank_transfer">Bank transfer</option>
        </select>
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={promptpayId}
          onChange={(event) => setPromptpayId(event.target.value)}
          placeholder="PromptPay ID"
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          placeholder="Bank name"
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder="Account name"
        />
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value)}
          placeholder="Account number"
        />
      </div>
      <textarea
        className="mt-3 min-h-24 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <button
        className="gold-button admin-form-save"
        disabled={isPending}
        onClick={submit}
        type="button"
      >
        {isPending ? "Saving..." : "Save payment method"}
      </button>
      {message && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">
          {message}
        </p>
      )}
    </section>
  );
}

export function AdminCategoryForm({
  categories,
}: {
  categories: YnotCategory[];
}) {
  const [visibleCategories, setVisibleCategories] = useState(categories);
  const [categoryId, setCategoryId] = useState("");
  const [slug, setSlug] = useState("new-category");
  const [nameTh, setNameTh] = useState("หมวดใหม่");
  const [nameEn, setNameEn] = useState("New Category");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("✨");
  const [legacySeries, setLegacySeries] = useState<
    "pokemon" | "one_piece" | ""
  >("");
  const [sortOrder, setSortOrder] = useState(100);
  const [isActive, setIsActive] = useState(true);
  const [isTest, setIsTest] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLElement | null>(null);

  const loadCategory = useCallback(
    (nextId: string) => {
      setCategoryId(nextId);
      const category = visibleCategories.find((item) => item.id === nextId);
      if (!category) return;
      setSlug(category.slug);
      setNameTh(category.nameTh);
      setNameEn(category.nameEn);
      setDescription(category.description ?? "");
      setIcon(category.icon ?? "");
      setLegacySeries(category.legacySeries ?? "");
      setSortOrder(category.sortOrder);
      setIsActive(category.isActive);
      setIsTest(category.isTest);
    },
    [visibleCategories],
  );

  // Listen for row-level Edit clicks dispatched from AdminCategoryRowActions.
  // Pre-fills the form and scrolls it into view so the admin can keep editing.
  useEffect(() => {
    function handle(event: Event) {
      const id = (event as CustomEvent<{ categoryId: string }>).detail?.categoryId;
      if (!id) return;
      loadCategory(id);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener("admin-category-edit", handle);
    return () => window.removeEventListener("admin-category-edit", handle);
  }, [loadCategory]);

  function submit(method: "POST" | "PATCH") {
    startTransition(async () => {
      try {
        setMessage("");
        if (!nameTh.trim() && !nameEn.trim())
          throw new Error("Add a Thai or English category name first.");
        const payload = await requestJson(
          "/api/ynot/admin/categories",
          {
            categoryId: method === "PATCH" ? categoryId : undefined,
            slug,
            nameTh,
            nameEn,
            description,
            icon,
            legacySeries: legacySeries || null,
            sortOrder,
            isActive,
            isTest,
          },
          method,
        );
        const savedCategory = payload.category as YnotCategory | undefined;
        if (savedCategory) {
          setCategoryId(savedCategory.id);
          setVisibleCategories((current) => {
            const withoutSaved = current.filter(
              (item) =>
                item.id !== savedCategory.id &&
                item.slug !== savedCategory.slug,
            );
            return [...withoutSaved, savedCategory].sort(
              (a, b) =>
                a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn),
            );
          });
        }
        setMessage(
          `Saved category “${savedCategory?.nameEn ?? nameEn}”. It is ready for random packs now.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Category could not be saved.",
        );
      }
    });
  }

  return (
    <section
      ref={formRef}
      id="admin-category-form"
      className="admin-panel admin-form-panel soft-card"
    >
      <div className="admin-form-head">
        <span>Category setup</span>
        <h3>Create or edit category</h3>
        <p>
          Categories now save to Supabase and can be reused by future random
          packs without a code change.
        </p>
      </div>
      <div className="admin-form-grid">
        <AdminField
          label="Existing category"
          hint="Choose a category to edit, or keep this as create new."
        >
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={categoryId}
            onChange={(event) => loadCategory(event.target.value)}
          >
            <option value="">Create new category</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nameEn}
                {category.isTest ? " [TEST]" : ""}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField
          label="URL slug"
          required
          hint="Lowercase URL key, for example pokemon or dragon-ball."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="category-slug"
          />
        </AdminField>
        <AdminField label="Thai category name" required>
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={nameTh}
            onChange={(event) => setNameTh(event.target.value)}
            placeholder="เช่น Pokemon"
          />
        </AdminField>
        <AdminField label="English category name" required>
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            placeholder="Example: Pokemon"
          />
        </AdminField>
        {/* Icon field hidden from the form — it only showed on admin
           category cards (decoration), never on the customer storefront.
           State + PATCH payload preserve the existing icon if the row is
           loaded for edit, so Pokemon ⚡ / One Piece ☠️ keep theirs. To
           change an icon on an existing category, use Supabase SQL. */}
        {/* Legacy compatibility (legacy_series column) is intentionally
           hidden from the form. It was a one-off bridge for the bootstrap
           Pokemon / One Piece categories whose pack data still keys off
           draw_rounds.series; new categories never need it. The state +
           PATCH payload still send `legacySeries: legacySeries || null`
           below so existing Pokemon/One Piece edits preserve their flag
           if loaded from the dropdown. To re-set it on an existing
           category, use the Supabase SQL editor. */}
        {/* Sort order hidden from the form — `/packs` chips are hardcoded
           in components.tsx today so sort_order has no effect on the
           customer storefront. It still feeds admin manager card order,
           but defaulting all rows to 100 produces a stable enough order.
           State + PATCH payload round-trip the value so existing rows
           keep theirs. To re-order, use Supabase SQL. */}
        <AdminField label="Status">
          <div className="flex min-h-12 flex-wrap items-center gap-2">
            <button
              className={
                isActive
                  ? "gold-button rounded-2xl px-4 py-3 text-sm font-black"
                  : "plain-button rounded-2xl px-4 py-3 text-sm font-black"
              }
              onClick={() => setIsActive((value) => !value)}
              type="button"
            >
              {isActive ? "Active" : "Hidden"}
            </button>
            <button
              className={
                isTest
                  ? "gold-button rounded-2xl px-4 py-3 text-sm font-black"
                  : "plain-button rounded-2xl px-4 py-3 text-sm font-black"
              }
              onClick={() => setIsTest((value) => !value)}
              type="button"
            >
              {isTest ? "Test-only" : "Normal"}
            </button>
          </div>
        </AdminField>
        <AdminField
          label="Description"
          hint="Optional customer/admin explanation."
        >
          <textarea
            className="min-h-24 rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this category contains"
          />
        </AdminField>
      </div>
      <div className="admin-form-actions">
        <button
          className="gold-button rounded-2xl px-4 py-3 text-sm font-black"
          disabled={isPending || !nameEn.trim()}
          onClick={() => submit("POST")}
          type="button"
        >
          {isPending ? "Saving..." : "Save as new/upsert"}
        </button>
        <button
          className="plain-button rounded-2xl px-4 py-3 text-sm font-black"
          disabled={isPending || !categoryId}
          onClick={() => submit("PATCH")}
          type="button"
        >
          Update selected
        </button>
      </div>
      {message && <p className="admin-form-message">{message}</p>}
    </section>
  );
}

/** Row-level Edit + Delete buttons on /admin/categories. Edit broadcasts a
 *  custom event that AdminCategoryForm above listens for and scrolls into.
 *  Delete is hard-gated on `packCount`: categories that are still linked
 *  to packs cannot be deleted (matches the server-side eligibility check). */
export function AdminCategoryRowActions({
  categoryId,
  categorySlug,
  categoryName,
  packCount,
  isLegacySeries,
}: {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  packCount: number;
  /** Legacy "pokemon" / "one_piece" rows derive from draw_rounds.series and
   *  aren't real store_categories rows — Edit/Delete don't apply. */
  isLegacySeries?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [typed, setTyped] = useState("");

  if (isLegacySeries) {
    return (
      <span className="admin-category-row-legacy" title="Built-in series, managed via draw_rounds">
        Built-in
      </span>
    );
  }

  const canDelete = packCount === 0;
  const expectedPhrase = categorySlug;
  const matches = typed.trim() === expectedPhrase;

  function emitEdit() {
    window.dispatchEvent(
      new CustomEvent("admin-category-edit", { detail: { categoryId } }),
    );
  }

  async function runDelete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Delete failed");
      }
      setShowModal(false);
      setTyped("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-category-row-actions">
      <button
        type="button"
        className="secondary-action compact"
        onClick={emitEdit}
      >
        Edit
      </button>
      <button
        type="button"
        className="secondary-action compact admin-category-delete-btn"
        onClick={() => {
          setError(null);
          setShowModal(true);
        }}
        disabled={!canDelete || pending}
        title={
          canDelete
            ? `Delete "${categoryName}" permanently`
            : `Cannot delete — ${packCount} pack${packCount === 1 ? "" : "s"} still use this category`
        }
      >
        Delete
      </button>
      {error && (
        <p className="admin-category-row-error" role="alert">
          {error}
        </p>
      )}
      {showModal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-category-title-${categoryId}`}
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setShowModal(false);
            }
          }}
        >
          <div className="admin-modal admin-modal-danger" role="document">
            <header className="admin-modal-head">
              <h2
                id={`delete-category-title-${categoryId}`}
                className="admin-modal-title"
              >
                Delete category &quot;{categoryName}&quot; permanently?
              </h2>
              <p className="admin-modal-subtitle">
                This removes the category row from the catalog. Packs are
                unaffected because no packs are currently linked. The action
                is logged to the audit trail.
              </p>
            </header>
            <label className="admin-modal-confirm-row">
              <span>
                Type <code>{expectedPhrase}</code> to confirm
              </span>
              <input
                type="text"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                disabled={pending}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="admin-modal-confirm-input"
                placeholder={expectedPhrase}
              />
            </label>
            {error && (
              <p className="admin-category-row-error" role="alert">
                {error}
              </p>
            )}
            <footer className="admin-modal-foot">
              <button
                type="button"
                className="admin-modal-secondary"
                onClick={() => {
                  setShowModal(false);
                  setTyped("");
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-modal-primary admin-modal-primary-danger"
                onClick={runDelete}
                disabled={!matches || pending}
              >
                {pending ? "Deleting…" : "Delete category"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

type CampaignPrizeDraft = {
  localId: string;
  displayTier: PrizeDisplayTier;
  cardId: string;
  tier: "normal" | "high";
  prizeCategory: PrizeCategory;
  rank: number;
  tierRank: number;
  valueThb: number;
  quantity: number;
  weight: number;
  unlockAtSoldPct: number;
};

const minTierPrizeRows = 1;
const maxTierPrizeRows = 30;
const tierCountChoices = [1, 2, 3, 5, 10, 15, 20] as const;

function isRandomPsa10Card(card: CardCatalogItem) {
  return isRandomPsa10PrizeCard(card);
}

function cardPrizeCategory(card: CardCatalogItem) {
  return prizeCategoryValue(card.prizeCategory);
}

function prizeCatalogCardsFor(
  cards: CardCatalogItem[],
  category: PrizeCategory,
  displayTier: PrizeDisplayTier,
) {
  const categorizedCards = cards.filter(
    (card) => cardPrizeCategory(card) === category,
  );
  if (category !== "psa10_card") return categorizedCards;
  if (canPrizeDisplayTierUseRandomPsa10(displayTier)) {
    return categorizedCards.filter(isRandomPsa10Card);
  }
  return categorizedCards.filter((card) => !isRandomPsa10Card(card));
}

function firstCatalogCardId(cards: CardCatalogItem[]) {
  return cards[0]?.catalogCardId ?? "";
}

function adminPrizeCardIdentity(card: CardCatalogItem) {
  return [
    card.code ?? "no code",
    card.grade,
    prizeCategoryLabel(card.prizeCategory),
  ]
    .filter(Boolean)
    .join(" · ");
}

function adminPrizeCardSearchText(card: CardCatalogItem) {
  return [
    card.code,
    card.name,
    card.grade,
    card.series,
    prizeCategoryLabel(card.prizeCategory),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function AdminPrizeCardImage({
  imageUrl,
  name,
  code,
}: {
  imageUrl?: string | null;
  name: string;
  code?: string | null;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const fallback = (code?.trim() || name.trim() || "Prize").slice(0, 12);

  if (!imageUrl || hasImageError) {
    return (
      <span className="admin-prize-card-thumb admin-prize-card-placeholder">
        <strong>{fallback}</strong>
        <small>No image</small>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Catalog URLs can be arbitrary Supabase/storage paths, so this thumbnail intentionally avoids Next remote image config.
    <img
      alt={`${code ? `${code} ` : ""}${name}`}
      className="admin-prize-card-thumb"
      loading="lazy"
      onError={() => setHasImageError(true)}
      src={imageUrl}
    />
  );
}

function AdminPrizeCardPicker({
  cards,
  value,
  onChange,
  disabled,
  showPreview = true,
  showSearch = true,
  emptyLabel = "Select prize item",
  missingLabel = "No catalog items match this tier and category.",
  testIdPrefix,
}: {
  cards: CardCatalogItem[];
  value: string;
  onChange: (cardId: string) => void;
  disabled?: boolean;
  showPreview?: boolean;
  showSearch?: boolean;
  emptyLabel?: string;
  missingLabel?: string;
  testIdPrefix: string;
}) {
  const [query, setQuery] = useState("");
  const selectedCard =
    cards.find((card) => card.catalogCardId === value) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCards = useMemo(() => {
    if (!normalizedQuery) return cards;
    return cards.filter((card) =>
      adminPrizeCardSearchText(card).includes(normalizedQuery),
    );
  }, [cards, normalizedQuery]);
  const selectCards =
    selectedCard &&
    !visibleCards.some((card) => card.catalogCardId === selectedCard.catalogCardId)
      ? [selectedCard, ...visibleCards]
      : visibleCards;
  const selectedValue = selectedCard?.catalogCardId ?? "";

  return (
    <div
      className="admin-prize-card-picker"
      data-selected-card-code={selectedCard?.code ?? ""}
      data-selected-card-id={selectedCard?.catalogCardId ?? ""}
      data-testid={`${testIdPrefix}-picker`}
    >
      {showPreview && (
        <div
          className={`admin-prize-card-preview${selectedCard ? "" : " is-empty"}`}
          data-testid={`${testIdPrefix}-selected-card-preview`}
        >
          {selectedCard ? (
            <>
              <AdminPrizeCardImage
                code={selectedCard.code}
                imageUrl={selectedCard.photoUrl}
                name={selectedCard.name}
              />
              <span>
                <strong>{selectedCard.name}</strong>
                <small>{adminPrizeCardIdentity(selectedCard)}</small>
                <code>{selectedCard.catalogCardId}</code>
              </span>
            </>
          ) : (
            <>
              <span className="admin-prize-card-thumb admin-prize-card-placeholder">
                <strong>Pick</strong>
                <small>No image</small>
              </span>
              <span>
                <strong>{cards.length ? emptyLabel : "No item available"}</strong>
                <small>{cards.length ? "Choose a visible card before saving." : missingLabel}</small>
              </span>
            </>
          )}
        </div>
      )}
      <div className={`admin-prize-card-controls${showSearch ? "" : " is-single"}`}>
        {showSearch && (
          <input
            aria-label="Search prize item by code or name"
            disabled={disabled || !cards.length}
            placeholder="Search code or name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        <select
          aria-label="Prize item"
          data-testid={`${testIdPrefix}-select`}
          disabled={disabled || !cards.length || !selectCards.length}
          value={selectedValue}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{cards.length ? emptyLabel : missingLabel}</option>
          {selectCards.map((card) => (
            <option key={card.catalogCardId} value={card.catalogCardId}>
              {[card.code ?? "no code", card.name, card.grade, prizeCategoryLabel(card.prizeCategory)].join(" · ")}
            </option>
          ))}
        </select>
      </div>
      {cards.length > 0 && !selectCards.length && (
        <small>No catalog item matches that search.</small>
      )}
    </div>
  );
}

function initialAdminPrizeCardId(cards: CardCatalogItem[]) {
  return firstCatalogCardId(
    prizeCatalogCardsFor(cards, "psa10_card", "bronze"),
  );
}

function clampTierPrizeRows(value: number) {
  const parsed = Math.round(Number(value) || minTierPrizeRows);
  return Math.min(maxTierPrizeRows, Math.max(minTierPrizeRows, parsed));
}

function prizeUnitCount(prize: CampaignPrizeDraft) {
  return Math.max(0, Math.round(Number(prize.quantity) || 0));
}

function defaultPrizeValueThb(displayTier: PrizeDisplayTier, index: number) {
  if (displayTier === "rainbow") return index === 0 ? 5000 : 3000;
  if (displayTier === "gold") return 1500;
  if (displayTier === "silver") return 750;
  return 100;
}

function createPrizeDraft(
  displayTier: PrizeDisplayTier,
  index: number,
  cards: CardCatalogItem[],
  existing?: CampaignPrizeDraft,
) {
  const config = prizeDisplayTierConfig(displayTier);
  const prizeCategory = existing?.prizeCategory ?? "psa10_card";
  const cardOptions = prizeCatalogCardsFor(cards, prizeCategory, displayTier);
  const existingCardId =
    existing?.cardId &&
    cardOptions.some((card) => card.catalogCardId === existing.cardId)
      ? existing.cardId
      : "";
  const defaultCardId = existing ? "" : firstCatalogCardId(cardOptions);
  return {
    localId: existing?.localId ?? `${displayTier}-${index + 1}`,
    displayTier,
    cardId: existingCardId || defaultCardId,
    tier: config.dbTier,
    prizeCategory,
    rank: existing?.rank ?? index + 1,
    tierRank: index + 1,
    valueThb: existing?.valueThb ?? defaultPrizeValueThb(displayTier, index),
    quantity: Math.max(
      0,
      Math.round(Number(existing?.quantity) || config.defaultQuantity),
    ),
    weight: existing?.weight ?? config.defaultWeight,
    unlockAtSoldPct:
      existing?.unlockAtSoldPct ?? config.defaultUnlockAtSoldPct,
  } satisfies CampaignPrizeDraft;
}

function sortPrizeDrafts(rows: CampaignPrizeDraft[]) {
  return [...rows].sort((left, right) => {
    const tierOrder =
      prizeDisplayTierOrder(left.displayTier) -
      prizeDisplayTierOrder(right.displayTier);
    if (tierOrder !== 0) return tierOrder;
    return left.tierRank - right.tierRank || left.rank - right.rank;
  });
}

function assignPrizeDraftRanks(rows: CampaignPrizeDraft[]) {
  let highRank = 1;
  let normalRank = 1;
  const tierRankByDisplayTier: Record<PrizeDisplayTier, number> = {
    rainbow: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
  };
  return sortPrizeDrafts(rows).map((prize) => {
    const displayTier = prizeDisplayTierValue(prize.displayTier);
    const tier = dbTierForPrizeDisplayTier(displayTier);
    tierRankByDisplayTier[displayTier] += 1;
    const rank = tier === "high" ? highRank++ : normalRank++;
    return {
      ...prize,
      displayTier,
      tier,
      rank,
      tierRank: tierRankByDisplayTier[displayTier],
    };
  });
}

function withLowestTierRemainder(
  rows: CampaignPrizeDraft[],
  totalSlots: number,
  cards: CardCatalogItem[],
) {
  const normalizedTotalSlots = Math.max(1, Math.round(Number(totalSlots) || 1));
  const rankedRows = assignPrizeDraftRanks(rows);
  if (!rankedRows.length) return rankedRows;
  const lowestTierOrder = Math.max(
    ...rankedRows.map((prize) => prizeDisplayTierOrder(prize.displayTier)),
  );
  const lowestTier = prizeDisplayTierOptions[lowestTierOrder]?.value ?? "bronze";
  const lowestRows = rankedRows.filter(
    (prize) => prize.displayTier === lowestTier,
  );
  const firstLowestRow = lowestRows[0];
  if (!firstLowestRow) return rankedRows;
  const fixedUnits = rankedRows
    .filter((prize) => prize.localId !== firstLowestRow.localId)
    .reduce((sum, prize) => sum + prizeUnitCount(prize), 0);
  const adjustedRows = rankedRows.map((prize) => {
    if (prize.localId !== firstLowestRow.localId) return prize;
    const cardOptions = prizeCatalogCardsFor(
      cards,
      prize.prizeCategory,
      prize.displayTier,
    );
    return {
      ...prize,
      cardId:
        prize.cardId &&
        cardOptions.some((card) => card.catalogCardId === prize.cardId)
          ? prize.cardId
          : "",
      quantity: Math.max(0, normalizedTotalSlots - fixedUnits),
    };
  });
  return assignPrizeDraftRanks(adjustedRows);
}

function createInitialPrizeDrafts(
  cards: CardCatalogItem[],
  totalSlots = 100,
): CampaignPrizeDraft[] {
  const rows = prizeDisplayTierOptions.flatMap((option) =>
    Array.from({ length: option.defaultCount }, (_, index) =>
      createPrizeDraft(option.value, index, cards),
    ),
  );
  return withLowestTierRemainder(rows, totalSlots, cards);
}

/** Convert an existing campaign's prize lineup into the editor's draft format
 *  so the AdminCampaignForm can load and reshape an existing draft pack. */
function prizeLineupToDrafts(
  prizes: YnotPrizePreview[],
  cards: CardCatalogItem[],
  totalSlots: number,
): CampaignPrizeDraft[] {
  if (!prizes.length) {
    return createInitialPrizeDrafts(cards, totalSlots);
  }
  const drafts = prizes.map((prize, index): CampaignPrizeDraft => {
    const displayTier = prizeDisplayTierValueFromPreview(prize);
    const prizeCategory = prizeCategoryValue(prize.prizeCategory);
    return {
      localId: `existing-${prize.id || index}`,
      displayTier,
      cardId: prize.cardId ?? "",
      tier: (prize.tier === "high" ? "high" : "normal") as "normal" | "high",
      prizeCategory,
      rank: Math.max(1, Math.round(prize.rank || index + 1)),
      tierRank: Math.max(1, Math.round(prize.tierRank || 1)),
      valueThb: Math.max(0, Math.round(prize.valueThb ?? 0)),
      quantity: Math.max(0, Math.round(prize.plannedQuantity ?? 0)),
      weight: Math.max(0, prize.weight ?? 1),
      unlockAtSoldPct: Math.max(0, Math.min(100, prize.unlockAtSoldPct ?? 0)),
    };
  });
  return withLowestTierRemainder(drafts, totalSlots, cards);
}

function prizeDisplayTierValueFromPreview(prize: YnotPrizePreview): PrizeDisplayTier {
  if (prize.displayTier) return prizeDisplayTierValue(prize.displayTier);
  if (prize.displayGroup) return prizeDisplayTierValue(prize.displayGroup);
  return prizeDisplayTierValue("bronze");
}

function prizeDraftTierLabel(displayTier: PrizeDisplayTier) {
  return `${prizeDisplayTierLabel(displayTier)} tier`;
}

export function AdminCampaignForm({
  categories = [],
  cards = [],
  editingCampaign,
  editingPrizes,
  editingCategoryId,
}: {
  categories?: YnotCategory[];
  cards?: CardCatalogItem[];
  editingCampaign?: YnotCampaign;
  editingPrizes?: YnotPrizePreview[];
  editingCategoryId?: string;
}) {
  const router = useRouter();
  const editMode = Boolean(editingCampaign);
  const defaultSeries: "pokemon" | "one_piece" =
    editingCampaign?.series ?? categories[0]?.legacySeries ?? "pokemon";
  const defaultTotalSlots = editingCampaign?.totalSlots ?? 100;
  const [slug, setSlug] = useState(editingCampaign?.slug ?? "new-campaign");
  const [titleTh, setTitleTh] = useState(editingCampaign?.titleTh ?? "แคมเปญใหม่");
  const [titleEn, setTitleEn] = useState(editingCampaign?.titleEn ?? "New campaign");
  const [series, setSeries] = useState<"pokemon" | "one_piece">(defaultSeries);
  const [categoryId, setCategoryId] = useState(
    editingCategoryId ?? editingCampaign?.categoryIds?.[0] ?? categories[0]?.id ?? "",
  );
  const [isTest, setIsTest] = useState(Boolean(editingCampaign?.isTest));
  const [mode, setMode] = useState<"instant_gacha" | "slot_pick">(
    editingCampaign?.mode ?? "instant_gacha",
  );
  const [priceThb, setPriceThb] = useState(editingCampaign?.priceThb ?? 100);
  const [costCoins, setCostCoins] = useState(editingCampaign?.costCoins ?? 1);
  const [totalSlots, setTotalSlots] = useState(defaultTotalSlots);
  const [displayTags, setDisplayTags] = useState<string[]>(
    normalizeCustomerTags(editingCampaign?.displayTags, defaultSeries),
  );
  const [openQuantityOptions, setOpenQuantityOptions] = useState<number[]>(
    normalizeOpenQuantityOptions(editingCampaign?.openQuantityOptions),
  );
  const [draftPrizes, setDraftPrizes] = useState<CampaignPrizeDraft[]>(() =>
    editingPrizes && editingPrizes.length
      ? prizeLineupToDrafts(editingPrizes, cards, defaultTotalSlots)
      : createInitialPrizeDrafts(cards, defaultTotalSlots),
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const sortedDraftPrizes = useMemo(
    () => assignPrizeDraftRanks(draftPrizes),
    [draftPrizes],
  );
  const activePrizeDrafts = useMemo(
    () =>
      sortedDraftPrizes.filter(
        (prize) => prize.cardId && Number(prize.quantity) > 0,
      ),
    [sortedDraftPrizes],
  );
  const configuredPrizeUnits = activePrizeDrafts.reduce(
    (sum, prize) => sum + Math.max(0, Math.round(Number(prize.quantity) || 0)),
    0,
  );
  const initialUnlockedUnits = activePrizeDrafts.reduce(
    (sum, prize) => sum + Math.max(0, Math.round(Number(prize.quantity) || 0)),
    0,
  );
  const draftPrizesByTier = prizeDisplayTierOptions.reduce(
    (groups, option) => ({
      ...groups,
      [option.value]: sortedDraftPrizes.filter(
        (prize) => prize.displayTier === option.value,
      ),
    }),
    {} as Record<PrizeDisplayTier, CampaignPrizeDraft[]>,
  );
  const activeDisplayTierOptions = prizeDisplayTierOptions.filter(
    (option) => draftPrizesByTier[option.value].length > 0,
  );
  const activeTierUnitCounts = prizeDisplayTierOptions.reduce(
    (counts, option) => ({
      ...counts,
      [option.value]: activePrizeDrafts
        .filter((prize) => prize.displayTier === option.value)
        .reduce((sum, prize) => sum + prizeUnitCount(prize), 0),
    }),
    {} as Record<PrizeDisplayTier, number>,
  );
  const tierRowSummary = activeDisplayTierOptions
    .map(
      (option) =>
        `${option.shortLabel} ${draftPrizesByTier[option.value].length}`,
    )
    .join(" / ");
  const unavailablePrizeCategoryRows = draftPrizes.filter(
    (prize) =>
      prizeUnitCount(prize) > 0 &&
      !prizeCatalogCardsFor(
        cards,
        prize.prizeCategory,
        prize.displayTier,
      ).length,
  );
  const invalidPrizeItemRows = draftPrizes.filter((prize) => {
    if (prizeUnitCount(prize) <= 0) return false;
    const itemOptions = prizeCatalogCardsFor(
      cards,
      prize.prizeCategory,
      prize.displayTier,
    );
    return (
      itemOptions.length > 0 &&
      Boolean(prize.cardId) &&
      !itemOptions.some((card) => card.catalogCardId === prize.cardId)
    );
  });
  const missingPrizeItemRows = draftPrizes.filter((prize) => {
    if (prizeUnitCount(prize) <= 0) return false;
    const itemOptions = prizeCatalogCardsFor(
      cards,
      prize.prizeCategory,
      prize.displayTier,
    );
    return itemOptions.length > 0 && !prize.cardId;
  });
  const missingPrizeCategories = [
    ...new Set(
      unavailablePrizeCategoryRows.map(
        (prize) =>
          `${prizeDraftTierLabel(prize.displayTier)}: ${prizeCategoryLabel(prize.prizeCategory)}`,
      ),
    ),
  ];
  const rankKeys = activePrizeDrafts.map(
    (prize) => `${prize.tier}:${prize.rank}`,
  );
  const hasDuplicateRank = rankKeys.some(
    (rankKey, index) => rankKeys.indexOf(rankKey) !== index,
  );
  const prizeBlockers = [
    !cards.length ? "Add at least one item in Prize Catalog first." : "",
    !activePrizeDrafts.length ? "Choose prize inventory before saving." : "",
    configuredPrizeUnits !== totalSlots
      ? "Prize quantity must equal the total pack quantity."
      : "",
    initialUnlockedUnits <= 0
      ? "At least one prize must be available in the launch pool."
      : "",
    missingPrizeCategories.length
      ? `Add catalog item(s) for ${missingPrizeCategories.join(", ")}.`
      : "",
    invalidPrizeItemRows.length
      ? "Choose a prize item that matches each selected prize category."
      : "",
    missingPrizeItemRows.length
      ? "Choose a prize item for every active prize row."
      : "",
    !activeDisplayTierOptions.length
      ? "Turn on at least one prize tier."
      : "",
    activeDisplayTierOptions.some(
      (option) => draftPrizesByTier[option.value].length < minTierPrizeRows,
    )
      ? "Each active tier needs at least one prize row."
      : "",
    hasDuplicateRank ? "Prize ranks must be unique inside each tier." : "",
  ].filter(Boolean);
  const prizeChecklist = [
    ...activeDisplayTierOptions.map((option) => {
      const rowCount = draftPrizesByTier[option.value].length;
      const unitCount = activeTierUnitCounts[option.value];
      return {
        label: option.label,
        primary: countLabel(rowCount, "row"),
        secondary: countLabel(unitCount, "unit"),
        ready: rowCount > 0,
      };
    }),
    {
      label: "Prize unit coverage",
      primary: `${configuredPrizeUnits.toLocaleString()}/${totalSlots.toLocaleString()}`,
      secondary: "units configured",
      ready: configuredPrizeUnits === totalSlots,
    },
    {
      label: "Launch pool",
      primary: countLabel(initialUnlockedUnits, "unit"),
      secondary: "unlocked at launch",
      ready: initialUnlockedUnits > 0,
    },
  ];
  const readinessLabel = prizeBlockers.length
    ? `${prizeBlockers.length} blocker${prizeBlockers.length === 1 ? "" : "s"}`
    : "Ready to save";

  function updatePrizeDraft(
    localId: string,
    patch: Partial<CampaignPrizeDraft>,
  ) {
    setDraftPrizes((current) =>
      withLowestTierRemainder(
        current.map((prize) =>
          prize.localId === localId ? { ...prize, ...patch } : prize,
        ),
        totalSlots,
        cards,
      ),
    );
  }

  function updatePrizeDraftCategory(
    prize: CampaignPrizeDraft,
    nextCategory: PrizeCategory,
  ) {
    updatePrizeDraft(prize.localId, {
      prizeCategory: nextCategory,
      cardId: "",
    });
  }

  function updateTotalSlots(nextTotalSlots: number) {
    const normalizedTotalSlots = Math.max(
      1,
      Math.round(Number(nextTotalSlots) || 1),
    );
    setTotalSlots(normalizedTotalSlots);
    setDraftPrizes((current) =>
      withLowestTierRemainder(current, normalizedTotalSlots, cards),
    );
  }

  function updateTierActive(displayTier: PrizeDisplayTier, active: boolean) {
    setDraftPrizes((current) => {
      const existingTierRows = current.filter(
        (prize) => prize.displayTier === displayTier,
      );
      if (active && existingTierRows.length) return current;
      if (active) {
        const config = prizeDisplayTierConfig(displayTier);
        return withLowestTierRemainder(
          [
            ...current,
            ...Array.from({ length: config.defaultCount }, (_, index) =>
              createPrizeDraft(displayTier, index, cards),
            ),
          ],
          totalSlots,
          cards,
        );
      }
      const activeTiers = new Set(current.map((prize) => prize.displayTier));
      if (activeTiers.size <= 1) return current;
      return withLowestTierRemainder(
        current.filter((prize) => prize.displayTier !== displayTier),
        totalSlots,
        cards,
      );
    });
  }

  function updateTierCount(displayTier: PrizeDisplayTier, nextCount: number) {
    const count = clampTierPrizeRows(nextCount);
    setDraftPrizes((current) =>
      withLowestTierRemainder(
        [
          ...current.filter((prize) => prize.displayTier !== displayTier),
          ...Array.from({ length: count }, (_, index) =>
            createPrizeDraft(
              displayTier,
              index,
              cards,
              current
                .filter((prize) => prize.displayTier === displayTier)
                .sort((left, right) => left.tierRank - right.tierRank)[index],
            ),
          ),
        ],
        totalSlots,
        cards,
      ),
    );
  }

  function fillLowestTierRemainder() {
    setDraftPrizes((current) =>
      withLowestTierRemainder(current, totalSlots, cards),
    );
  }

  function updateTierRows(
    displayTier: PrizeDisplayTier,
    patch: Partial<CampaignPrizeDraft>,
  ) {
    setDraftPrizes((current) =>
      withLowestTierRemainder(
        current.map((prize) =>
          prize.displayTier === displayTier ? { ...prize, ...patch } : prize,
        ),
        totalSlots,
        cards,
      ),
    );
  }

  function addPrizeDraft(displayTier: PrizeDisplayTier) {
    updateTierCount(displayTier, draftPrizesByTier[displayTier].length + 1);
  }

  function removePrizeDraft(localId: string) {
    const target = draftPrizes.find((prize) => prize.localId === localId);
    if (!target) return;
    const activeTiers = new Set(draftPrizes.map((prize) => prize.displayTier));
    const tierRows = draftPrizes.filter(
      (prize) => prize.displayTier === target.displayTier,
    );
    if (activeTiers.size <= 1 && tierRows.length <= 1) return;
    setDraftPrizes((current) =>
      withLowestTierRemainder(
        current.filter((prize) => prize.localId !== localId),
        totalSlots,
        cards,
      ),
    );
  }

  function toggleOpenQuantityOption(option: number) {
    setOpenQuantityOptions((current) => {
      const normalized = normalizeOpenQuantityOptions(current);
      if (normalized.includes(option)) {
        const next = normalized.filter((candidate) => candidate !== option);
        return next.length ? next : normalized;
      }
      return normalizeOpenQuantityOptions([...normalized, option]);
    });
  }

  function submit() {
    startTransition(async () => {
      try {
        if (prizeBlockers.length) throw new Error(prizeBlockers[0]);
        const basePayload = {
          slug,
          titleTh,
          titleEn,
          series,
          mode,
          priceThb,
          costCoins,
          totalSlots,
          displayTags,
          openQuantityOptions,
          categoryIds: categoryId ? [categoryId] : undefined,
          isTest,
          initialPrizes: activePrizeDrafts.map((prize) => ({
            cardId: prize.cardId,
            tier: dbTierForPrizeDisplayTier(prize.displayTier),
            rank: Math.max(1, Math.round(Number(prize.rank) || 1)),
            quantity: Math.max(0, Math.round(Number(prize.quantity) || 0)),
            metadata: {
              displayTier: prize.displayTier,
              displayTierLabel: prizeDisplayTierLabel(prize.displayTier),
              displayGroup: prize.displayTier,
              tierRank: prize.tierRank,
              tierRowCount: draftPrizesByTier[prize.displayTier].length,
              prizeCategory: prize.prizeCategory,
              prizeCategoryLabel: prizeCategoryLabel(prize.prizeCategory),
              sourceType: prizeSourceType(prize.prizeCategory),
            },
          })),
        };
        if (editMode && editingCampaign) {
          await patchJson("/api/ynot/admin/campaigns", {
            campaignId: editingCampaign.id,
            ...basePayload,
          });
          setMessage(
            `Pack "${editingCampaign.titleEn || editingCampaign.titleTh}" updated with ${configuredPrizeUnits.toLocaleString()} prize units. Submit owner review to re-publish.`,
          );
        } else {
          const payload = await postJson("/api/ynot/admin/campaigns", {
            ...basePayload,
            status: "draft",
            visibility: "private",
          });
          setMessage(
            `Random pack ${payload.campaign?.slug ?? slug} saved as draft with ${configuredPrizeUnits.toLocaleString()} prize units.`,
          );
        }
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Campaign could not be saved.",
        );
      }
    });
  }

  return (
    <section className="admin-pack-form admin-pack-form-horizontal soft-card">
      <div className="admin-pack-builder-head">
        <div>
          <span>{editMode ? "Edit random pack" : "New random pack"}</span>
          <h3>
            {editMode
              ? `Edit "${editingCampaign?.titleEn || editingCampaign?.titleTh || "pack"}"`
              : "Create pack draft with prizes"}
          </h3>
          <p>
            {editMode
              ? "Update campaign fields and prize list. Saving puts the pack back to draft/private and requires fresh owner review."
              : "Build the campaign, prize list, and owner-review readiness in one full-width workflow."}
          </p>
        </div>
        <strong
          className={
            prizeBlockers.length
              ? "admin-readiness-pill"
              : "admin-readiness-pill ready"
          }
        >
          {readinessLabel}
        </strong>
      </div>

      <div className="admin-pack-builder-layout">
        <aside className="admin-pack-info-panel" aria-label="Pack information">
          <div className="admin-panel-compact-head">
            <span>1. Pack info</span>
            <strong>Campaign setup</strong>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Slug</span>
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="new-pack-slug"
              />
            </label>
            <label className="admin-field">
              <span>Category</span>
              {categories.length ? (
                <select
                  value={categoryId}
                  onChange={(event) => {
                    const nextCategory = categories.find(
                      (category) => category.id === event.target.value,
                    );
                    const nextSeries = nextCategory?.legacySeries ?? undefined;
                    setCategoryId(event.target.value);
                    if (nextSeries) {
                      setSeries(nextSeries);
                      setDisplayTags((current) =>
                        normalizeCustomerTags(current, nextSeries),
                      );
                    }
                  }}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameEn}
                      {category.isTest ? " [TEST]" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={series}
                  onChange={(event) => {
                    const nextSeries = event.target.value as
                      | "pokemon"
                      | "one_piece";
                    setSeries(nextSeries);
                    setDisplayTags((current) =>
                      normalizeCustomerTags(current, nextSeries),
                    );
                  }}
                >
                  <option value="pokemon">Pokemon</option>
                  <option value="one_piece">One Piece</option>
                </select>
              )}
            </label>
            <label className="admin-field admin-field-wide">
              <span>Thai title</span>
              <input
                value={titleTh}
                onChange={(event) => setTitleTh(event.target.value)}
                placeholder="ชื่อแพ็ก"
              />
            </label>
            <label className="admin-field admin-field-wide">
              <span>English title</span>
              <input
                value={titleEn}
                onChange={(event) => setTitleEn(event.target.value)}
                placeholder="Pack title"
              />
            </label>
            <label className="admin-field">
              <span>Open mode</span>
              <select
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "instant_gacha" | "slot_pick")
                }
              >
                <option value="instant_gacha">Instant gacha</option>
                <option value="slot_pick">Slot pick</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Total packs</span>
              <input
                min={1}
                type="number"
                value={totalSlots}
                onChange={(event) =>
                  updateTotalSlots(Number(event.target.value))
                }
                placeholder="100"
              />
            </label>
            <label className="admin-field">
              <span>Price THB</span>
              <input
                min={1}
                type="number"
                value={priceThb}
                onChange={(event) => setPriceThb(Number(event.target.value))}
                placeholder="150"
              />
            </label>
            <label className="admin-field">
              <span>Cost coins</span>
              <input
                min={1}
                type="number"
                value={costCoins}
                onChange={(event) => setCostCoins(Number(event.target.value))}
                placeholder="1"
              />
            </label>
            <div className="admin-field admin-field-wide">
              <span>Open buttons</span>
              <div
                className="admin-open-preset-row"
                role="group"
                aria-label="Open quantity buttons"
              >
                {defaultOpenQuantityOptions.map((option) => (
                  <button
                    className={
                      openQuantityOptions.includes(option) ? "active" : ""
                    }
                    key={option}
                    onClick={() => toggleOpenQuantityOption(option)}
                    type="button"
                  >
                    Open {option}
                  </button>
                ))}
              </div>
              <small>
                These become the customer buttons on the open pack screen.
              </small>
            </div>
            <div className="admin-field admin-field-wide">
              <span>Customer card tags</span>
              <div className="admin-tag-chip-row" role="list">
                {displayTags.map((tag) => (
                  <button
                    className="admin-tag-chip active"
                    key={tag}
                    onClick={() =>
                      setDisplayTags((current) =>
                        toggleCustomerTag(current, tag),
                      )
                    }
                    type="button"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <select
                value=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  setDisplayTags((current) =>
                    toggleCustomerTag(current, event.target.value),
                  );
                }}
              >
                <option value="">Add label</option>
                {customerTagOptions
                  .filter((tag) => !displayTags.includes(tag))
                  .map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
              </select>
              <small>Choose up to 4 customer-facing pack labels.</small>
            </div>
            <label className="admin-field admin-field-wide">
              <span>Production test pack</span>
              <button
                className={
                  isTest
                    ? "gold-button rounded-2xl px-4 py-3 text-sm font-black"
                    : "plain-button rounded-2xl px-4 py-3 text-sm font-black"
                }
                onClick={() => setIsTest((value) => !value)}
                type="button"
              >
                {isTest ? "Test-only ON" : "Normal public pack"}
              </button>
            </label>
          </div>
        </aside>

        <section className="admin-prize-workspace" aria-label="Prize builder">
          <div className="admin-panel-compact-head">
            <span>2. Prize builder</span>
            <strong>Rainbow, Gold, Silver, Bronze tiers</strong>
          </div>

          <div className="admin-tier-toggle-grid">
            {prizeDisplayTierOptions.map((option) => {
              const rows = draftPrizesByTier[option.value];
              const active = rows.length > 0;
              return (
                <button
                  className={active ? `active tier-${option.value}` : ""}
                  key={option.value}
                  onClick={() => updateTierActive(option.value, !active)}
                  type="button"
                >
                  <span>{option.label}</span>
                  <strong>{active ? `${rows.length} rows` : "Off"}</strong>
                  <em>
                    {active
                      ? `${activeTierUnitCounts[
                          option.value
                        ].toLocaleString()} prize units`
                      : "Click to use this tier"}
                  </em>
                </button>
              );
            })}
          </div>

          <div className="admin-prize-tier-stack">
            {prizeDisplayTierOptions.map((option) => {
              const rows = draftPrizesByTier[option.value];
              if (!rows.length) return null;
              const lowestActiveTier =
                activeDisplayTierOptions[activeDisplayTierOptions.length - 1]
                  ?.value;
              const isLowestActiveTier = lowestActiveTier === option.value;
              return (
                <section
                  className={`admin-prize-tier-section admin-prize-tier-${option.value}`}
                  key={option.value}
                >
                  <div className="admin-prize-tier-head">
                    <div>
                      <span>{option.label} tier</span>
                      <strong>
                        {countLabel(rows.length, "row")} /{" "}
                        {countLabel(activeTierUnitCounts[option.value], "unit")}
                      </strong>
                      <p>
                        {option.value === "bronze"
                          ? "Lowest/base tier. PSA10 uses the Random PSA10 catalog item; other categories only show matching catalog items."
                          : `${option.label} uses specific catalog prizes and never shows the Random PSA10 base item.`}
                      </p>
                    </div>
                    <div className="admin-tier-count-controls">
                      {tierCountChoices.map((choice) => (
                        <button
                          className={rows.length === choice ? "active" : ""}
                          key={choice}
                          onClick={() => updateTierCount(option.value, choice)}
                          type="button"
                        >
                          {choice}
                        </button>
                      ))}
                      <label className="admin-field">
                        <span>Rows</span>
                        <input
                          max={maxTierPrizeRows}
                          min={minTierPrizeRows}
                          type="number"
                          value={rows.length}
                          onChange={(event) =>
                            updateTierCount(
                              option.value,
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                      <button
                        className="plain-button"
                        disabled={rows.length >= maxTierPrizeRows}
                        onClick={() => addPrizeDraft(option.value)}
                        type="button"
                      >
                        Add row
                      </button>
                      <button
                        className="plain-button"
                        onClick={() => updateTierRows(option.value, { quantity: 1 })}
                        type="button"
                      >
                        Qty 1
                      </button>
                      {isLowestActiveTier && (
                        <button
                          className="plain-button"
                          onClick={fillLowestTierRemainder}
                          type="button"
                        >
                          Fill remainder
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="admin-prize-table-wrap">
                    <div className="admin-prize-table-head">
                      <span>Tier #</span>
                      <span>Prize item</span>
                      <span>Category</span>
                      <span>Qty</span>
                      <span>Action</span>
                    </div>
                    {rows.map((prize) => {
                      const itemOptions = prizeCatalogCardsFor(
                        cards,
                        prize.prizeCategory,
                        prize.displayTier,
                      );
                      const selectedCardId = itemOptions.some(
                        (card) => card.catalogCardId === prize.cardId,
                      )
                        ? prize.cardId
                        : "";
                      const selectedCard =
                        itemOptions.find(
                          (card) => card.catalogCardId === selectedCardId,
                        ) ?? null;
                      return (
                        <article
                          className={`admin-prize-table-row tier-${option.value}`}
                          key={prize.localId}
                        >
                          <div className="admin-prize-rank-cell">
                            <div className="admin-prize-rank-label">
                              <strong>#{prize.tierRank}</strong>
                              <span>{option.shortLabel}</span>
                            </div>
                            {selectedCard ? (
                              <AdminPrizeCardImage
                                code={selectedCard.code}
                                imageUrl={selectedCard.photoUrl}
                                name={selectedCard.name}
                              />
                            ) : (
                              <span className="admin-prize-card-thumb admin-prize-card-placeholder">
                                <strong>Pick</strong>
                                <small>No image</small>
                              </span>
                            )}
                          </div>
                          <div className="admin-field admin-prize-card-field">
                            <span>Prize item</span>
                            <AdminPrizeCardPicker
                              cards={itemOptions}
                              disabled={!itemOptions.length}
                              showPreview={false}
                              showSearch={false}
                              value={selectedCardId}
                              onChange={(cardId) =>
                                updatePrizeDraft(prize.localId, {
                                  cardId,
                                })
                              }
                              testIdPrefix={`campaign-prize-${prize.localId}`}
                            />
                            {!itemOptions.length && (
                              <small>
                                Add a {prizeCategoryLabel(prize.prizeCategory)}{" "}
                                catalog item first.
                              </small>
                            )}
                          </div>
                          <label className="admin-field">
                            <span>Category</span>
                            <select
                              value={prize.prizeCategory}
                              onChange={(event) =>
                                updatePrizeDraftCategory(
                                  prize,
                                  event.target.value as PrizeCategory,
                                )
                              }
                            >
                              {prizeCategoryOptions.map((categoryOption) => (
                                <option
                                  key={categoryOption.value}
                                  value={categoryOption.value}
                                >
                                  {categoryOption.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="admin-field">
                            <span>Qty</span>
                            <input
                              min={0}
                              type="number"
                              value={prize.quantity}
                              onChange={(event) =>
                                updatePrizeDraft(prize.localId, {
                                  quantity: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <button
                            className="danger-button rounded-2xl px-3 py-2 text-xs font-black"
                            disabled={
                              activeDisplayTierOptions.length <= 1 &&
                              rows.length <= 1
                            }
                            onClick={() => removePrizeDraft(prize.localId)}
                            type="button"
                          >
                            Remove
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <aside className="admin-readiness-panel" aria-label="Pack readiness">
          <div className="admin-panel-compact-head">
            <span>3. Readiness</span>
            <strong>{readinessLabel}</strong>
          </div>
          <div className="admin-prize-summary-grid">
            <div>
              <span>Prize units</span>
              <strong>
                {configuredPrizeUnits.toLocaleString()}/
                {totalSlots.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Launch pool</span>
              <strong>{initialUnlockedUnits.toLocaleString()}</strong>
            </div>
            <div>
              <span>Tier rows</span>
              <strong>
                {activePrizeDrafts.length} total
                {tierRowSummary ? ` · ${tierRowSummary}` : ""}
              </strong>
            </div>
          </div>
          <div className="admin-prize-checklist">
            {prizeChecklist.map((item) => (
              <div className={item.ready ? "ready" : ""} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.primary}</strong>
                <em>{item.secondary}</em>
              </div>
            ))}
          </div>
          {prizeBlockers.length > 0 && (
            <ul className="admin-prize-blocker-list">
              {prizeBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          <button
            className="gold-button admin-form-save"
            disabled={isPending || prizeBlockers.length > 0}
            onClick={submit}
            type="button"
          >
            {isPending
              ? "Saving..."
              : editMode
                ? "Save pack changes"
                : "Save random pack draft"}
          </button>
          {message && <p className="admin-form-message">{message}</p>}
        </aside>
      </div>
    </section>
  );
}

type LocalApprovalQueueItem = YnotOwnerApprovalRequest & {
  runtimeStatus: YnotCampaign["status"];
  runtimeVisibility: YnotCampaign["visibility"];
  selectedLogicMode: YnotRandomLogicMode;
  localMessage?: string;
};

type LifecycleAction =
  | "submit_review"
  | "approve"
  | "reject"
  | "request_changes"
  | "publish"
  | "close"
  | "archive"
  | "delete";

function toLocalApprovalQueueItem(
  request: YnotOwnerApprovalRequest,
  current?: LocalApprovalQueueItem,
): LocalApprovalQueueItem {
  return {
    ...request,
    runtimeStatus: request.campaign.status,
    runtimeVisibility: request.campaign.visibility,
    selectedLogicMode: current?.selectedLogicMode ?? request.logicMode,
    localMessage: current?.localMessage,
  };
}

export function OwnerApprovalQueue({
  requests,
  viewerRole,
}: {
  requests: YnotOwnerApprovalRequest[];
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  const [items, setItems] = useState<LocalApprovalQueueItem[]>(
    requests.map((request) => toLocalApprovalQueueItem(request)),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems((current) => {
      const currentById = new Map(current.map((item) => [item.id, item]));
      return requests.map((request) =>
        toLocalApprovalQueueItem(request, currentById.get(request.id)),
      );
    });
  }, [requests]);

  function applyAction(index: number, action: LifecycleAction) {
    const item = items[index];
    if (!item) return;
    startTransition(async () => {
      try {
        const payload = await requestJson(
          "/api/ynot/admin/campaigns/lifecycle",
          {
            campaignId: item.campaign.id,
            action,
            logicMode: item.selectedLogicMode,
          },
          "POST",
        );
        setItems((current) =>
          current.map((candidate, candidateIndex) =>
            candidateIndex === index
              ? {
                  ...candidate,
                  approvalStatus:
                    payload.approvalStatus ?? candidate.approvalStatus,
                  runtimeStatus: payload.status ?? candidate.runtimeStatus,
                  runtimeVisibility:
                    payload.visibility ?? candidate.runtimeVisibility,
                  selectedLogicMode:
                    payload.logicMode ?? candidate.selectedLogicMode,
                  localMessage: payload.message ?? "Owner action saved.",
                }
              : candidate,
          ),
        );
      } catch (error) {
        setItems((current) =>
          current.map((candidate, candidateIndex) =>
            candidateIndex === index
              ? {
                  ...candidate,
                  localMessage:
                    error instanceof Error
                      ? error.message
                      : "Owner action could not be saved.",
                }
              : candidate,
          ),
        );
      }
    });
  }

  function chooseLogicMode(index: number, logicMode: YnotRandomLogicMode) {
    setItems((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? {
              ...candidate,
              selectedLogicMode: logicMode,
              logicMode,
              localMessage:
                logicMode === "pure_random"
                  ? "Pure random selected for this review."
                  : logicMode === "weighted_templates"
                    ? "Weighted high tier selected. Eligible prizes use configured weights, but this does not add a sold checkpoint by itself."
                    : "30% sold unlock selected. Locked prizes stay hidden and cannot drop until their sold checkpoint is reached.",
            }
          : candidate,
      ),
    );
  }

  function updateOwnerPrizeOdds(
    index: number,
    prizeId: string,
    patch: Partial<YnotPrizePreview>,
  ) {
    setItems((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? {
              ...candidate,
              campaign: {
                ...candidate.campaign,
                prizeLineup: (candidate.campaign.prizeLineup ?? []).map((prize) =>
                  prize.id === prizeId ? { ...prize, ...patch } : prize,
                ),
              },
              localMessage: undefined,
            }
          : candidate,
      ),
    );
  }

  function saveOwnerPrizeOdds(index: number, prize: YnotPrizePreview) {
    const item = items[index];
    if (!item || !prize.cardId) return;
    const prizeCategory = prizeCategoryValue(prize.prizeCategory);
    const sourceType = prizeSourceType(prizeCategory);
    const displayTier = prizePreviewDisplayTier(prize);
    const tierRank = prizePreviewTierRank(prize);
    const weight = usesPrizeWeight(item.selectedLogicMode)
      ? Math.max(0, Number(prize.weight) || 0)
      : 1;
    const unlockAtSoldPct = usesPrizeUnlock(item.selectedLogicMode)
      ? Math.min(
          100,
          Math.max(0, Math.round(Number(prize.unlockAtSoldPct) || 0)),
        )
      : 0;
    startTransition(async () => {
      try {
        await postJson("/api/ynot/admin/prizes", {
          campaignId: item.campaign.id,
          cardId: prize.cardId,
          tier: prize.tier,
          rank: prize.rank,
          weight,
          unlockAtSoldPct,
          prizeCategory,
          sourceType,
          displayTier,
          displayGroup: displayTier,
          metadata: {
            displayTier,
            displayTierLabel: prizeDisplayTierLabel(displayTier),
            displayGroup: displayTier,
            tierRank,
            prizeCategory,
            prizeCategoryLabel: prizeCategoryLabel(prizeCategory),
            sourceType,
          },
        });
        setItems((current) =>
          current.map((candidate, candidateIndex) =>
            candidateIndex === index
              ? {
                  ...candidate,
                  localMessage:
                    "Owner prize mode settings saved.",
                }
              : candidate,
          ),
        );
      } catch (error) {
        setItems((current) =>
          current.map((candidate, candidateIndex) =>
            candidateIndex === index
              ? {
                  ...candidate,
                  localMessage:
                    error instanceof Error
                      ? error.message
                      : "Owner prize odds could not be saved.",
                }
              : candidate,
          ),
        );
      }
    });
  }

  if (!items.length) {
    return (
      <section className="owner-approval-queue soft-card">
        <div className="admin-form-head">
          <span>Owner review queue</span>
          <h3>No random drops need owner review</h3>
          <p>
            New packs remain draft/private until an owner approves and publishes
            them.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="owner-approval-queue soft-card">
      <div className="admin-panel-head">
        <div>
          <p className="section-label">Owner review queue</p>
          <h3 className="title-m">Random drop requests</h3>
          <p className="txt-s">
            {items.length} request{items.length === 1 ? "" : "s"} waiting in
            the owner dashboard.
          </p>
        </div>
        <span className="status-pill warn">Owner notification</span>
      </div>

      <div className="owner-approval-list">
        {items.map((item, index) => {
          const isOwner = viewerRole === "owner";
          const readinessBlockers = item.campaign.readinessBlockers ?? [];
          const readinessBlocked = readinessBlockers.length > 0;
          const canPublish =
            isOwner && item.approvalStatus === "approved" && !readinessBlocked;
          const logicLocked = item.approvalStatus === "approved";
          const summaryLines = ownerLogicSummary(
            item.selectedLogicMode,
            item.soldPct,
          );
          const weightControlsActive = usesPrizeWeight(item.selectedLogicMode);
          const unlockControlsActive = usesPrizeUnlock(item.selectedLogicMode);
          const ownerPrizeLineup = item.campaign.prizeLineup ?? [];
          const ownerPrizeSections = prizeDisplayTierOptions
            .map((option) => ({
              key: option.value,
              title: `${option.label} tier`,
              note:
                option.value === "bronze"
                  ? "Base or lowest tier rewards that cover the pack."
                  : `${option.label} chase rewards reviewed above lower tiers.`,
              prizes: ownerPrizeLineup
                .filter(
                  (prize) => prizePreviewDisplayTier(prize) === option.value,
                )
                .sort(
                  (left, right) =>
                    prizePreviewTierRank(left) - prizePreviewTierRank(right),
                ),
            }))
            .filter((section) => section.prizes.length > 0);
          return (
            <article className="owner-approval-card" key={item.id}>
              <div className="owner-approval-card-head">
                <div>
                  <span>{item.notificationLabel}</span>
                  <h4>{item.campaign.titleTh || item.campaign.titleEn}</h4>
                  <p>
                    {item.campaign.slug} · {item.runtimeStatus}/
                    {item.runtimeVisibility} · {item.soldPct}% sold checkpoint
                  </p>
                </div>
                <div className="admin-pack-badges">
                  <strong>{approvalStatusLabel(item.approvalStatus)}</strong>
                  <em>{item.mock ? "localhost mock" : "database request"}</em>
                </div>
              </div>

              <details className="owner-review-details" open>
                <summary>Random logic</summary>
                <div className="owner-logic-panel">
                  <div>
                    <span>Random logic choice</span>
                    <strong>
                      {
                        randomLogicChoices.find(
                          (choice) => choice.value === item.selectedLogicMode,
                        )?.label
                      }
                    </strong>
                    <p>
                      {logicLocked
                        ? "Approved logic is locked for publish."
                        : "Pick the logic first, approve the settings, then publish when it is ready for customers."}
                    </p>
                  </div>
                  <div className="owner-logic-options" aria-label="Random logic">
                    {randomLogicChoices.map((choice) => (
                      <button
                        className={
                          item.selectedLogicMode === choice.value
                            ? "active"
                            : ""
                        }
                        disabled={!isOwner || isPending || logicLocked}
                        key={choice.value}
                        onClick={() => chooseLogicMode(index, choice.value)}
                        type="button"
                      >
                        <strong>{choice.label}</strong>
                        <span>{choice.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </details>

              <details className="owner-review-details" open>
                <summary>Overview</summary>
                <div className="owner-approval-grid">
                  <div>
                    <span>Requested by</span>
                    <strong>{item.requestedByLabel}</strong>
                  </div>
                  <div>
                    <span>Requested at</span>
                    <strong>{formatApprovalDate(item.requestedAt)}</strong>
                  </div>
                  <div>
                    <span>Prize units</span>
                    <strong>
                      {item.campaign.availablePrizeUnits ?? 0}/
                      {item.campaign.totalPrizeUnits ?? item.campaign.totalSlots}
                    </strong>
                  </div>
                  <div>
                    <span>Openable now</span>
                    <strong>{item.campaign.eligiblePrizeUnits ?? 0}</strong>
                  </div>
                </div>

                {readinessBlocked && (
                  <ul className="admin-prize-blocker-list">
                    {readinessBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                )}

                <ul className="owner-approval-summary">
                  {summaryLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>

              {isOwner && (
                <details className="owner-review-details" open>
                  <summary>Prize tiers</summary>
                  <div className="owner-prize-odds-panel">
                  <div className="owner-prize-odds-head">
                    <div>
                      <span>Owner-only prize odds</span>
                      <strong>
                        {item.selectedLogicMode === "pure_random"
                          ? "Tier review with equal odds"
                          : item.selectedLogicMode === "weighted_templates"
                            ? "Tier review with active weights"
                            : "Tier review with sold unlock and active weights"}
                      </strong>
                    </div>
                    <em>
                      {weightControlsActive ? "Weight active" : "Equal chance"}
                    </em>
                  </div>
                  {ownerPrizeLineup.length > 0 ? (
                    <div className="owner-prize-section-stack">
                      {ownerPrizeSections.map((section) => (
                        <section className="owner-prize-section" key={section.key}>
                          <div className="owner-prize-section-head">
                            <div>
                              <strong>{section.title}</strong>
                              <span>{section.note}</span>
                            </div>
                            <em>{section.prizes.length} row{section.prizes.length === 1 ? "" : "s"}</em>
                          </div>
                          <div className="owner-prize-odds-table-wrap">
                            <div className="owner-prize-odds-table-head">
                              <span>Prize</span>
                              <span>Tier</span>
                              <span>Weight</span>
                              <span>Unlock %</span>
                              <span>Current odds</span>
                              <span>Action</span>
                            </div>
                            {section.prizes.map((prize) => (
                              <article
                                className="owner-prize-odds-row"
                                key={prize.id}
                              >
                                <div className="owner-prize-name-cell">
                                  <strong>
                                    {prizeDisplayTierLabel(section.key)} #
                                    {prizePreviewTierRank(prize)}{" "}
                                    {prize.cardName}
                                  </strong>
                                  <span>
                                    {prize.prizeCategoryLabel ??
                                      (prize.tier === "high"
                                        ? "High tier"
                                        : "Normal")}
                                  </span>
                                </div>
                                <div className="owner-prize-tier-cell">
                                  {prizeDisplayTierLabel(section.key)}
                                </div>
                                {weightControlsActive ? (
                                  <label className="admin-field">
                                    <span>Weight</span>
                                    <input
                                      min={0}
                                      step={0.1}
                                      type="number"
                                      value={prize.weight ?? 1}
                                      onChange={(event) =>
                                        updateOwnerPrizeOdds(index, prize.id, {
                                          weight: Number(event.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                ) : (
                                  <div className="owner-prize-mode-pill">
                                    Equal chance
                                  </div>
                                )}
                                {unlockControlsActive ? (
                                  <label className="admin-field">
                                    <span>Unlock sold percent</span>
                                    <input
                                      max={100}
                                      min={0}
                                      type="number"
                                      value={prize.unlockAtSoldPct ?? 0}
                                      onChange={(event) =>
                                        updateOwnerPrizeOdds(index, prize.id, {
                                          unlockAtSoldPct: Number(event.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                ) : (
                                  <div className="owner-prize-mode-pill">
                                    Immediate pool
                                  </div>
                                )}
                                <div className="owner-prize-odds-cell">
                                  {ownerPrizeOddsLabel(
                                    prize,
                                    ownerPrizeLineup,
                                    item.soldPct,
                                    item.selectedLogicMode,
                                  )}
                                </div>
                                <button
                                  className="plain-button"
                                  disabled={
                                    isPending ||
                                    logicLocked ||
                                    item.mock ||
                                    !prize.cardId
                                  }
                                  onClick={() => saveOwnerPrizeOdds(index, prize)}
                                  type="button"
                                >
                                  Save
                                </button>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-empty-note">
                      Prize odds appear here after the draft has saved prize
                      inventory.
                    </p>
                  )}
                  </div>
                </details>
              )}

              <details className="owner-review-details" open>
                <summary>Approval actions</summary>
                <div className="owner-approval-actions">
                <div className="owner-action-note">
                  <strong>Approve settings</strong>
                  <span>Keeps the pack draft/private. Customers still cannot open it.</span>
                </div>
                <button
                  className="gold-button"
                  disabled={!isOwner || isPending || readinessBlocked}
                  onClick={() => applyAction(index, "approve")}
                  type="button"
                >
                  Approve settings
                </button>
                <button
                  className="plain-button"
                  disabled={!isOwner || isPending}
                  onClick={() => applyAction(index, "request_changes")}
                  type="button"
                >
                  Request changes
                </button>
                <button
                  className="danger-button"
                  disabled={!isOwner || isPending}
                  onClick={() => applyAction(index, "reject")}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="plain-button"
                  disabled={!canPublish || isPending}
                  onClick={() => applyAction(index, "publish")}
                  type="button"
                >
                  Publish live/public
                </button>
                <div className="owner-action-note">
                  <strong>Publish live/public</strong>
                  <span>Only after approval. This makes the pack visible and openable.</span>
                </div>
                </div>
              </details>
              {item.localMessage && (
                <p className="admin-pack-row-message">{item.localMessage}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function AdminCampaignActionPanel({
  campaigns,
  viewerRole,
}: {
  campaigns: YnotCampaign[];
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  const [campaignPatches, setCampaignPatches] = useState<
    Record<string, Partial<YnotCampaign>>
  >({});
  const items = useMemo(
    () =>
      campaigns.map((campaign) => ({
        ...campaign,
        ...(campaignPatches[campaign.id] ?? {}),
      })),
    [campaignPatches, campaigns],
  );

  function updateCampaign(campaignId: string, patch: Partial<YnotCampaign>) {
    setCampaignPatches((current) => ({
      ...current,
      [campaignId]: { ...(current[campaignId] ?? {}), ...patch },
    }));
  }

  if (!items.length) {
    return (
      <section className="admin-pack-list admin-full-span soft-card">
        <div className="admin-form-head">
          <span>Existing packs</span>
          <h3>Submit review or update customer labels</h3>
          <p>
            Create a random pack draft before publishing. Saved drafts will
            appear in this list.
          </p>
        </div>
      </section>
    );
  }
  const activeCampaigns = items.filter(
    (campaign) =>
      !campaign.adminRemoved &&
      !campaign.soldOut &&
      campaign.status !== "closed" &&
      campaign.status !== "archived",
  );
  const historyCampaigns = items.filter(
    (campaign) =>
      campaign.adminRemoved ||
      campaign.soldOut ||
      campaign.status === "closed" ||
      campaign.status === "archived",
  );

  return (
    <section className="admin-pack-list admin-full-span soft-card">
      <div className="admin-form-head">
        <span>Existing packs</span>
        <h3>Submit review or update customer labels</h3>
        <p>
          Use this list after creating a draft. Direct live/public publish is
          held for the owner approval queue.
        </p>
      </div>
      <div className="admin-pack-row-list admin-pack-row-list-horizontal">
        {activeCampaigns.map((campaign) => (
          <AdminCampaignStatusRow
            key={campaign.id}
            campaign={campaign}
            onCampaignChange={updateCampaign}
            viewerRole={viewerRole}
          />
        ))}
      </div>
      {!activeCampaigns.length && (
        <p className="admin-empty-note">No active draft/live packs.</p>
      )}
      <div className="admin-pack-history-head">
        <span>History</span>
        <strong>Closed, sold-out, archived, and removed packs</strong>
      </div>
      <div className="admin-pack-row-list admin-pack-row-list-horizontal">
        {historyCampaigns.map((campaign) => (
          <AdminCampaignStatusRow
            key={campaign.id}
            campaign={campaign}
            onCampaignChange={updateCampaign}
            viewerRole={viewerRole}
          />
        ))}
      </div>
      {!historyCampaigns.length && (
        <p className="admin-empty-note">No history packs yet.</p>
      )}
    </section>
  );
}

function AdminCampaignStatusRow({
  campaign,
  onCampaignChange,
  viewerRole,
}: {
  campaign: YnotCampaign;
  onCampaignChange: (campaignId: string, patch: Partial<YnotCampaign>) => void;
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<YnotCampaign["status"]>(campaign.status);
  const [visibility, setVisibility] = useState<YnotCampaign["visibility"]>(
    campaign.visibility,
  );
  const [approvalStatus, setApprovalStatus] = useState<YnotApprovalStatus>(
    campaign.approvalStatus ?? inferredApprovalStatus(campaign.status),
  );
  const [displayTags, setDisplayTags] = useState<string[]>(
    normalizeCustomerTags(campaign.displayTags, campaign.series),
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const readinessBlockers = campaign.readinessBlockers ?? [];
  const isOwner = viewerRole === "owner";

  function submit(nextStatus = status, nextVisibility = visibility) {
    startTransition(async () => {
      try {
        setMessage("");
        if (
          nextStatus === "live" ||
          nextVisibility === "public"
        ) {
          throw new Error(
            "Direct live/public publish is locked. Submit the pack for owner review first.",
          );
        }
        if (campaign.demo) {
          setStatus(nextStatus);
          setVisibility(nextVisibility);
          setMessage("Local mock status updated in this browser session.");
          return;
        }
        const payload = await requestJson(
          "/api/ynot/admin/campaigns",
          {
            campaignId: campaign.id,
            status: nextStatus,
            visibility: nextVisibility,
            displayTags,
          },
          "PATCH",
        );
        const updatedStatus = payload.status ?? "draft";
        const updatedVisibility = payload.visibility ?? "private";
        const updatedApprovalStatus =
          payload.approvalStatus ?? "not_submitted";
        setStatus(updatedStatus);
        setVisibility(updatedVisibility);
        setApprovalStatus(updatedApprovalStatus);
        onCampaignChange(campaign.id, {
          approvalStatus: updatedApprovalStatus,
          displayTags,
          status: updatedStatus,
          visibility: updatedVisibility,
        });
        setMessage(
          "Random pack settings saved. Submit owner review to reserve stock before publish.",
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Random pack status could not be saved.",
        );
      }
    });
  }

  function submitReview() {
    startTransition(async () => {
      try {
        setMessage("");
        if (readinessBlockers.length) throw new Error(readinessBlockers[0]);
        const payload = await requestJson(
          "/api/ynot/admin/campaigns/lifecycle",
          { campaignId: campaign.id, action: "submit_review" },
          "POST",
        );
        setApprovalStatus(payload.approvalStatus ?? "pending_review");
        setStatus(payload.status ?? "draft");
        setVisibility(payload.visibility ?? "private");
        onCampaignChange(campaign.id, {
          approvalStatus: payload.approvalStatus ?? "pending_review",
          status: payload.status ?? "draft",
          visibility: payload.visibility ?? "private",
        });
        setMessage(payload.message ?? "Random pack submitted for owner review.");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Random pack could not be submitted for owner review.",
        );
      }
    });
  }

  function applyLifecycleAction(action: "close" | "archive") {
    startTransition(async () => {
      try {
        setMessage("");
        const payload = await requestJson(
          "/api/ynot/admin/campaigns/lifecycle",
          { campaignId: campaign.id, action },
          "POST",
        );
        const updatedStatus = payload.status ?? status;
        const updatedVisibility = payload.visibility ?? visibility;
        const updatedApprovalStatus = payload.approvalStatus ?? approvalStatus;
        setStatus(updatedStatus);
        setVisibility(updatedVisibility);
        setApprovalStatus(updatedApprovalStatus);
        onCampaignChange(campaign.id, {
          approvalStatus: updatedApprovalStatus,
          status: updatedStatus,
          visibility: updatedVisibility,
        });
        setMessage(payload.message ?? "Random pack lifecycle updated.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Random pack lifecycle could not be updated.",
        );
      }
    });
  }

  function removeCampaign() {
    startTransition(async () => {
      try {
        setMessage("");
        const payload = await requestJson(
          "/api/ynot/admin/campaigns/lifecycle",
          { campaignId: campaign.id, action: "delete" },
          "POST",
        );
        setStatus(payload.status ?? "archived");
        setVisibility(payload.visibility ?? "private");
        setApprovalStatus(payload.approvalStatus ?? approvalStatus);
        onCampaignChange(campaign.id, {
          adminRemoved: true,
          approvalStatus: payload.approvalStatus ?? approvalStatus,
          status: payload.status ?? "archived",
          visibility: payload.visibility ?? "private",
        });
        setMessage(payload.message ?? "Pack removed and kept in history.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Random pack could not be removed.",
        );
      }
    });
  }

  return (
    <article className="admin-pack-row">
      <div className="admin-pack-row-main">
        <div>
          <span>
            {campaign.categoryLabel ??
              (campaign.series === "pokemon" ? "Pokemon" : "One Piece")}
            {campaign.isTest ? " · TEST" : ""}
          </span>
          <h4>{campaign.titleTh || campaign.titleEn}</h4>
          <p>
            {campaign.slug} · {campaign.mode} ·{" "}
            {campaign.remainingSlots ?? campaign.totalSlots}/
            {campaign.totalSlots} packs left
            {campaign.totalPrizeUnits !== undefined
              ? ` · ${campaign.availablePrizeUnits ?? 0}/${campaign.totalPrizeUnits} prizes left`
              : ""}
            {campaign.eligiblePrizeUnits !== undefined
              ? ` · ${campaign.eligiblePrizeUnits} openable prizes`
              : ""}
          </p>
        </div>
        <div className="admin-pack-badges">
          <strong>{status}</strong>
          <em>{visibility}</em>
          <em>{approvalStatusLabel(approvalStatus)}</em>
          {campaign.soldOut && <em>Sold out</em>}
          {campaign.adminRemoved && <em>Removed</em>}
        </div>
      </div>
      {readinessBlockers.length > 0 && (
        <ul className="admin-prize-blocker-list">
          {readinessBlockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}

      <div className="admin-pack-row-controls">
        <label className="admin-field">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as YnotCampaign["status"])
            }
          >
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Visibility</span>
          <select
            value={visibility}
            onChange={(event) =>
              setVisibility(event.target.value as YnotCampaign["visibility"])
            }
          >
            <option value="private">Private</option>
            <option value="hidden">Hidden</option>
            <option value="public">Public</option>
          </select>
        </label>
        <div className="admin-field admin-field-wide">
          <span>Customer card labels</span>
          <div className="admin-tag-chip-row" role="list">
            {displayTags.map((tag) => (
              <button
                className="admin-tag-chip active"
                key={tag}
                onClick={() =>
                  setDisplayTags((current) => toggleCustomerTag(current, tag))
                }
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>
          <select
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              setDisplayTags((current) =>
                toggleCustomerTag(current, event.target.value),
              );
            }}
          >
            <option value="">Add label</option>
            {customerTagOptions
              .filter((tag) => !displayTags.includes(tag))
              .map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="admin-pack-row-actions">
        <button
          className="gold-button"
          disabled={isPending}
          onClick={() => submit()}
          type="button"
        >
          Save status
        </button>
        <button
          className="plain-button"
          disabled={isPending || readinessBlockers.length > 0}
          onClick={submitReview}
          type="button"
        >
          Submit owner review
        </button>
        <button
          className="plain-button"
          disabled={isPending}
          onClick={() => applyLifecycleAction("close")}
          type="button"
        >
          Close private
        </button>
        <button
          className="danger-button"
          disabled={isPending}
          onClick={() => applyLifecycleAction("archive")}
          type="button"
        >
          Archive private
        </button>
        {isOwner && (
          <button
            className="danger-button"
            disabled={isPending}
            onClick={removeCampaign}
            type="button"
          >
            Remove pack
          </button>
        )}
      </div>
      {message && <p className="admin-pack-row-message">{message}</p>}
    </article>
  );
}

export function AdminCardForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [prizeCategory, setPrizeCategory] =
    useState<PrizeCategory>("psa10_card");
  const [series, setSeries] = useState<"pokemon" | "one_piece">("pokemon");
  const [grade, setGrade] = useState("Ungraded");
  const [imageUrl, setImageUrl] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [assetSource, setAssetSource] = useState(
    "Generated YNot placeholder asset",
  );
  const [assetLicense, setAssetLicense] = useState(
    "Original generated placeholder",
  );
  const [assetManifestKey, setAssetManifestKey] = useState("ynot-test-card");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const payload = await postJson("/api/ynot/admin/cards", {
          code,
          name,
          series,
          grade,
          prizeCategory,
          imageUrl,
          isTest,
          assetSource: isTest ? assetSource : undefined,
          assetLicense: isTest ? assetLicense : undefined,
          assetManifestKey: isTest ? assetManifestKey : undefined,
        });
        setMessage(`Prize item ${payload.card?.name ?? name} saved.`);
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Prize item could not be saved.",
        );
      }
    });
  }

  return (
      <section className="admin-panel admin-form-panel soft-card">
        <div className="admin-form-head">
          <span>Prize catalog</span>
          <h3>Create or update prize item</h3>
          <p>
            Add PSA10 cards, sealed products, electronics, or other prizes
            before assigning them into a random pack prize pool.
          </p>
        </div>
        <div className="admin-form-grid">
          <AdminField
            label="Prize code"
            hint="Optional unique code. If blank, the name is used to find/update an existing prize item."
          >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="OP-PSA10-001"
          />
        </AdminField>
        <AdminField label="Prize item name" required>
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="PSA10 card, PlayStation, AirPods, or other prize"
          />
        </AdminField>
        <AdminField label="Catalog series">
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={series}
            onChange={(event) =>
              setSeries(event.target.value as "pokemon" | "one_piece")
            }
          >
            <option value="pokemon">Pokémon</option>
            <option value="one_piece">One Piece</option>
          </select>
        </AdminField>
        <AdminField label="Prize category">
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={prizeCategory}
            onChange={(event) =>
              setPrizeCategory(event.target.value as PrizeCategory)
            }
          >
            {prizeCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Grade / model">
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            placeholder="PSA 10 / PS5 / AirPods Pro"
          />
        </AdminField>
        <AdminField
          label="Image URL"
          hint="Use approved storage or /test-assets paths for production test prize items."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="/test-assets/ynot-test-card-001.svg"
          />
        </AdminField>
        <AdminField label="Prize item mode">
          <button
            className={
              isTest
                ? "gold-button rounded-2xl px-4 py-3 text-sm font-black"
                : "plain-button rounded-2xl px-4 py-3 text-sm font-black"
            }
            onClick={() => setIsTest((value) => !value)}
            type="button"
          >
            {isTest ? "Test prize ON" : "Normal prize"}
          </button>
        </AdminField>
        {isTest && (
          <>
            <AdminField label="Asset manifest key" required>
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                value={assetManifestKey}
                onChange={(event) => setAssetManifestKey(event.target.value)}
                placeholder="ynot-test-card-001"
              />
            </AdminField>
            <AdminField label="Asset source" required>
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                value={assetSource}
                onChange={(event) => setAssetSource(event.target.value)}
                placeholder="Generated YNot placeholder asset"
              />
            </AdminField>
            <AdminField label="Asset license" required>
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                value={assetLicense}
                onChange={(event) => setAssetLicense(event.target.value)}
                placeholder="Original generated placeholder"
              />
            </AdminField>
          </>
        )}
      </div>
      <button
        className="gold-button admin-form-save"
        disabled={isPending || !name.trim()}
        onClick={submit}
        type="button"
      >
        {isPending ? "Saving..." : "Save prize item"}
      </button>
      {message && <p className="admin-form-message">{message}</p>}
    </section>
  );
}

export function AdminPrizePoolForm({
  campaigns,
  cards,
}: {
  campaigns: YnotCampaign[];
  cards: CardCatalogItem[];
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [cardId, setCardId] = useState(() => initialAdminPrizeCardId(cards));
  const [displayTier, setDisplayTier] =
    useState<PrizeDisplayTier>("bronze");
  const [prizeCategory, setPrizeCategory] =
    useState<PrizeCategory>("psa10_card");
  const [rank, setRank] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const tier = dbTierForPrizeDisplayTier(displayTier);
  const selectedCampaignId = campaigns.some(
    (campaign) => campaign.id === campaignId,
  )
    ? campaignId
    : campaigns[0]?.id ?? "";

  const prizeItemOptions = useMemo(
    () => prizeCatalogCardsFor(cards, prizeCategory, displayTier),
    [cards, displayTier, prizeCategory],
  );
  const selectedPrizeCardId = prizeItemOptions.some(
    (card) => card.catalogCardId === cardId,
  )
    ? cardId
    : "";
  const selectedPrizeCard =
    prizeItemOptions.find((card) => card.catalogCardId === selectedPrizeCardId) ??
    null;

  function savePrize() {
    startTransition(async () => {
      try {
        setMessage("");
        if (!selectedPrizeCardId) {
          throw new Error("Choose a visible prize item before saving.");
        }
        if (!selectedCampaignId) {
          throw new Error("Create a random pack before adding prize slots.");
        }
        await postJson("/api/ynot/admin/prizes", {
          campaignId: selectedCampaignId,
          cardId: selectedPrizeCardId,
          tier,
          rank,
          quantity,
          prizeCategory,
          sourceType: prizeSourceType(prizeCategory),
          displayTier,
          displayGroup: displayTier,
          metadata: {
            displayTier,
            displayTierLabel: prizeDisplayTierLabel(displayTier),
            displayGroup: displayTier,
            tierRank: rank,
            prizeCategory,
            prizeCategoryLabel: prizeCategoryLabel(prizeCategory),
            sourceType: prizeSourceType(prizeCategory),
          },
        });
        setMessage(
          "Prize slot and planned quantity saved. Owner review will reserve global stock before approval.",
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Prize slot could not be saved.",
        );
      }
    });
  }

  return (
    <section className="admin-panel admin-form-panel soft-card">
      <div className="admin-form-head">
        <span>Prize pool</span>
        <h3>Campaign prize pool</h3>
        <p>
          Attach catalog prize items to campaign ranks so instant gacha can
          award cards, electronics, store credit, or other inventory.
        </p>
      </div>
      <div className="admin-form-grid">
        <AdminField label="Random pack" required>
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={selectedCampaignId}
            onChange={(event) => setCampaignId(event.target.value)}
          >
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.titleTh || campaign.titleEn}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Prize item" required>
          <AdminPrizeCardPicker
            cards={prizeItemOptions}
            disabled={!prizeItemOptions.length}
            value={selectedPrizeCardId}
            onChange={setCardId}
            testIdPrefix="admin-prize-pool-card"
          />
          {!prizeItemOptions.length && (
            <small>Add a {prizeCategoryLabel(prizeCategory)} catalog item first.</small>
          )}
          {displayTier === "bronze" && prizeCategory === "psa10_card" && (
            <small>Bronze PSA10 prizes use the generic Random PSA10 card pool.</small>
          )}
        </AdminField>
        <AdminField label="Prize category">
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={prizeCategory}
            onChange={(event) => {
              const nextCategory = event.target.value as PrizeCategory;
              setPrizeCategory(nextCategory);
              setCardId("");
            }}
          >
            {prizeCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Prize tier">
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={displayTier}
            onChange={(event) => {
              const nextDisplayTier = prizeDisplayTierValue(event.target.value);
              setDisplayTier(nextDisplayTier);
              setCardId("");
            }}
          >
            {prizeDisplayTierOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField
          label="Prize rank"
          required
          hint="Rank controls display order inside the selected Rainbow, Gold, Silver, or Bronze tier."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            min={1}
            type="number"
            value={rank}
            onChange={(event) => setRank(Number(event.target.value))}
            placeholder="1"
          />
        </AdminField>
        <AdminField
          label="Planned pack quantity"
          required
          hint="How many copies this pack should reserve from global stock during owner review."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            min={1}
            type="number"
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.max(1, Math.round(Number(event.target.value) || 1)))
            }
            placeholder="10"
          />
        </AdminField>
      </div>
      <button
        className="gold-button admin-form-save"
        disabled={isPending || !selectedCampaignId || !selectedPrizeCardId}
        onClick={savePrize}
        type="button"
      >
        {isPending ? "Saving..." : "Save campaign prize slot"}
      </button>
      {message && <p className="admin-form-message">{message}</p>}
      {selectedPrizeCard && (
        <p className="admin-selected-card-note">
          Selected: {selectedPrizeCard.code ?? "no code"} · {selectedPrizeCard.name}
          {" · "}
          {selectedPrizeCard.grade} · {prizeCategoryLabel(selectedPrizeCard.prizeCategory)}
        </p>
      )}
    </section>
  );
}

type AdminCardCatalogRow = {
  card: CardCatalogItem;
  prizes: YnotPrizePoolItem[];
  stockTotal: number;
  stockAvailable: number;
  stockReserved: number;
  stockAllocated: number;
  stockArchived: number;
  packTotalUnits: number;
  packAvailableUnits: number;
  packAwardedUnits: number;
  packVoidUnits: number;
};

function buildAdminCardCatalogRows(
  cards: CardCatalogItem[],
  prizes: YnotPrizePoolItem[],
) {
  const prizesByCard = new Map<string, YnotPrizePoolItem[]>();
  for (const prize of prizes) {
    const current = prizesByCard.get(prize.cardId) ?? [];
    current.push(prize);
    prizesByCard.set(prize.cardId, current);
  }

  return cards
    .map((card) => {
      const cardPrizes = prizesByCard.get(card.catalogCardId) ?? [];
      return {
        card,
        prizes: cardPrizes,
        stockTotal: card.stockTotal ?? 0,
        stockAvailable: card.stockAvailable ?? 0,
        stockReserved: card.stockReserved ?? 0,
        stockAllocated: card.stockAllocated ?? 0,
        stockArchived: card.stockArchived ?? 0,
        packTotalUnits: cardPrizes.reduce(
          (sum, prize) => sum + prize.totalUnits,
          0,
        ),
        packAvailableUnits: cardPrizes.reduce(
          (sum, prize) => sum + prize.availableUnits,
          0,
        ),
        packAwardedUnits: cardPrizes.reduce(
          (sum, prize) => sum + prize.awardedUnits,
          0,
        ),
        packVoidUnits: cardPrizes.reduce((sum, prize) => sum + prize.voidUnits, 0),
      };
    })
    .sort((left, right) => {
      const categoryCompare = prizeCategoryLabel(
        left.card.prizeCategory,
      ).localeCompare(prizeCategoryLabel(right.card.prizeCategory));
      if (categoryCompare) return categoryCompare;
      const seriesCompare = left.card.series.localeCompare(right.card.series);
      if (seriesCompare) return seriesCompare;
      return left.card.name.localeCompare(right.card.name);
    });
}

function adminCardCatalogRowSearchText(row: AdminCardCatalogRow) {
  const card = row.card;
  return [
    card.code,
    card.name,
    card.grade,
    card.series,
    prizeCategoryLabel(card.prizeCategory),
    card.catalogCardId,
    card.searchName,
    card.searchCode,
    card.photoUrl,
    card.photoStoragePath,
    card.assetSource,
    card.assetLicense,
    card.assetManifestKey,
    card.seedRunId,
    card.isTest ? "test" : "normal",
    ...row.prizes.map((prize) => prize.campaignTitle),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatAdminCatalogDate(value?: string | null) {
  if (!value) return "Unknown";
  return formatApprovalDate(value);
}

type StockAdjustmentMode = "add" | "remove";

type StockAdjustmentDraft = {
  cardId: string;
  mode: StockAdjustmentMode;
  quantity: string;
};

export function AdminCardCatalogPanel({
  cards,
  prizes,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [pendingCardId, setPendingCardId] = useState("");
  const [stockDraft, setStockDraft] = useState<StockAdjustmentDraft | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingCard, setEditingCard] = useState<CardCatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { card: CardCatalogItem; row: AdminCardCatalogRow }
    | null
  >(null);
  const rows = useMemo(
    () => buildAdminCardCatalogRows(cards, prizes),
    [cards, prizes],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((row) =>
      adminCardCatalogRowSearchText(row).includes(normalizedQuery),
    );
  }, [normalizedQuery, rows]);
  const assignedCount = rows.filter((row) => row.prizes.length > 0).length;
  const stockedCount = rows.filter((row) => row.stockTotal > 0).length;

  function openStockAdjustment(
    card: CardCatalogItem,
    row: AdminCardCatalogRow,
    mode: StockAdjustmentMode,
  ) {
    setMessage("");
    setStockDraft({
      cardId: card.catalogCardId,
      mode,
      quantity: mode === "remove" ? String(Math.min(1, row.stockAvailable)) : "1",
    });
  }

  function updateStockDraftQuantity(quantity: string) {
    setStockDraft((current) => (current ? { ...current, quantity } : current));
  }

  function cancelStockAdjustment() {
    setStockDraft(null);
    setMessage("");
  }

  function confirmStockAdjustment(card: CardCatalogItem, row: AdminCardCatalogRow) {
    if (!stockDraft || stockDraft.cardId !== card.catalogCardId) return;
    const requestedQuantity = Math.max(1, Math.round(Number(stockDraft.quantity) || 0));

    if (stockDraft.mode === "remove" && row.stockAvailable <= 0) {
      setMessage("No available global stock can be removed for this card.");
      return;
    }

    const quantityDelta =
      stockDraft.mode === "remove" ? -requestedQuantity : requestedQuantity;
    startTransition(async () => {
      try {
        setMessage("");
        setPendingCardId(card.catalogCardId);
        await postJson("/api/ynot/admin/card-stock", {
          cardId: card.catalogCardId,
          quantityDelta,
          reason: quantityDelta > 0 ? "admin_stock_added" : "admin_stock_removed",
        });
        setMessage(
          quantityDelta > 0
            ? `${countLabel(requestedQuantity, "global stock unit")} added. Draft packs can reserve it during owner review.`
            : `${countLabel(requestedQuantity, "available global stock unit")} removed.`,
        );
        setStockDraft(null);
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Global stock could not be adjusted.",
        );
      } finally {
        setPendingCardId("");
      }
    });
  }

  return (
    <section className="admin-panel admin-full-span admin-card-catalog-panel soft-card">
      <div className="admin-panel-head">
        <div>
          <p className="section-label">Card catalog</p>
          <h3 className="title-m">All cards in database</h3>
          <p className="admin-muted-line">
            This list comes from the cards table. Pack stock is shown in the
            separate section below.
          </p>
        </div>
        <span className="status-pill">
          {visibleRows.length}/{cards.length} cards
        </span>
      </div>

      <div className="admin-card-catalog-toolbar">
        <label className="admin-field">
          <span>Search catalog</span>
          <input
            aria-label="Search catalog cards"
            placeholder="Search code, name, grade, category, pack"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="admin-card-catalog-summary">
          <strong>{assignedCount.toLocaleString()}</strong>
          <span>cards used in packs</span>
          <strong>{stockedCount.toLocaleString()}</strong>
          <span>cards with global stock</span>
        </div>
      </div>

      <div className="admin-card-catalog-list" data-testid="admin-card-catalog-list">
        {visibleRows.map((row) => {
          const card = row.card;
          const currentStockDraft =
            stockDraft?.cardId === card.catalogCardId ? stockDraft : null;
          const stockPending = isPending && pendingCardId === card.catalogCardId;
          return (
            <article className="admin-card-catalog-row" key={card.catalogCardId}>
              <AdminPrizeCardImage
                code={card.code}
                imageUrl={card.photoUrl}
                name={card.name}
              />
              <div className="admin-card-catalog-main">
                <strong>{card.name}</strong>
                <p className="admin-muted-line">
                  {[card.code ?? "no code", card.grade, prizeCategoryLabel(card.prizeCategory)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="admin-muted-line">
                  {card.series} · {card.isTest ? "Test item" : "Normal item"}
                </p>
                <p className="admin-muted-line">
                  Updated {formatAdminCatalogDate(card.updatedAt)}
                </p>
                <p className="admin-id-line">{card.catalogCardId}</p>
              </div>
              <div className="admin-card-catalog-usage">
                <span>Global stock</span>
                <strong>
                  {row.stockAvailable.toLocaleString()}/
                  {row.stockTotal.toLocaleString()}
                </strong>
                <small>
                  {row.stockReserved.toLocaleString()} reserved ·{" "}
                  {row.stockAllocated.toLocaleString()} allocated
                  {row.stockArchived ? ` · ${row.stockArchived.toLocaleString()} archived` : ""}
                </small>
                <div className="admin-card-stock-actions">
                  {currentStockDraft ? (
                    <div className="admin-stock-confirm">
                      <div className="admin-stock-confirm-head">
                        <span>
                          {currentStockDraft.mode === "remove"
                            ? "Remove stock"
                            : "Add stock"}
                        </span>
                        <strong>
                          {currentStockDraft.mode === "remove"
                            ? `${row.stockAvailable.toLocaleString()} available`
                            : "Global stock"}
                        </strong>
                      </div>
                      <label className="admin-stock-confirm-field">
                        <span>Quantity</span>
                        <input
                          aria-label={`Stock quantity for ${card.name}`}
                          disabled={stockPending}
                          max={
                            currentStockDraft.mode === "remove"
                              ? row.stockAvailable
                              : 10000
                          }
                          min={1}
                          type="number"
                          value={currentStockDraft.quantity}
                          onChange={(event) =>
                            updateStockDraftQuantity(
                              currentStockDraft.mode === "remove"
                                ? String(
                                    Math.min(
                                      Math.max(
                                        1,
                                        Math.round(Number(event.target.value) || 1),
                                      ),
                                      Math.max(1, row.stockAvailable),
                                    ),
                                  )
                                : event.target.value,
                            )
                          }
                        />
                      </label>
                      <div className="admin-stock-confirm-actions">
                        <button
                          className={
                            currentStockDraft.mode === "remove"
                              ? "danger-button"
                              : "gold-button"
                          }
                          disabled={
                            stockPending ||
                            (currentStockDraft.mode === "remove" &&
                              row.stockAvailable <= 0)
                          }
                          type="button"
                          onClick={() => confirmStockAdjustment(card, row)}
                        >
                          {stockPending
                            ? "Saving..."
                            : currentStockDraft.mode === "remove"
                              ? "Confirm remove"
                              : "Confirm add"}
                        </button>
                        <button
                          className="plain-button"
                          disabled={stockPending}
                          type="button"
                          onClick={cancelStockAdjustment}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-stock-action-row">
                      <button
                        className="plain-button"
                        disabled={isPending}
                        type="button"
                        onClick={() => openStockAdjustment(card, row, "add")}
                      >
                        Add stock
                      </button>
                      <button
                        className="plain-button"
                        disabled={isPending || row.stockAvailable <= 0}
                        type="button"
                        onClick={() => openStockAdjustment(card, row, "remove")}
                      >
                        Remove stock
                      </button>
                      <button
                        className="plain-button"
                        disabled={isPending}
                        type="button"
                        onClick={() => setEditingCard(card)}
                      >
                        Edit card
                      </button>
                      <button
                        className="plain-button admin-card-catalog-delete-btn"
                        disabled={isPending || row.prizes.length > 0 || row.stockTotal - row.stockArchived > 0}
                        type="button"
                        title={
                          row.prizes.length > 0
                            ? `Cannot delete — ${row.prizes.length} pack prize slot${row.prizes.length === 1 ? "" : "s"} still reference this card.`
                            : row.stockTotal - row.stockArchived > 0
                              ? `Cannot delete — ${row.stockTotal - row.stockArchived} active stock unit${row.stockTotal - row.stockArchived === 1 ? "" : "s"} still exist. Use "Remove stock" until 0/${row.stockTotal} first.`
                              : `Delete "${card.name}" permanently`
                        }
                        onClick={() => setDeleteTarget({ card, row })}
                      >
                        Delete card
                      </button>
                    </div>
                  )}
                </div>
                <small>
                  {row.prizes.length.toLocaleString()} pack slot
                  {row.prizes.length === 1 ? "" : "s"} ·{" "}
                  {row.packAvailableUnits.toLocaleString()}/
                  {row.packTotalUnits.toLocaleString()} pack units ·{" "}
                  {row.packAwardedUnits.toLocaleString()} awarded
                  {row.packVoidUnits ? ` · ${row.packVoidUnits.toLocaleString()} void` : ""}
                </small>
                <div className="admin-card-catalog-slot-list">
                  {row.prizes.length ? (
                    row.prizes.map((prize) => (
                      <em key={prize.id}>
                        {prize.campaignTitle} ·{" "}
                        {prizeDisplayTierLabel(
                          prize.displayTier ?? prize.displayGroup ?? prize.tier,
                        )}{" "}
                        #{prize.tierRank ?? prize.rank}
                      </em>
                    ))
                  ) : (
                    <em>No pack assignment</em>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!visibleRows.length && (
          <p className="admin-empty-note">No catalog cards match this search.</p>
        )}
      </div>
      {message && <p className="admin-form-message">{message}</p>}
      {editingCard && (
        <AdminCardEditModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={() => {
            setEditingCard(null);
            router.refresh();
          }}
        />
      )}
      {deleteTarget && (
        <AdminCardDeleteModal
          card={deleteTarget.card}
          onCancel={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function AdminCardEditModal({
  card,
  onClose,
  onSaved,
}: {
  card: CardCatalogItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(card.name);
  const [code, setCode] = useState(card.code ?? "");
  const [series, setSeries] = useState<"pokemon" | "one_piece">(
    (card.series as "pokemon" | "one_piece") ?? "pokemon",
  );
  const [grade, setGrade] = useState(card.grade ?? "");
  const [imageUrl, setImageUrl] = useState(card.photoUrl ?? "");
  const [isTest, setIsTest] = useState(card.isTest ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.catalogCardId,
          name: name.trim() || card.name,
          code: code.trim() || null,
          series,
          grade: grade.trim() || "Ungraded",
          prizeCategory: card.prizeCategory,
          imageUrl: imageUrl.trim() || null,
          isTest,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.error || payload?.message || "Save failed");
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="admin-modal" role="document">
        <header className="admin-modal-head">
          <h2 className="admin-modal-title" style={{ color: "#fff" }}>
            Edit card
          </h2>
          <p className="admin-modal-subtitle">
            Updates apply immediately. Customer collection rows that already
            reference this card keep the new name + image after refresh.
          </p>
        </header>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
          </label>
          <label className="admin-field">
            <span>Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} disabled={pending} />
          </label>
          <label className="admin-field">
            <span>Series</span>
            <select
              value={series}
              onChange={(e) => setSeries(e.target.value as "pokemon" | "one_piece")}
              disabled={pending}
            >
              <option value="pokemon">Pokemon</option>
              <option value="one_piece">One Piece</option>
            </select>
          </label>
          <label className="admin-field">
            <span>Grade</span>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} disabled={pending} />
          </label>
          <label className="admin-field" style={{ gridColumn: "span 2" }}>
            <span>Image URL</span>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={pending} />
          </label>
          <label className="admin-field" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} disabled={pending} />
            <span>Test-only card (hidden from public catalog)</span>
          </label>
        </div>
        {error && (
          <p className="admin-category-row-error" role="alert">
            {error}
          </p>
        )}
        <footer className="admin-modal-foot">
          <button type="button" className="admin-modal-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-modal-primary"
            onClick={save}
            disabled={pending || !name.trim()}
            style={{ background: "linear-gradient(135deg, #f4c542, #df9824)", color: "#161616" }}
          >
            {pending ? "Saving…" : "Save card"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function AdminCardDeleteModal({
  card,
  onCancel,
  onDeleted,
}: {
  card: CardCatalogItem;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const expectedPhrase = card.code ?? card.name;
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === expectedPhrase;

  async function runDelete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/cards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.catalogCardId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.error || payload?.message || "Delete failed");
      }
      onDeleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div className="admin-modal admin-modal-danger" role="document">
        <header className="admin-modal-head">
          <h2 className="admin-modal-title">Delete card &quot;{card.name}&quot; permanently?</h2>
          <p className="admin-modal-subtitle">
            This removes the card from the catalog forever. Eligibility is
            re-checked on the server — if any pack prize slot or active stock
            unit still references this card, the delete will be refused.
          </p>
        </header>
        <label className="admin-modal-confirm-row">
          <span>
            Type <code>{expectedPhrase}</code> to confirm
          </span>
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={pending}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="admin-modal-confirm-input"
            placeholder={expectedPhrase}
          />
        </label>
        {error && (
          <p className="admin-category-row-error" role="alert">
            {error}
          </p>
        )}
        <footer className="admin-modal-foot">
          <button type="button" className="admin-modal-secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-modal-primary admin-modal-primary-danger"
            onClick={runDelete}
            disabled={!matches || pending}
          >
            {pending ? "Deleting…" : "Delete card"}
          </button>
        </footer>
      </div>
    </div>
  );
}

type AdminPrizeInventoryCard = {
  cardId: string;
  card: CardCatalogItem | null;
  prizes: YnotPrizePoolItem[];
  totalUnits: number;
  availableUnits: number;
  awardedUnits: number;
  voidUnits: number;
};

function buildAdminPrizeInventoryCards(
  cards: CardCatalogItem[],
  prizes: YnotPrizePoolItem[],
) {
  const cardById = new Map(cards.map((card) => [card.catalogCardId, card]));
  const inventoryByCard = new Map<string, AdminPrizeInventoryCard>();

  for (const prize of prizes) {
    const current =
      inventoryByCard.get(prize.cardId) ??
      {
        cardId: prize.cardId,
        card: cardById.get(prize.cardId) ?? null,
        prizes: [],
        totalUnits: 0,
        availableUnits: 0,
        awardedUnits: 0,
        voidUnits: 0,
      };
    current.prizes.push(prize);
    current.totalUnits += prize.totalUnits;
    current.availableUnits += prize.availableUnits;
    current.awardedUnits += prize.awardedUnits;
    current.voidUnits += prize.voidUnits;
    inventoryByCard.set(prize.cardId, current);
  }

  return [...inventoryByCard.values()].sort((left, right) => {
    const leftName = left.card?.name ?? left.prizes[0]?.cardName ?? "";
    const rightName = right.card?.name ?? right.prizes[0]?.cardName ?? "";
    return leftName.localeCompare(rightName);
  });
}

export function AdminPrizeInventoryPanel({
  cards,
  prizes,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
}) {
  const inventoryCards = useMemo(
    () => buildAdminPrizeInventoryCards(cards, prizes),
    [cards, prizes],
  );

  return (
    <section className="admin-panel admin-full-span admin-inventory-panel soft-card">
      <div className="admin-panel-head">
        <div>
          <p className="section-label">Pack prize quantities</p>
          <h3 className="title-m">Cards assigned to random packs</h3>
          <p className="admin-muted-line">
            These quantities belong to each random pack. Draft packs store a
            plan first; owner review reserves global stock.
          </p>
        </div>
        <span className="status-pill">{inventoryCards.length} cards</span>
      </div>

      <div className="admin-card-inventory-list">
        {inventoryCards.map((item) => {
          const firstPrize = item.prizes[0];
          const cardName = item.card?.name ?? firstPrize?.cardName ?? "Card";
          const cardCode = item.card?.code ?? firstPrize?.cardCode ?? null;
          const cardGrade = item.card?.grade ?? firstPrize?.cardGrade ?? "";
          const cardImageUrl =
            item.card?.photoUrl ?? firstPrize?.cardImageUrl ?? null;
          const cardCategory =
            item.card?.prizeCategory ?? firstPrize?.cardPrizeCategory;
          return (
            <article className="admin-card-inventory-row" key={item.cardId}>
              <AdminPrizeCardImage
                code={cardCode}
                imageUrl={cardImageUrl}
                name={cardName}
              />
              <div className="admin-card-inventory-main">
                <strong>{cardName}</strong>
                <p className="admin-muted-line">
                  {[cardCode ?? "no code", cardGrade, prizeCategoryLabel(cardCategory)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.card?.series && (
                  <p className="admin-muted-line">{item.card.series}</p>
                )}
                <p className="admin-id-line">{item.cardId}</p>
              </div>
              <div className="admin-card-inventory-stock">
                <span>Pack units / plan</span>
                <strong>
                  {item.availableUnits.toLocaleString()}/
                  {item.totalUnits.toLocaleString()}
                </strong>
                <small>
                  {item.awardedUnits.toLocaleString()} awarded
                  {item.voidUnits ? ` · ${item.voidUnits.toLocaleString()} void` : ""}
                </small>
              </div>
              <div className="admin-card-inventory-slots">
                {item.prizes.map((prize) => {
                  return (
                    <div className="admin-card-inventory-slot" key={prize.id}>
                      <span>
                        {prize.campaignTitle} ·{" "}
                        {prizeDisplayTierLabel(
                          prize.displayTier ?? prize.displayGroup ?? prize.tier,
                        )}{" "}
                        #{prize.tierRank ?? prize.rank}
                      </span>
                      <strong>
                        {prize.availableUnits.toLocaleString()}/
                        {prize.plannedQuantity.toLocaleString()}
                      </strong>
                      <small>
                        Read-only plan · {prize.awardedUnits.toLocaleString()} awarded
                        {prize.voidUnits
                          ? ` · ${prize.voidUnits.toLocaleString()} void`
                          : ""}
                      </small>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
        {!inventoryCards.length && (
          <p className="admin-empty-note">
            No cards have been assigned to a random pack prize slot yet.
          </p>
        )}
      </div>
    </section>
  );
}

export function AdminUserRoleForm({
  profileId,
  currentRole,
  currentActive,
}: {
  profileId: string;
  currentRole: string | null;
  currentActive: boolean;
}) {
  const [role, setRole] = useState<"staff" | "admin" | "owner">(
    currentRole === "owner" ||
      currentRole === "admin" ||
      currentRole === "staff"
      ? currentRole
      : "staff",
  );
  const [isActive, setIsActive] = useState(currentRole ? currentActive : true);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await requestJson(
          "/api/ynot/admin/users",
          { profileId, role, isActive },
          "PATCH",
        );
        setMessage("Role saved.");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Role could not be saved.",
        );
      }
    });
  }

  return (
    <div className="grid gap-2">
      <select
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        value={role}
        onChange={(event) =>
          setRole(event.target.value as "staff" | "admin" | "owner")
        }
      >
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
        <option value="owner">Owner</option>
      </select>
      <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
        <input
          checked={isActive}
          type="checkbox"
          onChange={(event) => setIsActive(event.target.checked)}
        />
        Active admin
      </label>
      <button
        className="plain-button rounded-xl px-3 py-2 text-xs font-black"
        disabled={isPending}
        onClick={submit}
        type="button"
      >
        {isPending ? "Saving..." : "Save role"}
      </button>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}

export function AdminMergeActions({
  mergeRequestId,
}: {
  mergeRequestId: string;
}) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        await requestJson(
          "/api/ynot/admin/merge-requests",
          { mergeRequestId, action, note },
          "PATCH",
        );
        setMessage(
          `${action === "approve" ? "Merge completed" : "Merge rejected"}.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Merge review failed.",
        );
      }
    });
  }

  return (
    <div className="grid gap-2">
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        placeholder="Admin note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="gold-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          onClick={() => submit("approve")}
          type="button"
        >
          Approve merge
        </button>
        <button
          className="danger-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          onClick={() => submit("reject")}
          type="button"
        >
          Reject merge
        </button>
      </div>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}

export function AdminExchangeActions({ order }: { order: YnotExchangeOrder }) {
  const [coinValue, setCoinValue] = useState(order.requestedCoinValue);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        await fetch("/api/ynot/admin/exchange", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            exchangeOrderId: order.id,
            action,
            note,
            coinValue,
          }),
        }).then(async (response) => {
          if (!response.ok)
            throw new Error(
              (await response.json().catch(() => null))?.error ??
                "Exchange review failed.",
            );
        });
        setMessage(`${action} complete.`);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Exchange review failed.",
        );
      }
    });
  }
  return (
    <div className="mt-3 grid gap-2">
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        type="number"
        value={coinValue}
        onChange={(event) => setCoinValue(Number(event.target.value))}
      />
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        placeholder="Admin note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="gold-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          type="button"
          onClick={() => submit("approve")}
        >
          Approve
        </button>
        <button
          className="danger-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          type="button"
          onClick={() => submit("reject")}
        >
          Reject
        </button>
      </div>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}

export function AdminShippingActions({
  request,
}: {
  request: YnotShippingRequest;
}) {
  const [status, setStatus] = useState(request.status);
  const [trackingProvider, setTrackingProvider] = useState(
    request.trackingProvider ?? "",
  );
  const [trackingNumber, setTrackingNumber] = useState(
    request.trackingNumber ?? "",
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      try {
        await fetch("/api/ynot/admin/shipping", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shippingRequestId: request.id,
            status,
            trackingProvider,
            trackingNumber,
            note,
          }),
        }).then(async (response) => {
          if (!response.ok)
            throw new Error(
              (await response.json().catch(() => null))?.error ??
                "Shipping update failed.",
            );
        });
        setMessage("Shipping updated.");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Shipping update failed.",
        );
      }
    });
  }
  return (
    <div className="mt-3 grid gap-2">
      <select
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        value={status}
        onChange={(event) =>
          setStatus(event.target.value as YnotShippingRequest["status"])
        }
      >
        <option value="submitted">Submitted</option>
        <option value="packing">Packing</option>
        <option value="shipped">Shipped</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        placeholder="Carrier"
        value={trackingProvider}
        onChange={(event) => setTrackingProvider(event.target.value)}
      />
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        placeholder="Tracking number"
        value={trackingNumber}
        onChange={(event) => setTrackingNumber(event.target.value)}
      />
      <input
        className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs"
        placeholder="Admin note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <button
        className="gold-button rounded-xl px-3 py-2 text-xs font-black"
        disabled={isPending}
        type="button"
        onClick={submit}
      >
        Update shipping
      </button>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}

/**
 * Admin-only inline reorder widget rendered on each pack card. Lets the owner
 * swap a card with its previous/next neighbour without leaving the storefront
 * view. The first two positions become the featured slots at the top of the
 * /packs page; everything else cascades into the LEGENDARY grid below.
 */
export function PackOrderControls({
  campaignId,
  position,
  canMoveUp,
  canMoveDown,
  prevId,
  prevSortOrder,
  nextId,
  nextSortOrder,
  currentSortOrder,
  variant = "card",
}: {
  campaignId: string;
  position: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  prevId?: string | null;
  prevSortOrder?: number | null;
  nextId?: string | null;
  nextSortOrder?: number | null;
  currentSortOrder: number;
  variant?: "card" | "feature";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function moveTo(
    neighborId: string | null | undefined,
    neighborOrder: number | null | undefined,
  ) {
    if (!neighborId || neighborOrder === null || neighborOrder === undefined) {
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          swaps: [
            { id: campaignId, sortOrder: neighborOrder },
            { id: neighborId, sortOrder: currentSortOrder },
          ],
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Reorder failed");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reorder failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`pack-order-controls pack-order-controls--${variant}`}
      aria-label="Reorder pack"
    >
      <span
        className="pack-order-controls-position"
        aria-label={`Position ${position}`}
      >
        #{position}
      </span>
      <button
        type="button"
        className="pack-order-controls-button"
        onClick={() => moveTo(prevId, prevSortOrder)}
        disabled={!canMoveUp || pending}
        aria-label="Move pack up"
      >
        ↑
      </button>
      <button
        type="button"
        className="pack-order-controls-button"
        onClick={() => moveTo(nextId, nextSortOrder)}
        disabled={!canMoveDown || pending}
        aria-label="Move pack down"
      >
        ↓
      </button>
      {error && (
        <span className="pack-order-controls-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Admin-only delete button. Archives the campaign via the lifecycle API
 * (which any admin can call, unlike the owner-gated "delete" action). The
 * archived campaign is kept in the database for history but disappears from
 * the public storefront and active admin lists.
 */
export function PackDeleteButton({
  campaignId,
  campaignTitle,
  variant = "card",
}: {
  campaignId: string;
  campaignTitle: string;
  variant?: "card" | "feature";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    if (pending) return;
    const confirmed = window.confirm(
      `Archive "${campaignTitle}"?\n\nThis hides it from the storefront and active admin lists. The pack stays archived in the database — you can restore it later via the admin lifecycle queue.`,
    );
    if (!confirmed) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action: "archive" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Archive failed");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Archive failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`pack-admin-delete pack-admin-delete--${variant}`}
        onClick={archive}
        disabled={pending}
        aria-label={`Archive ${campaignTitle}`}
        title="Archive this pack"
      >
        {/* Bin icon — 12×14 thin stroke matches the chevron / close glyphs. */}
        <svg
          viewBox="0 0 12 14"
          width="12"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M0 3 H12" />
          <path d="M4 3 V1 H8 V3" />
          <path d="M1.5 3 V13 H10.5 V3" />
          <path d="M5 6 V11" />
          <path d="M7 6 V11" />
        </svg>
      </button>
      {error && (
        <span className="pack-admin-delete-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

/**
 * Star toggle that promotes / demotes a pack between the featured tier and
 * the regular collection. Featured packs have sortOrder ≤ 2 (slot 1 + 2 on
 * the storefront); everything else floats to the bottom with sortOrder 1000.
 * The button shows a filled star when featured and an outline otherwise so
 * admins can see the current state at a glance.
 */
export function PackFeatureToggle({
  campaignId,
  campaignTitle,
  isFeatured,
}: {
  campaignId: string;
  campaignTitle: string;
  isFeatured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/ynot/admin/campaigns/reorder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            swaps: [
              { id: campaignId, sortOrder: isFeatured ? 1000 : 1 },
            ],
          }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(
          payload?.message || payload?.error || "Feature toggle failed",
        );
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Feature toggle failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`pack-feature-toggle${isFeatured ? " is-featured" : ""}`}
        onClick={toggle}
        disabled={pending}
        aria-pressed={isFeatured}
        aria-label={
          isFeatured
            ? `Remove ${campaignTitle} from featured`
            : `Feature ${campaignTitle}`
        }
        title={isFeatured ? "Unfeature pack" : "Feature pack"}
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill={isFeatured ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M8 1.5 L10 6 L15 6.5 L11 10 L12 14.5 L8 12 L4 14.5 L5 10 L1 6.5 L6 6 Z" />
        </svg>
        <span className="pack-feature-toggle-label">
          {isFeatured ? "Featured" : "Feature"}
        </span>
      </button>
      {error && (
        <span className="pack-feature-toggle-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

type AdminCampaignSummary = {
  id: string;
  slug: string;
  titleTh: string;
  titleEn: string;
  series: "pokemon" | "one_piece";
  status: "draft" | "live" | "closed" | "archived";
  visibility: "public" | "hidden" | "private";
  sortOrder: number | null;
  costCoins: number;
  totalSlots: number;
  isTest: boolean;
};

/**
 * Admin-only pack picker. Opens an editorial overlay (white backdrop, thin
 * black hairlines — matching the FOG menu drawer) listing every campaign
 * the admin can see, with a "+ Create new" tile at the end. Selecting an
 * existing pack promotes it to the top of the featured row by writing
 * sortOrder = 1 via the reorder endpoint.
 */
/** Default cost in coins for each tier — pick a value comfortably inside
 *  the range so the pack lands in the right bucket without flirting with
 *  boundaries. Cost ranges (see components.tsx packTier):
 *    Legendary ≥ 200, Gold 100–199, Silver 50–99, Common < 50. */
const TIER_TARGET_COST: Record<string, number> = {
  legendary: 250,
  gold: 150,
  silver: 75,
  common: 25,
};

export function PackPickerModal({
  open,
  onClose,
  targetTier,
}: {
  open: boolean;
  onClose: () => void;
  /** When set, the picker shifts from "promote to hero" mode into "move
   *  pack into this tier" mode — each tile becomes a one-click cost
   *  rewrite that re-buckets the pack. */
  targetTier?: string;
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<AdminCampaignSummary[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  // Fetch the campaign list whenever the modal is opened. We deliberately
  // refetch on every open so newly archived/published packs show up
  // immediately without a hard refresh.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadCampaigns = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch("/api/ynot/admin/campaigns", { method: "GET" })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | { ok?: boolean; campaigns?: AdminCampaignSummary[]; error?: string; message?: string }
            | null;
          if (!response.ok || !payload?.ok) {
            throw new Error(
              payload?.message || payload?.error || "Failed to load packs",
            );
          }
          if (!cancelled) setCampaigns(payload.campaigns ?? []);
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(caught instanceof Error ? caught.message : "Load failed");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(loadCampaigns);
    };
  }, [open]);

  // Esc + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  async function promote(campaign: AdminCampaignSummary) {
    if (promotingId) return;
    setPromotingId(campaign.id);
    setError(null);
    try {
      // If the picked pack is archived, first restore it via the close
      // lifecycle action so it re-enters the storefront's visible status
      // set.
      if (campaign.status === "archived") {
        const restoreRes = await fetch(
          "/api/ynot/admin/campaigns/lifecycle",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaignId: campaign.id,
              action: "close",
            }),
          },
        );
        if (!restoreRes.ok) {
          const payload = (await restoreRes.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(
            payload?.message || payload?.error || "Restore failed",
          );
        }
      }
      if (targetTier) {
        // "Move to tier" mode — rewrite the pack's cost so it lands in
        // the target tier's bucket, and quietly evict it from the hero
        // cookie if it happened to be featured. This keeps the
        // "buttons aren't connected" promise: clicking + Add on COMMON
        // should never make a pack appear in Mystery Packs and vice
        // versa.
        const costCoins = TIER_TARGET_COST[targetTier] ?? 25;
        const response = await fetch("/api/ynot/admin/campaigns/cost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id, costCoins }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(
            payload?.message || payload?.error || "Move failed",
          );
        }
        // Best-effort hero eviction. If the pack wasn't featured this is
        // a no-op; we don't surface its failure to the user.
        await fetch("/api/ynot/admin/featured-packs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", id: campaign.id }),
        }).catch(() => {});
      } else {
        // Default mode — add the pack to the hero/featured cookie list
        // without touching its tier-section sortOrder.
        const response = await fetch("/api/ynot/admin/featured-packs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add", id: campaign.id }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(
            payload?.message || payload?.error || "Promote failed",
          );
        }
      }
      onClose();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : targetTier
            ? "Move failed"
            : "Promote failed",
      );
    } finally {
      setPromotingId(null);
    }
  }

  if (!open) return null;

  const hydrated = typeof window !== "undefined";
  if (!hydrated) return null;

  const overlay = (
    <div className="pack-picker-overlay" role="dialog" aria-modal="true" aria-label="Choose a pack">
      <div
        className="pack-picker-backdrop"
        aria-hidden
        onClick={onClose}
      />
      <div className="pack-picker-panel">
        <header className="pack-picker-head">
          <span className="pack-picker-eyebrow">
            {targetTier ? `Move into ${targetTier}` : "Featured slot"}
          </span>
          <h2 className="pack-picker-title">
            {targetTier
              ? `Move a pack into the ${targetTier} tier`
              : "Pick an existing pack"}
          </h2>
          <button
            type="button"
            className="pack-picker-close"
            onClick={onClose}
            aria-label="Close picker"
          >
            <svg
              viewBox="0 0 14 14"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.6"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M13 1 L1 13" />
              <path d="M1 1 L13 13" />
            </svg>
          </button>
        </header>

        <div className="pack-picker-body">
          {loading && (
            <p className="pack-picker-message">Loading…</p>
          )}
          {error && !loading && (
            <p className="pack-picker-message pack-picker-message-error" role="alert">
              {error}
            </p>
          )}
          {!loading && campaigns && (
            <ul className="pack-picker-grid">
              {campaigns.map((campaign) => {
                const isArchived = campaign.status === "archived";
                const isPromoting = promotingId === campaign.id;
                return (
                  <li key={campaign.id}>
                    <button
                      type="button"
                      className={`pack-picker-tile pack-picker-tile--${campaign.series}${isArchived ? " is-archived" : ""}`}
                      onClick={() => promote(campaign)}
                      disabled={isPromoting}
                      aria-label={
                        targetTier
                          ? `Move ${campaign.titleEn || campaign.titleTh} into ${targetTier}`
                          : isArchived
                            ? `Restore and promote ${campaign.titleEn || campaign.titleTh}`
                            : `Promote ${campaign.titleEn || campaign.titleTh}`
                      }
                    >
                      <span className="pack-picker-tile-series">
                        {campaign.series === "pokemon" ? "Pokemon" : "One Piece"}
                      </span>
                      <strong className="pack-picker-tile-title">
                        {campaign.titleTh || campaign.titleEn}
                      </strong>
                      <span className="pack-picker-tile-meta">
                        {campaign.status}
                        {campaign.isTest ? " · test" : ""}
                        {targetTier
                          ? ` · click to move into ${targetTier}`
                          : isArchived
                            ? " · click to restore"
                            : ""}
                      </span>
                      {isPromoting && (
                        <span className="pack-picker-tile-pending">
                          {targetTier
                            ? "Moving…"
                            : isArchived
                              ? "Restoring…"
                              : "Promoting…"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              <li>
                <a
                  href="/admin/campaigns"
                  className="pack-picker-tile pack-picker-tile--create"
                  aria-label="Create a new pack"
                >
                  <span className="pack-picker-tile-plus" aria-hidden>
                    +
                  </span>
                  <span className="pack-picker-tile-title">
                    Create new pack
                  </span>
                  <span className="pack-picker-tile-meta">
                    Opens admin form
                  </span>
                </a>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/**
 * Client wrapper that pairs the "+ Add new pack" placeholder card with the
 * PackPickerModal so a server component (PacksExperience) can drop a single
 * element in for the admin shortcut without managing modal state itself.
 */
export function PackPickerLauncher({
  variant = "card",
  targetTier,
}: {
  variant?: "card" | "button";
  /** When set, opens the picker in "move into tier" mode instead of
   *  "promote to hero" — clicking a pack rewrites its cost so it lands
   *  in the chosen tier bucket. */
  targetTier?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = targetTier
    ? `Move a pack into ${targetTier}`
    : "Add or pick a mystery pack";
  if (variant === "button") {
    return (
      <>
        <button
          type="button"
          className="packs-toolbar-add-btn"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
        >
          <span aria-hidden>+</span>
          <span>Add pack</span>
        </button>
        <PackPickerModal
          open={open}
          onClose={() => setOpen(false)}
          targetTier={targetTier}
        />
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className="packs-feature-card packs-feature-card--placeholder"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="packs-feature-placeholder-plus" aria-hidden>
          +
        </span>
        <span className="packs-feature-placeholder-label">Add or pick pack</span>
      </button>
      <PackPickerModal
        open={open}
        onClose={() => setOpen(false)}
        targetTier={targetTier}
      />
    </>
  );
}

/**
 * Shopify-inspired campaign list for /admin/campaigns. Status tabs + search
 * + per-row actions. Replaces the old AdminCampaignActionPanel for a denser
 * editorial layout. Bulk-select + bulk actions are handled inline.
 */
const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "live", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
] as const;

type AdminTableStatus = (typeof STATUS_TABS)[number]["key"];

export function AdminCampaignTable({
  campaigns,
}: {
  campaigns: YnotCampaign[];
}) {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState<AdminTableStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<YnotCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { mode: "single"; campaign: YnotCampaign }
    | { mode: "bulk"; campaigns: YnotCampaign[] }
    | null
  >(null);

  // Counts per status so the tabs show a Shopify-style number badge.
  const counts = useMemo(() => {
    const map: Record<AdminTableStatus, number> = {
      all: campaigns.length,
      live: 0,
      draft: 0,
      closed: 0,
      archived: 0,
    };
    for (const campaign of campaigns) {
      const status = campaign.status as AdminTableStatus;
      if (status === "live" || status === "draft" || status === "closed" || status === "archived") {
        map[status] += 1;
      }
    }
    return map;
  }, [campaigns]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const matchesStatus =
        activeStatus === "all" || campaign.status === activeStatus;
      if (!matchesStatus) return false;
      if (!term) return true;
      const haystack = [
        campaign.titleTh,
        campaign.titleEn,
        campaign.slug,
        campaign.series,
        campaign.categoryLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [activeStatus, campaigns, search]);

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (current.size === filtered.length) return new Set();
      return new Set(filtered.map((campaign) => campaign.id));
    });
  }

  async function bulkArchive() {
    if (!selectedIds.size) return;
    const confirmed = window.confirm(
      `Archive ${selectedIds.size} selected pack${selectedIds.size === 1 ? "" : "s"}? Each one is hidden from the storefront and active admin lists but kept in the database for history.`,
    );
    if (!confirmed) return;
    setError(null);
    for (const id of selectedIds) {
      setPending(id);
      try {
        const response = await fetch(
          "/api/ynot/admin/campaigns/lifecycle",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId: id, action: "archive" }),
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(
            payload?.message || payload?.error || "Archive failed",
          );
        }
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Archive failed",
        );
        break;
      }
    }
    setPending(null);
    setSelectedIds(new Set());
    router.refresh();
  }

  async function archiveOne(id: string, title: string) {
    const confirmed = window.confirm(
      `Archive "${title}"?\n\nThis hides it from the storefront. You can restore archived packs via the admin lifecycle queue.`,
    );
    if (!confirmed) return;
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, action: "archive" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Archive failed");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Archive failed");
    } finally {
      setPending(null);
    }
  }

  async function runDelete(targets: YnotCampaign[]) {
    if (!targets.length) return;
    setError(null);
    for (const target of targets) {
      setPending(target.id);
      try {
        const response = await fetch("/api/ynot/admin/campaigns/lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: target.id, action: "delete" }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; message?: string }
            | null;
          throw new Error(payload?.message || payload?.error || "Delete failed");
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Delete failed");
        setPending(null);
        return;
      }
    }
    setPending(null);
    setSelectedIds(new Set());
    setDeleteTarget(null);
    router.refresh();
  }

  const allChecked = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <section className="admin-pack-table">
      <header className="admin-pack-table-head">
        <div className="admin-pack-table-title-row">
          <div>
            <span className="section-label">All packs</span>
            <h3 className="title-m">{campaigns.length} total</h3>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search packs by title, slug, series…"
            className="admin-pack-table-search"
            aria-label="Search packs"
          />
        </div>
        <nav className="admin-pack-table-tabs" aria-label="Status filter">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`admin-pack-table-tab${activeStatus === tab.key ? " is-active" : ""}`}
              onClick={() => setActiveStatus(tab.key)}
            >
              <span>{tab.label}</span>
              <span className="admin-pack-table-tab-count">
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <p className="admin-pack-table-error" role="alert">
          {error}
        </p>
      )}

      {selectedIds.size > 0 && (
        <div className="admin-pack-table-bulkbar" role="status">
          <span>
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            className="admin-pack-table-bulk-action"
            onClick={bulkArchive}
            disabled={pending !== null}
          >
            Archive selected
          </button>
          <button
            type="button"
            className="admin-pack-table-bulk-action admin-pack-table-bulk-action-danger"
            onClick={() => {
              const targets = campaigns.filter((campaign) =>
                selectedIds.has(campaign.id),
              );
              if (targets.length) {
                setDeleteTarget({ mode: "bulk", campaigns: targets });
              }
            }}
            disabled={pending !== null}
          >
            Delete selected
          </button>
          <button
            type="button"
            className="admin-pack-table-bulk-action admin-pack-table-bulk-clear"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <div className="admin-pack-table-scroll">
        <table className="admin-pack-table-grid">
          <thead>
            <tr>
              <th className="admin-pack-table-checkbox-col">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleSelectAll}
                  aria-label="Select all packs"
                />
              </th>
              <th>Pack</th>
              <th>Series</th>
              <th>Status</th>
              <th>Price</th>
              <th>Slots</th>
              <th>Order</th>
              <th className="admin-pack-table-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="admin-pack-table-empty">
                  No packs match this view.
                </td>
              </tr>
            )}
            {filtered.map((campaign) => {
              const checked = selectedIds.has(campaign.id);
              const isPending = pending === campaign.id;
              return (
                <tr
                  key={campaign.id}
                  className={`admin-pack-table-row${checked ? " is-selected" : ""}${isPending ? " is-pending" : ""}`}
                >
                  <td className="admin-pack-table-checkbox-col">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(campaign.id)}
                      aria-label={`Select ${campaign.titleEn || campaign.titleTh}`}
                    />
                  </td>
                  <td>
                    <a
                      href={`/gacha/${campaign.slug}`}
                      className="admin-pack-table-title-link"
                    >
                      {campaign.titleTh || campaign.titleEn}
                    </a>
                    <span className="admin-pack-table-slug">
                      /{campaign.slug}
                    </span>
                  </td>
                  <td>
                    <span className="admin-pack-table-series">
                      {campaign.series === "pokemon" ? "Pokemon" : "One Piece"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`admin-pack-table-status admin-pack-table-status-${campaign.status}`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td>{campaign.costCoins}</td>
                  <td>{campaign.totalSlots}</td>
                  <td>{campaign.sortOrder ?? "—"}</td>
                  <td className="admin-pack-table-actions-col">
                    <a
                      href={`/gacha/${campaign.slug}`}
                      className="admin-pack-table-action"
                    >
                      View
                    </a>
                    {campaign.status === "draft" && (
                      <>
                        <button
                          type="button"
                          className="admin-pack-table-action"
                          onClick={() => setEditingCampaign(campaign)}
                          title="Quick edit campaign fields"
                        >
                          Quick edit
                        </button>
                        <a
                          href={`/admin/campaigns/${campaign.id}/edit`}
                          className="admin-pack-table-action"
                          title="Full editor (prize list + every field)"
                        >
                          Edit all
                        </a>
                      </>
                    )}
                    {campaign.status !== "archived" && (
                      <button
                        type="button"
                        className="admin-pack-table-action admin-pack-table-action-danger"
                        onClick={() =>
                          archiveOne(
                            campaign.id,
                            campaign.titleEn || campaign.titleTh,
                          )
                        }
                        disabled={isPending}
                      >
                        {isPending ? "…" : "Archive"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-pack-table-action admin-pack-table-action-delete"
                      onClick={() =>
                        setDeleteTarget({ mode: "single", campaign })
                      }
                      disabled={isPending}
                      title="Permanently remove this pack from admin and storefront. Customer card history stays in the database."
                    >
                      {isPending ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {deleteTarget && (
        <DeletePackConfirmModal
          target={deleteTarget}
          pending={pending !== null}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() =>
            runDelete(
              deleteTarget.mode === "single"
                ? [deleteTarget.campaign]
                : deleteTarget.campaigns,
            )
          }
        />
      )}
      {editingCampaign && (
        <EditCampaignModal
          campaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onSaved={() => {
            setEditingCampaign(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function DeletePackConfirmModal({
  target,
  pending,
  onCancel,
  onConfirm,
}: {
  target:
    | { mode: "single"; campaign: YnotCampaign }
    | { mode: "bulk"; campaigns: YnotCampaign[] };
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isBulk = target.mode === "bulk";
  const campaigns = isBulk ? target.campaigns : [target.campaign];
  const expectedPhrase = isBulk ? `delete ${campaigns.length} packs` : campaigns[0].slug;
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === expectedPhrase;
  const liveCount = campaigns.filter((c) => c.status === "live").length;
  const closedCount = campaigns.filter((c) => c.status === "closed").length;

  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-pack-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div className="admin-modal admin-modal-danger" role="document">
        <header className="admin-modal-head">
          <h2 id="delete-pack-title" className="admin-modal-title">
            {isBulk
              ? `Delete ${campaigns.length} packs permanently?`
              : `Delete "${target.campaign.titleEn || target.campaign.titleTh}" permanently?`}
          </h2>
          <p className="admin-modal-subtitle">
            This removes the pack from the admin list and the storefront. Customer card history, orders, and rankings stay intact in the database. The pack cannot be restored from the lifecycle queue.
          </p>
        </header>
        {(liveCount > 0 || closedCount > 0) && (
          <ul className="admin-modal-warning-list">
            {liveCount > 0 && (
              <li>
                <strong>{liveCount}</strong> pack{liveCount === 1 ? " is" : "s are"} currently live — customers will lose access immediately.
              </li>
            )}
            {closedCount > 0 && (
              <li>
                <strong>{closedCount}</strong> closed pack{closedCount === 1 ? "" : "s"} may have customer opens — their cards stay but the pack page is gone.
              </li>
            )}
          </ul>
        )}
        {isBulk && (
          <ol className="admin-modal-target-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <span>{c.titleEn || c.titleTh}</span>
                <span className="mono admin-modal-target-slug">/{c.slug}</span>
              </li>
            ))}
          </ol>
        )}
        <label className="admin-modal-confirm-row">
          <span>
            Type <code>{expectedPhrase}</code> to confirm
          </span>
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={pending}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="admin-modal-confirm-input"
            placeholder={expectedPhrase}
          />
        </label>
        <footer className="admin-modal-foot">
          <button
            type="button"
            className="admin-modal-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-modal-primary admin-modal-primary-danger"
            onClick={onConfirm}
            disabled={!matches || pending}
          >
            {pending ? "Deleting…" : isBulk ? `Delete ${campaigns.length} packs` : "Delete pack"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function EditCampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: YnotCampaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(campaign.slug);
  const [titleTh, setTitleTh] = useState(campaign.titleTh);
  const [titleEn, setTitleEn] = useState(campaign.titleEn);
  const [priceThb, setPriceThb] = useState(campaign.priceThb);
  const [costCoins, setCostCoins] = useState(campaign.costCoins);
  const [totalSlots, setTotalSlots] = useState(campaign.totalSlots);
  const [series, setSeries] = useState<"one_piece" | "pokemon">(campaign.series);
  const [mode, setMode] = useState<"instant_gacha" | "slot_pick">(campaign.mode);
  const [sortOrder, setSortOrder] = useState<number>(campaign.sortOrder ?? 100);
  const [isTest, setIsTest] = useState<boolean>(Boolean(campaign.isTest));
  const [displayTags, setDisplayTags] = useState<string[]>(
    normalizeCustomerTags(campaign.displayTags, campaign.series),
  );
  const [openQuantityOptions, setOpenQuantityOptions] = useState<number[]>(
    normalizeOpenQuantityOptions(campaign.openQuantityOptions),
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setDisplayTags((current) => {
      if (current.includes(tag)) {
        return current.filter((existing) => existing !== tag);
      }
      if (current.length >= 4) return current;
      return [...current, tag];
    });
  }

  function toggleOpenOption(option: number) {
    setOpenQuantityOptions((current) => {
      const normalized = normalizeOpenQuantityOptions(current);
      if (normalized.includes(option)) {
        const next = normalized.filter((existing) => existing !== option);
        return next.length ? next : normalized;
      }
      return normalizeOpenQuantityOptions([...normalized, option]);
    });
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          slug,
          titleTh,
          titleEn,
          priceThb,
          costCoins,
          totalSlots,
          series,
          mode,
          sortOrder,
          isTest,
          displayTags,
          openQuantityOptions,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.message || payload?.error || "Update failed");
      }
      onSaved();
    } catch (caught) {
      setErrorMsg(caught instanceof Error ? caught.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="admin-edit-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="admin-edit-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit pack"
      >
        <header className="admin-edit-modal-head">
          <h3>Edit pack</h3>
          <button
            type="button"
            className="admin-edit-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="admin-edit-modal-body">
          <label className="admin-edit-field">
            <span>Slug (URL)</span>
            <input
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="e.g. one-piece-wano-arc"
            />
          </label>
          <label className="admin-edit-field">
            <span>Thai title</span>
            <input
              type="text"
              value={titleTh}
              onChange={(event) => setTitleTh(event.target.value)}
            />
          </label>
          <label className="admin-edit-field">
            <span>English title</span>
            <input
              type="text"
              value={titleEn}
              onChange={(event) => setTitleEn(event.target.value)}
            />
          </label>
          <div className="admin-edit-row admin-edit-row-2">
            <label className="admin-edit-field">
              <span>Series</span>
              <select
                value={series}
                onChange={(event) =>
                  setSeries(event.target.value as "one_piece" | "pokemon")
                }
              >
                <option value="pokemon">Pokemon</option>
                <option value="one_piece">One Piece</option>
              </select>
            </label>
            <label className="admin-edit-field">
              <span>Open mode</span>
              <select
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "instant_gacha" | "slot_pick")
                }
              >
                <option value="instant_gacha">Instant gacha</option>
                <option value="slot_pick">Slot pick</option>
              </select>
            </label>
          </div>
          <div className="admin-edit-row">
            <label className="admin-edit-field">
              <span>Price (THB)</span>
              <input
                type="number"
                min={1}
                value={priceThb}
                onChange={(event) =>
                  setPriceThb(Math.max(1, Number(event.target.value) || 0))
                }
              />
            </label>
            <label className="admin-edit-field">
              <span>Cost (coins)</span>
              <input
                type="number"
                min={1}
                value={costCoins}
                onChange={(event) =>
                  setCostCoins(Math.max(1, Number(event.target.value) || 0))
                }
              />
            </label>
            <label className="admin-edit-field">
              <span>Total slots</span>
              <input
                type="number"
                min={1}
                value={totalSlots}
                onChange={(event) =>
                  setTotalSlots(Math.max(1, Number(event.target.value) || 0))
                }
              />
            </label>
          </div>
          <label className="admin-edit-field">
            <span>Sort order (lower = first on storefront)</span>
            <input
              type="number"
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(Number(event.target.value) || 0)
              }
            />
          </label>
          <div className="admin-edit-field">
            <span>Customer card tags (max 4)</span>
            <div className="admin-edit-chip-row">
              {customerTagOptions.map((tag) => {
                const active = displayTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`admin-edit-chip${active ? " is-active" : ""}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="admin-edit-field">
            <span>Open buttons (customer-facing batch options)</span>
            <div className="admin-edit-chip-row">
              {[1, 5, 10, 100].map((option) => {
                const active = openQuantityOptions.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    className={`admin-edit-chip${active ? " is-active" : ""}`}
                    onClick={() => toggleOpenOption(option)}
                  >
                    Open {option}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="admin-edit-checkbox">
            <input
              type="checkbox"
              checked={isTest}
              onChange={(event) => setIsTest(event.target.checked)}
            />
            <span>Production test pack (hidden from normal customer browsing)</span>
          </label>
          {errorMsg && <p className="admin-edit-error">{errorMsg}</p>}
        </div>
        <footer className="admin-edit-modal-foot">
          <button
            type="button"
            className="admin-pack-table-action"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-pack-table-action admin-edit-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}
