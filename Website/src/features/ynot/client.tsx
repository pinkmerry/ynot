"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CardCatalogItem, ProfileInfo } from "@/lib/lucky-draw/types";
import type { Database } from "@/lib/supabase/types";
import type {
  YnotAddress,
  YnotApprovalStatus,
  YnotCampaign,
  YnotCategory,
  YnotCollectionItem,
  YnotGachaOpenResult,
  YnotOwnerApprovalRequest,
  YnotPaymentMethod,
  YnotPrizePoolItem,
  YnotPrizePreview,
  YnotRandomLogicMode,
  YnotShippingRequest,
  YnotTierAnimation,
} from "./types";
import type { YnotViewer } from "./types";
import { AdminFrame } from "./admin/Shell";
import { AdminIcon } from "./admin/Icon";
import { AdminCardOptionSelect } from "./admin/AdminCardOptionSelect";
import { AdminSearchableSelect } from "./admin/AdminSearchableSelect";
import { GachaRevealOverlay } from "./GachaRevealOverlay";
import {
  adminCardDuplicateUsage,
  findAdminCardDuplicate,
  type AdminCardCatalogSortMode,
  type AdminCardDuplicateUsage,
  type AdminCardSeriesFilter,
} from "./admin-card-catalog-helpers";
import {
  allowedOpenQuantityOptions,
  normalizeOpenQuantityOptions,
} from "./open-quantity";
import {
  buildPrizeStockShortages,
  stockShortageBlockers,
  type PrizeStockSummary,
} from "./stock-readiness";
import {
  stockSkuGroups,
  stockSkuPackUsageByGroup,
  stockUnitSelectionMetadata,
  type StockSkuGroup,
  type StockSkuPackUsage,
} from "./stock-sku-usage";
import {
  catalogCategoryForPrizeCategory,
  prizeCategoryLabel,
  prizeCategoryForCatalogCategory,
  isRandomPsa10PrizeCard,
  prizeSourceType,
  type PrizeCategory,
} from "./prize-category";
import {
  cardConditionLabel,
  cardConditionOptions,
  cardGradeOptions,
  cardLanguageLabel,
  catalogCategoryLabel,
  catalogCategoryOptions,
  catalogCategoryValue,
  gradingServiceLabel,
  gradingServiceOptions,
  type CardCondition,
  type CatalogCategory,
  type GradingService,
} from "./card-catalog-metadata";
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
import { topUpPackages } from "./top-up-packages";

export class AdminRequestError extends Error {
  code?: string;
  detail?: string | null;
  blockers?: string[];
  payload?: unknown;
  status: number;

