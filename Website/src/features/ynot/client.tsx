"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { CardCatalogItem, ProfileInfo } from "@/lib/lucky-draw/types";
import type {
  YnotAddress,
  YnotCampaign,
  YnotCategory,
  YnotCollectionItem,
  YnotExchangeOrder,
  YnotPaymentMethod,
  YnotPrizePoolItem,
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

export function AdminCampaignForm({
  categories = [],
}: {
  categories?: YnotCategory[];
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
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
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
        });
        setMessage(
          `Random pack ${payload.campaign?.slug ?? slug} saved as draft.`,
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
    <section className="admin-pack-form soft-card">
      <div className="admin-form-head">
        <span>New random pack</span>
        <h3>Create pack draft</h3>
        <p>
          Fill these three sections, save as draft, then publish from the pack
          list below when the image, prizes, price, and labels are ready.
        </p>
      </div>

      <div className="admin-form-steps">
        <div className="admin-form-step">
          <strong>1. Basic info</strong>
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
            <label className="admin-field">
              <span>Thai title</span>
              <input
                value={titleTh}
                onChange={(event) => setTitleTh(event.target.value)}
                placeholder="ชื่อแพ็ก"
              />
            </label>
            <label className="admin-field">
              <span>English title</span>
              <input
                value={titleEn}
                onChange={(event) => setTitleEn(event.target.value)}
                placeholder="Pack title"
              />
            </label>
            <label className="admin-field admin-field-wide">
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
        </div>

        <div className="admin-form-step">
          <strong>2. Price & quantity</strong>
          <div className="admin-form-grid admin-form-grid-three">
            <label className="admin-field">
              <span>Total packs</span>
              <input
                min={1}
                type="number"
                value={totalSlots}
                onChange={(event) => setTotalSlots(Number(event.target.value))}
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
          </div>
        </div>

        <div className="admin-form-step">
          <strong>3. Display labels</strong>
          <label className="admin-field">
            <span>Customer card tags</span>
            <input
              value={displayTags}
              onChange={(event) => setDisplayTags(event.target.value)}
              placeholder="PSA10, New Exclusive"
            />
          </label>
          <p>
            These tags show on the customer pack card. Use labels like PSA10,
            New Exclusive, Manga, Few Left, or Event.
          </p>
        </div>
      </div>

      <button
        className="gold-button admin-form-save"
        disabled={isPending}
        onClick={submit}
        type="button"
      >
        {isPending ? "Saving..." : "Save random pack draft"}
      </button>
      {message && <p className="admin-form-message">{message}</p>}
    </section>
  );
}

export function AdminCampaignActionPanel({
  campaigns,
}: {
  campaigns: YnotCampaign[];
}) {
  if (!campaigns.length) {
    return (
      <section className="admin-pack-list soft-card">
        <div className="admin-form-head">
          <span>Existing packs</span>
          <h3>Publish, close, or update customer labels</h3>
          <p>
            Create a random pack draft before publishing. Saved drafts will
            appear in this list.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-pack-list soft-card">
      <div className="admin-form-head">
        <span>Existing packs</span>
        <h3>Publish, close, or update customer labels</h3>
        <p>
          Use this list after creating a draft. The public customer page only
          shows packs that are live and public.
        </p>
      </div>
      <div className="admin-pack-row-list">
        {campaigns.map((campaign) => (
          <AdminCampaignStatusRow key={campaign.id} campaign={campaign} />
        ))}
      </div>
    </section>
  );
}

function AdminCampaignStatusRow({ campaign }: { campaign: YnotCampaign }) {
  const [status, setStatus] = useState<YnotCampaign["status"]>(campaign.status);
  const [visibility, setVisibility] = useState<YnotCampaign["visibility"]>(
    campaign.visibility,
  );
  const [displayTags, setDisplayTags] = useState(
    tagsToInput(campaign.displayTags, campaign.series),
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(nextStatus = status, nextVisibility = visibility) {
    startTransition(async () => {
      try {
        setMessage("");
        await requestJson(
          "/api/ynot/admin/campaigns",
          {
            campaignId: campaign.id,
            status: nextStatus,
            visibility: nextVisibility,
            displayTags: inputToTags(displayTags),
          },
          "PATCH",
        );
        setStatus(nextStatus);
        setVisibility(nextVisibility);
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
          </p>
        </div>
        <div className="admin-pack-badges">
          <strong>{status}</strong>
          <em>{visibility}</em>
        </div>
      </div>

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
          disabled={isPending}
          onClick={() => submit("live", "public")}
          type="button"
        >
          Make live public
        </button>
        <button
          className="plain-button"
          disabled={isPending}
          onClick={() => submit("closed", "public")}
          type="button"
        >
          Close public
        </button>
        <button
          className="danger-button"
          disabled={isPending}
          onClick={() => submit("archived", "private")}
          type="button"
        >
          Archive private
        </button>
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
        setMessage(`Card ${payload.card?.name ?? name} saved.`);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Card could not be saved.",
        );
      }
    });
  }

  return (
    <section className="admin-panel admin-form-panel soft-card">
      <div className="admin-form-head">
        <span>Prize catalog</span>
        <h3>Create or update card</h3>
        <p>Add cards before assigning them into a random pack prize pool.</p>
      </div>
      <div className="admin-form-grid">
        <AdminField
          label="Card code"
          hint="Optional unique code. If blank, the name is used to find/update an existing card."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="OP-PSA10-001"
          />
        </AdminField>
        <AdminField label="Card name" required>
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Card name"
          />
        </AdminField>
        <AdminField label="Series">
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
        <AdminField label="Grade">
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            placeholder="PSA 10 / Ungraded"
          />
        </AdminField>
        <AdminField
          label="Image URL"
          hint="Use approved storage or /test-assets paths for production test cards."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="/test-assets/ynot-test-card-001.svg"
          />
        </AdminField>
        <AdminField label="Card mode">
          <button
            className={
              isTest
                ? "gold-button rounded-2xl px-4 py-3 text-sm font-black"
                : "plain-button rounded-2xl px-4 py-3 text-sm font-black"
            }
            onClick={() => setIsTest((value) => !value)}
            type="button"
          >
            {isTest ? "Test card ON" : "Normal card"}
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
        {isPending ? "Saving..." : "Save card"}
      </button>
      {message && <p className="admin-form-message">{message}</p>}
    </section>
  );
}

export function AdminPrizePoolForm({
  campaigns,
  cards,
  prizes,
}: {
  campaigns: YnotCampaign[];
  cards: CardCatalogItem[];
  prizes: YnotPrizePoolItem[];
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [cardId, setCardId] = useState(cards[0]?.catalogCardId ?? "");
  const [tier, setTier] = useState<"normal" | "high">("normal");
  const [rank, setRank] = useState(1);
  const [valueThb, setValueThb] = useState(0);
  const [quantity, setQuantity] = useState(1);
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
          valueThb,
          quantity,
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
          Attach catalog cards to campaign ranks so instant gacha can award
          collection items.
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
        <AdminField label="Prize card" required>
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
        <AdminField
          label="Value THB"
          hint="Optional estimated prize value shown to admin."
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
        <AdminField
          label="Prize quantity"
          required
          hint="How many units of this prize can be pulled from the pack."
        >
          <input
            className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4"
            min={0}
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            placeholder="10"
          />
        </AdminField>
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
                {prize.cardName} · ฿{(prize.valueThb ?? 0).toLocaleString()} ·{" "}
                {prize.availableUnits}/{prize.totalUnits} left
                {prize.awardedUnits ? ` · ${prize.awardedUnits} awarded` : ""}
              </p>
            </div>
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
