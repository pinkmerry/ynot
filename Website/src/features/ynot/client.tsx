"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { CardCatalogItem, ProfileInfo } from "@/lib/lucky-draw/types";
import type {
  YnotAddress,
  YnotApprovalStatus,
  YnotCampaign,
  YnotCategory,
  YnotCollectionItem,
  YnotExchangeOrder,
  YnotOwnerApprovalRequest,
  YnotPaymentMethod,
  YnotPrizePoolItem,
  YnotPrizePreview,
  YnotRandomLogicMode,
  YnotShippingRequest,
} from "./types";

const coinPackages = [
  { label: "Starter", amountThb: 100, coins: 100 },
  { label: "Player", amountThb: 500, coins: 550 },
  { label: "Collector", amountThb: 1000, coins: 1150 },
  { label: "Whale", amountThb: 3000, coins: 3600 },
];

async function requestJson(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Request failed.");
  return payload;
}

async function postJson(url: string, body: unknown) {
  return requestJson(url, body, "POST");
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

function tagsToInput(
  tags: string[] | undefined,
  series: YnotCampaign["series"] = "pokemon",
) {
  const fallback =
    series === "pokemon"
      ? ["PSA10", "New Exclusive"]
      : ["Manga", "New Exclusive"];
  return (tags?.length ? tags : fallback).join(", ");
}

function inputToTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
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
      "Weight changes odds only among prizes that are already eligible to drop.",
      "Higher weight means more chance; weight 0 removes that prize from the random pool.",
      "This mode does not add a 30% delay unless that prize also has an unlock checkpoint.",
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
    "Every unlocked available prize unit has the same chance.",
    "There is no high-tier weight boost in pure random mode.",
    "Prizes with a future sold unlock checkpoint still stay hidden and cannot drop until unlocked.",
  ];
}

function ownerPrizeOddsLabel(
  prize: YnotPrizePreview,
  lineup: YnotPrizePreview[],
  soldPct: number,
) {
  const unlockAtSoldPct = Number(prize.unlockAtSoldPct ?? 0);
  const weight = Number(prize.weight ?? 1);
  if (unlockAtSoldPct > soldPct) return `Locked until ${unlockAtSoldPct}%`;
  if (weight <= 0) return "Disabled";
  const eligibleWeight = lineup
    .filter(
      (candidate) =>
        Number(candidate.weight ?? 1) > 0 &&
        Number(candidate.unlockAtSoldPct ?? 0) <= soldPct,
    )
    .reduce((sum, candidate) => sum + Number(candidate.weight ?? 1), 0);
  if (eligibleWeight <= 0) return "No eligible pool";
  return `${((weight / eligibleWeight) * 100).toFixed(1)}%`;
}