  constructor(
    message: string,
    options: {
      blockers?: string[];
      code?: string;
      detail?: string | null;
      payload?: unknown;
      status: number;
    },
  ) {
    super(message);
    this.name = "AdminRequestError";
    this.blockers = options.blockers;
    this.code = options.code;
    this.detail = options.detail;
    this.payload = options.payload;
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
    stringValue(payload.message) ||
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
      payload,
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

type AdminCardImageUpload = {
  imageUrl: string;
  storagePath: string;
};

async function uploadAdminCardImage(
  file: File,
  details: { code?: string; name?: string },
): Promise<AdminCardImageUpload> {
  const form = new FormData();
  form.set("file", file);
  if (details.code) form.set("code", details.code);
  if (details.name) form.set("name", details.name);

  const response = await fetch("/api/ynot/admin/cards/image", {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminRequestError(requestErrorMessage(payload), {
      code: isRecord(payload) ? stringValue(payload.code) || undefined : undefined,
      payload,
      status: response.status,
    });
  }
  if (
    !isRecord(payload) ||
    !stringValue(payload.imageUrl) ||
    !stringValue(payload.storagePath)
  ) {
    throw new Error("Upload response did not include an image URL.");
  }
  return {
    imageUrl: stringValue(payload.imageUrl),
    storagePath: stringValue(payload.storagePath),
  };
}

async function uploadAdminPaymentQrImage(
  file: File,
  details: { code?: string; displayName?: string },
): Promise<AdminCardImageUpload> {
  const form = new FormData();
  form.set("file", file);
  if (details.code) form.set("code", details.code);
  if (details.displayName) form.set("displayName", details.displayName);

  const response = await fetch("/api/ynot/admin/payment-methods/qr-image", {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminRequestError(requestErrorMessage(payload), {
      code: isRecord(payload) ? stringValue(payload.code) || undefined : undefined,
      payload,
      status: response.status,
    });
  }
  if (
    !isRecord(payload) ||
    !stringValue(payload.imageUrl) ||
    !stringValue(payload.storagePath)
  ) {
    throw new Error("Upload response did not include a QR image URL.");
  }
  return {
    imageUrl: stringValue(payload.imageUrl),
    storagePath: stringValue(payload.storagePath),
  };
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
        {required && "\u00A0*"}
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
  const selected = topUpPackages[packageIndex] ?? topUpPackages[0];
  const selectedMethod =
    paymentMethods.find((method) => method.id === paymentMethodId) ??
    paymentMethods[0] ??
    null;
  const blocked = !paymentMethods.length || !selectedMethod;

  function copyValue(label: string, value: string | null | undefined) {
    const clean = value?.trim();
    if (!clean) return;
    void navigator.clipboard?.writeText(clean).catch(() => undefined);
    setMessage(`${label} copied.`);
  }

  function submit() {
    startTransition(async () => {
      try {
        setMessage("");
        if (!selectedMethod) throw new Error("Choose a payment method first.");
        if (!slip) throw new Error("Upload your bank/QR transfer slip first.");
        const form = new FormData();
        form.set("paymentMethodId", selectedMethod.id);
        form.set("packageId", selected.id);
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
        Manual bank transfer slip upload stays first. Admin confirms
        before coins are credited.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {topUpPackages.map((pkg, index) => (
          <button
            key={pkg.id}
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
      <div className="mt-4">
        <p className="text-sm font-bold">Payment method</p>
        {paymentMethods.length ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {paymentMethods.map((method) => {
              const active = method.id === selectedMethod?.id;
              return (
                <button
                  className={`${active ? "gold-button" : "plain-button"} rounded-2xl px-4 py-3 text-left text-sm font-black`}
                  key={method.id}
                  onClick={() => setPaymentMethodId(method.id)}
                  type="button"
                >
                  <span className="block">
                    {method.type === "promptpay_qr"
                      ? "PromptPay QR"
                      : "Bank Transfer"}
                  </span>
                  <span className="mt-1 block text-xs font-bold opacity-75">
                    {method.displayName}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-[var(--muted)]">
            No active bank transfer method is configured yet. Admin must add
            one before customers can submit a top-up.
          </div>
        )}
      </div>
      {selectedMethod && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[var(--gold)]">
                {selectedMethod.displayName}
              </p>
              <p className="mt-1 text-xs font-bold opacity-75">
                Pay ฿{selected.amountThb.toLocaleString()} for{" "}
                {selected.coins.toLocaleString()} coins
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black">
              {selectedMethod.type === "promptpay_qr"
                ? "PromptPay"
                : "Bank Transfer"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            {selectedMethod.bankName && (
              <p>
                <span className="font-bold opacity-70">Bank:</span>{" "}
                {selectedMethod.bankName}
              </p>
            )}
            {selectedMethod.accountName && (
              <p>
                <span className="font-bold opacity-70">Account:</span>{" "}
                {selectedMethod.accountName}
              </p>
            )}
            {selectedMethod.accountNumber && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-black">
                  {selectedMethod.accountNumber}
                </span>
                <button
                  className="plain-button rounded-xl px-3 py-1 text-xs font-black"
                  onClick={() =>
                    copyValue("Account number", selectedMethod.accountNumber)
                  }
                  type="button"
                >
                  Copy
                </button>
              </div>
            )}
            {selectedMethod.type === "promptpay_qr" &&
              selectedMethod.promptpayId && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-black">
                    {selectedMethod.promptpayId}
                  </span>
                  <button
                    className="plain-button rounded-xl px-3 py-1 text-xs font-black"
                    onClick={() =>
                      copyValue("PromptPay ID", selectedMethod.promptpayId)
                    }
                    type="button"
                  >
                    Copy
                  </button>
                </div>
              )}
            {selectedMethod.qrImagePath &&
              /^(https?:)?\/\//.test(selectedMethod.qrImagePath) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`${selectedMethod.displayName} QR`}
                  className="mt-2 max-w-48 rounded-2xl border border-white/10"
                  src={selectedMethod.qrImagePath}
                />
              )}
            {selectedMethod.instructions && (
              <p className="text-xs font-bold text-[var(--muted)]">
                {selectedMethod.instructions}
              </p>
            )}
          </div>
        </div>
      )}
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
        disabled={isPending || blocked}
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
  autoStart = false,
  immersive = false,
}: {
  campaign: YnotCampaign;
  authenticated: boolean;
  initialQuantity?: number;
  tierAnimations?: YnotTierAnimation[];
  /** When true, immediately fire the open API on mount (no second confirm
   *  screen). Used when the user just confirmed in the Y-Pack flow and
   *  expects the reveal animation to play right away. */
  autoStart?: boolean;
  immersive?: boolean;
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
  const [revealRunId, setRevealRunId] = useState(0);
  const [openingOverlayVisible, setOpeningOverlayVisible] = useState(autoStart);
  const [, startTransition] = useTransition();
  const remainingOpenUnits = Math.min(
    campaign.remainingSlots ?? Number.POSITIVE_INFINITY,
    campaign.availablePrizeUnits ?? Number.POSITIVE_INFINITY,
  );

  function quantityDisabled(option: number) {
    return Number.isFinite(remainingOpenUnits) && option > remainingOpenUnits;
  }

  function fireOpen(targetQuantity: number) {
    setRevealRunId((current) => current + 1);
    startTransition(async () => {
      try {
        setMessage("");
        const payload = await postJson("/api/ynot/gacha/open", {
          campaignId: campaign.slug,
          quantity: targetQuantity,
          idempotencyKey: crypto.randomUUID(),
        });
        const result = (payload?.result ?? null) as YnotGachaOpenResult | null;
        if (result && Array.isArray(result.items)) {
          setRevealResult(result);
        } else {
          setOpeningOverlayVisible(false);
          setMessage("Open succeeded but no items were returned.");
        }
      } catch (error) {
        setOpeningOverlayVisible(false);
        setMessage(
          error instanceof Error ? error.message : "Could not open gacha.",
        );
      }
    });
  }

  function openAgain(nextQuantity: number) {
    setQuantity(nextQuantity);
    setMessage("");
    setOpeningOverlayVisible(true);
    setRevealResult(null);
    fireOpen(nextQuantity);
  }

  function handleRevealClose() {
    setOpeningOverlayVisible(false);
    setRevealResult(null);
    router.push("/collection");
  }

  const handleRevealFinish = useCallback(() => {
    const detailHref = `/packs/${campaign.slug}`;
    setOpeningOverlayVisible(true);
    setRevealResult(null);
    router.replace(detailHref);
    window.setTimeout(() => {
      if (window.location.pathname !== detailHref) {
        window.location.replace(detailHref);
      }
    }, 900);
  }, [campaign.slug, router]);

  // Auto-start: when the user already confirmed quantity + cost on the
  // previous page (the Y-Pack confirm modal), skip the second "START PULL"
  // screen and fire the open immediately so the animation plays. We use a
  // ref so the effect can't double-fire under React strict mode or
  // re-renders that change unrelated state.
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (autoStartFiredRef.current) return;
    if (!autoStart) return;
    if (!authenticated) return;
    if (campaign.demo || !campaign.openable) return;
    if (quantityDisabled(initialOption)) return;
    const timer = window.setTimeout(() => {
      if (autoStartFiredRef.current) return;
      autoStartFiredRef.current = true;
      fireOpen(initialOption);
    }, 0);
    return () => window.clearTimeout(timer);
    // initialOption captures the qty from the URL once on mount — that's the
    // value we want, not a possibly stale closure on `quantity`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAgainOptions = openQuantityOptions.map((option) => ({
    quantity: option,
    disabled: quantityDisabled(option),
    costCoins: campaign.costCoins * option,
  }));

  const revealOverlay = revealResult ? (
    <GachaRevealOverlay
      key={`${revealResult.openId}-${revealRunId}`}
      result={revealResult}
      quantity={quantity}
      tierAnimations={tierAnimations}
      forceAnimation={autoStart || openingOverlayVisible}
      onClose={handleRevealClose}
      onFinish={handleRevealFinish}
      onOpenAgain={openAgain}
      openAgainOptions={openAgainOptions}
    />
  ) : null;

  const pendingOverlay =
    openingOverlayVisible && !revealResult ? (
      <div
        className="gacha-auto-open-overlay"
        role="status"
        aria-live="polite"
        aria-label="Opening pack"
      >
        <div className="gacha-auto-open-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    ) : null;
  const errorPanel =
    message && !revealResult && !openingOverlayVisible ? (
      <div className="gacha-open-error-panel" role="alert">
        <p className="gacha-open-error-eyebrow">Open stopped</p>
        <h2>Could not open this pull</h2>
        <p>{message}</p>
        <div className="gacha-open-error-actions">
          <Link
            className="gacha-open-error-action is-primary"
            href={`/packs/${campaign.slug}`}
          >
            Back to pack detail
          </Link>
          <Link className="gacha-open-error-action" href="/wallet">
            Top up coins
          </Link>
        </div>
      </div>
    ) : null;

  return (
    <div
      className="gacha-open-immersive-host"
      data-open-mode={immersive ? "immersive" : "embedded"}
    >
      {revealOverlay}
      {pendingOverlay}
      {errorPanel}
    </div>
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

function formatShortDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return `${date.getFullYear()}/${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}`;
}

function formatCollectionGradeLabel(item: YnotCollectionItem) {
  if (item.cardGrade && item.cardGrade !== "Ungraded") return item.cardGrade;
  const category = item.cardPrizeCategory ?? "";
  if (category === "psa10_card") return "PSA10";
  if (category === "sealed_product") return "Sealed";
  if (category === "electronics") return "Tech";
  return null;
}

const SHIPPING_REQUEST_MIN_COINS = 1000;

export function CollectionConvertPanel({
  collection,
  addresses = [],
  prefilterOpenId,
  autoConvertOnLoad,
}: {
  collection: YnotCollectionItem[];
  addresses?: YnotAddress[];
  prefilterOpenId?: string | null;
  autoConvertOnLoad?: boolean;
}) {
  const router = useRouter();
  const ownedItems = useMemo(
    () => collection.filter((item) => item.status === "owned"),
    [collection],
  );
  const ownedIds = useMemo(() => ownedItems.map((item) => item.id), [ownedItems]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [showShippingConfirm, setShowShippingConfirm] = useState(false);
  const [currentTimeMs] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  function isCompleteShippingAddress(address?: YnotAddress) {
    return Boolean(
      address?.recipientName?.trim() &&
        address.phone?.trim() &&
        address.addressLine1?.trim() &&
        address.district?.trim() &&
        address.province?.trim() &&
        address.postalCode?.trim(),
    );
  }

  // When the user clicks "Convert to coins" on the pack-open reveal screen,
  // we land here with ?from=<openId>&action=convert. Auto-select the cards
  // pulled in that open so the confirm modal can pop right away.
  useEffect(() => {
    if (!prefilterOpenId || !autoConvertOnLoad) return;
    // Source-open item mapping is not available in the collection rows yet.
  }, [autoConvertOnLoad, prefilterOpenId]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(ownedIds));
  }
  function reset() {
    setSelected(new Set());
  }

  const selectedItems = useMemo(
    () => ownedItems.filter((item) => selected.has(item.id)),
    [ownedItems, selected],
  );
  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === addressId),
    [addresses, addressId],
  );
  const selectedConvertableItems = useMemo(
    () =>
      selectedItems.filter(
        (item) =>
          (item.convertCoinValue ?? 0) > 0 &&
          (!item.convertExpiresAt ||
            new Date(item.convertExpiresAt).valueOf() > currentTimeMs),
      ),
    [currentTimeMs, selectedItems],
  );
  const selectedTotalCoins = selectedConvertableItems.reduce(
    (sum, item) => sum + (item.convertCoinValue ?? 0),
    0,
  );
  const canConvert =
    !isPending &&
    selectedConvertableItems.length > 0 &&
    selectedConvertableItems.length === selectedItems.length;
  const canShip =
    !isPending &&
    selectedItems.length > 0 &&
    isCompleteShippingAddress(selectedAddress) &&
    selectedTotalCoins >= SHIPPING_REQUEST_MIN_COINS;

  function submitConvert() {
    startTransition(async () => {
      try {
        setMessage(null);
        setShowConvertConfirm(false);
        if (!selectedConvertableItems.length) {
          throw new Error("Pick at least one convertible card.");
        }
        const payload = await postJson("/api/ynot/collection/convert", {
          collectionItemIds: selectedConvertableItems.map((item) => item.id),
          idempotencyKey: crypto.randomUUID(),
        });
        const totalCoins = Number(payload?.result?.totalCoins ?? 0);
        setMessage({
          tone: "success",
          text: `Converted ${selectedConvertableItems.length} card${
            selectedConvertableItems.length === 1 ? "" : "s"
          } for ${totalCoins.toLocaleString()} coins.`,
        });
        setSelected(new Set());
        router.refresh();
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Convert failed.",
        });
      }
    });
  }

  function submitShipping() {
    startTransition(async () => {
      try {
        setMessage(null);
        setShowShippingConfirm(false);
        if (!isCompleteShippingAddress(selectedAddress)) {
          throw new Error("Save and pick a complete shipping address first.");
        }
        if (!selectedItems.length) {
          throw new Error("Pick at least one card to ship.");
        }
        const payload = await postJson("/api/ynot/shipping", {
          collectionItemIds: selectedItems.map((item) => item.id),
          addressId,
          idempotencyKey: crypto.randomUUID(),
        });
        setMessage({
          tone: "success",
          text: `Shipping request ${payload.result?.publicCode ?? "created"}.`,
        });
        setSelected(new Set());
        router.refresh();
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Shipping request failed.",
        });
      }
    });
  }

  if (!ownedItems.length) {
    return (
      <section className="collection-convert-shell collection-convert-empty">
        <h3 className="collection-convert-empty-title">
          No real collection cards yet
        </h3>
        <p className="collection-convert-empty-body">
          Open a live pack first. Cards you pull will appear here with their
          convert-to-coin value and request deadline.
        </p>
      </section>
    );
  }

  return (
    <section className="collection-convert-shell" aria-label="Collection">
      <div className="collection-convert-list" role="list">
        {ownedItems.map((item) => {
          const isSelected = selected.has(item.id);
          const gradeLabel = formatCollectionGradeLabel(item);
          const expiryLabel = formatShortDate(item.convertExpiresAt);
          const expired =
            item.convertExpiresAt &&
            new Date(item.convertExpiresAt).valueOf() <= currentTimeMs;
          const coinValue = Math.max(0, Math.round(item.convertCoinValue ?? 0));
          const convertable = coinValue > 0 && !expired;
          return (
            <article
              key={item.id}
              role="listitem"
              className={`collection-convert-row${isSelected ? " is-selected" : ""}${
                convertable ? "" : " is-unconvertible"
              }`}
              onClick={() => toggle(item.id)}
            >
              <div className="collection-convert-row-thumb">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.cardName} loading="lazy" />
                ) : (
                  <span className="collection-convert-row-thumb-placeholder">
                    {(item.cardCode ?? "YN").toString().slice(0, 6).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="collection-convert-row-body">
                <div className="collection-convert-row-titles">
                  <h4 className="collection-convert-row-name">
                    {item.cardName}
                  </h4>
                  <div className="collection-convert-row-meta">
                    {gradeLabel ? (
                      <span className="collection-convert-grade-pill">
                        {gradeLabel}
                      </span>
                    ) : null}
                    {item.cardCode ? (
                      <span className="collection-convert-row-code">
                        {item.cardCode}
                      </span>
                    ) : (
                      <span className="collection-convert-row-code">
                        {item.serialNo ?? "Collection reward"}
                      </span>
                    )}
                  </div>
                  {item.sourceCampaignTitle ? (
                    <p className="collection-convert-row-source">
                      from {item.sourceCampaignTitle}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="collection-convert-row-side">
                <span
                  className={`collection-convert-row-checkbox${
                    isSelected ? " is-checked" : ""
                  }`}
                  aria-hidden="true"
                >
                  {isSelected ? "✓" : ""}
                </span>
                {convertable ? (
                  <span className="collection-convert-row-coin">
                    <span className="collection-convert-row-coin-dot" aria-hidden="true" />
                    <strong>{coinValue.toLocaleString()}</strong>
                    <small>coin</small>
                  </span>
                ) : (
                  <span className="collection-convert-row-coin is-muted">
                    <small>{expired ? "Expired" : "Not convertible"}</small>
                  </span>
                )}
                {expiryLabel && convertable ? (
                  <span className="collection-convert-row-deadline">
                    Convert by {expiryLabel}
                  </span>
                ) : null}
              </div>
              <input
                type="checkbox"
                checked={isSelected}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggle(item.id)}
                className="sr-only"
                aria-label={`Select ${item.cardName}`}
              />
            </article>
          );
        })}
      </div>

      {message ? (
        <p
          className={`collection-convert-message${
            message.tone === "success" ? " is-success" : " is-error"
          }`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      <div className="collection-convert-dock" role="region" aria-label="Collection actions">
        <div className="collection-convert-dock-meta">
          <div className="collection-convert-dock-count">
            <strong>Selecting {selectedItems.length} card{selectedItems.length === 1 ? "" : "s"}</strong>
            <span>
              <span className="collection-convert-dock-coin-dot" aria-hidden="true" />
              {selectedTotalCoins.toLocaleString()} coin
            </span>
          </div>
          <div className="collection-convert-dock-quick">
            <button
              type="button"
              className="collection-convert-dock-link"
              onClick={selectAll}
              disabled={isPending}
            >
              Select all
            </button>
            <button
              type="button"
              className="collection-convert-dock-link"
              onClick={reset}
              disabled={isPending || selectedItems.length === 0}
            >
              Reset
            </button>
          </div>
        </div>
        {addresses.length ? (
          <select
            className="collection-convert-dock-address"
            value={addressId}
            onChange={(event) => setAddressId(event.target.value)}
            disabled={isPending}
          >
            {addresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.label} · {address.addressLine1}
              </option>
            ))}
          </select>
        ) : null}
        <div className="collection-convert-dock-actions">
          <button
            type="button"
            className="collection-convert-dock-button is-ghost"
            disabled={!canConvert}
            onClick={() => setShowConvertConfirm(true)}
          >
            Convert to Coins
          </button>
          <button
            type="button"
            className="collection-convert-dock-button is-primary"
            disabled={!canShip}
            onClick={() => setShowShippingConfirm(true)}
          >
            Shipping Request
          </button>
        </div>
        <p className="collection-convert-dock-foot">
          Shipping requires a complete saved address and{" "}
          {SHIPPING_REQUEST_MIN_COINS.toLocaleString()} coins or more in selected
          reward value.
        </p>
      </div>

      {showConvertConfirm ? (
        <div
          className="collection-convert-modal-backdrop"
          role="presentation"
          onClick={() => setShowConvertConfirm(false)}
        >
          <div
            className="collection-convert-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm convert"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="collection-convert-modal-head">
              <h3>Convert to coins?</h3>
              <button
                type="button"
                className="collection-convert-modal-close"
                onClick={() => setShowConvertConfirm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="collection-convert-modal-body">
              <p>
                You will receive{" "}
                <strong>{selectedTotalCoins.toLocaleString()} coins</strong> for{" "}
                <strong>
                  {selectedConvertableItems.length} card
                  {selectedConvertableItems.length === 1 ? "" : "s"}
                </strong>
                .
              </p>
              <p className="collection-convert-modal-warn">
                Selected cards will be removed from your collection. This cannot
                be undone.
              </p>
            </div>
            <footer className="collection-convert-modal-foot">
              <button
                type="button"
                className="collection-convert-modal-button is-ghost"
                onClick={() => setShowConvertConfirm(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="collection-convert-modal-button is-primary"
                onClick={submitConvert}
                disabled={isPending}
                autoFocus
              >
                {isPending ? "Converting…" : "Yes, convert"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {showShippingConfirm ? (
        <div
          className="collection-convert-modal-backdrop"
          role="presentation"
          onClick={() => setShowShippingConfirm(false)}
        >
          <div
            className="collection-convert-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm shipping request"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="collection-convert-modal-head">
              <h3>Request shipping?</h3>
              <button
                type="button"
                className="collection-convert-modal-close"
                onClick={() => setShowShippingConfirm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="collection-convert-modal-body">
              <p>
                This reward will be locked for fulfilment and cannot be
                converted while the shipping request is active.
              </p>
              <p>
                <strong>
                  {selectedItems.length} card
                  {selectedItems.length === 1 ? "" : "s"}
                </strong>{" "}
                will be sent to{" "}
                <strong>{selectedAddress?.recipientName ?? "your address"}</strong>.
              </p>
              <p className="collection-convert-modal-warn">
                Ship to:{" "}
                {selectedAddress
                  ? [
                      selectedAddress.addressLine1,
                      selectedAddress.district,
                      selectedAddress.province,
                      selectedAddress.postalCode,
                    ]
                      .filter(Boolean)
                      .join(" | ")
                  : "No complete address selected"}
              </p>
            </div>
            <footer className="collection-convert-modal-foot">
              <button
                type="button"
                className="collection-convert-modal-button is-ghost"
                onClick={() => setShowShippingConfirm(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="collection-convert-modal-button is-primary"
                onClick={submitShipping}
                disabled={isPending}
                autoFocus
              >
                {isPending ? "Requesting…" : "Yes, request shipping"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
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

export function AdminPaymentMethodForm({
  paymentMethods = [],
}: {
  paymentMethods?: YnotPaymentMethod[];
}) {
  const [code, setCode] = useState("bank-transfer");
  const [displayName, setDisplayName] = useState("Bank Transfer");
  const [type, setType] = useState<"bank_transfer" | "promptpay_qr">(
    "bank_transfer",
  );
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [promptpayId, setPromptpayId] = useState("");
  const [qrImagePath, setQrImagePath] = useState("");
  const [qrImageFile, setQrImageFile] = useState<File | null>(null);
  const [qrImagePreviewUrl, setQrImagePreviewUrl] = useState("");
  const qrImagePreviewObjectUrlRef = useRef<string | null>(null);
  const [sortOrder, setSortOrder] = useState(10);
  const [isActive, setIsActive] = useState(true);
  const [instructions, setInstructions] = useState(
    "Transfer manually and upload slip for admin review.",
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (qrImagePreviewObjectUrlRef.current) {
        URL.revokeObjectURL(qrImagePreviewObjectUrlRef.current);
      }
    };
  }, []);

  function replaceQrImagePreviewUrl(nextUrl: string, objectUrl = false) {
    if (qrImagePreviewObjectUrlRef.current) {
      URL.revokeObjectURL(qrImagePreviewObjectUrlRef.current);
      qrImagePreviewObjectUrlRef.current = null;
    }
    if (objectUrl) qrImagePreviewObjectUrlRef.current = nextUrl;
    setQrImagePreviewUrl(nextUrl);
  }

  function applyPaymentPreset(nextType: "bank_transfer" | "promptpay_qr") {
    setType(nextType);
    setCode(nextType === "promptpay_qr" ? "promptpay-qr" : "bank-transfer");
    setDisplayName(nextType === "promptpay_qr" ? "PromptPay QR" : "Bank Transfer");
    setSortOrder(nextType === "promptpay_qr" ? 20 : 10);
  }

  function loadMethod(method: YnotPaymentMethod) {
    setCode(method.code ?? "bank-transfer");
    setDisplayName(method.displayName);
    setType(method.type);
    setBankName(method.bankName ?? "");
    setAccountName(method.accountName ?? "");
    setAccountNumber(method.accountNumber ?? "");
    setPromptpayId(method.promptpayId ?? "");
    setQrImagePath(method.qrImagePath ?? "");
    setQrImageFile(null);
    replaceQrImagePreviewUrl(method.qrImagePath ?? "");
    setInstructions(method.instructions ?? "");
    setIsActive(method.isActive !== false);
  }

  function submit() {
    startTransition(async () => {
      try {
        let nextQrImagePath = qrImagePath.trim();
        if (qrImageFile) {
          const uploaded = await uploadAdminPaymentQrImage(qrImageFile, {
            code,
            displayName,
          });
          nextQrImagePath = uploaded.imageUrl;
          setQrImagePath(uploaded.imageUrl);
          replaceQrImagePreviewUrl(uploaded.imageUrl);
        }
        await postJson("/api/ynot/admin/payment-methods", {
          code,
          displayName,
          type,
          bankName,
          accountName,
          accountNumber,
          promptpayId,
          qrImagePath: nextQrImagePath,
          sortOrder,
          instructions,
          isActive,
        });
        setQrImageFile(null);
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
          Manage the bank transfer details customers see before uploading a
          transfer slip.
        </p>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          className="plain-button rounded-xl px-3 py-2 text-xs font-black"
          onClick={() => applyPaymentPreset("bank_transfer")}
          type="button"
        >
          Bank Transfer
        </button>
        <button
          className="plain-button rounded-xl px-3 py-2 text-xs font-black"
          onClick={() => applyPaymentPreset("promptpay_qr")}
          type="button"
        >
          PromptPay QR
        </button>
      </div>
      {paymentMethods.length > 0 && (
        <div className="mb-3 grid gap-2">
          {paymentMethods.map((method) => (
            <button
              className="plain-button rounded-xl px-3 py-2 text-left text-xs font-black"
              key={method.id}
              onClick={() => loadMethod(method)}
              type="button"
            >
              Edit {method.displayName} · {method.type.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      )}
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
          <option value="bank_transfer">Bank Transfer</option>
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
        <input
          className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
          placeholder="Sort order"
          type="number"
        />
      </div>
      <div className="mt-3">
        <AdminQrImageDropzone
          disabled={isPending}
          imageFile={qrImageFile}
          imageUrl={qrImagePath}
          previewUrl={qrImagePreviewUrl || qrImagePath}
          onClear={() => {
            setQrImageFile(null);
            setQrImagePath("");
            replaceQrImagePreviewUrl("");
          }}
          onFileChange={(file) => {
            setQrImageFile(file);
            if (file) {
              replaceQrImagePreviewUrl(URL.createObjectURL(file), true);
            } else {
              replaceQrImagePreviewUrl(qrImagePath.trim());
            }
          }}
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-bold">
        <input
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          type="checkbox"
        />
        Active for customers
      </label>
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

  if (isLegacySeries) {
    return (
      <span className="admin-category-row-legacy" title="Built-in series, managed via draw_rounds">
        Built-in
      </span>
    );
  }

  const canDelete = packCount === 0;
  // `categorySlug` is still referenced via the prop but no longer
  // required to be typed — the server eligibility check is the real
  // safety net.
  void categorySlug;

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
                disabled={pending}
                autoFocus
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
  stockUnitKey: string;
  tier: "normal" | "high";
  catalogCategory: CatalogCategory;
  prizeCategory: PrizeCategory;
  rank: number;
  tierRank: number;
  valueThb: number;
  convertCoinValue: number;
  quantity: number;
  weight: number;
  unlockAtSoldPct: number;
};

const defaultConvertDeadlineDays = 14;
const convertCoinValueMax = 10_000_000;

function defaultConvertCoinValue(displayTier: PrizeDisplayTier, index: number) {
  if (displayTier === "rainbow") return index === 0 ? 5000 : 3000;
  if (displayTier === "gold") return 1500;
  if (displayTier === "silver") return 750;
  return 100;
}

function clampConvertCoinValue(value: unknown) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(convertCoinValueMax, parsed);
}

const minTierPrizeRows = 1;
const maxTierPrizeRows = 30;
const tierCountChoices = [1, 2, 3, 5, 10, 15, 20] as const;

function isRandomPsa10Card(card: CardCatalogItem) {
  return isRandomPsa10PrizeCard(card);
}

function cardCatalogCategory(card: CardCatalogItem) {
  return catalogCategoryValue(card.catalogCategory);
}

function prizeCatalogCardsFor(
  cards: CardCatalogItem[],
  category: CatalogCategory,
  displayTier: PrizeDisplayTier,
  series?: YnotCampaign["series"],
) {
  const catalogCategory = catalogCategoryValue(category);
  const categorizedCards = cards.filter(
    (card) =>
      cardCatalogCategory(card) === catalogCategory &&
      (!series || cardMatchesCampaignSeries(card, series)),
  );
  if (catalogCategory !== "single_cards") return categorizedCards;
  if (canPrizeDisplayTierUseRandomPsa10(displayTier)) {
    return categorizedCards.filter(isRandomPsa10Card);
  }
  return categorizedCards.filter((card) => !isRandomPsa10Card(card));
}

function cardMatchesCampaignSeries(
  card: CardCatalogItem,
  series: YnotCampaign["series"],
) {
  return series === "pokemon"
    ? card.series === "Pokemon"
    : card.series === "One Piece";
}

function firstCatalogCardId(cards: CardCatalogItem[]) {
  return cards[0]?.catalogCardId ?? "";
}

function defaultStockUnitKey(card: CardCatalogItem | null | undefined) {
  if (!card) return "";
  const groups = stockSkuGroups(card);
  return (
    groups.find((group) => group.availableUnits > 0)?.key ??
    groups[0]?.key ??
    ""
  );
}

function defaultRemovableStockUnitKey(card: CardCatalogItem | null | undefined) {
  if (!card) return "";
  return stockSkuGroups(card).find((group) => group.availableUnits > 0)?.key ?? "";
}

function validStockUnitKey(
  card: CardCatalogItem | null | undefined,
  key: string | null | undefined,
) {
  if (!card) return "";
  const groups = stockSkuGroups(card);
  if (key && groups.some((group) => group.key === key)) return key;
  return "";
}

type PrizeStockUnitShortage = {
  cardName: string;
  stockSku: string;
  requiredUnits: number;
  usableUnits: number;
  shortageUnits: number;
};

function stockUnitShortageMessage(shortage: PrizeStockUnitShortage) {
  return `${shortage.cardName} ${shortage.stockSku} needs ${shortage.requiredUnits.toLocaleString()} prize units but only ${shortage.usableUnits.toLocaleString()} matching sub-SKU stock units are usable.`;
}

function adminPrizeCardIdentity(card: CardCatalogItem) {
  return [
    card.modelCode ?? card.code ?? "no model code",
    card.grade,
    prizeCategoryLabel(card.prizeCategory),
  ]
    .filter(Boolean)
    .join(" · ");
}

function adminPrizeCardSearchText(card: CardCatalogItem) {
  return [
    card.code,
    card.modelCode,
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
  fallbackUrl,
  name,
  code,
}: {
  imageUrl?: string | null;
  // Used when the primary (sub-SKU) image is missing or fails to load, so
  // the thumbnail can fall back to the catalog product image before giving up.
  fallbackUrl?: string | null;
  name: string;
  code?: string | null;
}) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const fallback = (code?.trim() || name.trim() || "Prize").slice(0, 12);
  const candidates = [imageUrl, fallbackUrl].filter(
    (url): url is string => Boolean(url && url.trim()),
  );
  const activeUrl = candidates.find((url) => !failedUrls.has(url)) ?? null;

  if (!activeUrl) {
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
      key={activeUrl}
      loading="lazy"
      onError={() =>
        setFailedUrls((prev) => new Set(prev).add(activeUrl))
      }
      src={activeUrl}
    />
  );
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const maxAdminImageUploadBytes = 10 * 1024 * 1024;
const adminImageUploadTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function AdminImageDropzone({
  imageUrl,
  imageFile,
  previewUrl,
  manualUrl,
  onFileChange,
  onManualUrlChange,
  onClear,
  disabled,
  cardCode,
  cardName,
  label = "Card image",
  hint = "JPG, PNG, or WEBP. Uploaded to Supabase storage.",
}: {
  imageUrl: string;
  imageFile: File | null;
  previewUrl: string;
  manualUrl: string;
  onFileChange: (file: File | null) => void;
  onManualUrlChange: (value: string) => void;
  onClear: () => void;
  disabled?: boolean;
  cardCode?: string;
  cardName?: string;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [showManualUrl, setShowManualUrl] = useState(
    Boolean(manualUrl && !imageFile),
  );
  const hasPreview = Boolean(previewUrl);

  function openFilePicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    if (!adminImageUploadTypes.has(file.type)) {
      setFileError("Use a JPG, PNG, or WEBP image.");
      onFileChange(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > maxAdminImageUploadBytes) {
      setFileError("Image must be 10 MB or smaller.");
      onFileChange(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFileError("");
    onFileChange(file);
  }

  return (
    <div className="admin-image-dropzone-field">
      <span className="admin-image-dropzone-label">{label}</span>
      <div
        className={`admin-image-dropzone${isDragging ? " is-dragging" : ""}${hasPreview ? " has-preview" : ""}${disabled ? " is-disabled" : ""}`}
        onClick={(event) => {
          if (event.defaultPrevented) return;
          openFilePicker();
        }}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!isDragging) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (disabled) return;
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setIsDragging(false);
        }}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
          }
        }}
        aria-label={`Upload image for ${cardName?.trim() || "card"}`}
      >
        <div className="admin-image-dropzone-thumb">
          <AdminPrizeCardImage
            code={cardCode}
            imageUrl={previewUrl}
            name={cardName?.trim() || "New prize item"}
          />
        </div>
        <div className="admin-image-dropzone-body">
          <strong className="admin-image-dropzone-title">
            {hasPreview ? "Image ready" : "Drop a card image here"}
          </strong>
          <p className="admin-image-dropzone-hint">{hint}</p>
          <div className="admin-image-dropzone-actions">
            <button
              type="button"
              className="admin-image-dropzone-button"
              onClick={(event) => {
                event.stopPropagation();
                openFilePicker();
              }}
              disabled={disabled}
            >
              {hasPreview ? "Replace file" : "Choose file"}
            </button>
            <button
              type="button"
              className="admin-image-dropzone-link"
              onClick={(event) => {
                event.stopPropagation();
                setFileError("");
                setShowManualUrl((value) => !value);
              }}
              disabled={disabled}
            >
              {showManualUrl ? "Hide URL field" : "Paste URL instead"}
            </button>
            {hasPreview && (
              <button
                type="button"
                className="admin-image-dropzone-clear"
                onClick={(event) => {
                  event.stopPropagation();
                  setFileError("");
                  if (inputRef.current) inputRef.current.value = "";
                  onClear();
                }}
                disabled={disabled}
              >
                Clear
              </button>
            )}
          </div>
          {imageFile && (
            <p className="admin-image-dropzone-file">
              <span>{imageFile.name}</span>
              <span aria-hidden="true">·</span>
              <span>{formatFileSize(imageFile.size)}</span>
            </p>
          )}
          {!imageFile && imageUrl && (
            <p className="admin-image-dropzone-file">
              <span>Existing upload</span>
              <span aria-hidden="true">·</span>
              <span className="admin-image-dropzone-url">{imageUrl}</span>
            </p>
          )}
          {fileError && (
            <p
              className="admin-image-dropzone-file"
              role="alert"
              style={{ color: "#ff8a98" }}
            >
              {fileError}
            </p>
          )}
        </div>
        <input
          ref={inputRef}
          accept="image/jpeg,image/png,image/webp"
          className="admin-image-dropzone-input"
          disabled={disabled}
          onChange={(event) => handleFiles(event.target.files)}
          type="file"
        />
      </div>
      {showManualUrl && (
        <label className="admin-image-dropzone-manual">
          <span>Manual image URL</span>
          <input
            value={manualUrl}
            onChange={(event) => onManualUrlChange(event.target.value)}
            placeholder="/test-assets/ynot-test-card-001.svg or https://…"
            disabled={disabled}
          />
          <small>Optional URL. Leave blank when you uploaded a file.</small>
        </label>
      )}
    </div>
  );
}

function AdminQrImageDropzone({
  imageUrl,
  imageFile,
  previewUrl,
  onFileChange,
  onClear,
  disabled,
}: {
  imageUrl: string;
  imageFile: File | null;
  previewUrl: string;
  onFileChange: (file: File | null) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const hasPreview = Boolean(previewUrl);

  function openFilePicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    if (!adminImageUploadTypes.has(file.type)) {
      setFileError("Use a JPG, PNG, or WEBP image.");
      onFileChange(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > maxAdminImageUploadBytes) {
      setFileError("Image must be 10 MB or smaller.");
      onFileChange(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFileError("");
    onFileChange(file);
  }

  return (
    <div className="admin-image-dropzone-field">
      <span className="admin-image-dropzone-label">QR code image</span>
      <div
        aria-label="Upload payment QR code image"
        className={`admin-image-dropzone admin-qr-dropzone${isDragging ? " is-dragging" : ""}${hasPreview ? " has-preview" : ""}${disabled ? " is-disabled" : ""}`}
        onClick={(event) => {
          if (event.defaultPrevented) return;
          openFilePicker();
        }}
        onDragLeave={(event) => {
          if (disabled) return;
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setIsDragging(false);
        }}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!isDragging) setIsDragging(true);
        }}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
      >
        <div className="admin-image-dropzone-thumb admin-qr-dropzone-thumb">
          {hasPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Payment QR preview"
              className="admin-payment-qr-preview"
              src={previewUrl}
            />
          ) : (
            <div className="admin-payment-qr-placeholder">
              <strong>QR</strong>
              <small>Upload image</small>
            </div>
          )}
        </div>
        <div className="admin-image-dropzone-body">
          <strong className="admin-image-dropzone-title">
            {hasPreview ? "QR image ready" : "Drop payment QR image here"}
          </strong>
          <p className="admin-image-dropzone-hint">
            JPG, PNG, or WEBP. Uploaded to the public YNOTT asset bucket and
            shown on the customer top-up page.
          </p>
          <div className="admin-image-dropzone-actions">
            <button
              className="admin-image-dropzone-button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                openFilePicker();
              }}
              type="button"
            >
              {hasPreview ? "Replace QR" : "Choose QR image"}
            </button>
            {hasPreview && (
              <button
                className="admin-image-dropzone-clear"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  setFileError("");
                  if (inputRef.current) inputRef.current.value = "";
                  onClear();
                }}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          {imageFile && (
            <p className="admin-image-dropzone-file">
              <span>{imageFile.name}</span>
              <span aria-hidden="true">·</span>
              <span>{formatFileSize(imageFile.size)}</span>
            </p>
          )}
          {!imageFile && imageUrl && (
            <p className="admin-image-dropzone-file">
              <span>Saved QR image</span>
              <span aria-hidden="true">·</span>
              <span className="admin-image-dropzone-url">{imageUrl}</span>
            </p>
          )}
          {fileError && (
            <p
              className="admin-image-dropzone-file"
              role="alert"
              style={{ color: "#ff8a98" }}
            >
              {fileError}
            </p>
          )}
        </div>
        <input
          ref={inputRef}
          accept="image/jpeg,image/png,image/webp"
          className="admin-image-dropzone-input"
          disabled={disabled}
          onChange={(event) => handleFiles(event.target.files)}
          type="file"
        />
      </div>
    </div>
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
            aria-label="Search prize item by model code or name"
            disabled={disabled || !cards.length}
            placeholder="Search model code or name"
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
              {[
                card.modelCode ?? card.code ?? "no model code",
                card.name,
                card.grade,
                catalogCategoryLabel(card.catalogCategory),
              ].join(" · ")}
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
  const catalogCategory = existing?.catalogCategory ?? "single_cards";
  const prizeCategory = prizeCategoryForCatalogCategory(catalogCategory);
  const cardOptions = prizeCatalogCardsFor(cards, catalogCategory, displayTier);
  const existingCardId =
    existing?.cardId &&
    cardOptions.some((card) => card.catalogCardId === existing.cardId)
      ? existing.cardId
      : "";
  const defaultCardId = existing ? "" : firstCatalogCardId(cardOptions);
  const cardId = existingCardId || defaultCardId;
  const selectedCard =
    cardOptions.find((card) => card.catalogCardId === cardId) ?? null;
  return {
    localId: existing?.localId ?? `${displayTier}-${index + 1}`,
    displayTier,
    cardId,
    stockUnitKey: existing
      ? validStockUnitKey(selectedCard, existing.stockUnitKey)
      : defaultStockUnitKey(selectedCard),
    tier: config.dbTier,
    catalogCategory,
    prizeCategory,
    rank: existing?.rank ?? index + 1,
    tierRank: index + 1,
    valueThb: existing?.valueThb ?? defaultPrizeValueThb(displayTier, index),
    convertCoinValue:
      existing?.convertCoinValue ??
      defaultConvertCoinValue(displayTier, index),
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
      prize.catalogCategory,
      prize.displayTier,
    );
    const cardId =
      prize.cardId &&
      cardOptions.some((card) => card.catalogCardId === prize.cardId)
        ? prize.cardId
        : "";
    const selectedCard =
      cardOptions.find((card) => card.catalogCardId === cardId) ?? null;
    return {
      ...prize,
      cardId,
      stockUnitKey: validStockUnitKey(selectedCard, prize.stockUnitKey),
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
    const selectedCard = cards.find(
      (card) => card.catalogCardId === prize.cardId,
    );
    const catalogCategory = selectedCard
      ? cardCatalogCategory(selectedCard)
      : catalogCategoryForPrizeCategory(prize.prizeCategory);
    const prizeCategory = prizeCategoryForCatalogCategory(catalogCategory);
    return {
      localId: `existing-${prize.id || index}`,
      displayTier,
      cardId: prize.cardId ?? "",
      stockUnitKey: validStockUnitKey(
        selectedCard,
        prize.intendedStockUnitKey,
      ),
      tier: (prize.tier === "high" ? "high" : "normal") as "normal" | "high",
      catalogCategory,
      prizeCategory,
      rank: Math.max(1, Math.round(prize.rank || index + 1)),
      tierRank: Math.max(1, Math.round(prize.tierRank || 1)),
      valueThb: Math.max(0, Math.round(prize.valueThb ?? 0)),
      convertCoinValue: clampConvertCoinValue(prize.convertCoinValue ?? 0),
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

// Loads the admin catalog AND the campaign's saved prize lineup client-side,
// then mounts the editor. Neither can be fetched reliably in the editor page's
// server request: the dashboard slice loads a live pack's inventory + readiness
// (many materialized units) and exhausts the Cloudflare Worker subrequest
// budget, so getAdminCards' stock RPCs and the prize-lineup query both come back
// empty (blank catalog + a default prize template). Each fetch here is its own
// request with a fresh budget, and we wait for both before mounting the form so
// every saved prize resolves its real card, category and sub-SKU stock on the
// first render.
export function AdminCampaignEditForm({
  categories,
  editingCampaign,
  editingCategoryId,
}: {
  categories?: YnotCategory[];
  editingCampaign: YnotCampaign;
  editingCategoryId?: string;
}) {
  const [cards, setCards] = useState<CardCatalogItem[] | null>(null);
  const [prizes, setPrizes] = useState<YnotPrizePreview[] | null>(null);
  const campaignId = editingCampaign.id;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cardsData, lineupData] = await Promise.all([
        fetch("/api/ynot/admin/cards")
          .then((res) => res.json())
          .catch(() => null) as Promise<{ cards?: CardCatalogItem[] } | null>,
        fetch(`/api/ynot/admin/campaigns/${campaignId}/lineup`)
          .then((res) => res.json())
          .catch(() => null) as Promise<{
          prizeLineup?: YnotPrizePreview[];
        } | null>,
      ]);
      if (cancelled) return;
      setCards(Array.isArray(cardsData?.cards) ? cardsData.cards : []);
      setPrizes(
        Array.isArray(lineupData?.prizeLineup) ? lineupData.prizeLineup : [],
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (cards === null || prizes === null) {
    return (
      <p className="admin-card-catalog-empty-usage">Loading prize catalog…</p>
    );
  }

  return (
    <AdminCampaignForm
      categories={categories}
      cards={cards}
      editingCampaign={editingCampaign}
      editingPrizes={prizes}
      editingCategoryId={editingCategoryId}
    />
  );
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
  const [isTest] = useState(Boolean(editingCampaign?.isTest));
  const [mode, setMode] = useState<"instant_gacha" | "slot_pick">(
    editingCampaign?.mode ?? "instant_gacha",
  );
  const [priceThb, setPriceThb] = useState(editingCampaign?.priceThb ?? 100);
  const [costCoins, setCostCoins] = useState(editingCampaign?.costCoins ?? 1);
  const [totalSlots, setTotalSlots] = useState(defaultTotalSlots);
  const [convertDeadlineDays, setConvertDeadlineDays] = useState<number>(() => {
    const stored = editingCampaign?.convertDeadlineDays;
    if (stored === null || stored === undefined) return defaultConvertDeadlineDays;
    const parsed = Math.round(Number(stored));
    if (!Number.isFinite(parsed) || parsed < 1) return defaultConvertDeadlineDays;
    return Math.min(3650, parsed);
  });
  const [displayTags, setDisplayTags] = useState<string[]>(
    normalizeCustomerTags(editingCampaign?.displayTags, defaultSeries),
  );
  const [openQuantityOptions, setOpenQuantityOptions] = useState<number[]>(
    normalizeOpenQuantityOptions(editingCampaign?.openQuantityOptions),
  );
  const [slotGrid, setSlotGrid] = useState<{
    layout: "10x10" | "5x20" | "20x5";
    reveal: "stamp_on_pick" | "reveal_on_close";
    blockRepick: boolean;
  }>({ layout: "10x10", reveal: "stamp_on_pick", blockRepick: true });
  const [draftPrizes, setDraftPrizes] = useState<CampaignPrizeDraft[]>(() =>
    editingPrizes && editingPrizes.length
      ? prizeLineupToDrafts(editingPrizes, cards, defaultTotalSlots)
      : createInitialPrizeDrafts(cards, defaultTotalSlots),
  );
  // Last One Prize: a bonus card for whoever opens the final pack. Stored on the
  // campaign (not the prize pool), so it never touches slot/odds logic.
  const [lastPrizeCardId, setLastPrizeCardId] = useState(
    editingCampaign?.lastPrizeCardId ?? "",
  );
  const [lastPrizeStockUnitKey, setLastPrizeStockUnitKey] = useState(
    editingCampaign?.lastPrizeStockUnitKey ?? "",
  );
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info",
  );
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
  const campaignCatalogCards = useMemo(
    () => cards.filter((card) => cardMatchesCampaignSeries(card, series)),
    [cards, series],
  );
  const cardsById = useMemo(
    () => new Map(campaignCatalogCards.map((card) => [card.catalogCardId, card])),
    [campaignCatalogCards],
  );
  // True when the pack already owns inventory tied to this campaign — either
  // reserved (pending owner review) or allocated/materialized (live/closed). In
  // those cases the campaign's own units must count as available in the
  // readiness check, otherwise every existing prize reports a phantom "needs N
  // but 0 available" shortage even though its stock is already committed here.
  const editsExistingCampaignInventory =
    editingCampaign?.approvalStatus === "pending_review" ||
    editingCampaign?.status === "live" ||
    editingCampaign?.status === "closed";
  const reservedForEditingCampaignByCardId = useMemo(() => {
    const counts = new Map<string, number>();
    if (!editsExistingCampaignInventory) return counts;
    for (const prize of editingPrizes ?? []) {
      if (!prize.cardId) continue;
      counts.set(
        prize.cardId,
        (counts.get(prize.cardId) ?? 0) +
          Math.max(0, Math.round(Number(prize.plannedQuantity) || 0)),
      );
    }
    return counts;
  }, [editsExistingCampaignInventory, editingPrizes]);
  const prizeStockSummaries = useMemo<PrizeStockSummary[]>(() => {
    const cardIds = [
      ...new Set(activePrizeDrafts.map((prize) => prize.cardId).filter(Boolean)),
    ];
    return cardIds.map((cardId) => {
      const card = cardsById.get(cardId);
      return {
        cardId,
        cardName: card?.name ?? null,
        cardCode: card?.code ?? card?.searchCode ?? null,
        stockAvailable: card?.stockAvailable ?? 0,
        reservedForCampaign: reservedForEditingCampaignByCardId.get(cardId) ?? 0,
      };
    });
  }, [activePrizeDrafts, cardsById, reservedForEditingCampaignByCardId]);
  const stockShortages = useMemo(
    () =>
      buildPrizeStockShortages({
        includeReservedForCampaign: editsExistingCampaignInventory,
        prizes: activePrizeDrafts.map((prize) => ({
          cardId: prize.cardId,
          quantity: prizeUnitCount(prize),
        })),
        stockSummaries: prizeStockSummaries,
      }),
    [activePrizeDrafts, editsExistingCampaignInventory, prizeStockSummaries],
  );
  const stockBlockers = stockShortageBlockers(stockShortages);
  const reservedForEditingCampaignByStockKey = useMemo(() => {
    const counts = new Map<string, number>();
    if (!editsExistingCampaignInventory) return counts;
    for (const prize of editingPrizes ?? []) {
      if (!prize.cardId || !prize.intendedStockUnitKey) continue;
      const key = `${prize.cardId}\u001f${prize.intendedStockUnitKey}`;
      counts.set(
        key,
        (counts.get(key) ?? 0) +
          Math.max(0, Math.round(Number(prize.plannedQuantity) || 0)),
      );
    }
    return counts;
  }, [editsExistingCampaignInventory, editingPrizes]);
  const stockUnitShortages = useMemo<PrizeStockUnitShortage[]>(() => {
    const requiredByStockKey = new Map<
      string,
      { card: CardCatalogItem; groupKey: string; requiredUnits: number }
    >();

    for (const prize of activePrizeDrafts) {
      if (!prize.cardId || !prize.stockUnitKey) continue;
      const card = cardsById.get(prize.cardId);
      if (!card) continue;
      const groupKey = validStockUnitKey(card, prize.stockUnitKey);
      if (!groupKey) continue;
      const key = `${card.catalogCardId}\u001f${groupKey}`;
      const existing = requiredByStockKey.get(key);
      requiredByStockKey.set(key, {
        card,
        groupKey,
        requiredUnits:
          (existing?.requiredUnits ?? 0) + Math.max(0, prizeUnitCount(prize)),
      });
    }

    return Array.from(requiredByStockKey.entries()).flatMap(([key, entry]) => {
      const group = stockSkuGroups(entry.card).find(
        (candidate) => candidate.key === entry.groupKey,
      );
      if (!group) return [];
      const reservedUnits = editsExistingCampaignInventory
        ? (reservedForEditingCampaignByStockKey.get(key) ?? 0)
        : 0;
      const usableUnits = group.availableUnits + reservedUnits;
      if (entry.requiredUnits <= usableUnits) return [];
      return [
        {
          cardName: entry.card.name,
          stockSku: group.sku,
          requiredUnits: entry.requiredUnits,
          usableUnits,
          shortageUnits: entry.requiredUnits - usableUnits,
        },
      ];
    });
  }, [
    activePrizeDrafts,
    cardsById,
    editsExistingCampaignInventory,
    reservedForEditingCampaignByStockKey,
  ]);
  const stockUnitBlockers = stockUnitShortages.map(stockUnitShortageMessage);
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
  const unavailableCatalogCategoryRows = draftPrizes.filter(
    (prize) =>
      prizeUnitCount(prize) > 0 &&
      !prizeCatalogCardsFor(
        campaignCatalogCards,
        prize.catalogCategory,
        prize.displayTier,
        series,
      ).length,
  );
  const invalidPrizeItemRows = draftPrizes.filter((prize) => {
    if (prizeUnitCount(prize) <= 0) return false;
    const itemOptions = prizeCatalogCardsFor(
      campaignCatalogCards,
      prize.catalogCategory,
      prize.displayTier,
      series,
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
      campaignCatalogCards,
      prize.catalogCategory,
      prize.displayTier,
      series,
    );
    return itemOptions.length > 0 && !prize.cardId;
  });
  const missingStockUnitRows = activePrizeDrafts.filter((prize) => {
    const card = cardsById.get(prize.cardId);
    return Boolean(
      card &&
        stockSkuGroups(card).length &&
        !validStockUnitKey(card, prize.stockUnitKey),
    );
  });
  const missingCatalogCategories = [
    ...new Set(
      unavailableCatalogCategoryRows.map(
        (prize) =>
          `${prizeDraftTierLabel(prize.displayTier)}: ${catalogCategoryLabel(prize.catalogCategory)}`,
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
    !campaignCatalogCards.length
      ? "Add at least one Prize Catalog item for the selected brand first."
      : "",
    !activePrizeDrafts.length ? "Choose prize inventory before saving." : "",
    configuredPrizeUnits !== totalSlots
      ? "Prize quantity must equal the total pack quantity."
      : "",
    ...stockBlockers,
    ...stockUnitBlockers,
    missingStockUnitRows.length
      ? "Choose sub-SKU stock for every active prize row."
      : "",
    initialUnlockedUnits <= 0
      ? "At least one prize must be available in the launch pool."
      : "",
    missingCatalogCategories.length
      ? `Add catalog item(s) for ${missingCatalogCategories.join(", ")}.`
      : "",
    invalidPrizeItemRows.length
      ? "Choose a prize item that matches each selected sub-category."
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
      label: "Global stock",
      primary: stockShortages.length
        ? `${stockShortages.length.toLocaleString()} shortage${stockShortages.length === 1 ? "" : "s"}`
        : "Covered",
      secondary:
        editingCampaign?.approvalStatus === "pending_review"
          ? "available + this pack reservation"
          : "available card stock",
      ready: stockShortages.length === 0,
    },
    {
      label: "Sub-SKU stock",
      primary: stockUnitShortages.length
        ? `${stockUnitShortages.length.toLocaleString()} shortage${stockUnitShortages.length === 1 ? "" : "s"}`
        : "Covered",
      secondary: "selected raw / graded identity",
      ready: stockUnitShortages.length === 0,
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
        campaignCatalogCards,
      ),
    );
  }

  function applyCampaignSeries(nextSeries: YnotCampaign["series"]) {
    const nextCampaignCards = cards.filter((card) =>
      cardMatchesCampaignSeries(card, nextSeries),
    );
    setSeries(nextSeries);
    setDisplayTags((current) => normalizeCustomerTags(current, nextSeries));
    setDraftPrizes((current) =>
      withLowestTierRemainder(
        current.map((prize) => {
          const itemOptions = prizeCatalogCardsFor(
            nextCampaignCards,
            prize.catalogCategory,
            prize.displayTier,
            nextSeries,
          );
          const currentCard = itemOptions.find(
            (card) => card.catalogCardId === prize.cardId,
          );
          const nextCard = currentCard ?? itemOptions[0] ?? null;
          return {
            ...prize,
            cardId: nextCard?.catalogCardId ?? "",
            stockUnitKey: currentCard
              ? validStockUnitKey(currentCard, prize.stockUnitKey)
              : defaultStockUnitKey(nextCard),
          };
        }),
        totalSlots,
        nextCampaignCards,
      ),
    );
  }

  function updatePrizeDraftCatalogCategory(
    prize: CampaignPrizeDraft,
    nextCategory: CatalogCategory,
  ) {
    const catalogCategory = catalogCategoryValue(nextCategory);
    const prizeCategory = prizeCategoryForCatalogCategory(catalogCategory);
    const itemOptions = prizeCatalogCardsFor(
      campaignCatalogCards,
      catalogCategory,
      prize.displayTier,
      series,
    );
    const defaultCard = itemOptions[0] ?? null;
    updatePrizeDraft(prize.localId, {
      catalogCategory,
      prizeCategory,
      cardId: defaultCard?.catalogCardId ?? "",
      stockUnitKey: defaultStockUnitKey(defaultCard),
    });
  }

  function updateTotalSlots(nextTotalSlots: number) {
    const normalizedTotalSlots = Math.max(
      1,
      Math.round(Number(nextTotalSlots) || 1),
    );
    setTotalSlots(normalizedTotalSlots);
    setDraftPrizes((current) =>
      withLowestTierRemainder(current, normalizedTotalSlots, campaignCatalogCards),
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
              createPrizeDraft(displayTier, index, campaignCatalogCards),
            ),
          ],
          totalSlots,
          campaignCatalogCards,
        );
      }
      const activeTiers = new Set(current.map((prize) => prize.displayTier));
      if (activeTiers.size <= 1) return current;
      return withLowestTierRemainder(
        current.filter((prize) => prize.displayTier !== displayTier),
        totalSlots,
        campaignCatalogCards,
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
              campaignCatalogCards,
              current
                .filter((prize) => prize.displayTier === displayTier)
                .sort((left, right) => left.tierRank - right.tierRank)[index],
            ),
          ),
        ],
        totalSlots,
        campaignCatalogCards,
      ),
    );
  }

  function fillLowestTierRemainder() {
    setDraftPrizes((current) =>
      withLowestTierRemainder(current, totalSlots, campaignCatalogCards),
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
        campaignCatalogCards,
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
        campaignCatalogCards,
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
          slotGrid: mode === "slot_pick" ? slotGrid : undefined,
          categoryIds: categoryId ? [categoryId] : undefined,
          isTest,
          convertDeadlineDays,
          initialPrizes: activePrizeDrafts.map((prize) => {
            const card = cardsById.get(prize.cardId);
            const stockUnitKey = validStockUnitKey(card, prize.stockUnitKey);
            const catalogCategory = catalogCategoryValue(prize.catalogCategory);
            const prizeCategory =
              prizeCategoryForCatalogCategory(catalogCategory);
            const stockMetadata =
              card && stockUnitKey
                ? stockUnitSelectionMetadata(card, stockUnitKey)
                : null;
            return {
              cardId: prize.cardId,
              tier: dbTierForPrizeDisplayTier(prize.displayTier),
              rank: Math.max(1, Math.round(Number(prize.rank) || 1)),
              quantity: Math.max(0, Math.round(Number(prize.quantity) || 0)),
              convertCoinValue: clampConvertCoinValue(prize.convertCoinValue),
              metadata: {
                displayTier: prize.displayTier,
                displayTierLabel: prizeDisplayTierLabel(prize.displayTier),
                displayGroup: prize.displayTier,
                tierRank: prize.tierRank,
                tierRowCount: draftPrizesByTier[prize.displayTier].length,
                catalogCategory,
                catalogCategoryLabel: catalogCategoryLabel(catalogCategory),
                prizeCategory,
                prizeCategoryLabel: prizeCategoryLabel(prizeCategory),
                sourceType: prizeSourceType(prizeCategory),
                ...(stockMetadata ?? {}),
              },
            };
          }),
          lastPrizeCardId: lastPrizeCardId || null,
          lastPrizeMetadata: (() => {
            const card = lastPrizeCardId
              ? cardsById.get(lastPrizeCardId)
              : null;
            const key = validStockUnitKey(card, lastPrizeStockUnitKey);
            return card && key
              ? stockUnitSelectionMetadata(card, key)
              : null;
          })(),
        };
        if (editMode && editingCampaign) {
          const result = await patchJson("/api/ynot/admin/campaigns", {
            campaignId: editingCampaign.id,
            ...basePayload,
          });
          const packLabel =
            editingCampaign.titleEn || editingCampaign.titleTh || "pack";
          setMessageTone("success");
          setMessage(
            isRecord(result) && result.status === "live"
              ? `✓ "${packLabel}" saved — pack is live and changes apply now (${configuredPrizeUnits.toLocaleString()} prize units). No owner review needed.`
              : `✓ "${packLabel}" saved with ${configuredPrizeUnits.toLocaleString()} prize units. Submit owner review to re-publish.`,
          );
        } else {
          const payload = await postJson("/api/ynot/admin/campaigns", {
            ...basePayload,
            status: "draft",
            visibility: "private",
          });
          setMessageTone("success");
          setMessage(
            `✓ Random pack ${payload.campaign?.slug ?? slug} saved as draft with ${configuredPrizeUnits.toLocaleString()} prize units.`,
          );
        }
        router.refresh();
      } catch (error) {
        setMessageTone("error");
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
          <span>
            {editMode ? "Edit random pack" : "New random pack"}
            {editMode && editingCampaign?.packCode
              ? ` · ${editingCampaign.packCode}`
              : ""}
          </span>
          <h3>
            {editMode
              ? `Edit "${editingCampaign?.titleEn || editingCampaign?.titleTh || "pack"}"`
              : "Create pack draft with prizes"}
          </h3>
          <p>
            {!editMode
              ? "Build the campaign, prize list, and owner-review readiness in one full-width workflow."
              : editingCampaign?.status === "live"
                ? "Update fields and the prize list. Changes apply immediately to this LIVE pack — prize/slot edits re-materialize stock atomically and awarded prizes are kept. The pack stays live; no re-approval needed."
                : "Update campaign fields and prize list. Saving puts the pack back to draft/private and requires fresh owner review."}
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
              <span>Brand</span>
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
                      applyCampaignSeries(nextSeries);
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
                    applyCampaignSeries(nextSeries);
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
            <div className="admin-field admin-field-wide">
              <span>Open mode</span>
              <div className="tabs" style={{ width: "100%" }}>
                <button
                  type="button"
                  className={`t ${mode === "slot_pick" ? "active" : ""}`}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    textAlign: "center",
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                  onClick={() => setMode("slot_pick")}
                >
                  Slot pick
                </button>
                <button
                  type="button"
                  className={`t ${mode === "instant_gacha" ? "active" : ""}`}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    textAlign: "center",
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                  onClick={() => setMode("instant_gacha")}
                >
                  Instant gacha
                </button>
              </div>
              <small>
                {mode === "instant_gacha"
                  ? "Customer buys bundles (1, 10, 100 pulls) and opens instantly."
                  : "Admin sets N slots at a fixed cost per slot. Customer pays any amount, gets paid ÷ cost slots to pick."}
              </small>
            </div>
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
            <label className="admin-field">
              <span>Convert deadline (days)</span>
              <input
                min={1}
                max={3650}
                type="number"
                value={convertDeadlineDays}
                onChange={(event) => {
                  const parsed = Math.round(Number(event.target.value));
                  if (!Number.isFinite(parsed) || parsed < 1) {
                    setConvertDeadlineDays(defaultConvertDeadlineDays);
                    return;
                  }
                  setConvertDeadlineDays(Math.min(3650, parsed));
                }}
                placeholder="14"
              />
              <small>
                Days a user has to convert pulled cards into coins before they
                expire. Default 14.
              </small>
            </label>
            {mode === "instant_gacha" && (
              <div className="admin-field admin-field-wide">
                <span>Customer pull buttons</span>
                <div
                  className="admin-open-preset-row"
                  role="group"
                  aria-label="Open quantity buttons"
                >
                  {allowedOpenQuantityOptions.map((option) => {
                    const selected = openQuantityOptions.includes(option);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`admin-open-preset-button${selected ? " active is-selected" : ""}`}
                        key={option}
                        onClick={() => toggleOpenQuantityOption(option)}
                        type="button"
                      >
                        <strong>Open {option}</strong>
                        <span>{openQuantityLabel(option)}</span>
                      </button>
                    );
                  })}
                </div>
                <small>
                  Selected: {openQuantitySummary(openQuantityOptions)}. These
                  exact buttons appear on the pack detail and opening screens.
                </small>
              </div>
            )}
            {mode === "slot_pick" && (
              <div className="admin-field admin-field-wide">
                <span>How slot pick works</span>
                <div
                  style={{
                    padding: "10px 12px",
                    background: "rgba(108,166,255,0.06)",
                    border: "1px solid rgba(108,166,255,0.18)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--a-fg-dim)",
                    lineHeight: 1.55,
                  }}
                >
                  Customer pays any amount of coins. The number of spots they
                  can pick = <b>coins paid ÷ cost per slot</b>. Each picked spot
                  is fully random — no per-card weights apply. The {totalSlots.toLocaleString()}-spot
                  grid layout is configured below.
                </div>
              </div>
            )}
            {mode === "slot_pick" && (
              <div className="admin-field admin-field-wide">
                <span>Slot grid config</span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                  }}
                >
                  <label
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <small>Grid layout</small>
                    <select
                      className="select"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                      value={slotGrid.layout}
                      onChange={(event) =>
                        setSlotGrid((current) => ({
                          ...current,
                          layout: event.target.value as typeof current.layout,
                        }))
                      }
                    >
                      <option value="10x10">10 × 10</option>
                      <option value="5x20">5 × 20</option>
                      <option value="20x5">20 × 5</option>
                    </select>
                  </label>
                  <label
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <small>Reveal style</small>
                    <select
                      className="select"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                      value={slotGrid.reveal}
                      onChange={(event) =>
                        setSlotGrid((current) => ({
                          ...current,
                          reveal: event.target.value as typeof current.reveal,
                        }))
                      }
                    >
                      <option value="stamp_on_pick">Stamp serial on pick</option>
                      <option value="reveal_on_close">Reveal at draw close</option>
                    </select>
                  </label>
                  <label
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <small>Block re-pick same user</small>
                    <button
                      type="button"
                      className={`toggle ${slotGrid.blockRepick ? "on" : ""}`}
                      onClick={() =>
                        setSlotGrid((current) => ({
                          ...current,
                          blockRepick: !current.blockRepick,
                        }))
                      }
                      aria-pressed={slotGrid.blockRepick}
                      style={{ border: 0, cursor: "pointer", marginTop: 4 }}
                    />
                  </label>
                </div>
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: "rgba(7,7,15,0.5)",
                    border: "1px solid var(--a-border-soft)",
                    borderRadius: 8,
                  }}
                >
                  <small
                    style={{
                      display: "block",
                      marginBottom: 6,
                      color: "var(--a-muted)",
                    }}
                  >
                    Live preview · {totalSlots} slots · {slotGrid.layout}
                  </small>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${
                        slotGrid.layout === "10x10"
                          ? 10
                          : slotGrid.layout === "5x20"
                          ? 5
                          : 20
                      },1fr)`,
                      gap: 3,
                    }}
                  >
                    {Array.from({ length: Math.min(totalSlots, 100) }).map(
                      (_, i) => {
                        const picked = (i * 7) % 11 === 0 || (i * 13) % 17 === 0;
                        return (
                          <div
                            key={i}
                            style={{
                              aspectRatio: "1 / 1.4",
                              background: picked
                                ? "rgba(244,197,66,0.20)"
                                : "rgba(255,255,255,0.04)",
                              border: picked
                                ? "1px solid rgba(244,197,66,0.5)"
                                : "1px solid var(--a-border-soft)",
                              borderRadius: 3,
                              display: "grid",
                              placeItems: "center",
                              fontFamily: "Geist Mono, monospace",
                              fontSize: 8,
                              color: picked ? "var(--a-gold)" : "var(--a-muted-2)",
                            }}
                          >
                            {i + 1}
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
            )}
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
                      <span>Sub-SKU stock</span>
                      <span>Sub-category</span>
                      <span>Qty</span>
                      <span>Convert coins</span>
                      <span>Action</span>
                    </div>
                    {rows.map((prize) => {
                      const itemOptions = prizeCatalogCardsFor(
                        campaignCatalogCards,
                        prize.catalogCategory,
                        prize.displayTier,
                        series,
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
                      const stockGroups = selectedCard
                        ? stockSkuGroups(selectedCard)
                        : [];
                      const selectedStockUnitKey = validStockUnitKey(
                        selectedCard,
                        prize.stockUnitKey,
                      );
                      const selectedStockGroup =
                        stockGroups.find(
                          (group) => group.key === selectedStockUnitKey,
                        ) ?? null;
                      const selectedStockImageUrl =
                        selectedStockGroup?.units.find((unit) => unit.imageUrl)
                          ?.imageUrl ?? null;
                      return (
                        <article
                          className={`admin-prize-table-row tier-${option.value}`}
                          key={prize.localId}
                        >
                          <div className="admin-prize-rank-cell">
                            {selectedCard ? (
                              <AdminPrizeCardImage
                                code={selectedCard.code}
                                imageUrl={selectedStockImageUrl}
                                fallbackUrl={selectedCard.photoUrl}
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
                            <div className="admin-prize-rank-label">
                              <strong>#{prize.tierRank}</strong>
                              <span>{option.shortLabel}</span>
                            </div>
                            <AdminPrizeCardPicker
                              cards={itemOptions}
                              disabled={!itemOptions.length}
                              showPreview={false}
                              showSearch={false}
                              value={selectedCardId}
                              onChange={(cardId) => {
                                const nextCard =
                                  itemOptions.find(
                                    (card) => card.catalogCardId === cardId,
                                  ) ?? null;
                                updatePrizeDraft(prize.localId, {
                                  cardId,
                                  stockUnitKey: defaultStockUnitKey(nextCard),
                                });
                              }}
                              testIdPrefix={`campaign-prize-${prize.localId}`}
                            />
                            {!itemOptions.length && (
                              <small>
                                Add a {catalogCategoryLabel(prize.catalogCategory)}{" "}
                                catalog item first.
                              </small>
                            )}
                          </div>
                          <label className="admin-field admin-prize-stock-sku-field">
                            <span>Sub-SKU stock</span>
                            <select
                              disabled={!stockGroups.length}
                              value={selectedStockUnitKey}
                              onChange={(event) =>
                                updatePrizeDraft(prize.localId, {
                                  stockUnitKey: event.target.value,
                                })
                              }
                            >
                              {stockGroups.length ? (
                                <option value="">Choose sub-SKU stock</option>
                              ) : (
                                <option value="">
                                  {selectedCard
                                    ? "No sub-SKU stock"
                                    : "Choose item first"}
                                </option>
                              )}
                              {stockGroups.map((group) => (
                                <option key={group.key} value={group.key}>
                                  {group.sku} · {group.label} ·{" "}
                                  {group.availableUnits}/{group.totalUnits} stock
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="admin-field">
                            <span>Sub-category</span>
                            <select
                              value={prize.catalogCategory}
                              onChange={(event) =>
                                updatePrizeDraftCatalogCategory(
                                  prize,
                                  event.target.value as CatalogCategory,
                                )
                              }
                            >
                              {catalogCategoryOptions.map((categoryOption) => (
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
                          <label className="admin-field admin-prize-convert-field">
                            <span>Convert coins</span>
                            <input
                              min={0}
                              max={convertCoinValueMax}
                              type="number"
                              value={prize.convertCoinValue}
                              onChange={(event) =>
                                updatePrizeDraft(prize.localId, {
                                  convertCoinValue: clampConvertCoinValue(
                                    event.target.value,
                                  ),
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
            {(() => {
              const lastCard = lastPrizeCardId
                ? (cardsById.get(lastPrizeCardId) ?? null)
                : null;
              const lastGroups = lastCard ? stockSkuGroups(lastCard) : [];
              const lastSelectedKey = validStockUnitKey(
                lastCard,
                lastPrizeStockUnitKey,
              );
              const lastSelectedGroup =
                lastGroups.find((group) => group.key === lastSelectedKey) ??
                null;
              const lastImageUrl =
                lastSelectedGroup?.units.find((unit) => unit.imageUrl)
                  ?.imageUrl ?? null;
              return (
                <section className="admin-prize-tier-section admin-prize-tier-last-prize">
                  <div className="admin-prize-tier-head">
                    <div>
                      <span>Last prize</span>
                      <strong>Last One Prize · bonus</strong>
                      <p>
                        Awarded to whoever opens the final pack — on top of
                        their normal pull. Not part of the pool and does not
                        affect odds. Leave empty for no last prize.
                      </p>
                    </div>
                  </div>
                  <div className="admin-prize-table">
                    <div className="admin-prize-table-head">
                      <span>Tier #</span>
                      <span>Prize item</span>
                      <span>Sub-SKU stock</span>
                      <span>Sub-category</span>
                      <span>Qty</span>
                      <span>Convert coins</span>
                      <span>Action</span>
                    </div>
                    <article className="admin-prize-table-row tier-last-prize">
                      <div className="admin-prize-rank-cell">
                        {lastCard ? (
                          <AdminPrizeCardImage
                            code={lastCard.code}
                            imageUrl={lastImageUrl}
                            fallbackUrl={lastCard.photoUrl}
                            name={lastCard.name}
                          />
                        ) : (
                          <span className="admin-prize-card-thumb admin-prize-card-placeholder">
                            <strong>★</strong>
                            <small>No image</small>
                          </span>
                        )}
                      </div>
                      <div className="admin-field admin-prize-card-field">
                        <span>Prize item</span>
                        <div className="admin-prize-rank-label">
                          <strong>★</strong>
                          <span>Last</span>
                        </div>
                        <AdminPrizeCardPicker
                          cards={campaignCatalogCards}
                          disabled={!campaignCatalogCards.length}
                          showPreview={false}
                          showSearch
                          value={lastPrizeCardId}
                          onChange={(cardId) => {
                            const next =
                              campaignCatalogCards.find(
                                (card) => card.catalogCardId === cardId,
                              ) ?? null;
                            setLastPrizeCardId(cardId);
                            setLastPrizeStockUnitKey(defaultStockUnitKey(next));
                          }}
                          testIdPrefix="campaign-last-prize"
                        />
                      </div>
                      <label className="admin-field admin-prize-stock-sku-field">
                        <span>Sub-SKU stock</span>
                        <select
                          disabled={!lastGroups.length}
                          value={lastSelectedKey}
                          onChange={(event) =>
                            setLastPrizeStockUnitKey(event.target.value)
                          }
                        >
                          {lastGroups.length ? (
                            <option value="">Choose sub-SKU stock</option>
                          ) : (
                            <option value="">
                              {lastCard
                                ? "No sub-SKU stock"
                                : "Choose item first"}
                            </option>
                          )}
                          {lastGroups.map((group) => (
                            <option key={group.key} value={group.key}>
                              {group.sku} · {group.label} ·{" "}
                              {group.availableUnits}/{group.totalUnits} stock
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="admin-field">
                        <span>Sub-category</span>
                        <span className="admin-prize-static-cell">Bonus</span>
                      </div>
                      <div className="admin-field">
                        <span>Qty</span>
                        <span className="admin-prize-static-cell">1</span>
                      </div>
                      <div className="admin-field">
                        <span>Convert coins</span>
                        <span className="admin-prize-static-cell">—</span>
                      </div>
                      <div className="admin-field admin-prize-action-field">
                        <span>Action</span>
                        <button
                          className="admin-prize-remove"
                          disabled={!lastPrizeCardId}
                          onClick={() => {
                            setLastPrizeCardId("");
                            setLastPrizeStockUnitKey("");
                          }}
                          type="button"
                        >
                          Clear
                        </button>
                      </div>
                    </article>
                  </div>
                </section>
              );
            })()}
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
          {message && (
            <p className={`admin-form-message admin-form-message--${messageTone}`}>
              {message}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

export function OwnerApprovalQueue({
  requests,
  viewerRole,
}: {
  requests: YnotOwnerApprovalRequest[];
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  if (!requests.length) {
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

  const isOwner = viewerRole === "owner";

  return (
    <section className="owner-approval-queue soft-card">
      <div className="admin-panel-head">
        <div>
          <p className="section-label">Owner review queue</p>
          <h3 className="title-m">Random drop requests</h3>
          <p className="txt-s">
            {requests.length} request{requests.length === 1 ? "" : "s"} waiting.
            Click <strong>Review</strong> to inspect and approve.
          </p>
        </div>
        <span className="status-pill warn">Owner notification</span>
      </div>

      <div className="owner-approval-list">
        {requests.map((request) => {
          const logicLabel =
            randomLogicChoices.find(
              (choice) => choice.value === request.logicMode,
            )?.label ?? request.logicMode;
          const modeLabel =
            request.campaign.mode === "slot_pick"
              ? "Slot pick"
              : "Instant gacha";
          const totalUnits =
            request.campaign.totalPrizeUnits ?? request.campaign.totalSlots;
          const availableUnits = request.campaign.availablePrizeUnits ?? 0;
          const shortStatusLabel: Record<YnotApprovalStatus, string> = {
            not_submitted: "Draft",
            pending_review: "Pending",
            approved: "Approved",
            rejected: "Rejected",
            changes_requested: "Changes",
          };
          const requesterLabel = request.requestedByLabel?.trim();
          return (
            <article className="owner-approval-row" key={request.id}>
              <span
                className="owner-approval-row-status"
                data-status={request.approvalStatus}
                title={approvalStatusLabel(request.approvalStatus)}
              >
                <span className="owner-approval-row-status-dot" aria-hidden="true" />
                {shortStatusLabel[request.approvalStatus]}
              </span>
              <div className="owner-approval-row-main">
                <h4>{request.campaign.titleTh || request.campaign.titleEn}</h4>
                <p>
                  <span>{request.campaign.slug}</span>
                  <span aria-hidden="true">·</span>
                  <span>{modeLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatApprovalDate(request.requestedAt)}</span>
                  {requesterLabel ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>by {requesterLabel}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="owner-approval-row-stats">
                <div>
                  <span>Sold</span>
                  <strong>{request.soldPct}%</strong>
                </div>
                <div>
                  <span>Units</span>
                  <strong>
                    {availableUnits}/{totalUnits}
                  </strong>
                </div>
                <div>
                  <span>Logic</span>
                  <strong>{logicLabel}</strong>
                </div>
              </div>
              {isOwner ? (
                <Link
                  className="btn btn-sm btn-primary owner-approval-row-cta"
                  href={`/admin/campaigns/${request.campaign.id}/review`}
                  prefetch={false}
                >
                  Review <AdminIcon name="chev-r" size={12} />
                </Link>
              ) : (
                <span className="owner-approval-row-locked">Owner only</span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Owner Approval Review (design artboard 02c) ----------

type OwnerReviewTier = "rainbow" | "gold" | "silver" | "bronze";

const OWNER_REVIEW_TIER_ORDER: OwnerReviewTier[] = [
  "rainbow",
  "gold",
  "silver",
  "bronze",
];

const OWNER_REVIEW_TIER_COLORS: Record<OwnerReviewTier, string> = {
  rainbow: "#f05a6c",
  gold: "#f4c542",
  silver: "#c8c8d8",
  bronze: "#cf8750",
};

const OWNER_REVIEW_GUARANTEE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "silver_plus", label: "Silver+" },
  { value: "gold_plus", label: "Gold+" },
  { value: "rainbow", label: "Rainbow" },
] as const;

type OwnerReviewGuarantee =
  (typeof OWNER_REVIEW_GUARANTEE_OPTIONS)[number]["value"];

type OwnerReviewLogicMode = YnotRandomLogicMode;

const OWNER_REVIEW_LOGIC_OPTIONS: Array<{
  value: OwnerReviewLogicMode;
  label: string;
  desc: string;
}> = [
  { value: "pure_random", label: "Pure random", desc: "Equal weight per remaining unit" },
  { value: "weighted_templates", label: "Weighted", desc: "Use admin weights" },
  { value: "inventory_gated", label: "Inventory-gated", desc: "Weights + unlock %" },
];

type OwnerReviewCardEdit = {
  weight?: number;
  unlockAtSoldPct?: number;
};

type OwnerReviewSimResult = {
  counts: Record<OwnerReviewTier, number>;
  expected: Record<OwnerReviewTier, number>;
  cumulative: Record<OwnerReviewTier, number[]>;
  payoutAvg: number;
  payoutWorst10: number;
  payoutBest1: number;
  draws: number;
  seed: string;
  ranAt: number;
};

type OwnerReviewModeComparison = {
  mode: OwnerReviewLogicMode;
  label: string;
  result: OwnerReviewSimResult;
  recommended: boolean;
};

function ownerReviewTierLabel(tier: OwnerReviewTier) {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function ownerReviewTierFromPrize(prize: YnotPrizePreview): OwnerReviewTier {
  const display = (prize.displayTier ?? "").toLowerCase();
  if (display === "rainbow" || display === "gold" || display === "silver" || display === "bronze") {
    return display as OwnerReviewTier;
  }
  if (prize.tier === "high") {
    return (prize.tierRank ?? prize.rank ?? 99) <= 3 ? "rainbow" : "gold";
  }
  return "bronze";
}

function ownerReviewReadGuarantee(value: unknown): OwnerReviewGuarantee {
  return OWNER_REVIEW_GUARANTEE_OPTIONS.some((opt) => opt.value === value)
    ? (value as OwnerReviewGuarantee)
    : "none";
}

function ownerReviewSeed() {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ownerReviewPrizeUnits(prize: YnotPrizePreview) {
  return Math.max(
    0,
    Math.round(
      prize.availableUnits ?? prize.plannedQuantity ?? prize.totalUnits ?? 0,
    ),
  );
}

function ownerReviewPrizeWeight(
  prize: YnotPrizePreview,
  logicMode: OwnerReviewLogicMode,
) {
  if (logicMode === "pure_random") return 1;
  return Math.max(0, Number(prize.weight ?? 1) || 0);
}

function ownerReviewPrizeUnlockAtSoldPct(
  prize: YnotPrizePreview,
  logicMode: OwnerReviewLogicMode,
) {
  if (logicMode !== "inventory_gated") return 0;
  return Math.min(100, Math.max(0, Number(prize.unlockAtSoldPct ?? 0) || 0));
}

function ownerReviewEffectivePoolWeight(
  prize: YnotPrizePreview,
  logicMode: OwnerReviewLogicMode,
  soldPct: number,
  remainingUnits = ownerReviewPrizeUnits(prize),
) {
  if (remainingUnits <= 0) return 0;
  if (ownerReviewPrizeUnlockAtSoldPct(prize, logicMode) > soldPct) return 0;
  return remainingUnits * ownerReviewPrizeWeight(prize, logicMode);
}

function runOwnerReviewSimulation(
  prizes: YnotPrizePreview[],
  logicMode: OwnerReviewLogicMode,
  cardEdits: Record<string, OwnerReviewCardEdit>,
  totalPulls: number,
  draws: number,
  seedHex: string,
): OwnerReviewSimResult {
  const sampleDraws = Math.max(1, Math.round(draws || 0));
  const packSize = Math.max(1, Math.round(totalPulls || sampleDraws));
  // Build the active table the same way the RPC samples prize units:
  // remaining units multiplied by the row weight, with sold-% gates applied.
  const entries = prizes
    .map((prize) => {
      const edit = cardEdits[prize.id];
      const effectivePrize = {
        ...prize,
        weight: edit?.weight ?? prize.weight ?? 1,
        unlockAtSoldPct:
          edit?.unlockAtSoldPct ?? prize.unlockAtSoldPct ?? 0,
      };
      return {
        tier: ownerReviewTierFromPrize(prize),
        prize: effectivePrize,
        remainingUnits: ownerReviewPrizeUnits(effectivePrize),
        value: prize.valueThb ?? 0,
      };
    })
    .filter((row) => row.remainingUnits > 0);

  const counts: Record<OwnerReviewTier, number> = {
    rainbow: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
  };
  const expected: Record<OwnerReviewTier, number> = {
    rainbow: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
  };

  const cumulativeStep = Math.max(1, Math.floor(sampleDraws / 50));
  const cumulative: Record<OwnerReviewTier, number[]> = {
    rainbow: [],
    gold: [],
    silver: [],
    bronze: [],
  };
  const payouts: number[] = [];

  if (entries.length === 0) {
    return {
      counts,
      expected,
      cumulative,
      payoutAvg: 0,
      payoutWorst10: 0,
      payoutBest1: 0,
      draws: sampleDraws,
      seed: seedHex,
      ranAt: Date.now(),
    };
  }

  const seedNum = parseInt(seedHex, 16) || Date.now();
  const random = mulberry32(seedNum);

  for (let i = 0; i < sampleDraws; i++) {
    const soldPct = Math.min(100, ((i + 1) / packSize) * 100);
    const pool = entries
      .map((row) => ({
        row,
        weight: ownerReviewEffectivePoolWeight(
          row.prize,
          logicMode,
          soldPct,
          row.remainingUnits,
        ),
      }))
      .filter((entry) => entry.weight > 0);
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) break;

    for (const entry of pool) {
      expected[entry.row.tier] += (entry.weight / totalWeight);
    }

    const target = random() * totalWeight;
    let acc = 0;
    for (const entry of pool) {
      acc += entry.weight;
      if (target <= acc) {
        entry.row.remainingUnits -= 1;
        counts[entry.row.tier] += 1;
        payouts.push(entry.row.value);
        break;
      }
    }
    if ((i + 1) % cumulativeStep === 0 || i === sampleDraws - 1) {
      for (const tier of OWNER_REVIEW_TIER_ORDER) {
        cumulative[tier].push(counts[tier]);
      }
    }
  }

  payouts.sort((a, b) => a - b);
  const payoutAvg =
    payouts.reduce((sum, value) => sum + value, 0) / Math.max(1, payouts.length);
  const worstIdx = Math.max(0, Math.floor(payouts.length * 0.1) - 1);
  const bestIdx = Math.min(payouts.length - 1, Math.ceil(payouts.length * 0.99) - 1);
  return {
    counts,
    expected,
    cumulative,
    payoutAvg,
    payoutWorst10: payouts[worstIdx] ?? 0,
    payoutBest1: payouts[bestIdx] ?? 0,
    draws: sampleDraws,
    seed: seedHex,
    ranAt: Date.now(),
  };
}

function ownerReviewRecommendedLogicMode(
  prizes: YnotPrizePreview[],
): OwnerReviewLogicMode {
  // UI guidance only: the actual simulator/open math stays in ownerReviewEffectivePoolWeight.
  const hasUnlockPlan = prizes.some(
    (prize) => ownerReviewPrizeUnlockAtSoldPct(prize, "inventory_gated") > 0,
  );
  if (hasUnlockPlan) return "inventory_gated";

  const hasCustomWeights = prizes.some(
    (prize) => ownerReviewPrizeWeight(prize, "weighted_templates") !== 1,
  );
  return hasCustomWeights ? "weighted_templates" : "pure_random";
}

function ownerReviewRecommendationReason(
  recommendedMode: OwnerReviewLogicMode,
) {
  if (recommendedMode === "inventory_gated") {
    return "Unlock gates are configured, so this keeps early pulls from seeing locked prizes.";
  }
  if (recommendedMode === "weighted_templates") {
    return "Weights are configured, so this uses the intended prize balance without sold-% gates.";
  }
  return "No custom weights or unlock gates are set, so pure random is the cleanest match.";
}

function ownerReviewComparisonDrawCount(totalPulls: number, drawSampleSize: number) {
  const selectedDraws = Math.max(1, Math.round(drawSampleSize || 0));
  const packSize = Math.max(1, Math.round(totalPulls || selectedDraws));
  const firstTenPercent = Math.max(1, Math.ceil(packSize * 0.1));
  return Math.min(selectedDraws, firstTenPercent, 10000);
}

type OwnerReviewDiffRow = {
  key: string;
  before: string;
  after: string;
};

function ownerReviewBuildDiff(
  current: {
    logicMode: OwnerReviewLogicMode;
    totalPulls: number;
    bundles: number[];
    guarantees: Record<"single" | "ten" | "hundred", OwnerReviewGuarantee>;
    cardEdits: Record<string, OwnerReviewCardEdit>;
  },
  baseline: Record<string, unknown> | null,
  prizes: YnotPrizePreview[],
): OwnerReviewDiffRow[] {
  if (!baseline) {
    return [
      { key: "snapshot", before: "—", after: "draft (not yet published)" },
    ];
  }
  const baseLogic =
    typeof baseline.mode === "string" ? (baseline.mode as string) : "pure_random";
  const baseTotalPulls =
    typeof baseline.totalPulls === "number"
      ? (baseline.totalPulls as number)
      : typeof baseline.totalSlots === "number"
      ? (baseline.totalSlots as number)
      : null;
  const baseBundles = Array.isArray(baseline.openQuantityOptions)
    ? (baseline.openQuantityOptions as number[]).join(", ")
    : "—";
  const baseGuarantees =
    baseline.guarantees && typeof baseline.guarantees === "object"
      ? (baseline.guarantees as Record<string, string>)
      : {};
  const baseEdits =
    baseline.ownerOverrides &&
    typeof baseline.ownerOverrides === "object" &&
    (baseline.ownerOverrides as Record<string, unknown>).byCard &&
    typeof (baseline.ownerOverrides as Record<string, unknown>).byCard === "object"
      ? ((baseline.ownerOverrides as Record<string, unknown>).byCard as Record<
          string,
          OwnerReviewCardEdit
        >)
      : {};

  const diff: OwnerReviewDiffRow[] = [];
  if (baseLogic !== current.logicMode) {
    diff.push({ key: "logic_mode", before: baseLogic, after: current.logicMode });
  }
  if (baseTotalPulls !== null && baseTotalPulls !== current.totalPulls) {
    diff.push({
      key: "total_pulls",
      before: baseTotalPulls.toLocaleString(),
      after: current.totalPulls.toLocaleString(),
    });
  }
  const currentBundles = current.bundles.join(", ") || "—";
  if (baseBundles !== currentBundles) {
    diff.push({ key: "bundles", before: baseBundles, after: currentBundles });
  }
  for (const slot of ["single", "ten", "hundred"] as const) {
    const before = baseGuarantees[slot] ?? "none";
    const after = current.guarantees[slot];
    if (before !== after) {
      diff.push({ key: `guarantee_${slot}`, before, after });
    }
  }
  for (const prize of prizes) {
    const beforeWeight = baseEdits[prize.id]?.weight ?? prize.weight ?? 0;
    const beforeUnlock =
      baseEdits[prize.id]?.unlockAtSoldPct ?? prize.unlockAtSoldPct ?? 0;
    const editWeight =
      current.cardEdits[prize.id]?.weight ?? prize.weight ?? 0;
    const editUnlock =
      current.cardEdits[prize.id]?.unlockAtSoldPct ?? prize.unlockAtSoldPct ?? 0;
    if (beforeWeight !== editWeight) {
      diff.push({
        key: `${prize.cardName}.weight`,
        before: String(beforeWeight),
        after: String(editWeight),
      });
    }
    if (beforeUnlock !== editUnlock) {
      diff.push({
        key: `${prize.cardName}.unlock`,
        before: `${beforeUnlock}%`,
        after: `${editUnlock}%`,
      });
    }
  }
  if (!diff.length) {
    return [{ key: "no_changes", before: "—", after: "no changes vs published" }];
  }
  return diff;
}

export function AdminOwnerReview({
  viewer,
  campaign,
  prizes,
  approvalRequest,
}: {
  viewer: YnotViewer;
  campaign: YnotCampaign;
  prizes: YnotPrizePreview[];
  approvalRequest: YnotOwnerApprovalRequest | null;
}) {
  const router = useRouter();
  const logicSnapshotRaw =
    approvalRequest && isRecord((approvalRequest as { snapshot?: unknown }).snapshot)
      ? ((approvalRequest as { snapshot?: unknown }).snapshot as Record<string, unknown>)
      : null;
  const persistedOverrides =
    logicSnapshotRaw && isRecord(logicSnapshotRaw.ownerOverrides)
      ? (logicSnapshotRaw.ownerOverrides as Record<string, unknown>)
      : null;
  const persistedGuarantees =
    persistedOverrides && isRecord(persistedOverrides.guarantees)
      ? (persistedOverrides.guarantees as Record<string, unknown>)
      : null;
  const persistedByCard =
    persistedOverrides && isRecord(persistedOverrides.byCard)
      ? (persistedOverrides.byCard as Record<string, OwnerReviewCardEdit>)
      : null;
  const publishedBaseline =
    logicSnapshotRaw && isRecord(logicSnapshotRaw.published)
      ? (logicSnapshotRaw.published as Record<string, unknown>)
      : null;

  const [logicMode, setLogicMode] = useState<OwnerReviewLogicMode>(
    (campaign.logicMode ?? "weighted_templates") as OwnerReviewLogicMode,
  );
  const [guarantees] = useState<
    Record<"single" | "ten" | "hundred", OwnerReviewGuarantee>
  >({
    single: ownerReviewReadGuarantee(persistedGuarantees?.single),
    ten: ownerReviewReadGuarantee(persistedGuarantees?.ten),
    hundred: ownerReviewReadGuarantee(persistedGuarantees?.hundred),
  });
  const [cardEdits, setCardEdits] = useState<Record<string, OwnerReviewCardEdit>>(
    persistedByCard ?? {},
  );
  const [notes, setNotes] = useState(campaign.approvalNotes ?? "");
  const [drawSampleSize, setDrawSampleSize] = useState<number>(1000);
  const [simResult, setSimResult] = useState<OwnerReviewSimResult | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const effectivePrizes = useMemo(
    () =>
      prizes.map((prize) => {
        const edit = cardEdits[prize.id];
        return {
          ...prize,
          weight: edit?.weight ?? prize.weight ?? 1,
          unlockAtSoldPct:
            edit?.unlockAtSoldPct ?? prize.unlockAtSoldPct ?? 0,
          ownerTier: ownerReviewTierFromPrize(prize),
        };
      }),
    [prizes, cardEdits],
  );

  const totalWeight = effectivePrizes.reduce(
    (sum, prize) => sum + ownerReviewEffectivePoolWeight(prize, logicMode, 0),
    0,
  );
  const tierRollups = useMemo(() => {
    return OWNER_REVIEW_TIER_ORDER.map((tier) => {
      const subset = effectivePrizes.filter((prize) => prize.ownerTier === tier);
      const weight = subset.reduce(
        (sum, prize) =>
          sum + ownerReviewEffectivePoolWeight(prize, logicMode, 0),
        0,
      );
      const planned = subset.reduce(
        (sum, prize) => sum + ownerReviewPrizeUnits(prize),
        0,
      );
      const pct = totalWeight === 0 ? 0 : (weight / totalWeight) * 100;
      return {
        tier,
        weight,
        planned,
        cards: subset.length,
        pct,
      };
    });
  }, [effectivePrizes, logicMode, totalWeight]);

  const totalPlanned = effectivePrizes.reduce(
    (sum, prize) => sum + (prize.plannedQuantity ?? 0),
    0,
  );

  const expectedValuePerOpen =
    totalWeight === 0
      ? 0
      : effectivePrizes.reduce(
          (sum, prize) =>
            sum +
            (ownerReviewEffectivePoolWeight(prize, logicMode, 0) / totalWeight) *
              (prize.valueThb ?? 0),
          0,
        );

  const totalConvertPayoutCoins = effectivePrizes.reduce(
    (sum, prize) =>
      sum +
      Math.max(0, prize.convertCoinValue ?? 0) *
        Math.max(0, prize.plannedQuantity ?? 0),
    0,
  );
  const averageConvertPerCardCoins =
    totalWeight === 0
      ? 0
      : effectivePrizes.reduce(
          (sum, prize) =>
            sum +
            (ownerReviewEffectivePoolWeight(prize, logicMode, 0) / totalWeight) *
              (prize.convertCoinValue ?? 0),
          0,
        );
  const convertDeadlineDaysDisplay =
    campaign.convertDeadlineDays === null ||
    campaign.convertDeadlineDays === undefined
      ? "no deadline"
      : `${campaign.convertDeadlineDays} days`;

  const baseCostCoins = Math.max(1, campaign.costCoins ?? 1);
  const expectedRtp = baseCostCoins > 0 ? (expectedValuePerOpen / baseCostCoins) * 100 : 0;

  const recommendedLogicMode = useMemo(
    () => ownerReviewRecommendedLogicMode(effectivePrizes),
    [effectivePrizes],
  );
  const recommendationReason = ownerReviewRecommendationReason(recommendedLogicMode);

  const simulatorModeComparisons = useMemo<OwnerReviewModeComparison[]>(() => {
    if (campaign.mode !== "instant_gacha") return [];

    const comparisonDraws = ownerReviewComparisonDrawCount(
      campaign.totalSlots,
      drawSampleSize,
    );
    const comparisonSeed = simResult?.seed ?? "0dd5eed0";

    return OWNER_REVIEW_LOGIC_OPTIONS.map((option) => ({
      mode: option.value,
      label: option.label,
      result: runOwnerReviewSimulation(
        prizes,
        option.value,
        cardEdits,
        campaign.totalSlots,
        comparisonDraws,
        comparisonSeed,
      ),
      recommended: option.value === recommendedLogicMode,
    }));
  }, [
    campaign.mode,
    campaign.totalSlots,
    cardEdits,
    drawSampleSize,
    prizes,
    recommendedLogicMode,
    simResult?.seed,
  ]);
  const recommendedComparison = simulatorModeComparisons.find(
    (row) => row.recommended,
  );

  const bundles = useMemo(
    () => normalizeOpenQuantityOptions(campaign.openQuantityOptions),
    [campaign.openQuantityOptions],
  );

  const diffRows = useMemo(
    () =>
      ownerReviewBuildDiff(
        {
          logicMode,
          totalPulls: campaign.totalSlots ?? 0,
          bundles,
          guarantees,
          cardEdits,
        },
        publishedBaseline,
        prizes,
      ),
    [logicMode, campaign.totalSlots, bundles, guarantees, cardEdits, publishedBaseline, prizes],
  );

  const runSimulation = useCallback(
    (draws: number) => {
      const seedHex = ownerReviewSeed();
      startTransition(() => {
        const result = runOwnerReviewSimulation(
          prizes,
          logicMode,
          cardEdits,
          campaign.totalSlots,
          draws,
          seedHex,
        );
        setSimResult(result);
      });
    },
    [prizes, logicMode, cardEdits, campaign.totalSlots],
  );

  // Real-time simulator (Instant Gacha only): re-run on every edit, debounced
  // 250ms so typing stays smooth. Slot pick has no weights → no simulation.
  useEffect(() => {
    if (campaign.mode !== "instant_gacha") return;
    const handle = setTimeout(() => {
      runSimulation(drawSampleSize);
    }, 250);
    return () => clearTimeout(handle);
  }, [campaign.mode, logicMode, cardEdits, drawSampleSize, runSimulation]);

  function updateCardEdit(prizeId: string, patch: OwnerReviewCardEdit) {
    setCardEdits((current) => ({
      ...current,
      [prizeId]: { ...current[prizeId], ...patch },
    }));
  }

  type OwnerReviewAction =
    | "save_logic"
    | "approve"
    | "reject"
    | "request_changes"
    | "publish";

  function ownerReviewLifecyclePayload(action: OwnerReviewAction) {
    return {
      campaignId: campaign.id,
      action,
      logicMode,
      note: notes,
      overrides: {
        byCard: cardEdits,
        guarantees,
      },
      guarantees,
    };
  }

  async function postOwnerReviewAction(action: OwnerReviewAction) {
    return requestJson(
      "/api/ynot/admin/campaigns/lifecycle",
      ownerReviewLifecyclePayload(action),
      "POST",
    );
  }

  function sendAction(action: OwnerReviewAction | "approve_and_publish") {
    setMessage("");
    startTransition(async () => {
      try {
        if (action === "approve_and_publish") {
          await postOwnerReviewAction("approve");
          setMessage("Approved. Use Publish live after the page refreshes.");
          router.refresh();
          return;
        }

        await postOwnerReviewAction(action);
        const successMessages: Record<OwnerReviewAction, string> = {
          save_logic: "Overrides saved.",
          approve: "Approved. Use Publish live after the page refreshes.",
          reject: "Rejected — pack stays held from publish.",
          request_changes: "Returned to admin with notes.",
          publish: "Published live/public.",
        };
        setMessage(successMessages[action]);
        if (action !== "save_logic") {
          router.refresh();
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Action could not be saved.",
        );
      }
    });
  }

  const pendingStatus =
    campaign.approvalStatus ??
    (approvalRequest?.approvalStatus as YnotApprovalStatus | undefined) ??
    "not_submitted";
  const alreadyApproved = pendingStatus === "approved";
  const alreadyPublished =
    campaign.status === "live" && campaign.visibility === "public";

  const headerActions = (
    <>
      <Link
        href="/admin/campaigns"
        className="btn"
        prefetch={false}
        style={{ marginRight: "auto" }}
      >
        <AdminIcon name="chev-r" size={12} style={{ transform: "rotate(180deg)" }} />
        Back to packs
      </Link>
      <span className="chip mono">
        {campaign.slug} · v{publishedBaseline ? "0.7" : "0.1"}
      </span>
      <span className={`pill ${pendingStatus === "pending_review" ? "review" : "draft"}`}>
        <span className="d" />
        {pendingStatus === "pending_review" ? "Pending review" : pendingStatus}
      </span>
      <button
        type="button"
        className="btn btn-danger"
        disabled={isPending}
        onClick={() => sendAction("reject")}
      >
        <AdminIcon name="x" size={12} />
        Reject
      </button>
      <button
        type="button"
        className="btn"
        disabled={isPending}
        onClick={() => sendAction("request_changes")}
      >
        <AdminIcon name="warning" size={12} />
        Request changes
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={isPending || alreadyPublished}
        onClick={() =>
          sendAction(alreadyApproved ? "publish" : "approve_and_publish")
        }
      >
        <AdminIcon name="check" size={12} />
        {alreadyPublished
          ? "Published"
          : alreadyApproved
            ? "Publish live"
            : "Approve inventory"}
      </button>
    </>
  );

  const pricingSummary = bundles
    .map((qty) => {
      const baseCoins = qty * baseCostCoins;
      return `${qty}×${baseCoins.toLocaleString()}c`;
    })
    .join(" · ") || `1×${baseCostCoins.toLocaleString()}c`;

  return (
    <AdminFrame
      viewer={viewer}
      active="/admin/campaigns"
      trail={["Admin", "Pack studio", "Random packs", `Review · ${campaign.slug}`]}
      eyebrow="Owner approval"
      title={`Review · ${campaign.titleEn || campaign.titleTh}`}
      desc="Tune draw logic, simulate opens, and approve or request changes. Owner-only — staff cannot publish."
      actions={headerActions}
    >
      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Pack</div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em", marginTop: 4 }}>
            {campaign.titleEn || campaign.titleTh}
          </div>
          <div className="text-mute mono" style={{ fontSize: 11, marginTop: 3 }}>
            {campaign.slug} · {campaign.mode === "instant_gacha" ? "Instant gacha" : "Slot pick"}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Pool size</div>
          <div className="value">{(campaign.totalSlots ?? 0).toLocaleString()}</div>
          <div className="text-mute" style={{ fontSize: 11 }}>
            slots planned · {totalPlanned.toLocaleString()} prize units assigned
          </div>
        </div>
        <div className="kpi">
          <div className="label">Pricing</div>
          <div className="value">฿{(campaign.priceThb ?? 0).toLocaleString()}</div>
          <div className="text-mute" style={{ fontSize: 11 }}>{pricingSummary}</div>
        </div>
        <div className="kpi">
          <div className="label">Expected RTP</div>
          <div className="value">{expectedRtp.toFixed(1)}%</div>
          <div className={`delta ${expectedRtp >= 75 && expectedRtp <= 100 ? "up" : "down"}`} style={{ fontSize: 11 }}>
            <AdminIcon name={expectedRtp >= 75 && expectedRtp <= 100 ? "arrow-up" : "arrow-dn"} size={11} />
            {expectedRtp >= 75 && expectedRtp <= 100 ? "Within owner band (75-100%)" : "Outside owner band — review"}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Convert payout pool</div>
          <div className="value">
            {totalConvertPayoutCoins.toLocaleString()} coins
          </div>
          <div className="text-mute" style={{ fontSize: 11 }}>
            Avg {averageConvertPerCardCoins.toFixed(0)} coins/card · deadline {convertDeadlineDaysDisplay}
          </div>
        </div>
      </div>

      {message && (
        <div className="card-pad" style={{ background: "rgba(244,197,66,0.08)", border: "1px solid rgba(244,197,66,0.2)", borderRadius: 8, fontSize: 12 }}>
          {message}
        </div>
      )}

      <div className="split-aside">
        <section className="card">
          <div className="card-head">
            <div>
              <p className="section-label">
                {campaign.mode === "slot_pick" ? "Prize lineup" : "Draw logic"}
              </p>
              <h3>
                {campaign.mode === "slot_pick"
                  ? "Slot pick · pure random per spot"
                  : "Random algorithm"}
              </h3>
            </div>
            {campaign.mode === "instant_gacha" && (
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={isPending}
                  onClick={() => {
                    setCardEdits({});
                    setMessage("Reset to admin draft (unsaved).");
                  }}
                >
                  Reset to admin draft
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={isPending}
                  onClick={() => sendAction("save_logic")}
                >
                  <AdminIcon name="check" size={12} />
                  Save overrides
                </button>
              </div>
            )}
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {campaign.mode === "instant_gacha" && (
            <>
            <div className="field">
              <label>Logic mode</label>
              <div className="tabs" style={{ width: "100%" }}>
                {OWNER_REVIEW_LOGIC_OPTIONS.map((m) => (
                  <button
                    type="button"
                    key={m.value}
                    className={`t ${logicMode === m.value ? "active" : ""}`}
                    style={{ flex: 1, padding: "7px 10px", textAlign: "left", background: "transparent", border: 0, cursor: "pointer", color: "inherit", fontFamily: "inherit" }}
                    onClick={() => setLogicMode(m.value)}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: "var(--a-muted)", marginTop: 2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--a-muted)" }}>
                pure_random ignores all weights; weighted_templates uses card weights; inventory_gated also locks prizes until pack hits sold %.
              </div>
            </div>

            <hr className="hr" />

            <div className="section-label">Per-tier active odds</div>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 90px", gap: 10, alignItems: "center", fontSize: 11, color: "var(--a-muted)", padding: "0 4px" }}>
              <div>Tier</div>
              <div>Active share</div>
              <div className="num">Hit %</div>
              <div className="num">Override</div>
            </div>
            {tierRollups.map((row) => (
              <div key={row.tier} style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px 90px", gap: 10, alignItems: "center" }}>
                <span className={`tier-pill ${row.tier}`}>{row.tier}</span>
                <div>
                  <div className="bar"><i style={{ width: `${Math.min(100, row.pct)}%` }} /></div>
                  <div className="text-mute" style={{ fontSize: 10, marginTop: 3 }}>
                    {row.cards} cards · {row.planned} units
                  </div>
                </div>
                <div className="num tnum" style={{ fontWeight: 600 }}>{row.pct.toFixed(2)}%</div>
                <div>
                  <input
                    className="input tnum"
                    style={{ padding: "4px 8px", textAlign: "right", fontSize: 11 }}
                    defaultValue={row.pct.toFixed(1)}
                    disabled
                    title="Per-tier overrides are a v2 feature — edit per-card weights below for now."
                  />
                </div>
              </div>
            ))}
            </>
            )}

            {campaign.mode === "instant_gacha" && <hr className="hr" />}

            <div className="section-label">
              {campaign.mode === "slot_pick"
                ? "Prize lineup (slot pick — pure random per spot, no weights)"
                : "Per-card weights & unlocks"}
            </div>
            {effectivePrizes.length === 0 && (
              <div
                className="text-mute"
                style={{ padding: 16, textAlign: "center", fontSize: 12 }}
              >
                No prizes assigned to this pack yet.
              </div>
            )}
            {OWNER_REVIEW_TIER_ORDER.map((tier) => {
              const rows = effectivePrizes.filter((prize) => prize.ownerTier === tier);
              if (!rows.length) return null;
              const tierLabel =
                tier === "rainbow"
                  ? "Rainbow tier"
                  : tier === "gold"
                  ? "Gold tier"
                  : tier === "silver"
                  ? "Silver tier"
                  : "Bronze tier";
              const tierNote =
                tier === "bronze"
                  ? "Base / lowest tier rewards that cover the pack."
                  : `${tierLabel.replace(" tier", "")} chase rewards reviewed above lower tiers.`;
              return (
                <div
                  key={tier}
                  style={{
                    border: "1px solid var(--a-border-soft)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 12px",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{tierLabel}</div>
                      <div style={{ fontSize: 10, color: "var(--a-muted)", marginTop: 2 }}>
                        {tierNote}
                      </div>
                    </div>
                    <span className={`tier-pill ${tier}`}>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
                  </div>
                  <table className="tbl" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "40%" }}>Prize</th>
                        {campaign.mode === "instant_gacha" && (
                          <>
                            <th className="num" style={{ width: 90 }}>Weight</th>
                            <th className="num" style={{ width: 110 }}>Unlock %</th>
                            <th className="num" style={{ width: 90 }}>Per-pull %</th>
                          </>
                        )}
                        {campaign.mode === "slot_pick" && (
                            <th className="num" style={{ width: 150 }}>Planned pack quantity</th>
                        )}
                        <th className="num" style={{ width: 70 }}>Planned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((prize) => {
                        const poolShare =
                          totalWeight === 0
                            ? 0
                            : (ownerReviewEffectivePoolWeight(prize, logicMode, 0) /
                                totalWeight) *
                              100;
                        return (
                          <tr key={prize.id}>
                          <td>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              {prize.cardImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={prize.cardImageUrl}
                                  alt={prize.cardName}
                                  width={32}
                                  height={44}
                                  style={{
                                    objectFit: "cover",
                                    borderRadius: 4,
                                    border: "1px solid var(--a-border-soft)",
                                    flex: "none",
                                  }}
                                />
                              ) : (
                                <span className="thumb" style={{ width: 32, height: 44 }} />
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div className="row-title" style={{ fontSize: 12 }}>{prize.cardName}</div>
                                <div className="row-sub mono" style={{ fontSize: 10 }}>
                                  {prize.cardCode ?? "—"}
                                  {prize.cardGrade ? ` · ${prize.cardGrade}` : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          {campaign.mode === "instant_gacha" && (
                            <>
                              <td className="num">
                                <input
                                  className="input tnum"
                                  style={{
                                    padding: "4px 6px",
                                    width: 70,
                                    textAlign: "right",
                                    fontSize: 11,
                                    opacity: logicMode === "pure_random" ? 0.45 : 1,
                                    cursor: logicMode === "pure_random" ? "not-allowed" : "text",
                                  }}
                                  defaultValue={prize.weight}
                                  disabled={logicMode === "pure_random"}
                                  title={
                                    logicMode === "pure_random"
                                      ? "Pure random ignores weights"
                                      : undefined
                                  }
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    if (Number.isFinite(next) && next >= 0) {
                                      updateCardEdit(prize.id, { weight: next });
                                    }
                                  }}
                                />
                              </td>
                              <td className="num">
                                <input
                                  className="input tnum"
                                  style={{
                                    padding: "4px 6px",
                                    width: 70,
                                    textAlign: "right",
                                    fontSize: 11,
                                    opacity: logicMode !== "inventory_gated" ? 0.45 : 1,
                                    cursor:
                                      logicMode !== "inventory_gated"
                                        ? "not-allowed"
                                        : "text",
                                  }}
                                  defaultValue={prize.unlockAtSoldPct}
                                  disabled={logicMode !== "inventory_gated"}
                                  title={
                                    logicMode === "pure_random"
                                      ? "Pure random ignores unlock %"
                                      : logicMode === "weighted_templates"
                                      ? "Weighted templates ignore unlock % — use Inventory-gated to lock prizes until pack hits sold %"
                                      : undefined
                                  }
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    if (Number.isFinite(next) && next >= 0 && next <= 100) {
                                      updateCardEdit(prize.id, { unlockAtSoldPct: next });
                                    }
                                  }}
                                />
                              </td>
                              <td className="num tnum text-mute">
                                {`${poolShare.toFixed(3)}%`}
                              </td>
                            </>
                          )}
                          {campaign.mode === "slot_pick" && (
                            <td className="num tnum text-mute">
                              {prize.plannedQuantity ?? 0} units
                            </td>
                          )}
                          <td className="num tnum">{prize.plannedQuantity ?? 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card">
            <div className="card-head">
              <div>
                <p className="section-label">
                  {campaign.mode === "instant_gacha" ? "Simulator · live" : "Distribution"}
                </p>
                <h3>
                  {campaign.mode === "instant_gacha"
                    ? `Run ${drawSampleSize.toLocaleString()} opens`
                    : "Per-tier hit share (slot pick · planned units)"}
                </h3>
              </div>
              {campaign.mode === "instant_gacha" && (
                <div className="actions">
                  <select
                    className="select"
                    style={{ padding: "4px 8px", width: 96, fontSize: 11 }}
                    value={drawSampleSize}
                    onChange={(event) => setDrawSampleSize(Number(event.target.value) || 1000)}
                  >
                    <option value={1000}>1,000</option>
                    <option value={10000}>10,000</option>
                    <option value={100000}>100,000</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={isPending}
                    onClick={() => runSimulation(drawSampleSize)}
                  >
                    <AdminIcon name="play" size={12} />
                    Reseed
                  </button>
                </div>
              )}
            </div>
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="text-mute" style={{ fontSize: 11 }}>
                {campaign.mode === "slot_pick" ? (
                  "Slot pick draws are pure random per spot. Each tier share = planned units in tier ÷ total planned units."
                ) : simResult ? (
                  <>
                    Auto-runs on every edit · {simResult.draws.toLocaleString()} opens · seed{" "}
                    <span className="mono">0x{simResult.seed}</span>
                  </>
                ) : (
                  "Loading simulation…"
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {tierRollups.map((row) => {
                  const actual = simResult?.counts[row.tier] ?? 0;
                  const expected = simResult?.expected[row.tier] ?? 0;
                  const slotPickPct =
                    totalPlanned === 0 ? 0 : (row.planned / totalPlanned) * 100;
                  const pctOfDraws =
                    campaign.mode === "slot_pick"
                      ? slotPickPct
                      : simResult && simResult.draws > 0
                      ? (actual / simResult.draws) * 100
                      : row.pct;
                  return (
                    <div key={row.tier}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className={`tier-pill ${row.tier}`}>{row.tier}</span>
                          <span style={{ fontSize: 11, color: "var(--a-muted)" }}>
                            {row.cards} card{row.cards === 1 ? "" : "s"} · {row.planned} units
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 11 }}>
                          {campaign.mode === "slot_pick" ? (
                            <span className="tnum" style={{ fontWeight: 600, fontSize: 13 }}>
                              {slotPickPct.toFixed(2)}%
                            </span>
                          ) : (
                            <>
                              <span className="tnum" style={{ fontWeight: 600, fontSize: 13 }}>{actual.toLocaleString()}</span>
                              <span className="text-mute">actual</span>
                              <span className="tnum text-mute">vs expected {expected.toFixed(1)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, pctOfDraws)}%`, background: OWNER_REVIEW_TIER_COLORS[row.tier], borderRadius: 4 }} />
                        {campaign.mode === "instant_gacha" && simResult && simResult.draws > 0 && (
                          <div style={{ position: "absolute", top: 0, left: `${Math.min(100, (expected / simResult.draws) * 100)}%`, height: "100%", width: 1, background: "rgba(255,255,255,0.7)" }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {campaign.mode === "instant_gacha" &&
                simulatorModeComparisons.length > 0 && (
                  <div
                    style={{
                      border: "1px solid var(--a-border-soft)",
                      borderRadius: 7,
                      background: "rgba(255,255,255,0.02)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px 8px",
                      }}
                    >
                      <div>
                        <div className="section-label">Logic mode comparison</div>
                        <div className="text-mute" style={{ fontSize: 10, marginTop: 3 }}>
                          First {simulatorModeComparisons[0]?.result.draws.toLocaleString()} opens · expected tier hits
                        </div>
                      </div>
                      {recommendedComparison && (
                        <span className="tier-pill gold">
                          Recommended · {recommendedComparison.label}
                        </span>
                      )}
                    </div>
                    <div
                      className="text-mute"
                      style={{ fontSize: 11, padding: "0 12px 8px" }}
                    >
                      {recommendationReason}
                    </div>
                    <table className="tbl" style={{ width: "100%" }}>
                      <thead>
                        <tr>
                          <th>Mode</th>
                          {OWNER_REVIEW_TIER_ORDER.map((tier) => (
                            <th key={tier} className="num">
                              {ownerReviewTierLabel(tier)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {simulatorModeComparisons.map((comparison) => {
                          const { result } = comparison;
                          return (
                            <tr key={comparison.mode}>
                              <td>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span>{comparison.label}</span>
                                  {comparison.mode === logicMode && (
                                    <span className="text-mute" style={{ fontSize: 10 }}>
                                      selected
                                    </span>
                                  )}
                                  {comparison.recommended && (
                                    <span className="tier-pill gold">recommend</span>
                                  )}
                                </div>
                              </td>
                              {OWNER_REVIEW_TIER_ORDER.map((tier) => {
                                const expectedHits = result.expected[tier];
                                const expectedPct =
                                  result.draws === 0
                                    ? 0
                                    : (expectedHits / result.draws) * 100;
                                return (
                                  <td key={tier} className="num tnum">
                                    {expectedHits.toLocaleString(undefined, {
                                      maximumFractionDigits: 2,
                                    })}
                                    <div className="text-mute" style={{ fontSize: 10 }}>
                                      {expectedPct.toFixed(2)}%
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

              {simResult && campaign.mode === "instant_gacha" && (
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>
                    Hits over {simResult.draws.toLocaleString()} opens (cumulative)
                  </div>
                  <svg viewBox="0 0 600 110" preserveAspectRatio="none" style={{ width: "100%", height: 110 }}>
                    {[20, 40, 60, 80, 100].map((y) => (
                      <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />
                    ))}
                    {OWNER_REVIEW_TIER_ORDER.map((tier) => {
                      const series = simResult.cumulative[tier];
                      if (!series.length) return null;
                      const maxValue = Math.max(1, series[series.length - 1]);
                      const points = series
                        .map((value, idx) => {
                          const x = (idx / (series.length - 1 || 1)) * 600;
                          const y = 108 - (value / maxValue) * 100;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(" ");
                      return (
                        <polyline
                          key={tier}
                          points={points}
                          fill="none"
                          stroke={OWNER_REVIEW_TIER_COLORS[tier]}
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </svg>
                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--a-muted)", marginTop: 4 }}>
                    {OWNER_REVIEW_TIER_ORDER.map((tier) => (
                      <span key={tier}>
                        <span style={{ display: "inline-block", width: 8, height: 2, background: OWNER_REVIEW_TIER_COLORS[tier], marginRight: 5, verticalAlign: "middle" }} />
                        {tier}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {simResult && campaign.mode === "instant_gacha" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--a-border-soft)", borderRadius: 7 }}>
                  <div>
                    <div className="section-label">Avg payout / open</div>
                    <div className="tnum" style={{ fontWeight: 600, fontSize: 14, color: "var(--a-mint)" }}>
                      ฿{simResult.payoutAvg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="section-label">Worst 10% pulls</div>
                    <div className="tnum" style={{ fontWeight: 600, fontSize: 14 }}>
                      ฿{simResult.payoutWorst10.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="section-label">Best 1% pulls</div>
                    <div className="tnum" style={{ fontWeight: 600, fontSize: 14, color: "var(--a-gold)" }}>
                      ฿{simResult.payoutBest1.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <p className="section-label">Diff vs published</p>
                <h3>{publishedBaseline ? "What changed since last publish" : "First review — no published baseline yet"}</h3>
              </div>
            </div>
            <div className="card-pad">
              <pre className="mono" style={{ fontSize: 11, background: "rgba(7,7,15,0.5)", border: "1px solid var(--a-border-soft)", padding: 12, borderRadius: 6, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.7 }}>
                {diffRows
                  .map((row) => `${row.key.padEnd(24, " ")} ${row.before}  →  ${row.after}`)
                  .join("\n")}
              </pre>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <p className="section-label">Notes for admin</p>
                <h3>Optional message</h3>
              </div>
            </div>
            <div className="card-pad">
              <textarea
                className="textarea"
                placeholder="Explain what to change before next submission…"
                style={{ minHeight: 90 }}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </section>
        </div>
      </div>
    </AdminFrame>
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

function DuplicateCardCaution({
  cardName,
  code,
  usage,
  confirmed,
  onConfirmedChange,
}: {
  cardName: string;
  code?: string | null;
  usage: AdminCardDuplicateUsage;
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
}) {
  return (
    <div className="admin-form-message" role="status">
      <strong>This card already exists.</strong>
      <br />
      Saving will update the existing catalog card
      {code ? ` (${code})` : ""}: {cardName}. Existing inventory and pack usage
      stay linked.
      <br />
      Stock: {usage.stockAvailable.toLocaleString()}/
      {usage.stockTotal.toLocaleString()} available,{" "}
      {usage.stockReserved.toLocaleString()} reserved,{" "}
      {usage.stockAllocated.toLocaleString()} allocated. Pack assignments:{" "}
      {usage.prizeAssignmentCount.toLocaleString()}.
      <label
        className="admin-field"
        style={{ marginTop: 10, maxWidth: "none" }}
      >
        <span>Overwrite confirmation</span>
        <span
          style={{
            alignItems: "center",
            display: "flex",
            gap: 8,
          }}
        >
          <input
            checked={confirmed}
            onChange={(event) => onConfirmedChange(event.target.checked)}
            type="checkbox"
          />
          I understand this will replace the old card details/image.
        </span>
      </label>
    </div>
  );
}

type PrizeCreateModalKind = "card" | "stock";

/**
 * Header actions for the Prize catalog page. Replaces the two always-visible
 * "Create catalog item" / "Add stock units" forms with a pair of buttons that
 * each open the corresponding form in a modal, keeping the page focused on the
 * catalog table.
 */
export function AdminPrizeCreateActions({
  cards,
  prizes,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
}) {
  const [openModal, setOpenModal] = useState<PrizeCreateModalKind | null>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!openModal) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenModal(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openModal]);

  useEffect(
    () => () => {
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    },
    [],
  );

  function handleModalBodyScroll() {
    const el = modalBodyRef.current;
    if (!el) return;
    el.classList.add("is-scrolling");
    if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => {
      el.classList.remove("is-scrolling");
    }, 700);
  }

  return (
    <>
      <div className="admin-prize-create-actions">
        <button
          type="button"
          className="admin-prize-create-btn"
          onClick={() => setOpenModal("card")}
        >
          <AdminIcon name="plus" size={14} />
          Add card
        </button>
        <button
          type="button"
          className="admin-prize-create-btn"
          onClick={() => setOpenModal("stock")}
        >
          <AdminIcon name="plus" size={14} />
          Add stock
        </button>
      </div>

      {openModal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpenModal(null);
          }}
        >
          <div className="admin-modal admin-prize-create-modal" role="document">
            <header className="admin-modal-head">
              <button
                type="button"
                className="admin-prize-create-modal-close"
                onClick={() => setOpenModal(null)}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="admin-modal-title" style={{ color: "#fff" }}>
                {openModal === "card" ? "Create catalog item" : "Add stock units"}
              </h2>
            </header>
            <div
              className="admin-prize-create-modal-body"
              ref={modalBodyRef}
              onScroll={handleModalBodyScroll}
            >
              {openModal === "card" ? (
                <AdminCardForm cards={cards} prizes={prizes} />
              ) : (
                <AdminCardStockUnitForm cards={cards} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AdminCardForm({
  cards,
  prizes,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [name, setName] = useState("");
  const [series, setSeries] = useState("Pokemon");
  const [language, setLanguage] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [cardSet, setCardSet] = useState("");
  const [variant, setVariant] = useState("");
  const [catalogCategory, setCatalogCategory] =
    useState<CatalogCategory>("Single Cards");
  const [imageUrl, setImageUrl] = useState("");
  const [imageStoragePath, setImageStoragePath] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [seedRunId, setSeedRunId] = useState("");
  const [assetSource, setAssetSource] = useState("");
  const [assetLicense, setAssetLicense] = useState("");
  const [assetManifestKey, setAssetManifestKey] = useState("");
  const [psaCert, setPsaCert] = useState("");
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState("");
  const imagePreviewObjectUrlRef = useRef<string | null>(null);
  const [overwriteConfirmedForCardId, setOverwriteConfirmedForCardId] =
    useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const duplicateCard = useMemo(
    () => findAdminCardDuplicate(cards, { code, name }),
    [cards, code, name],
  );
  const duplicateUsage = useMemo(
    () => (duplicateCard ? adminCardDuplicateUsage(duplicateCard, prizes) : null),
    [duplicateCard, prizes],
  );
  const overwriteConfirmed = Boolean(
    duplicateCard &&
      overwriteConfirmedForCardId === duplicateCard.catalogCardId,
  );
  const canConfirmOverwrite = Boolean(duplicateCard) && overwriteConfirmed;

  useEffect(() => {
    return () => {
      if (imagePreviewObjectUrlRef.current) {
        URL.revokeObjectURL(imagePreviewObjectUrlRef.current);
      }
    };
  }, []);

  function replaceImagePreviewUrl(nextUrl: string, objectUrl = false) {
    if (imagePreviewObjectUrlRef.current) {
      URL.revokeObjectURL(imagePreviewObjectUrlRef.current);
      imagePreviewObjectUrlRef.current = null;
    }
    if (objectUrl) imagePreviewObjectUrlRef.current = nextUrl;
    setImagePreviewUrl(nextUrl);
  }

  function submit() {
    startTransition(async () => {
      try {
        setMessage("");
        let nextImageUrl = imageUrl.trim();
        let nextImageStoragePath = imageStoragePath.trim();
        if (imageFile) {
          const uploaded = await uploadAdminCardImage(imageFile, {
            code,
            name,
          });
          nextImageUrl = uploaded.imageUrl;
          nextImageStoragePath = uploaded.storagePath;
          setImageUrl(uploaded.imageUrl);
          setImageStoragePath(uploaded.storagePath);
          replaceImagePreviewUrl(uploaded.imageUrl);
        }
        const payload = await postJson("/api/ynot/admin/cards", {
          modelCode: code,
          cardNumber: cardNumber || null,
          name,
          series,
          language: language || null,
          releaseYear: releaseYear || null,
          cardSet,
          variant,
          catalogCategory,
          prizeCategory: prizeCategoryForCatalogCategory(catalogCategory),
          imageUrl: nextImageUrl,
          imageStoragePath: nextImageStoragePath,
          isTest,
          seedRunId,
          assetSource,
          assetLicense,
          assetManifestKey,
          confirmOverwrite: canConfirmOverwrite,
        });
        setMessage(`Catalog item ${payload.card?.name ?? name} saved.`);
        setImageFile(null);
        setOverwriteConfirmedForCardId(null);
        router.refresh();
      } catch (error) {
        if (
          error instanceof AdminRequestError &&
          error.code === "CARD_ALREADY_EXISTS"
        ) {
          setMessage(error.message);
          return;
        }
        setMessage(
          error instanceof Error ? error.message : "Catalog item could not be saved.",
        );
      }
    });
  }

  async function fillFromCert() {
    const cert = psaCert.trim();
    if (!cert || filling) return;
    setFilling(true);
    setFillError("");
    try {
      const response = await fetch("/api/ynot/admin/gemrate-cert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cert, grader: "psa" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setFillError(data?.error || "Cert lookup failed.");
        return;
      }
      const draft = data?.lookup?.productDraft;
      if (!draft) {
        setFillError("No card details found for this cert.");
        return;
      }
      if (draft.productName) setName(draft.productName);
      if (draft.brandName) setSeries(String(draft.brandName));
      if (draft.languageName) setLanguage(draft.languageName);
      if (draft.releaseYear) setReleaseYear(String(draft.releaseYear));
      if (draft.setName) setCardSet(draft.setName);
      if (draft.modelCode) setCardNumber(draft.modelCode);
      if (draft.variant) setVariant(draft.variant);
    } catch {
      setFillError("Could not look up this cert.");
    } finally {
      setFilling(false);
    }
  }

  return (
      <section className="admin-panel admin-form-panel soft-card">
        <div className="admin-form-sections">
          <section className="admin-form-section">
            <p className="admin-form-section-label">Import</p>
            <div className="admin-field admin-field-wide">
              <span>PSA cert</span>
              <div className="admin-cert-fill">
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                  value={psaCert}
                  onChange={(event) => setPsaCert(event.target.value)}
                  placeholder="Enter PSA cert to fill product"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void fillFromCert();
                    }
                  }}
                />
                <button
                  type="button"
                  className="admin-cert-fill-btn"
                  onClick={() => void fillFromCert()}
                  disabled={filling || !psaCert.trim()}
                >
                  {filling ? "Filling…" : "Fill"}
                </button>
              </div>
              {fillError && (
                <small style={{ color: "#ff8a98" }}>{fillError}</small>
              )}
            </div>
          </section>
          <section className="admin-form-section">
            <p className="admin-form-section-label">Basic</p>
            <div className="admin-form-grid">
              <AdminField label="Product name" required>
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Kaya, Charizard, booster box, or supplies"
                />
              </AdminField>
              <AdminField label="Brands" required>
                <AdminCardOptionSelect
                  kind="brand"
                  value={series}
                  onChange={setSeries}
                  placeholder="Select brand…"
                />
              </AdminField>
              <AdminField label="Sub-category" required>
                <AdminCardOptionSelect
                  kind="catalog_category"
                  value={catalogCategory}
                  onChange={setCatalogCategory}
                  placeholder="Select sub-category…"
                />
              </AdminField>
            </div>
          </section>

          <section className="admin-form-section">
            <p className="admin-form-section-label">Details</p>
            <div className="admin-form-grid">
              <AdminField label="Model code">
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="OP-PSA10-001"
                />
              </AdminField>
              <AdminField label="Card number">
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  placeholder="057 or #057/204"
                />
              </AdminField>
              <AdminField label="Language">
                <AdminCardOptionSelect
                  kind="language"
                  value={language}
                  onChange={setLanguage}
                  placeholder="Select language…"
                />
              </AdminField>
              <AdminField label="Release year">
                <AdminCardOptionSelect
                  kind="release_year"
                  value={releaseYear}
                  onChange={setReleaseYear}
                  placeholder="Select year…"
                />
              </AdminField>
              <AdminField label="Set">
                <AdminCardOptionSelect
                  kind="set"
                  value={cardSet}
                  onChange={setCardSet}
                  placeholder="Select set…"
                />
              </AdminField>
              <AdminField label="Variant">
                <AdminCardOptionSelect
                  kind="variant"
                  value={variant}
                  onChange={setVariant}
                  placeholder="Select variant…"
                />
              </AdminField>
            </div>
          </section>

          {/* Condition / grade / grading service / cert / GemRate live in the
              "Add stock units" form — those describe the physical item (unit),
              not the product identity. */}
          <section className="admin-form-section">
            <p className="admin-form-section-label">Image</p>
            <div className="admin-form-grid">
              <div className="admin-field admin-field-wide admin-image-dropzone-field-wrap">
                <AdminImageDropzone
                  imageUrl={imageUrl}
                  imageFile={imageFile}
                  previewUrl={imagePreviewUrl}
                  manualUrl={imageUrl}
                  cardCode={code}
                  cardName={name}
                  label="Card image"
                  hint="Drag &amp; drop a JPG / PNG / WEBP, or paste a URL. Uploaded to Supabase storage."
                  onFileChange={(file) => {
                    setImageFile(file);
                    if (file) {
                      setImageStoragePath("");
                      replaceImagePreviewUrl(URL.createObjectURL(file), true);
                    } else {
                      replaceImagePreviewUrl(imageUrl.trim());
                    }
                  }}
                  onManualUrlChange={(value) => {
                    setImageUrl(value);
                    setImageFile(null);
                    setImageStoragePath("");
                    replaceImagePreviewUrl(value.trim());
                  }}
                  onClear={() => {
                    setImageFile(null);
                    setImageUrl("");
                    setImageStoragePath("");
                    replaceImagePreviewUrl("");
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      {duplicateCard && duplicateUsage && (
        <DuplicateCardCaution
          cardName={duplicateCard.name}
          code={duplicateCard.modelCode ?? duplicateCard.code}
          confirmed={overwriteConfirmed}
          usage={duplicateUsage}
          onConfirmedChange={(confirmed) =>
            setOverwriteConfirmedForCardId(
              confirmed ? duplicateCard.catalogCardId : null,
            )
          }
        />
      )}
      <button
        className="gold-button admin-form-save"
        disabled={
          isPending ||
          !name.trim() ||
          (Boolean(duplicateCard) && !overwriteConfirmed)
        }
        onClick={submit}
        type="button"
      >
        {isPending
          ? imageFile
            ? "Uploading..."
            : "Saving..."
          : duplicateCard
            ? "Update existing card"
            : "Save catalog item"}
      </button>
      {message && <p className="admin-form-message">{message}</p>}
    </section>
  );
}

/**
 * Adds physical stock units to an existing catalog product. Each unit carries
 * its own condition/grade/cert (the product row stays pure identity). Graded
 * slabs are added one at a time with a unique cert; raw/sealed are added as N
 * identical rows. Posts to the card-stock API which stamps the identity onto
 * the units it creates.
 */
export function AdminCardStockUnitForm({
  cards,
  initialCardId,
}: {
  cards: CardCatalogItem[];
  initialCardId?: string;
}) {
  const router = useRouter();
  const [cardId, setCardId] = useState(initialCardId ?? "");
  const [condition, setCondition] = useState<CardCondition>("raw");
  const [grade, setGrade] = useState("");
  const [gradingService, setGradingService] = useState<GradingService | "">("");
  const [certNumber, setCertNumber] = useState("");
  const [gemrateId, setGemrateId] = useState("");
  const [count, setCount] = useState("1");
  const [imageUrl, setImageUrl] = useState("");
  const [imageStoragePath, setImageStoragePath] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const imagePreviewObjectUrlRef = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const isGraded = condition === "graded";
  const hasCert = isGraded && certNumber.trim().length > 0;
  // A cert pins one physical slab, so it can only attach to a single unit.
  const effectiveCount = hasCert
    ? 1
    : Math.min(10000, Math.max(1, Math.trunc(Number(count) || 1)));
  const productCardOptions = useMemo(
    () =>
      cards.map((card) => ({
        value: card.catalogCardId,
        label: `${card.name}${card.code ? ` (${card.code})` : ""}`,
      })),
    [cards],
  );

  function replaceUnitPreviewUrl(nextUrl: string, objectUrl = false) {
    if (imagePreviewObjectUrlRef.current) {
      URL.revokeObjectURL(imagePreviewObjectUrlRef.current);
      imagePreviewObjectUrlRef.current = null;
    }
    if (objectUrl) imagePreviewObjectUrlRef.current = nextUrl;
    setImagePreviewUrl(nextUrl);
  }

  function submit() {
    startTransition(async () => {
      try {
        setMessage("");
        if (!cardId) {
          setMessage("Select a product card first.");
          return;
        }
        if (isGraded && !grade.trim()) {
          setMessage("Choose a grade for graded stock.");
          return;
        }
        if (isGraded && !gradingService) {
          setMessage("Choose a grading service for graded stock.");
          return;
        }
        let nextImageUrl = imageUrl.trim();
        let nextImageStoragePath = imageStoragePath.trim();
        if (imageFile) {
          const uploaded = await uploadAdminCardImage(imageFile, {
            code: cardId,
            name: certNumber || "unit",
          });
          nextImageUrl = uploaded.imageUrl;
          nextImageStoragePath = uploaded.storagePath;
        }
        await postJson("/api/ynot/admin/card-stock", {
          cardId,
          quantityDelta: effectiveCount,
          reason: "admin_catalog",
          condition,
          grade: isGraded ? grade.trim() : "",
          gradingService: isGraded ? gradingService || "" : "",
          certNumber: isGraded ? certNumber.trim() : "",
          gemrateId: isGraded ? gemrateId.trim() : "",
          imageUrl: nextImageUrl,
          imageStoragePath: nextImageStoragePath,
        });
        setMessage(
          `Added ${effectiveCount} ${condition} unit${effectiveCount > 1 ? "s" : ""}.`,
        );
        setCertNumber("");
        setGemrateId("");
        setImageFile(null);
        setImageUrl("");
        setImageStoragePath("");
        replaceUnitPreviewUrl("");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Units could not be added.",
        );
      }
    });
  }

  return (
    <section className="admin-panel admin-form-panel soft-card">
      <div className="admin-form-grid">
        <AdminField label="Product card" required>
          <AdminSearchableSelect
            value={cardId}
            onChange={setCardId}
            placeholder="Select product…"
            searchPlaceholder="Search product…"
            options={productCardOptions}
          />
        </AdminField>
        <AdminField label="Condition">
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={condition}
            onChange={(event) =>
              setCondition(event.target.value as CardCondition)
            }
          >
            {cardConditionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </AdminField>
        {isGraded ? (
          <>
            <AdminField label="Grade" required>
              <select
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
              >
                <option value="">-- Select --</option>
                {cardGradeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Grading service" required>
              <select
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                value={gradingService}
                onChange={(event) =>
                  setGradingService(event.target.value as GradingService | "")
                }
              >
                <option value="">-- Select --</option>
                {gradingServiceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField
              label="Cert number"
              hint="Unique per slab — adding a cert forces a single unit."
            >
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                value={certNumber}
                onChange={(event) => setCertNumber(event.target.value)}
                placeholder="154130791"
              />
            </AdminField>
            <AdminField label="GemRate ID">
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
                value={gemrateId}
                onChange={(event) => setGemrateId(event.target.value)}
                placeholder="GemRate record ID"
              />
            </AdminField>
          </>
        ) : null}
        <AdminField
          label="How many"
          hint={hasCert ? "Locked to 1 because a cert is set." : undefined}
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            type="number"
            min={1}
            max={10000}
            value={hasCert ? 1 : count}
            disabled={hasCert}
            onChange={(event) => setCount(event.target.value)}
          />
        </AdminField>
        <div className="admin-field admin-field-wide admin-image-dropzone-field-wrap">
          <AdminImageDropzone
            imageUrl={imageUrl}
            imageFile={imageFile}
            previewUrl={imagePreviewUrl}
            manualUrl={imageUrl}
            label="Unit image (optional)"
            hint="Photo of this specific slab. Leave empty to use the product image."
            onFileChange={(file) => {
              setImageFile(file);
              if (file) {
                setImageStoragePath("");
                replaceUnitPreviewUrl(URL.createObjectURL(file), true);
              } else {
                replaceUnitPreviewUrl(imageUrl.trim());
              }
            }}
            onManualUrlChange={(value) => {
              setImageUrl(value);
              setImageFile(null);
              setImageStoragePath("");
              replaceUnitPreviewUrl(value.trim());
            }}
            onClear={() => {
              setImageFile(null);
              setImageUrl("");
              setImageStoragePath("");
              replaceUnitPreviewUrl("");
            }}
          />
        </div>
      </div>
      <button
        className="admin-form-submit"
        onClick={submit}
        type="button"
        disabled={isPending}
      >
        {isPending ? "Adding..." : `Add ${effectiveCount} unit${effectiveCount > 1 ? "s" : ""}`}
      </button>
      {message && <p className="admin-form-message">{message}</p>}
    </section>
  );
}

async function requestUnitJson(
  method: "PATCH" | "DELETE",
  body: unknown,
): Promise<void> {
  const res = await fetch("/api/ynot/admin/card-stock/unit", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
}

async function fetchEditableStockUnits(
  cardId: string,
  groupKey: string,
): Promise<NonNullable<CardCatalogItem["stockUnits"]>> {
  const params = new URLSearchParams({
    cardId,
    groupKey,
    limit: "200",
  });
  const res = await fetch(`/api/ynot/admin/card-stock/units?${params}`);
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    units?: NonNullable<CardCatalogItem["stockUnits"]>;
  };
  if (!res.ok) throw new Error(data.error || "Could not load units.");
  return data.units ?? [];
}

/** One row in the catalog's per-unit breakdown — editable + removable when the
 * unit is still available (reserved/allocated units are locked to a pool). */
function AdminStockUnitRow({
  onChanged,
  unit,
}: {
  onChanged?: () => Promise<void> | void;
  unit: NonNullable<CardCatalogItem["stockUnits"]>[number];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [condition, setCondition] = useState<CardCondition>(
    (unit.condition as CardCondition) || "graded",
  );
  const [grade, setGrade] = useState(unit.grade ?? "");
  const [gradingService, setGradingService] = useState<GradingService | "">(
    (unit.gradingService as GradingService) ?? "",
  );
  const [certNumber, setCertNumber] = useState(unit.certNumber ?? "");
  const [gemrateId, setGemrateId] = useState(unit.gemrateId ?? "");
  const [imageUrl, setImageUrl] = useState(unit.imageUrl ?? "");
  const [imageStoragePath, setImageStoragePath] = useState(
    unit.imageStoragePath ?? "",
  );
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState("");
  // Editing is allowed even while a pack holds the unit (reserved/allocated) so
  // admins can fix its identity or attach an image; removal stays restricted to
  // available units so a pack prize slot is never orphaned.
  const editable = ["available", "reserved", "allocated"].includes(unit.status);
  const removable = unit.status === "available";

  async function handleImageFile(file: File | null) {
    if (!file) return;
    try {
      setMsg("");
      setUploading(true);
      const uploaded = await uploadAdminCardImage(file, {
        code: unit.id,
        name: certNumber || "unit",
      });
      setImageUrl(uploaded.imageUrl);
      setImageStoragePath(uploaded.storagePath);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    startBusy(async () => {
      try {
        setMsg("");
        if (condition === "graded" && !grade.trim()) {
          setMsg("Choose a grade for graded stock.");
          return;
        }
        if (condition === "graded" && !gradingService) {
          setMsg("Choose a grading service for graded stock.");
          return;
        }
        await requestUnitJson("PATCH", {
          unitId: unit.id,
          condition,
          grade: condition === "graded" ? grade.trim() : "",
          gradingService: condition === "graded" ? gradingService || "" : "",
          certNumber: condition === "graded" ? certNumber : "",
          gemrateId: condition === "graded" ? gemrateId : "",
          imageUrl,
          imageStoragePath,
        });
        setEditing(false);
        await onChanged?.();
        router.refresh();
      } catch (error) {
        setMsg(error instanceof Error ? error.message : "Could not save unit.");
      }
    });
  }

  function remove() {
    if (!window.confirm("Remove this unit from stock?")) return;
    startBusy(async () => {
      try {
        setMsg("");
        await requestUnitJson("DELETE", { unitId: unit.id });
        await onChanged?.();
        router.refresh();
      } catch (error) {
        setMsg(
          error instanceof Error ? error.message : "Could not remove unit.",
        );
      }
    });
  }

  if (editing) {
    return (
      <li className="admin-stock-unit-row is-editing">
        <div className="admin-stock-unit-edit-grid">
          <select
            className="admin-stock-unit-input"
            value={condition}
            onChange={(event) =>
              setCondition(event.target.value as CardCondition)
            }
          >
            {cardConditionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="admin-stock-unit-input"
            value={grade}
            disabled={condition !== "graded"}
            onChange={(event) => setGrade(event.target.value)}
          >
            <option value="">-- Grade --</option>
            {cardGradeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="admin-stock-unit-input"
            value={gradingService}
            disabled={condition !== "graded"}
            onChange={(event) =>
              setGradingService(event.target.value as GradingService | "")
            }
          >
            <option value="">-- Service --</option>
            {gradingServiceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="admin-stock-unit-input"
            value={certNumber}
            disabled={condition !== "graded"}
            placeholder="Cert #"
            onChange={(event) => setCertNumber(event.target.value)}
          />
          <input
            className="admin-stock-unit-input"
            value={gemrateId}
            disabled={condition !== "graded"}
            placeholder="GemRate ID"
            onChange={(event) => setGemrateId(event.target.value)}
          />
          <label
            className={`admin-stock-unit-image${dragging ? " is-dragging" : ""}`}
            onDragOver={(event) => {
              if (uploading) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (uploading) return;
              void handleImageFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  objectFit: "cover",
                }}
              />
            ) : null}
            <span className="admin-stock-unit-image-btn">
              {uploading
                ? "Uploading..."
                : dragging
                  ? "Drop image"
                  : imageUrl
                    ? "Change / drop image"
                    : "Upload / drop image"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={(event) =>
                handleImageFile(event.target.files?.[0] ?? null)
              }
            />
            {imageUrl ? (
              <button
                type="button"
                className="admin-stock-unit-image-clear"
                onClick={(event) => {
                  event.preventDefault();
                  setImageUrl("");
                  setImageStoragePath("");
                }}
              >
                Remove image
              </button>
            ) : null}
          </label>
        </div>
        <div className="admin-stock-unit-actions">
          <button type="button" onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setMsg("");
            }}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
        {msg && <span className="admin-stock-unit-msg">{msg}</span>}
      </li>
    );
  }

  return (
    <li className="admin-stock-unit-row">
      {unit.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={unit.imageUrl}
          alt=""
          className="admin-stock-unit-thumb"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            objectFit: "cover",
            flex: "0 0 auto",
          }}
        />
      ) : null}
      <span className="admin-stock-unit-label">
        {unit.grade || cardConditionLabel(unit.condition)}
        {unit.gradingService ? ` (${unit.gradingService.toUpperCase()})` : ""}
        {unit.certNumber ? ` · #${unit.certNumber}` : ""}
        <span style={{ opacity: 0.6 }}> — {unit.status}</span>
      </span>
      {editable || removable ? (
        <span className="admin-stock-unit-actions">
          {editable ? (
            <button type="button" onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </button>
          ) : null}
          {removable ? (
            <button type="button" onClick={remove} disabled={busy}>
              Remove
            </button>
          ) : null}
        </span>
      ) : null}
      {msg && <span className="admin-stock-unit-msg">{msg}</span>}
    </li>
  );
}

function prizeAssignmentQuantity(prizes: YnotPrizePoolItem[]) {
  return prizes.reduce(
    (sum, prize) =>
      sum +
      Math.max(
        0,
        Math.trunc(Number(prize.totalUnits || prize.plannedQuantity || 0)),
      ),
    0,
  );
}

function prizeUsageTierLabel(prize: {
  displayGroup?: string | null;
  displayTier?: string | null;
  rank: number;
  tier: "normal" | "high";
  tierRank?: number | null;
}) {
  return `${prizeDisplayTierLabel(
    prizeDisplayTierValue(prize.displayTier ?? prize.displayGroup ?? prize.tier),
  )} #${prize.tierRank ?? prize.rank}`;
}

function prizeStockUsageSummary(prize: YnotPrizePoolItem) {
  const materialized = prize.stockUnitUsages ?? [];
  if (materialized.length) {
    return materialized
      .map((usage) => `${usage.sku} · ${usage.totalUnits.toLocaleString()} unit${usage.totalUnits === 1 ? "" : "s"}`)
      .join(" / ");
  }
  if (prize.intendedStockSku) return `${prize.intendedStockSku} · draft target`;
  return "Main SKU stock";
}

function AdminSubSkuPackUsageList({
  usages,
}: {
  usages: StockSkuPackUsage[];
}) {
  if (!usages.length) {
    return (
      <p className="admin-stock-sku-pack-empty">
        Not assigned to a random pack yet.
      </p>
    );
  }
  return (
    <div className="admin-stock-sku-pack-list">
      {usages.map((usage) => (
        <div
          className="admin-stock-sku-pack-row"
          key={`${usage.prizeId}-${usage.sku}-${usage.source}`}
        >
          <span>
            <strong>{usage.campaignTitle}</strong>
            <small>
              {prizeUsageTierLabel(usage)} · {usage.source === "intended" ? "draft target" : "reserved stock"}
            </small>
          </span>
          <code>{usage.sku}</code>
          <span>
            {usage.availableUnits.toLocaleString()}/
            {usage.units.toLocaleString()} available
            {usage.awardedUnits
              ? ` · ${usage.awardedUnits.toLocaleString()} awarded`
              : ""}
            {usage.voidUnits ? ` · ${usage.voidUnits.toLocaleString()} void` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function AdminSubSkuManageUnits({
  cardId,
  group,
}: {
  cardId: string;
  group: StockSkuGroup;
}) {
  const [units, setUnits] = useState<NonNullable<CardCatalogItem["stockUnits"]>>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Units a pack reserves/allocates are still editable (identity + image), so
  // surface them here too — not only the freely available ones.
  const editableUnits =
    group.availableUnits + group.reservedUnits + group.allocatedUnits;

  async function loadUnits(force = false) {
    if ((!force && loaded) || loading || editableUnits <= 0) return;
    try {
      setError("");
      setLoading(true);
      setUnits(await fetchEditableStockUnits(cardId, group.key));
      setLoaded(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load units.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (editableUnits <= 0) return null;

  return (
    <details
      className="admin-stock-sku-manage"
      onToggle={(event) => {
        if (event.currentTarget.open) void loadUnits();
      }}
    >
      <summary>
        Manage {editableUnits.toLocaleString()} unit
        {editableUnits === 1 ? "" : "s"}
      </summary>
      {loading ? (
        <p className="admin-card-catalog-empty-usage">Loading units...</p>
      ) : null}
      {error ? <p className="admin-form-message">{error}</p> : null}
      {loaded && units.length ? (
        <>
          <ul className="admin-stock-unit-list">
            {units.map((unit) => (
              <AdminStockUnitRow
                key={unit.id}
                unit={unit}
                onChanged={() => loadUnits(true)}
              />
            ))}
          </ul>
          {editableUnits > units.length ? (
            <small>
              Showing first {units.length.toLocaleString()} units.
            </small>
          ) : null}
        </>
      ) : null}
      {loaded && !units.length ? (
        <p className="admin-card-catalog-empty-usage">
          No editable units found for this sub-SKU.
        </p>
      ) : null}
    </details>
  );
}

function AdminStockSkuBreakdown({
  card,
  row,
}: {
  card: CardCatalogItem;
  row: AdminCardCatalogRow;
}) {
  const groups = stockSkuGroups(card);
  const assignedUnits = prizeAssignmentQuantity(row.prizes);
  const usageByGroup = stockSkuPackUsageByGroup(groups, row.prizes);
  const activeUnits = Math.max(0, row.stockTotal - row.stockArchived);
  if (!groups.length && !activeUnits && !assignedUnits) return null;

  return (
    <details className="admin-card-stock-breakdown">
      <summary className="admin-card-stock-summary">
        <span>Stock sub-SKUs</span>
        <strong>
          {groups.length
            ? `${groups.length.toLocaleString()} sub-SKU${groups.length === 1 ? "" : "s"}`
            : "No sub-SKU detail"}
          {assignedUnits ? ` · ${assignedUnits.toLocaleString()} assigned to packs` : ""}
        </strong>
        <em>
          {row.stockAvailable.toLocaleString()}/{activeUnits.toLocaleString()} active
        </em>
      </summary>

      {groups.length ? (
        <div className="admin-stock-sku-list">
          {groups.map((group) => {
            const packUsages = usageByGroup.get(group.key) ?? [];
            const packUsageUnits = packUsages.reduce(
              (sum, usage) => sum + usage.units,
              0,
            );
            return (
              <article className="admin-stock-sku-row" key={group.key}>
                <div className="admin-stock-sku-main">
                  <div className="admin-stock-sku-identity">
                    <strong>{group.label}</strong>
                    <code className="admin-stock-sku-code">{group.sku}</code>
                  </div>
                  <small>
                    {group.availableUnits.toLocaleString()}/
                    {group.totalUnits.toLocaleString()} available
                  </small>
                </div>
                <div className="admin-stock-sku-statuses">
                  {group.availableUnits ? (
                    <span>{group.availableUnits.toLocaleString()} available</span>
                  ) : null}
                  {group.reservedUnits ? (
                    <span>{group.reservedUnits.toLocaleString()} reserved</span>
                  ) : null}
                  {group.allocatedUnits ? (
                    <span>{group.allocatedUnits.toLocaleString()} allocated</span>
                  ) : null}
                  {packUsageUnits ? (
                    <span>
                      {packUsageUnits.toLocaleString()} used in{" "}
                      {packUsages.length.toLocaleString()} pack row
                      {packUsages.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                <AdminSubSkuPackUsageList usages={packUsages} />
                <AdminSubSkuManageUnits cardId={card.catalogCardId} group={group} />
              </article>
            );
          })}
        </div>
      ) : (
        <p className="admin-card-catalog-empty-usage">
          Stock exists for this main SKU, but detailed sub-SKU rows are not
          loaded yet.
        </p>
      )}
    </details>
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
      const testCompare = Number(left.card.isTest) - Number(right.card.isTest);
      if (testCompare) return testCompare;
      const assignmentCompare = Number(right.prizes.length > 0) - Number(left.prizes.length > 0);
      if (assignmentCompare) return assignmentCompare;
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
    card.modelCode,
    card.cardNumber,
    card.name,
    card.grade,
    card.series,
    cardLanguageLabel(card.language),
    card.releaseYear,
    card.cardSet,
    card.variant,
    catalogCategoryLabel(card.catalogCategory),
    cardConditionLabel(card.condition),
    gradingServiceLabel(card.gradingService),
    card.certNumber,
    card.gemrateId,
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

function adminCardDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function adminCardCatalogDetails(card: CardCatalogItem) {
  // Condition / grade / cert / GemRate identity now live on the sub-SKU
  // stock units, not the catalog card, and are not editable from "Edit
  // card", so they are intentionally omitted from the card detail grid.
  return [
    { label: "Model code", value: card.modelCode ?? card.code },
    { label: "Card number", value: card.cardNumber },
    { label: "Release year", value: card.releaseYear },
    { label: "Set", value: card.cardSet },
    { label: "Variant", value: card.variant },
  ];
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
  stockUnitKey: string;
};

type AdminCardApiRow = Database["public"]["Tables"]["cards"]["Row"];

function adminCardApiSeries(series: AdminCardApiRow["series"]): CardCatalogItem["series"] {
  if (series === "pokemon") return "Pokemon";
  if (series === "one_piece") return "One Piece";
  return series;
}

function adminCardApiRowToCatalogItem(
  row: AdminCardApiRow,
  previous?: CardCatalogItem,
): CardCatalogItem {
  return {
    id: row.id,
    catalogCardId: row.id,
    code: row.card_code ?? undefined,
    modelCode: row.card_code ?? undefined,
    cardNumber: row.card_number,
    name: row.name,
    searchName: row.search_name,
    searchCode: row.search_code,
    grade: row.grade,
    series: adminCardApiSeries(row.series),
    prizeCategory: row.prize_category ?? "psa10_card",
    language: row.language,
    releaseYear: row.release_year,
    cardSet: row.card_set,
    variant: row.variant,
    catalogCategory: row.catalog_category,
    condition: row.condition,
    gradingService: row.grading_service,
    certNumber: row.cert_number,
    gemrateId: row.gemrate_id,
    photoUrl: row.image_url ?? undefined,
    photoStoragePath: row.image_storage_path ?? undefined,
    isTest: row.is_test,
    seedRunId: row.seed_run_id,
    assetSource: row.asset_source,
    assetLicense: row.asset_license,
    assetManifestKey: row.asset_manifest_key,
    stockTotal: previous?.stockTotal ?? 0,
    stockAvailable: previous?.stockAvailable ?? 0,
    stockReserved: previous?.stockReserved ?? 0,
    stockAllocated: previous?.stockAllocated ?? 0,
    stockArchived: previous?.stockArchived ?? 0,
    // Editing a card never changes its stock, so carry the sub-SKU detail over
    // from the previous row — otherwise the breakdown collapses to "detailed
    // sub-SKU rows are not loaded yet" until a manual refresh.
    stockUnits: previous?.stockUnits,
    stockSkuGroups: previous?.stockSkuGroups,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isAdminCardApiRow(value: unknown): value is AdminCardApiRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.search_name === "string" &&
    (value.series === "pokemon" || value.series === "one_piece") &&
    typeof value.grade === "string"
  );
}

function adminCardFromSavePayload(
  payload: unknown,
  previous?: CardCatalogItem,
) {
  if (!isRecord(payload) || !isAdminCardApiRow(payload.card)) return null;
  return adminCardApiRowToCatalogItem(payload.card, previous);
}

const ADMIN_CATALOG_SORT_OPTIONS: {
  value: AdminCardCatalogSortMode;
  label: string;
}[] = [
  { value: "default", label: "Recommended" },
  { value: "recent", label: "Recently added" },
  { value: "az", label: "Name A–Z" },
  { value: "stock", label: "Stock: high → low" },
];

const ADMIN_CARD_CATALOG_PAGE_SIZE = 24;

type AdminCatalogStockKey = "pools" | "stock" | "archived";

function adminCatalogToggleSetValue<T>(
  setState: React.Dispatch<React.SetStateAction<Set<T>>>,
  value: T,
) {
  setState((previous) => {
    const next = new Set(previous);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

/** Collapsible section inside the catalog FILTERS sidebar. */
function AdminCatalogFilterSection({
  label,
  summary,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  summary: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`catalog-filter-section${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="catalog-filter-section-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="catalog-filter-section-label">{label}</span>
        <span className="catalog-filter-section-summary">{summary}</span>
        <svg
          className="catalog-filter-section-chevron"
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      {expanded && (
        <div className="catalog-filter-section-body">{children}</div>
      )}
    </div>
  );
}

/** One selectable option row (radio or checkbox style) in a filter section. */
function AdminCatalogFilterOption({
  label,
  count,
  selected,
  onClick,
}: {
  label: ReactNode;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`catalog-filter-option${selected ? " is-selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="catalog-filter-option-check" aria-hidden="true" />
      <span className="catalog-filter-option-label">{label}</span>
      {count !== undefined && (
        <span className="catalog-filter-option-count">
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

export function AdminCardCatalogPanel({
  cards,
  prizes,
}: {
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
}) {
  const router = useRouter();
  const [savedCatalogCards, setSavedCatalogCards] = useState(
    () => new Map<string, CardCatalogItem>(),
  );
  const [deletedCatalogCardIds, setDeletedCatalogCardIds] = useState(
    () => new Set<string>(),
  );
  const [query, setQuery] = useState("");
  const [seriesFilter, setSeriesFilter] =
    useState<AdminCardSeriesFilter>("all");
  const [sortMode, setSortMode] =
    useState<AdminCardCatalogSortMode>("default");
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [conditionFilter, setConditionFilter] = useState<Set<string>>(new Set());
  const [gradingFilter, setGradingFilter] = useState<Set<string>>(new Set());
  const [stockFilter, setStockFilter] = useState<Set<AdminCatalogStockKey>>(
    new Set(),
  );
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [visibleRowLimitState, setVisibleRowLimitState] = useState(() => ({
    key: "",
    limit: ADMIN_CARD_CATALOG_PAGE_SIZE,
  }));
  const [openFilterSections, setOpenFilterSections] = useState<Set<string>>(
    () => new Set(["sort"]),
  );
  const [message, setMessage] = useState("");
  const [pendingCardId, setPendingCardId] = useState("");
  const [stockDraft, setStockDraft] = useState<StockAdjustmentDraft | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingCard, setEditingCard] = useState<CardCatalogItem | null>(null);
  const [stockUnitModalCard, setStockUnitModalCard] =
    useState<CardCatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { card: CardCatalogItem; row: AdminCardCatalogRow }
    | null
  >(null);

  const catalogCards = useMemo(() => {
    const serverCardIds = new Set(cards.map((card) => card.catalogCardId));
    const localOnlyCards = [...savedCatalogCards.values()].filter(
      (card) =>
        !serverCardIds.has(card.catalogCardId) &&
        !deletedCatalogCardIds.has(card.catalogCardId),
    );
    return [
      ...localOnlyCards,
      ...cards
        .filter((card) => !deletedCatalogCardIds.has(card.catalogCardId))
        .map((card) => savedCatalogCards.get(card.catalogCardId) ?? card),
    ];
  }, [cards, deletedCatalogCardIds, savedCatalogCards]);

  const rows = useMemo(
    () => buildAdminCardCatalogRows(catalogCards, prizes),
    [catalogCards, prizes],
  );
  const facets = useMemo(() => {
    const category = new Map<string, number>();
    const condition = new Map<string, number>();
    const grading = new Map<string, number>();
    let pools = 0;
    let stocked = 0;
    let archived = 0;
    let pokemon = 0;
    let onePiece = 0;
    for (const row of rows) {
      const cat = String(row.card.catalogCategory ?? "");
      if (cat) category.set(cat, (category.get(cat) ?? 0) + 1);
      const cond = String(row.card.condition ?? "");
      if (cond) condition.set(cond, (condition.get(cond) ?? 0) + 1);
      const grad = String(row.card.gradingService ?? "");
      if (grad) grading.set(grad, (grading.get(grad) ?? 0) + 1);
      if (row.prizes.length > 0) pools += 1;
      if (row.stockTotal > 0) stocked += 1;
      if (row.stockArchived > 0) archived += 1;
      if (row.card.series === "Pokemon") pokemon += 1;
      else if (row.card.series === "One Piece") onePiece += 1;
    }
    return {
      category,
      condition,
      grading,
      pools,
      stocked,
      archived,
      pokemon,
      onePiece,
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let visible = rows;
    if (seriesFilter !== "all") {
      visible = visible.filter((row) => row.card.series === seriesFilter);
    }
    if (normalizedQuery) {
      visible = visible.filter((row) =>
        adminCardCatalogRowSearchText(row).includes(normalizedQuery),
      );
    }
    if (categoryFilter.size) {
      visible = visible.filter((row) =>
        categoryFilter.has(String(row.card.catalogCategory ?? "")),
      );
    }
    if (conditionFilter.size) {
      visible = visible.filter((row) =>
        conditionFilter.has(String(row.card.condition ?? "")),
      );
    }
    if (gradingFilter.size) {
      visible = visible.filter((row) =>
        gradingFilter.has(String(row.card.gradingService ?? "")),
      );
    }
    if (stockFilter.size) {
      visible = visible.filter(
        (row) =>
          (stockFilter.has("pools") && row.prizes.length > 0) ||
          (stockFilter.has("stock") && row.stockTotal > 0) ||
          (stockFilter.has("archived") && row.stockArchived > 0),
      );
    }
    const sorted = [...visible];
    if (sortMode === "az") {
      sorted.sort((left, right) => left.card.name.localeCompare(right.card.name));
    } else if (sortMode === "stock") {
      sorted.sort((left, right) => right.stockTotal - left.stockTotal);
    } else if (sortMode === "recent") {
      sorted.sort((left, right) =>
        String(right.card.updatedAt ?? right.card.createdAt ?? "").localeCompare(
          String(left.card.updatedAt ?? left.card.createdAt ?? ""),
        ),
      );
    }
    return sorted;
  }, [
    rows,
    query,
    seriesFilter,
    sortMode,
    categoryFilter,
    conditionFilter,
    gradingFilter,
    stockFilter,
  ]);
  const visibleRowsKey = useMemo(
    () =>
      [
        query.trim().toLowerCase(),
        seriesFilter,
        sortMode,
        viewMode,
        [...categoryFilter].sort().join("|"),
        [...conditionFilter].sort().join("|"),
        [...gradingFilter].sort().join("|"),
        [...stockFilter].sort().join("|"),
      ].join("::"),
    [
      categoryFilter,
      conditionFilter,
      gradingFilter,
      query,
      seriesFilter,
      sortMode,
      stockFilter,
      viewMode,
    ],
  );
  const visibleRowLimit =
    visibleRowLimitState.key === visibleRowsKey
      ? visibleRowLimitState.limit
      : ADMIN_CARD_CATALOG_PAGE_SIZE;
  const renderedRows = useMemo(
    () => visibleRows.slice(0, visibleRowLimit),
    [visibleRowLimit, visibleRows],
  );
  const hiddenRowCount = Math.max(0, visibleRows.length - renderedRows.length);

  const activeFilterCount =
    (seriesFilter !== "all" ? 1 : 0) +
    categoryFilter.size +
    conditionFilter.size +
    gradingFilter.size +
    stockFilter.size;

  function toggleFilterSection(id: string) {
    adminCatalogToggleSetValue(setOpenFilterSections, id);
  }

  function clearAllFilters() {
    setSeriesFilter("all");
    setCategoryFilter(new Set());
    setConditionFilter(new Set());
    setGradingFilter(new Set());
    setStockFilter(new Set());
  }

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
      stockUnitKey: mode === "remove" ? defaultRemovableStockUnitKey(card) : "",
    });
  }

  function updateStockDraftQuantity(quantity: string) {
    setStockDraft((current) => (current ? { ...current, quantity } : current));
  }

  function updateStockDraftSubSku(stockUnitKey: string) {
    setStockDraft((current) =>
      current ? { ...current, stockUnitKey } : current,
    );
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
    let selectedRemoveGroup: StockSkuGroup | null = null;
    let stockUnitGroupKey: string | undefined;
    if (stockDraft.mode === "remove") {
      selectedRemoveGroup =
        stockSkuGroups(card).find((group) => group.key === stockDraft.stockUnitKey) ??
        null;
      if (!selectedRemoveGroup) {
        setMessage("Choose a stock sub-SKU before removing stock.");
        return;
      }
      stockUnitGroupKey = selectedRemoveGroup.key;
      if (requestedQuantity > selectedRemoveGroup.availableUnits) {
        setMessage(
          `Only ${selectedRemoveGroup.availableUnits.toLocaleString()} available units can be removed for ${selectedRemoveGroup.sku}.`,
        );
        return;
      }
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
          stockUnitGroupKey,
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
      <div className="admin-card-catalog-toolbar">
        <label className="admin-card-catalog-search">
          <span className="admin-card-catalog-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            aria-label="Search catalog cards"
            placeholder="Search model code, set, variant, cert, GemRate, category, condition, grade, pack"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="admin-card-catalog-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              ×
            </button>
          )}
        </label>
        <div className="admin-card-catalog-toolbar-right">
          <span className="admin-card-catalog-count">
            {visibleRows.length.toLocaleString()} of{" "}
            {catalogCards.length.toLocaleString()}
          </span>
          <div
            className="admin-card-catalog-view-toggle"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              className={`admin-card-catalog-view-btn${viewMode === "grid" ? " is-active" : ""}`}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="1.5" width="5" height="5" rx="1.2" fill="currentColor" />
                <rect x="9.5" y="1.5" width="5" height="5" rx="1.2" fill="currentColor" />
                <rect x="1.5" y="9.5" width="5" height="5" rx="1.2" fill="currentColor" />
                <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={`admin-card-catalog-view-btn${viewMode === "list" ? " is-active" : ""}`}
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="2.4" rx="1" fill="currentColor" />
                <rect x="1.5" y="6.8" width="13" height="2.4" rx="1" fill="currentColor" />
                <rect x="1.5" y="11.1" width="13" height="2.4" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card-catalog-shell">
        <aside className="admin-card-catalog-filters" aria-label="Catalog filters">
          <header className="admin-card-catalog-filters-head">
            <span className="admin-card-catalog-filters-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M2 4.5h7M12 4.5h2" />
                <path d="M2 11.5h3M9 11.5h5" />
                <circle cx="9.5" cy="4.5" r="1.7" />
                <circle cx="6.5" cy="11.5" r="1.7" />
              </svg>
            </span>
            <div className="admin-card-catalog-filters-head-text">
              <p className="section-label">Filters</p>
              <p className="admin-muted-line">Refine catalog</p>
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                className="admin-card-catalog-filters-clear"
                onClick={clearAllFilters}
              >
                Clear ({activeFilterCount})
              </button>
            )}
          </header>

          <AdminCatalogFilterSection
            label="Sort"
            summary={
              ADMIN_CATALOG_SORT_OPTIONS.find((o) => o.value === sortMode)?.label ??
              "Recommended"
            }
            expanded={openFilterSections.has("sort")}
            onToggle={() => toggleFilterSection("sort")}
          >
            {ADMIN_CATALOG_SORT_OPTIONS.map((option) => (
              <AdminCatalogFilterOption
                key={option.value}
                label={option.label}
                selected={sortMode === option.value}
                onClick={() => setSortMode(option.value)}
              />
            ))}
          </AdminCatalogFilterSection>

          <AdminCatalogFilterSection
            label="Series"
            summary={seriesFilter === "all" ? "All" : seriesFilter}
            expanded={openFilterSections.has("series")}
            onToggle={() => toggleFilterSection("series")}
          >
            <AdminCatalogFilterOption
              label="All series"
              count={rows.length}
              selected={seriesFilter === "all"}
              onClick={() => setSeriesFilter("all")}
            />
            <AdminCatalogFilterOption
              label="Pokémon"
              count={facets.pokemon}
              selected={seriesFilter === "Pokemon"}
              onClick={() => setSeriesFilter("Pokemon")}
            />
            <AdminCatalogFilterOption
              label="One Piece"
              count={facets.onePiece}
              selected={seriesFilter === "One Piece"}
              onClick={() => setSeriesFilter("One Piece")}
            />
          </AdminCatalogFilterSection>

          {facets.category.size > 0 && (
            <AdminCatalogFilterSection
              label="Category"
              summary={categoryFilter.size || facets.category.size}
              expanded={openFilterSections.has("category")}
              onToggle={() => toggleFilterSection("category")}
            >
              {[...facets.category.entries()].map(([value, count]) => (
                <AdminCatalogFilterOption
                  key={value}
                  label={catalogCategoryLabel(value as CatalogCategory)}
                  count={count}
                  selected={categoryFilter.has(value)}
                  onClick={() =>
                    adminCatalogToggleSetValue(setCategoryFilter, value)
                  }
                />
              ))}
            </AdminCatalogFilterSection>
          )}

          {facets.condition.size > 0 && (
            <AdminCatalogFilterSection
              label="Condition"
              summary={conditionFilter.size || facets.condition.size}
              expanded={openFilterSections.has("condition")}
              onToggle={() => toggleFilterSection("condition")}
            >
              {[...facets.condition.entries()].map(([value, count]) => (
                <AdminCatalogFilterOption
                  key={value}
                  label={cardConditionLabel(value as CardCondition)}
                  count={count}
                  selected={conditionFilter.has(value)}
                  onClick={() =>
                    adminCatalogToggleSetValue(setConditionFilter, value)
                  }
                />
              ))}
            </AdminCatalogFilterSection>
          )}

          {facets.grading.size > 0 && (
            <AdminCatalogFilterSection
              label="Grading"
              summary={gradingFilter.size || facets.grading.size}
              expanded={openFilterSections.has("grading")}
              onToggle={() => toggleFilterSection("grading")}
            >
              {[...facets.grading.entries()].map(([value, count]) => (
                <AdminCatalogFilterOption
                  key={value}
                  label={gradingServiceLabel(value as GradingService)}
                  count={count}
                  selected={gradingFilter.has(value)}
                  onClick={() =>
                    adminCatalogToggleSetValue(setGradingFilter, value)
                  }
                />
              ))}
            </AdminCatalogFilterSection>
          )}

          <AdminCatalogFilterSection
            label="Stock"
            summary={stockFilter.size || 3}
            expanded={openFilterSections.has("stock")}
            onToggle={() => toggleFilterSection("stock")}
          >
            <AdminCatalogFilterOption
              label="In prize pools"
              count={facets.pools}
              selected={stockFilter.has("pools")}
              onClick={() =>
                adminCatalogToggleSetValue<AdminCatalogStockKey>(
                  setStockFilter,
                  "pools",
                )
              }
            />
            <AdminCatalogFilterOption
              label="With global stock"
              count={facets.stocked}
              selected={stockFilter.has("stock")}
              onClick={() =>
                adminCatalogToggleSetValue<AdminCatalogStockKey>(
                  setStockFilter,
                  "stock",
                )
              }
            />
            <AdminCatalogFilterOption
              label="Has archived"
              count={facets.archived}
              selected={stockFilter.has("archived")}
              onClick={() =>
                adminCatalogToggleSetValue<AdminCatalogStockKey>(
                  setStockFilter,
                  "archived",
                )
              }
            />
          </AdminCatalogFilterSection>
        </aside>

        <div className="admin-card-catalog-content">
          <p className="admin-card-catalog-summary-line">
            <span className="admin-card-catalog-summary-dot admin-card-catalog-summary-dot-mint" aria-hidden="true" />
            <strong>{assignedCount.toLocaleString()}</strong>
            <span>in prize pools</span>
            <span className="admin-card-catalog-summary-sep" aria-hidden="true">
              •
            </span>
            <span className="admin-card-catalog-summary-dot admin-card-catalog-summary-dot-gold" aria-hidden="true" />
            <strong>{stockedCount.toLocaleString()}</strong>
            <span>with global stock</span>
          </p>

          <div
            className={`admin-card-catalog-list${viewMode === "grid" ? " is-grid" : ""}`}
            data-testid="admin-card-catalog-list"
          >
        {renderedRows.map((row) => {
          const card = row.card;
          const currentStockDraft =
            stockDraft?.cardId === card.catalogCardId ? stockDraft : null;
          const stockPending = isPending && pendingCardId === card.catalogCardId;
          const removableStockGroups = stockSkuGroups(card).filter(
            (group) => group.availableUnits > 0,
          );
          const selectedRemoveGroup =
            currentStockDraft?.mode === "remove"
              ? removableStockGroups.find(
                  (group) => group.key === currentStockDraft.stockUnitKey,
                ) ?? removableStockGroups[0] ?? null
              : null;
          return (
            <article
              className={`admin-card-catalog-row${card.isTest ? " is-test" : ""}`}
              key={card.catalogCardId}
            >
              <div className="admin-card-catalog-row-thumb">
                <AdminPrizeCardImage
                  code={card.code}
                  imageUrl={card.photoUrl}
                  name={card.name}
                />
              </div>
              <div className="admin-card-catalog-body">
                <header className="admin-card-catalog-row-head">
                  <div className="admin-card-catalog-row-titles">
                    <strong className="admin-card-catalog-row-name">
                      {card.name}
                    </strong>
                    <p className="admin-muted-line">
                      {[card.releaseYear, card.series]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="admin-muted-line">
                      {[
                        card.modelCode ?? card.code ?? "no model code",
                        card.variant,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="admin-card-catalog-row-pills">
                    <span
                      className={`admin-card-catalog-tag-pill${card.isTest ? " is-test" : ""}`}
                    >
                      {card.isTest ? "Test" : "Normal"}
                    </span>
                    {row.prizes.length > 0 && (
                      <span className="admin-card-catalog-tag-pill is-info">
                        {row.prizes.length.toLocaleString()} pack
                        {row.prizes.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </header>

                <div className="admin-card-catalog-detail-grid">
                  {adminCardCatalogDetails(card).map((detail) => (
                    <div
                      className="admin-card-catalog-detail-item"
                      key={detail.label}
                    >
                      <span>{detail.label}</span>
                      <strong>{adminCardDisplayValue(detail.value)}</strong>
                    </div>
                  ))}
                </div>

                <div className="admin-card-catalog-metrics">
                  <div className="admin-card-catalog-metric">
                    <span>Global stock</span>
                    <strong>
                      {row.stockAvailable.toLocaleString()}/
                      {row.stockTotal.toLocaleString()}
                    </strong>
                    <small>
                      {row.stockReserved.toLocaleString()} reserved ·{" "}
                      {row.stockAllocated.toLocaleString()} allocated
                      {row.stockArchived
                        ? ` · ${row.stockArchived.toLocaleString()} archived`
                        : ""}
                    </small>
                  </div>
                  <div className="admin-card-catalog-metric">
                    <span>Prize pool</span>
                    <strong>
                      {row.packAvailableUnits.toLocaleString()}/
                      {row.packTotalUnits.toLocaleString()}
                    </strong>
                    <small>
                      {row.prizes.length.toLocaleString()} pack slot
                      {row.prizes.length === 1 ? "" : "s"} ·{" "}
                      {row.packAwardedUnits.toLocaleString()} awarded
                      {row.packVoidUnits
                        ? ` · ${row.packVoidUnits.toLocaleString()} void`
                        : ""}
                    </small>
                  </div>
                  <div className="admin-card-catalog-metric">
                    <span>Assignments</span>
                    <strong>{row.prizes.length.toLocaleString()}</strong>
                    <small>
                      {row.prizes.length
                        ? row.prizes
                            .slice(0, 2)
                            .map((prize) => prize.campaignTitle)
                            .join(", ") +
                          (row.prizes.length > 2
                            ? ` +${row.prizes.length - 2} more`
                            : "")
                        : "Not in any pack yet"}
                    </small>
                  </div>
                </div>

                <AdminStockSkuBreakdown card={card} row={row} />

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
	                            ? selectedRemoveGroup
	                              ? `${selectedRemoveGroup.availableUnits.toLocaleString()} available`
	                              : "Choose sub-SKU"
	                            : "Global stock"}
	                        </strong>
	                      </div>
	                      {currentStockDraft.mode === "remove" ? (
	                        <label className="admin-stock-confirm-field">
	                          <span>Stock sub-SKU</span>
	                          <select
	                            disabled={stockPending || !removableStockGroups.length}
	                            value={selectedRemoveGroup?.key ?? ""}
	                            onChange={(event) =>
	                              updateStockDraftSubSku(event.target.value)
	                            }
	                          >
	                            {!removableStockGroups.length ? (
	                              <option value="">No available sub-SKU</option>
	                            ) : null}
	                            {removableStockGroups.map((group) => (
	                              <option key={group.key} value={group.key}>
	                                {group.sku} · {group.label} ·{" "}
	                                {group.availableUnits.toLocaleString()} available
	                              </option>
	                            ))}
	                          </select>
	                        </label>
	                      ) : null}
	                      <label className="admin-stock-confirm-field">
	                        <span>Quantity</span>
	                        <input
                          aria-label={`Stock quantity for ${card.name}`}
                          disabled={stockPending}
	                          max={
	                            currentStockDraft.mode === "remove"
	                              ? selectedRemoveGroup?.availableUnits ?? 0
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
	                                      Math.max(
	                                        1,
	                                        selectedRemoveGroup?.availableUnits ?? 0,
	                                      ),
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
	                              (!selectedRemoveGroup ||
	                                selectedRemoveGroup.availableUnits <= 0))
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
                      <div className="admin-stock-action-group">
                        <button
                          className="plain-button"
                          disabled={isPending}
                          type="button"
                          onClick={() => {
                            setStockDraft(null);
                            setMessage("");
                            setStockUnitModalCard(card);
                          }}
                        >
                          + Add stock
                        </button>
	                        <button
	                          className="plain-button"
	                          disabled={
	                            isPending || !removableStockGroups.length
	                          }
	                          type="button"
                          onClick={() => openStockAdjustment(card, row, "remove")}
                        >
                          − Remove stock
                        </button>
                        <button
                          className="plain-button"
                          disabled={isPending}
                          type="button"
                          onClick={() => setEditingCard(card)}
                        >
                          Edit card
                        </button>
                      </div>
                      <button
                        className="plain-button admin-card-catalog-delete-btn"
                        disabled={isPending || row.prizes.length > 0 || row.stockTotal - row.stockArchived > 0}
                        type="button"
                        title={
                          row.prizes.length > 0
                            ? `Cannot delete - ${row.prizes.length} pack prize slot${row.prizes.length === 1 ? "" : "s"} still reference this card.`
                            : row.stockTotal - row.stockArchived > 0
                              ? `Cannot delete - ${row.stockTotal - row.stockArchived} active stock unit${row.stockTotal - row.stockArchived === 1 ? "" : "s"} still exist. Use "Remove stock" until 0/${row.stockTotal} first.`
                              : `Delete "${card.name}" permanently`
                        }
                        onClick={() => setDeleteTarget({ card, row })}
                      >
                        Delete card
                      </button>
                    </div>
                  )}
                </div>

                <details
                  className="admin-card-catalog-prize-details"
                  open={row.prizes.length > 0}
                >
                  <summary>
                    <span>Random pack usage</span>
                    <strong>
                      {row.prizes.length
                        ? `${row.prizes.length.toLocaleString()} assignment${
                            row.prizes.length === 1 ? "" : "s"
                          }`
                        : "No assignment"}
                    </strong>
                  </summary>
                  {row.prizes.length ? (
                    <div className="admin-card-catalog-prize-table">
                      <div className="admin-card-catalog-prize-head">
                        <span>Random pack</span>
                        <span>Card / stock</span>
                        <span>Tier</span>
                        <span>Weight</span>
                        <span>Unlock</span>
                        <span>Units</span>
                        <span>Awarded</span>
                      </div>
                      {row.prizes.map((prize) => (
                        <div className="admin-card-catalog-prize-row" key={prize.id}>
                          <span>{prize.campaignTitle}</span>
                          <span className="admin-card-catalog-prize-stock-cell">
                            <strong>{card.name}</strong>
                            <small>
                              {[card.modelCode ?? card.code, catalogCategoryLabel(card.catalogCategory)]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                            <code>{prizeStockUsageSummary(prize)}</code>
                          </span>
                          <span>
                            {prizeUsageTierLabel(prize)}
                          </span>
                          <span>{prize.weight.toLocaleString()}</span>
                          <span>{prize.unlockAtSoldPct.toLocaleString()}%</span>
                          <span>
                            {prize.availableUnits.toLocaleString()}/
                            {prize.plannedQuantity.toLocaleString()}
                          </span>
                          <span>
                            {prize.awardedUnits.toLocaleString()}
                            {prize.voidUnits
                              ? ` · ${prize.voidUnits.toLocaleString()} void`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-card-catalog-empty-usage">
                      This card is in the catalog but is not assigned to a
                      random pack prize pool yet.
                    </p>
                  )}
                </details>

                <footer className="admin-card-catalog-row-footer">
                  <span className="admin-card-catalog-row-footer-meta">
                    Updated {formatAdminCatalogDate(card.updatedAt)}
                  </span>
                  <span className="admin-card-catalog-row-footer-sep" aria-hidden="true">·</span>
                  <code className="admin-card-catalog-row-footer-id">
                    {card.catalogCardId}
                  </code>
                </footer>
              </div>
            </article>
          );
        })}
            {!visibleRows.length && (
              <p className="admin-empty-note">
                No catalog cards match this search.
              </p>
            )}
            {hiddenRowCount > 0 && (
              <button
                type="button"
                className="plain-button admin-card-catalog-load-more"
                onClick={() =>
                  setVisibleRowLimitState((current) => {
                    const currentLimit =
                      current.key === visibleRowsKey
                        ? current.limit
                        : ADMIN_CARD_CATALOG_PAGE_SIZE;
                    return {
                      key: visibleRowsKey,
                      limit: Math.min(
                        currentLimit + ADMIN_CARD_CATALOG_PAGE_SIZE,
                        visibleRows.length,
                      ),
                    };
                  })
                }
              >
                Load {Math.min(ADMIN_CARD_CATALOG_PAGE_SIZE, hiddenRowCount).toLocaleString()} more
                <span>
                  {renderedRows.length.toLocaleString()} of{" "}
                  {visibleRows.length.toLocaleString()} shown
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      {message && <p className="admin-form-message">{message}</p>}
      {stockUnitModalCard && (
        <AdminCardStockUnitModal
          card={stockUnitModalCard}
          cards={catalogCards}
          onClose={() => setStockUnitModalCard(null)}
        />
      )}
      {editingCard && (
        <AdminCardEditModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={(savedCard) => {
            setSavedCatalogCards((current) => {
              const next = new Map(current);
              next.set(savedCard.catalogCardId, savedCard);
              return next;
            });
            setDeletedCatalogCardIds((current) => {
              if (!current.has(savedCard.catalogCardId)) return current;
              const next = new Set(current);
              next.delete(savedCard.catalogCardId);
              return next;
            });
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
            const deletedCardId = deleteTarget.card.catalogCardId;
            setDeletedCatalogCardIds((current) => {
              const next = new Set(current);
              next.add(deletedCardId);
              return next;
            });
            setSavedCatalogCards((current) => {
              if (!current.has(deletedCardId)) return current;
              const next = new Map(current);
              next.delete(deletedCardId);
              return next;
            });
            setDeleteTarget(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function AdminCardStockUnitModal({
  card,
  cards,
  onClose,
}: {
  card: CardCatalogItem;
  cards: CardCatalogItem[];
  onClose: () => void;
}) {
  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="admin-modal admin-prize-create-modal admin-card-stock-unit-modal"
        role="document"
      >
        <header className="admin-modal-head">
          <button
            type="button"
            className="admin-prize-create-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
          <h2 className="admin-modal-title" style={{ color: "#fff" }}>
            Add stock units
          </h2>
          <p className="admin-modal-subtitle">
            Main SKU selected: {card.modelCode ?? card.code ?? card.catalogCardId} ·{" "}
            {card.name}
          </p>
        </header>
        <div className="admin-prize-create-modal-body">
          <AdminCardStockUnitForm
            key={card.catalogCardId}
            cards={cards}
            initialCardId={card.catalogCardId}
          />
        </div>
      </div>
    </div>
  );
}

function AdminCardEditModal({
  card,
  onClose,
  onSaved,
}: {
  card: CardCatalogItem;
  onClose: () => void;
  onSaved: (card: CardCatalogItem) => void;
}) {
  const [name, setName] = useState(card.name);
  const [code, setCode] = useState(card.modelCode ?? card.code ?? "");
  const [cardNumber, setCardNumber] = useState(card.cardNumber ?? "");
  const [series, setSeries] = useState(card.series ?? "Pokemon");
  const [language, setLanguage] = useState(card.language ?? "");
  const [releaseYear, setReleaseYear] = useState(
    card.releaseYear ? String(card.releaseYear) : "",
  );
  const [cardSet, setCardSet] = useState(card.cardSet ?? "");
  const [variant, setVariant] = useState(card.variant ?? "");
  const [catalogCategory, setCatalogCategory] = useState<CatalogCategory>(
    card.catalogCategory ?? "Single Cards",
  );
  const [imageUrl, setImageUrl] = useState(card.photoUrl ?? "");
  const [imageStoragePath, setImageStoragePath] = useState(
    card.photoStoragePath ?? "",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(card.photoUrl ?? "");
  const [isTest, setIsTest] = useState(Boolean(card.isTest));
  const [seedRunId, setSeedRunId] = useState(card.seedRunId ?? "");
  const [assetSource, setAssetSource] = useState(card.assetSource ?? "");
  const [assetLicense, setAssetLicense] = useState(card.assetLicense ?? "");
  const [assetManifestKey, setAssetManifestKey] = useState(
    card.assetManifestKey ?? "",
  );
  const imagePreviewObjectUrlRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewObjectUrlRef.current) {
        URL.revokeObjectURL(imagePreviewObjectUrlRef.current);
      }
    };
  }, []);

  function replaceImagePreviewUrl(nextUrl: string, objectUrl = false) {
    if (imagePreviewObjectUrlRef.current) {
      URL.revokeObjectURL(imagePreviewObjectUrlRef.current);
      imagePreviewObjectUrlRef.current = null;
    }
    if (objectUrl) imagePreviewObjectUrlRef.current = nextUrl;
    setImagePreviewUrl(nextUrl);
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      let nextImageUrl = imageUrl.trim();
      let nextImageStoragePath = imageStoragePath.trim();
      if (imageFile) {
        const uploaded = await uploadAdminCardImage(imageFile, {
          code,
          name,
        });
        nextImageUrl = uploaded.imageUrl;
        nextImageStoragePath = uploaded.storagePath;
        setImageUrl(uploaded.imageUrl);
        setImageStoragePath(uploaded.storagePath);
        replaceImagePreviewUrl(uploaded.imageUrl);
      }
      const response = await fetch("/api/ynot/admin/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.catalogCardId,
          name: name.trim() || card.name,
          modelCode: code.trim() || null,
          cardNumber: cardNumber.trim() || null,
          series,
          language: language || null,
          releaseYear: releaseYear || null,
          cardSet,
          variant,
          catalogCategory,
          prizeCategory: prizeCategoryForCatalogCategory(catalogCategory),
          imageUrl: nextImageUrl || null,
          imageStoragePath: nextImageStoragePath || null,
          isTest,
          seedRunId,
          assetSource,
          assetLicense,
          assetManifestKey,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(payload?.error || payload?.message || "Save failed");
      }
      const payload = await response.json().catch(() => null);
      const savedCard = adminCardFromSavePayload(payload, card);
      if (!savedCard) {
        throw new Error("Save response did not include the updated card.");
      }
      onSaved(savedCard);
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
      <div className="admin-modal admin-card-edit-modal" role="document">
        <header className="admin-modal-head">
          <h2 className="admin-modal-title" style={{ color: "#fff" }}>
            Edit card
          </h2>
          <p className="admin-modal-subtitle">
            Updates apply immediately. Customer collection rows that already
            reference this card keep the new name + image after refresh.
          </p>
        </header>
        <div className="admin-card-edit-modal-body">
          <div className="admin-form-grid admin-card-edit-grid">
            <label className="admin-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
            </label>
            <label className="admin-field">
              <span>Model code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} disabled={pending} />
            </label>
            <label className="admin-field">
              <span>Card number</span>
              <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} disabled={pending} />
            </label>
            <div className="admin-field">
              <span>Brands</span>
              <AdminCardOptionSelect
                kind="brand"
                value={series}
                onChange={setSeries}
                placeholder="Select brand…"
                disabled={pending}
              />
            </div>
            <div className="admin-field">
              <span>Language</span>
              <AdminCardOptionSelect
                kind="language"
                value={language}
                onChange={setLanguage}
                placeholder="Select language…"
                disabled={pending}
              />
            </div>
            <div className="admin-field">
              <span>Release year</span>
              <AdminCardOptionSelect
                kind="release_year"
                value={releaseYear}
                onChange={setReleaseYear}
                placeholder="Select year…"
                disabled={pending}
              />
            </div>
            <div className="admin-field">
              <span>Set</span>
              <AdminCardOptionSelect
                kind="set"
                value={cardSet}
                onChange={setCardSet}
                placeholder="Select set…"
                disabled={pending}
              />
            </div>
            <div className="admin-field">
              <span>Variant</span>
              <AdminCardOptionSelect
                kind="variant"
                value={variant}
                onChange={setVariant}
                placeholder="Select variant…"
                disabled={pending}
              />
            </div>
            <div className="admin-field">
              <span>Prize catalog</span>
              <AdminCardOptionSelect
                kind="catalog_category"
                value={catalogCategory}
                onChange={setCatalogCategory}
                placeholder="Select prize catalog…"
                disabled={pending}
              />
            </div>
            <div className="admin-field admin-field-wide admin-image-dropzone-field-wrap">
              <AdminImageDropzone
                imageUrl={imageUrl}
                imageFile={imageFile}
                previewUrl={imagePreviewUrl}
                manualUrl={imageUrl}
                cardCode={code}
                cardName={name || card.name}
                label="Card image"
                hint="Drag &amp; drop a JPG / PNG / WEBP, or paste a URL. Uploaded to Supabase storage."
                disabled={pending}
                onFileChange={(file) => {
                  setImageFile(file);
                  if (file) {
                    setImageStoragePath("");
                    replaceImagePreviewUrl(URL.createObjectURL(file), true);
                  } else {
                    replaceImagePreviewUrl(imageUrl.trim());
                  }
                }}
                onManualUrlChange={(value) => {
                  setImageUrl(value);
                  setImageFile(null);
                  setImageStoragePath("");
                  replaceImagePreviewUrl(value.trim());
                }}
                onClear={() => {
                  setImageFile(null);
                  setImageUrl("");
                  setImageStoragePath("");
                  replaceImagePreviewUrl("");
                }}
              />
            </div>
            <label className="admin-field">
              <span>Test asset</span>
              <span style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <input
                  checked={isTest}
                  disabled={pending}
                  onChange={(e) => setIsTest(e.target.checked)}
                  type="checkbox"
                />
                Mark as test-only catalog data
              </span>
            </label>
            <label className="admin-field">
              <span>Seed run ID</span>
              <input value={seedRunId} onChange={(e) => setSeedRunId(e.target.value)} disabled={pending} />
            </label>
            <label className="admin-field">
              <span>Asset source</span>
              <input value={assetSource} onChange={(e) => setAssetSource(e.target.value)} disabled={pending} />
            </label>
            <label className="admin-field">
              <span>Asset license</span>
              <input value={assetLicense} onChange={(e) => setAssetLicense(e.target.value)} disabled={pending} />
            </label>
            <label className="admin-field">
              <span>Asset manifest key</span>
              <input value={assetManifestKey} onChange={(e) => setAssetManifestKey(e.target.value)} disabled={pending} />
            </label>
          </div>
          {error && (
            <p className="admin-category-row-error" role="alert">
              {error}
            </p>
          )}
        </div>
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            disabled={pending}
            autoFocus
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
          const cardCode =
            item.card?.modelCode ?? item.card?.code ?? firstPrize?.cardCode ?? null;
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
                  {[cardCode ?? "no model code", cardGrade, prizeCategoryLabel(cardCategory)]
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
          `${action === "approve" ? "Identity link approved" : "Identity link rejected"}.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Identity review failed.",
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
          Approve link
        </button>
        <button
          className="danger-button rounded-xl px-3 py-2 text-xs font-black"
          disabled={isPending}
          onClick={() => submit("reject")}
          type="button"
        >
          Reject link
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
        <option value="ready_for_pickup">Ready for pickup</option>
        <option value="picked_up">Picked up</option>
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

  async function submitForOwnerReview(campaign: YnotCampaign) {
    if (
      campaign.approvalStatus === "pending_review" ||
      campaign.approvalStatus === "approved"
    ) {
      return;
    }

    const blocker = campaign.readinessBlockers?.[0];
    if (blocker) {
      setError(
        `Cannot submit "${campaign.titleEn || campaign.titleTh}": ${blocker}`,
      );
      return;
    }

    setPending(campaign.id);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          action: "submit_review",
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { blockers?: string[]; error?: string; message?: string }
          | null;
        throw new Error(
          payload?.blockers?.[0] ||
            payload?.message ||
            payload?.error ||
            "Submit owner review failed",
        );
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Submit owner review failed",
      );
    } finally {
      setPending(null);
    }
  }

  async function publishApprovedCampaign(campaign: YnotCampaign) {
    if (
      campaign.status !== "draft" ||
      campaign.approvalStatus !== "approved"
    ) {
      return;
    }

    setPending(campaign.id);
    setError(null);
    try {
      const response = await fetch("/api/ynot/admin/campaigns/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          action: "publish",
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { blockers?: string[]; error?: string; message?: string }
          | null;
        throw new Error(
          payload?.blockers?.[0] ||
            payload?.message ||
            payload?.error ||
            "Publish failed",
        );
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publish failed");
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
              <th className="admin-pack-table-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="admin-pack-table-empty">
                  No packs match this view.
                </td>
              </tr>
            )}
            {filtered.map((campaign) => {
              const checked = selectedIds.has(campaign.id);
              const isPending = pending === campaign.id;
              const alreadySubmitted =
                campaign.approvalStatus === "pending_review";
              const alreadyApproved = campaign.approvalStatus === "approved";
              const reviewBlocker = campaign.readinessBlockers?.[0];
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
                    {campaign.packCode ? (
                      <span className="admin-pack-table-code">
                        {campaign.packCode}
                      </span>
                    ) : null}
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
                  <td>
                    {campaign.totalSlots.toLocaleString()}
                    {typeof campaign.remainingSlots === "number" ? (
                      <span className="admin-pack-table-slug">
                        {Math.max(
                          0,
                          campaign.totalSlots - campaign.remainingSlots,
                        ).toLocaleString()}{" "}
                        sold ·{" "}
                        {Math.max(0, campaign.remainingSlots).toLocaleString()}{" "}
                        left
                      </span>
                    ) : null}
                  </td>
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
                        {alreadyApproved ? (
                          <button
                            type="button"
                            className="admin-pack-table-action admin-pack-table-action-review"
                            onClick={() => publishApprovedCampaign(campaign)}
                            disabled={isPending || pending !== null}
                            title="Publish this approved draft as live/public"
                          >
                            {isPending ? "…" : "Publish live"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-pack-table-action admin-pack-table-action-review"
                            onClick={() => submitForOwnerReview(campaign)}
                            disabled={
                              isPending ||
                              pending !== null ||
                              alreadySubmitted ||
                              Boolean(reviewBlocker)
                            }
                            title={
                              alreadySubmitted
                                ? "Pack is already waiting for owner review."
                                : reviewBlocker ||
                                  "Send this draft to owner review"
                            }
                          >
                            {isPending
                              ? "…"
                              : alreadySubmitted
                                ? "In review"
                                : "Submit owner review"}
                          </button>
                        )}
                      </>
                    )}
                    {campaign.status === "live" && (
                      <a
                        href={`/admin/campaigns/${campaign.id}/edit`}
                        className="admin-pack-table-action"
                        title="Edit this LIVE pack in place — changes apply immediately and re-materialize stock"
                      >
                        Edit live
                      </a>
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
        {/* Type-to-confirm only on bulk delete — gives a real chance to
            catch a stray multi-select. Single delete is just Yes/No
            because each row already shows the pack title in the modal
            header and the server eligibility check refuses any pack
            that still has live opens. */}
        {isBulk && (
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
        )}
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
            disabled={pending || (isBulk && !matches)}
            autoFocus={!isBulk}
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
  const [convertDeadlineDays, setConvertDeadlineDays] = useState<number>(() => {
    const stored = campaign.convertDeadlineDays;
    if (stored === null || stored === undefined) return defaultConvertDeadlineDays;
    const parsed = Math.round(Number(stored));
    if (!Number.isFinite(parsed) || parsed < 1) return defaultConvertDeadlineDays;
    return Math.min(3650, parsed);
  });
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
          convertDeadlineDays,
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
            <span>Convert-to-coin deadline (days)</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={convertDeadlineDays}
              onChange={(event) => {
                const parsed = Math.round(Number(event.target.value));
                if (!Number.isFinite(parsed) || parsed < 1) {
                  setConvertDeadlineDays(defaultConvertDeadlineDays);
                  return;
                }
                setConvertDeadlineDays(Math.min(3650, parsed));
              }}
            />
            <small>
              Days a user has after opening to convert pulled cards into
              coins. Default 14.
            </small>
          </label>
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
            <span>Customer pull buttons</span>
            <div className="admin-edit-chip-row">
              {allowedOpenQuantityOptions.map((option) => {
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
            <small>
              Selected: {openQuantitySummary(openQuantityOptions)}. The open
              pack page only shows selected pull buttons.
            </small>
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

function openQuantityLabel(option: number) {
  return `${option} pull${option === 1 ? "" : "s"}`;
}

function openQuantitySummary(options: number[]) {
  return normalizeOpenQuantityOptions(options)
    .map((option) => `Open ${option}`)
    .join(", ");
}