function prizeDisplayGroup(prize: YnotPrizePreview) {
  if (prize.displayGroup) return prize.displayGroup;
  return prize.tier === "high" && prize.rank <= 3 ? "top" : prize.tier;
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
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(payload?.error ?? "Top-up request failed.");
        setMessage(
          `Top-up ${payload.topUp?.publicCode ?? "request"} created for admin review.`,
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
}: {
  campaign: YnotCampaign;
  authenticated: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function open() {
    startTransition(async () => {
      try {
        setMessage("");
        const payload = await postJson("/api/ynot/gacha/open", {
          campaignId: campaign.id,
          quantity,
          idempotencyKey: crypto.randomUUID(),
        });
        setMessage(
          `Opened ${payload.result?.publicCode ?? "gacha"}. Result is now in Collection.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not open gacha.",
        );
      }
    });
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
        Cost: {(campaign.costCoins * quantity).toLocaleString()} coins.
      </p>
      <label className="mt-4 block text-sm font-bold">
        Quantity
        <input
          className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4"
          min={1}
          max={10}
          type="number"
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
        />
      </label>
      {!authenticated ? (
        <a className="primary-action open-start mt-4" href="/login">
          &gt;&gt; START PULL
        </a>
      ) : (
        <button
          className="primary-action open-start mt-4 w-full"
          disabled={isPending}
          onClick={open}
          type="button"
        >
          {isPending ? "Opening..." : ">> START PULL"}
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
        <a href={lineHref}>Connect / reconnect LINE</a>
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

  function loadCategory(nextId: string) {
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
  }

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
    <section className="admin-panel admin-form-panel soft-card">
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
        <AdminField
          label="Icon"
          hint="Emoji or short text shown in admin/category cards."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            placeholder="✨"
          />
        </AdminField>
        <AdminField
          label="Legacy compatibility"
          hint="Only use this for Pokemon/One Piece backfill compatibility."
        >
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={legacySeries}
            onChange={(event) =>
              setLegacySeries(event.target.value as typeof legacySeries)
            }
          >
            <option value="">No legacy series</option>
            <option value="pokemon">Pokemon compatibility</option>
            <option value="one_piece">One Piece compatibility</option>
          </select>
        </AdminField>
        <AdminField label="Sort order" hint="Lower number appears first.">
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            min={0}
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
            placeholder="100"
          />
        </AdminField>
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

type CampaignPrizeDraft = {
  localId: string;
  group: "top" | "high" | "normal";
  cardId: string;
  tier: "normal" | "high";
  prizeCategory: PrizeCategory;
  rank: number;
  valueThb: number;
  quantity: number;
  weight: number;
  unlockAtSoldPct: number;
};

type PrizeCategory =
  | "psa10_card"
  | "sealed_product"
  | "console_gaming"
  | "audio_electronics"
  | "store_credit"
  | "other";

type PrizeSourceType = "card" | "sealed" | "physical" | "credit" | "other";

const minHighTierCount = 5;
const maxHighTierCount = 20;
const defaultHighTierCount = 10;
const highTierCountChoices = [5, 10, 15, 20] as const;

const prizeCategoryOptions: Array<{
  value: PrizeCategory;
  label: string;
  sourceType: PrizeSourceType;
}> = [
  { value: "psa10_card", label: "PSA10 card", sourceType: "card" },
  { value: "sealed_product", label: "Sealed/card product", sourceType: "sealed" },
  { value: "console_gaming", label: "Console/gaming", sourceType: "physical" },
  { value: "audio_electronics", label: "Audio/electronics", sourceType: "physical" },
  { value: "store_credit", label: "Store credit", sourceType: "credit" },
  { value: "other", label: "Other prize", sourceType: "other" },
];

function firstCatalogCardId(cards: CardCatalogItem[]) {
  return cards[0]?.catalogCardId ?? "";
}

function prizeCategoryLabel(category: PrizeCategory) {
  return (
    prizeCategoryOptions.find((option) => option.value === category)?.label ??
    "Other prize"
  );
}

function prizeSourceType(category: PrizeCategory) {
  return (
    prizeCategoryOptions.find((option) => option.value === category)
      ?.sourceType ?? "other"
  );
}

function prizeCategoryValue(value: string | undefined): PrizeCategory {
  return prizeCategoryOptions.some((option) => option.value === value)
    ? (value as PrizeCategory)
    : "psa10_card";
}

function clampHighTierCount(value: number) {
  const parsed = Math.round(Number(value) || defaultHighTierCount);
  return Math.min(maxHighTierCount, Math.max(minHighTierCount, parsed));
}

function prizeUnitCount(prize: CampaignPrizeDraft) {
  return Math.max(0, Math.round(Number(prize.quantity) || 0));
}

function createHighTierPrizeDraft(
  index: number,
  cardId: string,
  existing?: CampaignPrizeDraft,
): CampaignPrizeDraft {
  return {
    localId: existing?.localId ?? `high-${index + 1}`,
    group: "high",
    cardId: existing?.cardId ?? cardId,
    tier: "high",
    prizeCategory: existing?.prizeCategory ?? "psa10_card",
    rank: index + 4,
    valueThb: existing?.valueThb ?? 750,
    quantity: Math.max(1, Math.round(Number(existing?.quantity) || 1)),
    weight: existing?.weight ?? 1,
    unlockAtSoldPct: existing?.unlockAtSoldPct ?? 20,
  };
}

function createNormalPrizeDraft(
  cardId: string,
  quantity: number,
  existing?: CampaignPrizeDraft,
): CampaignPrizeDraft {
  return {
    localId: existing?.localId ?? "normal-1",
    group: "normal",
    cardId: existing?.cardId ?? cardId,
    tier: "normal",
    prizeCategory: existing?.prizeCategory ?? "psa10_card",
    rank: existing?.rank ?? 1,
    valueThb: existing?.valueThb ?? 100,
    quantity: Math.max(0, Math.round(Number(quantity) || 0)),
    weight: existing?.weight ?? 10,
    unlockAtSoldPct: existing?.unlockAtSoldPct ?? 0,
  };
}

function withNormalPoolRemainder(
  rows: CampaignPrizeDraft[],
  totalSlots: number,
  cardId: string,
) {
  const normalizedTotalSlots = Math.max(1, Math.round(Number(totalSlots) || 1));
  const normalRows = rows
    .filter((prize) => prize.group === "normal")
    .sort((left, right) => left.rank - right.rank);
  const normalFirst = normalRows[0];
  const normalRest = normalRows.slice(1);
  const fixedUnits = rows
    .filter((prize) => prize.group !== "normal")
    .reduce((sum, prize) => sum + prizeUnitCount(prize), 0);
  const normalRestUnits = normalRest.reduce(
    (sum, prize) => sum + prizeUnitCount(prize),
    0,
  );
  const firstNormalQuantity = Math.max(
    0,
    normalizedTotalSlots - fixedUnits - normalRestUnits,
  );
  const normalRowsById = new Set(normalRows.map((prize) => prize.localId));
  return [
    ...rows.filter((prize) => !normalRowsById.has(prize.localId)),
    createNormalPrizeDraft(cardId, firstNormalQuantity, normalFirst),
    ...normalRest,
  ];
}

function sortPrizeDrafts(rows: CampaignPrizeDraft[]) {
  const groupOrder: Record<CampaignPrizeDraft["group"], number> = {
    top: 0,
    high: 1,
    normal: 2,
  };
  return [...rows].sort((left, right) => {
    if (left.group !== right.group) {
      return groupOrder[left.group] - groupOrder[right.group];
    }
    return left.rank - right.rank;
  });
}

function createInitialPrizeDrafts(
  cards: CardCatalogItem[],
  highTierCount = defaultHighTierCount,
  totalSlots = 100,
): CampaignPrizeDraft[] {
  const cardId = firstCatalogCardId(cards);
  const topRows: CampaignPrizeDraft[] = [
    {
      localId: "top-1",
      group: "top",
      cardId,
      tier: "high",
      prizeCategory: "psa10_card",
      rank: 1,
      valueThb: 5000,
      quantity: 1,
      weight: 0.25,
      unlockAtSoldPct: 30,
    },
    {
      localId: "top-2",
      group: "top",
      cardId,
      tier: "high",
      prizeCategory: "psa10_card",
      rank: 2,
      valueThb: 3000,
      quantity: 1,
      weight: 0.5,
      unlockAtSoldPct: 20,
    },
    {
      localId: "top-3",
      group: "top",
      cardId,
      tier: "high",
      prizeCategory: "psa10_card",
      rank: 3,
      valueThb: 1500,
      quantity: 1,
      weight: 1,
      unlockAtSoldPct: 0,
    },
  ];
  const highRows = Array.from({ length: clampHighTierCount(highTierCount) }, (_, index) =>
    createHighTierPrizeDraft(index, cardId),
  );
  return withNormalPoolRemainder([...topRows, ...highRows], totalSlots, cardId);
}

function prizeDraftGroupLabel(group: CampaignPrizeDraft["group"]) {
  if (group === "top") return "Top 1-3 showcase";
  if (group === "high") return "High tier pool";
  return "Normal/base pool";
}

export function AdminCampaignForm({
  categories = [],
  cards = [],
}: {
  categories?: YnotCategory[];
  cards?: CardCatalogItem[];
}) {
  const [slug, setSlug] = useState("new-campaign");
  const [titleTh, setTitleTh] = useState("แคมเปญใหม่");
  const [titleEn, setTitleEn] = useState("New campaign");
  const [series, setSeries] = useState<"pokemon" | "one_piece">(
    categories[0]?.legacySeries ?? "pokemon",
  );
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [isTest, setIsTest] = useState(false);
  const [mode, setMode] = useState<"instant_gacha" | "slot_pick">(
    "instant_gacha",
  );
  const [priceThb, setPriceThb] = useState(100);
  const [costCoins, setCostCoins] = useState(1);
  const [totalSlots, setTotalSlots] = useState(100);
  const [displayTags, setDisplayTags] = useState("PSA10, New Exclusive");
  const [highTierCount, setHighTierCount] = useState(defaultHighTierCount);
  const [draftPrizes, setDraftPrizes] = useState<CampaignPrizeDraft[]>(() =>
    createInitialPrizeDrafts(cards, defaultHighTierCount, 100),
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const sortedDraftPrizes = useMemo(
    () => sortPrizeDrafts(draftPrizes),
    [draftPrizes],
  );
  const activePrizeDrafts = useMemo(
    () =>
      draftPrizes.filter(
        (prize) => prize.cardId && Number(prize.quantity) > 0,
      ),
    [draftPrizes],
  );
  const configuredPrizeUnits = activePrizeDrafts.reduce(
    (sum, prize) => sum + Math.max(0, Math.round(Number(prize.quantity) || 0)),
    0,
  );
  const initialUnlockedUnits = activePrizeDrafts
    .filter(
      (prize) =>
        Number(prize.weight) > 0 && Number(prize.unlockAtSoldPct) <= 0,
    )
    .reduce((sum, prize) => sum + Math.max(0, Math.round(prize.quantity)), 0);
  const highPrizeRows = activePrizeDrafts.filter(
    (prize) => prize.tier === "high",
  ).length;
  const highPoolRows = activePrizeDrafts.filter(
    (prize) => prize.group === "high",
  ).length;
  const topPrizeRows = activePrizeDrafts.filter(
    (prize) => prize.group === "top",
  ).length;
  const normalPrizeRows = activePrizeDrafts.filter(
    (prize) => prize.group === "normal",
  ).length;
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
    topPrizeRows < 3 ? "Choose all Top 1-3 showcase prizes." : "",
    highPoolRows < minHighTierCount || highPoolRows > maxHighTierCount
      ? "Choose 5-20 high-tier prizes below Top 1-3."
      : "",
    highPoolRows !== highTierCount
      ? "High-tier list count must match the selected prize count."
      : "",
    normalPrizeRows <= 0 ? "Add at least one normal/base prize row." : "",
    hasDuplicateRank ? "Prize ranks must be unique inside each tier." : "",
  ].filter(Boolean);
  const prizeChecklist = [
    {
      label: "Top 1-3",
      value: `${topPrizeRows}/3`,
      ready: topPrizeRows >= 3,
    },
    {
      label: "High tier below Top 3",
      value: `${highPoolRows}/${highTierCount}`,
      ready: highPoolRows === highTierCount,
    },
    {
      label: "Normal/base rows",
      value: String(normalPrizeRows),
      ready: normalPrizeRows > 0,
    },
    {
      label: "Prize unit coverage",
      value: `${configuredPrizeUnits.toLocaleString()}/${totalSlots.toLocaleString()}`,
      ready: configuredPrizeUnits === totalSlots,
    },
    {
      label: "Launch pool",
      value: initialUnlockedUnits.toLocaleString(),
      ready: initialUnlockedUnits > 0,
    },
  ];
  const topPrizeDrafts = sortedDraftPrizes.filter(
    (prize) => prize.group === "top",
  );
  const highTierDrafts = sortedDraftPrizes.filter(
    (prize) => prize.group === "high",
  );
  const normalPrizeDrafts = sortedDraftPrizes.filter(
    (prize) => prize.group === "normal",
  );
  const readinessLabel = prizeBlockers.length
    ? `${prizeBlockers.length} blocker${prizeBlockers.length === 1 ? "" : "s"}`
    : "Ready to save";

  function updatePrizeDraft(
    localId: string,
    patch: Partial<CampaignPrizeDraft>,
  ) {
    setDraftPrizes((current) =>
      current.map((prize) =>
        prize.localId === localId ? { ...prize, ...patch } : prize,
      ),
    );
  }

  function updateTotalSlots(nextTotalSlots: number) {
    const normalizedTotalSlots = Math.max(
      1,
      Math.round(Number(nextTotalSlots) || 1),
    );
    setTotalSlots(normalizedTotalSlots);
    setDraftPrizes((current) =>
      withNormalPoolRemainder(
        current,
        normalizedTotalSlots,
        firstCatalogCardId(cards),
      ),
    );
  }

  function updateHighTierCount(nextCount: number) {
    const count = clampHighTierCount(nextCount);
    const defaultCardId = firstCatalogCardId(cards);
    setHighTierCount(count);
    setDraftPrizes((current) => {
      const highRows = current
        .filter((prize) => prize.group === "high")
        .sort((left, right) => left.rank - right.rank);
      const nextHighRows = Array.from({ length: count }, (_, index) =>
        createHighTierPrizeDraft(index, defaultCardId, highRows[index]),
      );
      const nonHighRows = current.filter((prize) => prize.group !== "high");
      return withNormalPoolRemainder(
        [...nonHighRows, ...nextHighRows],
        totalSlots,
        defaultCardId,
      );
    });
  }

  function fillNormalPoolRemainder() {
    const defaultCardId = firstCatalogCardId(cards);
    setDraftPrizes((current) =>
      withNormalPoolRemainder(current, totalSlots, defaultCardId),
    );
  }

  function updateHighTierRows(patch: Partial<CampaignPrizeDraft>) {
    const defaultCardId = firstCatalogCardId(cards);
    setDraftPrizes((current) =>
      withNormalPoolRemainder(
        current.map((prize) =>
          prize.group === "high" ? { ...prize, ...patch } : prize,
        ),
        totalSlots,
        defaultCardId,
      ),
    );
  }

  function addPrizeDraft(group: "high" | "normal") {
    if (group === "high") {
      updateHighTierCount(highTierCount + 1);
      return;
    }
    const tier = "normal";
    const sameTier = draftPrizes.filter((prize) => prize.tier === tier);
    const nextRank = Math.max(1, ...sameTier.map((prize) => prize.rank + 1));
    const remainingNeed = Math.max(1, totalSlots - configuredPrizeUnits);
    setDraftPrizes((current) => [
      ...current,
      {
        localId: `${group}-${Date.now().toString(36)}`,
        group,
        cardId: firstCatalogCardId(cards),
        tier,
        prizeCategory: "psa10_card",
        rank: nextRank,
        valueThb: 100,
        quantity: remainingNeed,
        weight: 10,
        unlockAtSoldPct: 0,
      },
    ]);
  }

  function removePrizeDraft(localId: string) {
    const target = draftPrizes.find((prize) => prize.localId === localId);
    if (target?.group === "high") {
      const nextCount = clampHighTierCount(highTierCount - 1);
      const defaultCardId = firstCatalogCardId(cards);
      setHighTierCount(nextCount);
      setDraftPrizes((current) => {
        const remainingRows = current.filter((prize) => prize.localId !== localId);
        const remainingHighRows = remainingRows
          .filter((prize) => prize.group === "high")
          .sort((left, right) => left.rank - right.rank);
        const nextHighRows = Array.from({ length: nextCount }, (_, index) =>
          createHighTierPrizeDraft(
            index,
            defaultCardId,
            remainingHighRows[index],
          ),
        );
        return withNormalPoolRemainder(
          [
            ...remainingRows.filter((prize) => prize.group !== "high"),
            ...nextHighRows,
          ],
          totalSlots,
          defaultCardId,
        );
      });
      return;
    }
    setDraftPrizes((current) =>
      current.filter((prize) => prize.localId !== localId),
    );
  }

  function submit() {
    startTransition(async () => {
      try {
        if (prizeBlockers.length) throw new Error(prizeBlockers[0]);
        const payload = await postJson("/api/ynot/admin/campaigns", {
          slug,
          titleTh,
          titleEn,
          series,
          mode,
          priceThb,
          costCoins,
          totalSlots,
          displayTags: inputToTags(displayTags),
          categoryIds: categoryId ? [categoryId] : undefined,
          isTest,
          status: "draft",
          visibility: "private",
          initialPrizes: activePrizeDrafts.map((prize) => ({
            cardId: prize.cardId,
            tier: prize.tier,
            rank: Math.max(1, Math.round(Number(prize.rank) || 1)),
            valueThb: Math.max(0, Math.round(Number(prize.valueThb) || 0)),
            quantity: Math.max(0, Math.round(Number(prize.quantity) || 0)),
            weight: Math.max(0, Number(prize.weight) || 0),
            unlockAtSoldPct: Math.min(
              100,
              Math.max(0, Math.round(Number(prize.unlockAtSoldPct) || 0)),
            ),
            metadata: {
              displayGroup: prize.group,
              prizeCategory: prize.prizeCategory,
              prizeCategoryLabel: prizeCategoryLabel(prize.prizeCategory),
              sourceType: prizeSourceType(prize.prizeCategory),
              highTierCount,
            },
          })),
        });
        setMessage(
          `Random pack ${payload.campaign?.slug ?? slug} saved as draft with ${configuredPrizeUnits.toLocaleString()} prize units.`,
        );
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
          <span>New random pack</span>
          <h3>Create pack draft with prizes</h3>
          <p>
            Build the campaign, prize list, and owner-review readiness in one
            full-width workflow.
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
                    setCategoryId(event.target.value);
                    if (nextCategory?.legacySeries)
                      setSeries(nextCategory.legacySeries);
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
                  onChange={(event) =>
                    setSeries(event.target.value as "pokemon" | "one_piece")
                  }
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
            <label className="admin-field admin-field-wide">
              <span>Customer card tags</span>
              <input
                value={displayTags}
                onChange={(event) => setDisplayTags(event.target.value)}
                placeholder="PSA10, New Exclusive"
              />
            </label>
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
            <strong>Top 1-3, high tier, normal pool</strong>
          </div>

          <div className="admin-top-prize-strip">
            {topPrizeDrafts.map((prize) => (
              <article className="admin-top-prize-card" key={prize.localId}>
                <div className="admin-prize-draft-head">
                  <div>
                    <span>Top {prize.rank}</span>
                    <strong>{prizeCategoryLabel(prize.prizeCategory)}</strong>
                    <em>{prizeDraftGroupLabel(prize.group)}</em>
                  </div>
                </div>
                <label className="admin-field">
                  <span>Prize item</span>
                  <select
                    value={prize.cardId}
                    onChange={(event) =>
                      updatePrizeDraft(prize.localId, {
                        cardId: event.target.value,
                      })
                    }
                  >
                    {cards.map((card) => (
                      <option
                        key={card.catalogCardId}
                        value={card.catalogCardId}
                      >
                        {card.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-top-prize-controls">
                  <label className="admin-field">
                    <span>Category</span>
                    <select
                      value={prize.prizeCategory}
                      onChange={(event) =>
                        updatePrizeDraft(prize.localId, {
                          prizeCategory: event.target.value as PrizeCategory,
                        })
                      }
                    >
                      {prizeCategoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
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
                </div>
              </article>
            ))}
          </div>

          <div className="admin-prize-structure-panel">
            <div>
              <span>High-tier prizes below Top 1-3</span>
              <strong>{highTierCount} prize rows</strong>
              <p>
                Ranks 4-{highTierCount + 3} are generated automatically for
                PSA10, sealed, console, AirPods, or other premium prizes.
              </p>
            </div>
            <div className="admin-prize-count-controls">
              {highTierCountChoices.map((choice) => (
                <button
                  className={highTierCount === choice ? "active" : ""}
                  key={choice}
                  onClick={() => updateHighTierCount(choice)}
                  type="button"
                >
                  {choice}
                </button>
              ))}
              <label className="admin-field">
                <span>Custom</span>
                <input
                  max={maxHighTierCount}
                  min={minHighTierCount}
                  type="number"
                  value={highTierCount}
                  onChange={(event) =>
                    updateHighTierCount(Number(event.target.value))
                  }
                />
              </label>
            </div>
          </div>

          <div className="admin-prize-picker-toolbar">
            <button
              className="plain-button rounded-2xl px-4 py-3 text-sm font-black"
              disabled={highTierCount >= maxHighTierCount}
              onClick={() => addPrizeDraft("high")}
              type="button"
            >
              Add high tier row
            </button>
            <button
              className="plain-button rounded-2xl px-4 py-3 text-sm font-black"
              onClick={() => addPrizeDraft("normal")}
              type="button"
            >
              Add normal/base
            </button>
            <button
              className="plain-button rounded-2xl px-4 py-3 text-sm font-black"
              onClick={fillNormalPoolRemainder}
              type="button"
            >
              Fill normal pool
            </button>
            <button
              className="plain-button rounded-2xl px-4 py-3 text-sm font-black"
              onClick={() => updateHighTierRows({ quantity: 1 })}
              type="button"
            >
              High qty 1
            </button>
          </div>

          <div className="admin-prize-table-wrap">
            <div className="admin-prize-table-head">
              <span>Rank</span>
              <span>Prize item</span>
              <span>Category</span>
              <span>Qty</span>
              <span>Action</span>
            </div>
            {highTierDrafts.map((prize) => (
              <article className="admin-prize-table-row" key={prize.localId}>
                <div className="admin-prize-rank-cell">
                  <strong>#{prize.rank}</strong>
                  <span>High tier</span>
                </div>
                <label className="admin-field">
                  <span>Prize item</span>
                  <select
                    value={prize.cardId}
                    onChange={(event) =>
                      updatePrizeDraft(prize.localId, {
                        cardId: event.target.value,
                      })
                    }
                  >
                    {cards.map((card) => (
                      <option
                        key={card.catalogCardId}
                        value={card.catalogCardId}
                      >
                        {card.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Category</span>
                  <select
                    value={prize.prizeCategory}
                    onChange={(event) =>
                      updatePrizeDraft(prize.localId, {
                        prizeCategory: event.target.value as PrizeCategory,
                      })
                    }
                  >
                    {prizeCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
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
                  disabled={highTierCount <= minHighTierCount}
                  onClick={() => removePrizeDraft(prize.localId)}
                  type="button"
                >
                  Remove
                </button>
              </article>
            ))}
          </div>

          <div className="admin-normal-pool-panel">
            <div className="admin-panel-compact-head">
              <span>Normal/base pool</span>
              <strong>
                {normalPrizeRows} row{normalPrizeRows === 1 ? "" : "s"} ready
              </strong>
            </div>
            <div className="admin-prize-table-wrap normal">
              <div className="admin-prize-table-head">
                <span>Rank</span>
                <span>Prize item</span>
                <span>Category</span>
                <span>Qty</span>
                <span>Action</span>
              </div>
              {normalPrizeDrafts.map((prize) => (
                <article
                  className="admin-prize-table-row normal"
                  key={prize.localId}
                >
                  <div className="admin-prize-rank-cell">
                    <strong>#{prize.rank}</strong>
                    <span>Base</span>
                  </div>
                  <label className="admin-field">
                    <span>Prize item</span>
                    <select
                      value={prize.cardId}
                      onChange={(event) =>
                        updatePrizeDraft(prize.localId, {
                          cardId: event.target.value,
                        })
                      }
                    >
                      {cards.map((card) => (
                        <option
                          key={card.catalogCardId}
                          value={card.catalogCardId}
                        >
                          {card.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Category</span>
                    <select
                      value={prize.prizeCategory}
                      onChange={(event) =>
                        updatePrizeDraft(prize.localId, {
                          prizeCategory: event.target.value as PrizeCategory,
                        })
                      }
                    >
                      {prizeCategoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
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
                    onClick={() => removePrizeDraft(prize.localId)}
                    type="button"
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
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
              <span>Top/high rows</span>
              <strong>
                {topPrizeRows}/{highPrizeRows}
              </strong>
            </div>
          </div>
          <div className="admin-prize-checklist">
            {prizeChecklist.map((item) => (
              <div className={item.ready ? "ready" : ""} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
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
            {isPending ? "Saving..." : "Save random pack draft"}
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

export function OwnerApprovalQueue({
  requests,
  viewerRole,
}: {
  requests: YnotOwnerApprovalRequest[];
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  const [items, setItems] = useState<LocalApprovalQueueItem[]>(
    requests.map((request) => ({
      ...request,
      runtimeStatus: request.campaign.status,
      runtimeVisibility: request.campaign.visibility,
      selectedLogicMode: request.logicMode,
    })),
  );
  const [isPending, startTransition] = useTransition();

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
    const displayGroup = prizeDisplayGroup(prize);
    startTransition(async () => {
      try {
        await postJson("/api/ynot/admin/prizes", {
          campaignId: item.campaign.id,
          cardId: prize.cardId,
          tier: prize.tier,
          rank: prize.rank,
          valueThb: Math.max(0, Math.round(Number(prize.valueThb) || 0)),
          weight: Math.max(0, Number(prize.weight) || 0),
          unlockAtSoldPct: Math.min(
            100,
            Math.max(0, Math.round(Number(prize.unlockAtSoldPct) || 0)),
          ),
          prizeCategory,
          sourceType,
          displayGroup,
          metadata: {
            displayGroup,
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
                    "Owner prize value, weight, and unlock settings saved.",
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
          const ownerPrizeLineup = item.campaign.prizeLineup ?? [];
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

              {isOwner && (
                <div className="owner-prize-odds-panel">
                  <div className="owner-prize-odds-head">
                    <div>
                      <span>Owner-only prize odds</span>
                      <strong>Value, weight, and sold unlock</strong>
                    </div>
                    <em>Hidden from draft creation</em>
                  </div>
                  {ownerPrizeLineup.length > 0 ? (
                    <div className="owner-prize-odds-table-wrap">
                      <div className="owner-prize-odds-table-head">
                        <span>Prize</span>
                        <span>Tier</span>
                        <span>Value</span>
                        <span>Weight</span>
                        <span>Unlock %</span>
                        <span>Current odds</span>
                        <span>Action</span>
                      </div>
                      {ownerPrizeLineup.map((prize) => (
                        <article
                          className="owner-prize-odds-row"
                          key={prize.id}
                        >
                          <div className="owner-prize-name-cell">
                            <strong>{prize.cardName}</strong>
                            <span>
                              #{prize.rank} ·{" "}
                              {prize.prizeCategoryLabel ??
                                (prize.tier === "high"
                                  ? "High tier"
                                  : "Normal")}
                            </span>
                          </div>
                          <div className="owner-prize-tier-cell">
                            {prizeDisplayGroup(prize)}
                          </div>
                          <label className="admin-field">
                            <span>Value THB</span>
                            <input
                              min={0}
                              type="number"
                              value={prize.valueThb ?? 0}
                              onChange={(event) =>
                                updateOwnerPrizeOdds(index, prize.id, {
                                  valueThb: Number(event.target.value),
                                })
                              }
                            />
                          </label>
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
                          <div className="owner-prize-odds-cell">
                            {ownerPrizeOddsLabel(
                              prize,
                              ownerPrizeLineup,
                              item.soldPct,
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
                  ) : (
                    <p className="admin-empty-note">
                      Prize odds appear here after the draft has saved prize
                      inventory.
                    </p>
                  )}
                </div>
              )}

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
      <section className="admin-pack-list soft-card">
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
    <section className="admin-pack-list soft-card">
      <div className="admin-form-head">
        <span>Existing packs</span>
        <h3>Submit review or update customer labels</h3>
        <p>
          Use this list after creating a draft. Direct live/public publish is
          held for the owner approval queue.
        </p>
      </div>
      <div className="admin-pack-row-list">
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
      <div className="admin-pack-row-list">
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
  const [status, setStatus] = useState<YnotCampaign["status"]>(campaign.status);
  const [visibility, setVisibility] = useState<YnotCampaign["visibility"]>(
    campaign.visibility,
  );
  const [approvalStatus, setApprovalStatus] = useState<YnotApprovalStatus>(
    campaign.approvalStatus ?? inferredApprovalStatus(campaign.status),
  );
  const [displayTags, setDisplayTags] = useState(
    tagsToInput(campaign.displayTags, campaign.series),
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
            displayTags: inputToTags(displayTags),
          },
          "PATCH",
        );
        const updatedStatus = payload.status ?? "draft";
        const updatedVisibility = payload.visibility ?? "private";
        const updatedApprovalStatus =
          payload.approvalStatus ?? "pending_review";
        setStatus(updatedStatus);
        setVisibility(updatedVisibility);
        setApprovalStatus(updatedApprovalStatus);
        onCampaignChange(campaign.id, {
          approvalStatus: updatedApprovalStatus,
          displayTags: inputToTags(displayTags),
          status: updatedStatus,
          visibility: updatedVisibility,
        });
        setMessage(
          "Random pack status and customer card labels saved. Refresh to see the updated public page.",
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
        <label className="admin-field admin-field-wide">
          <span>Customer card labels</span>
          <input
            value={displayTags}
            onChange={(event) => setDisplayTags(event.target.value)}
            placeholder="PSA10, New Exclusive"
          />
        </label>
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
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
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
          imageUrl,
          isTest,
          assetSource: isTest ? assetSource : undefined,
          assetLicense: isTest ? assetLicense : undefined,
          assetManifestKey: isTest ? assetManifestKey : undefined,
        });
        setMessage(`Prize item ${payload.card?.name ?? name} saved.`);
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
  prizes,
  viewerRole,
}: {
  campaigns: YnotCampaign[];
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
  viewerRole?: "owner" | "admin" | "staff" | null;
}) {
  const isOwner = viewerRole === "owner";
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [cardId, setCardId] = useState(cards[0]?.catalogCardId ?? "");
  const [tier, setTier] = useState<"normal" | "high">("normal");
  const [prizeCategory, setPrizeCategory] =
    useState<PrizeCategory>("psa10_card");
  const [rank, setRank] = useState(1);
  const [valueThb, setValueThb] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState(1);
  const [unlockAtSoldPct, setUnlockAtSoldPct] = useState(0);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function savePrize() {
    startTransition(async () => {
      try {
        setMessage("");
        await postJson("/api/ynot/admin/prizes", {
          campaignId,
          cardId,
          tier,
          rank,
          quantity,
          ...(isOwner
            ? {
                valueThb,
                weight,
                unlockAtSoldPct,
              }
            : {}),
          prizeCategory,
          sourceType: prizeSourceType(prizeCategory),
          displayGroup: tier === "high" && rank <= 3 ? "top" : tier,
          metadata: {
            displayGroup: tier === "high" && rank <= 3 ? "top" : tier,
            prizeCategory,
            prizeCategoryLabel: prizeCategoryLabel(prizeCategory),
            sourceType: prizeSourceType(prizeCategory),
          },
        });
        setMessage(
          "Prize slot and inventory quantity saved. Refresh to see the updated pool.",
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

  function deletePrize(prizeId: string) {
    startTransition(async () => {
      try {
        setMessage("");
        await requestJson("/api/ynot/admin/prizes", { prizeId }, "DELETE");
        setMessage("Prize slot deleted. Refresh to see the updated pool.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Prize slot could not be deleted.",
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
            value={campaignId}
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
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={cardId}
            onChange={(event) => setCardId(event.target.value)}
          >
            {cards.map((card) => (
              <option key={card.catalogCardId} value={card.catalogCardId}>
                {card.name}
              </option>
            ))}
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
        <AdminField label="Prize tier">
          <select
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={tier}
            onChange={(event) =>
              setTier(event.target.value as "normal" | "high")
            }
          >
            <option value="normal">Normal prize</option>
            <option value="high">High tier prize</option>
          </select>
        </AdminField>
        <AdminField
          label="Prize rank"
          required
          hint="Rank controls display/order inside this pack."
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
        {isOwner && (
          <AdminField
            label="Value THB"
            hint="Owner-only estimated prize value for approval."
          >
            <input
              className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
              min={0}
              type="number"
              value={valueThb}
              onChange={(event) => setValueThb(Number(event.target.value))}
              placeholder="1500"
            />
          </AdminField>
        )}
        <AdminField
          label="Prize quantity"
          required
          hint="How many units of this prize can be pulled from the pack."
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
        {isOwner && (
          <AdminField
            label="Drop weight"
            required
            hint="Owner-only odds setting. Higher numbers increase this prize's chance after it is unlocked."
          >
            <input
              className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
              min={0}
              step={0.1}
              type="number"
              value={weight}
              onChange={(event) => setWeight(Number(event.target.value))}
              placeholder="1"
            />
          </AdminField>
        )}
        {isOwner && (
          <AdminField
            label="Unlock at sold %"
            hint="Owner-only odds setting. Before this checkpoint, customers cannot see or pull this prize."
          >
            <input
              className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
              max={100}
              min={0}
              step={1}
              type="number"
              value={unlockAtSoldPct}
              onChange={(event) =>
                setUnlockAtSoldPct(Number(event.target.value))
              }
              placeholder="30"
            />
          </AdminField>
        )}
      </div>
      <button
        className="gold-button admin-form-save"
        disabled={isPending || !campaignId || !cardId}
        onClick={savePrize}
        type="button"
      >
        {isPending ? "Saving..." : "Save campaign prize slot"}
      </button>
      {message && <p className="admin-form-message">{message}</p>}
      <div className="admin-prize-list">
        {prizes.map((prize) => (
          <div
            key={prize.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm"
          >
            <div>
              <p className="font-black">
                {prize.campaignTitle} · {prize.tier} #{prize.rank}
              </p>
              <p className="text-[var(--muted)]">
                {prize.cardName}
                {isOwner
                  ? ` · ฿${(prize.valueThb ?? 0).toLocaleString()}`
                  : ""}
                {" · "}
                {prize.availableUnits}/{prize.totalUnits} left
                {prize.awardedUnits ? ` · ${prize.awardedUnits} awarded` : ""}
                {prize.prizeCategoryLabel
                  ? ` · ${prize.prizeCategoryLabel}`
                  : ""}
                {isOwner
                  ? ` · weight ${prize.weight.toLocaleString()} · unlock ${prize.unlockAtSoldPct}% sold`
                  : ""}
              </p>
            </div>
            <button
              className="plain-button rounded-xl px-3 py-2 text-xs font-black"
              disabled={isPending}
              onClick={() => {
                setCampaignId(prize.campaignId);
                setCardId(prize.cardId);
                setTier(prize.tier);
                setPrizeCategory(prizeCategoryValue(prize.prizeCategory));
                setRank(prize.rank);
                setValueThb(prize.valueThb ?? 0);
                setQuantity(prize.totalUnits);
                setWeight(prize.weight);
                setUnlockAtSoldPct(prize.unlockAtSoldPct);
              }}
              type="button"
            >
              Use
            </button>
            <button
              className="danger-button rounded-xl px-3 py-2 text-xs font-black"
              disabled={isPending}
              onClick={() => deletePrize(prize.id)}
              type="button"
            >
              Delete
            </button>
          </div>
        ))}
        {!prizes.length && (
          <p className="text-sm text-[var(--muted)]">
            No prize slots assigned yet.
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
