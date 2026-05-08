"use client";

import { useMemo, useState, useTransition } from "react";
import type { CardCatalogItem } from "@/lib/lucky-draw/types";
import type { YnotAddress, YnotCampaign, YnotCollectionItem, YnotExchangeOrder, YnotPaymentMethod, YnotPrizePoolItem, YnotShippingRequest } from "./types";
import { sampleCollectionCards } from "./storefront-content";

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

function tagsToInput(tags: string[] | undefined, series: YnotCampaign["series"] = "pokemon") {
  const fallback = series === "pokemon" ? ["PSA10", "New Exclusive"] : ["Manga", "New Exclusive"];
  return (tags?.length ? tags : fallback).join(", ");
}

function inputToTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function TopUpForm({ paymentMethods }: { paymentMethods: YnotPaymentMethod[] }) {
  const [packageIndex, setPackageIndex] = useState(1);
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
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
        const response = await fetch("/api/ynot/wallet", { method: "POST", body: form });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "Top-up request failed.");
        setMessage(`Top-up ${payload.topUp?.publicCode ?? "request"} created for admin review.`);
        setSlip(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Top-up request failed.");
      }
    });
  }

  return (
    <section className="soft-card topup-slip-card">
      <h3 className="text-lg font-black">Upload transfer slip</h3>
      <p className="txt-s mt-2">Manual bank transfer and QR slip upload stay first. Admin confirms before coins are credited.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {coinPackages.map((pkg, index) => (
          <button key={pkg.label} className={`${index === packageIndex ? "gold-button" : "plain-button"} rounded-2xl px-4 py-3 text-left text-sm font-black`} onClick={() => setPackageIndex(index)} type="button">
            {pkg.label}<br /><span className="text-xs font-bold opacity-75">฿{pkg.amountThb.toLocaleString()} = {pkg.coins.toLocaleString()} coins</span>
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-bold">Payment method
        <select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4" value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
          {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.displayName}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-sm font-bold">Slip image
        <input className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3" accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => setSlip(event.target.files?.[0] ?? null)} />
      </label>
      <label className="mt-4 block text-sm font-bold">Note
        <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3" value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending || !paymentMethods.length} onClick={submit} type="button">{isPending ? "Submitting..." : "Create top-up for admin review"}</button>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
    </section>
  );
}

export function GachaOpenPanel({ campaign, authenticated }: { campaign: YnotCampaign; authenticated: boolean }) {
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
        setMessage(`Opened ${payload.result?.publicCode ?? "gacha"}. Result is now in Collection.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not open gacha.");
      }
    });
  }
  if (campaign.demo) {
    return (
      <section className="soft-card open-sequence-card phone-surface">
        <p className="sequence-label">{"// CONFIRM SEQUENCE"}</p>
        <div className="open-pack-cube"><span>⚡ GOLD</span></div>
        <h3>Pokemon · Gold Collection</h3>
        <p>10 CARDS · {(campaign.costCoins * 10).toLocaleString()} COIN</p>
        <a className="primary-action open-start" href={authenticated ? "/wallet" : "/login"}>
          &gt;&gt; START PULL
        </a>
        <a className="open-cancel" href={`/gacha/${campaign.slug}`}>[ CANCEL ]</a>
      </section>
    );
  }
  return (
    <section className="soft-card open-sequence-card phone-surface">
      <p className="sequence-label">{"// CONFIRM SEQUENCE"}</p>
      <div className="open-pack-cube"><span>⚡ GOLD</span></div>
      <h3>{campaign.titleEn}</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">Cost: {(campaign.costCoins * quantity).toLocaleString()} coins.</p>
      <label className="mt-4 block text-sm font-bold">Quantity
        <input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4" min={1} max={10} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
      </label>
      {!authenticated ? <a className="primary-action open-start mt-4" href="/login">&gt;&gt; START PULL</a> : <button className="primary-action open-start mt-4 w-full" disabled={isPending} onClick={open} type="button">{isPending ? "Opening..." : ">> START PULL"}</button>}
      <a className="open-cancel" href={`/gacha/${campaign.slug}`}>[ CANCEL ]</a>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
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
        const payload = await postJson("/api/ynot/addresses", { recipientName, phone, addressLine1, district, province, postalCode, isDefault: !addresses.length });
        setMessage(`Address saved. Use address ID ${payload.address?.id ?? ""} for shipping.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Address could not be saved.");
      }
    });
  }
  return (
    <section className="soft-card address-card">
      <h3 className="text-lg font-black">Saved shipping address</h3>
      <div className="mt-4 grid gap-2">
        {addresses.map((address) => <div key={address.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm"><p className="font-black">{address.label} {address.isDefault ? "· default" : ""}</p><p className="text-[var(--muted)]">{address.addressLine1}, {address.district}, {address.province} {address.postalCode}</p><p className="font-mono text-xs text-[var(--gold)]">{address.id}</p></div>)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" placeholder="Recipient name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" placeholder="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </div>
      <input className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4" placeholder="Address line 1" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" placeholder="District" value={district} onChange={(event) => setDistrict(event.target.value)} />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" placeholder="Province" value={province} onChange={(event) => setProvince(event.target.value)} />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" placeholder="Postal code" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} />
      </div>
      <button className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending} onClick={submit} type="button">{isPending ? "Saving..." : "Save address"}</button>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
    </section>
  );
}

export function CollectionActionPanel({ collection, addresses = [] }: { collection: YnotCollectionItem[]; addresses?: YnotAddress[] }) {
  const ownedItems = useMemo(() => collection.filter((item) => item.status === "owned"), [collection]);
  const [selected, setSelected] = useState<string[]>([]);
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function submit(kind: "exchange" | "shipping") {
    startTransition(async () => {
      try {
        setMessage("");
        if (!selected.length) throw new Error("Select at least one owned card.");
        const payload = kind === "exchange"
          ? await postJson("/api/ynot/exchange", { collectionItemIds: selected, idempotencyKey: crypto.randomUUID() })
          : await postJson("/api/ynot/shipping", { collectionItemIds: selected, addressId, idempotencyKey: crypto.randomUUID() });
        setMessage(`${kind === "exchange" ? "Exchange" : "Shipping"} request ${payload.result?.publicCode ?? "created"}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Request failed.");
      }
    });
  }
  return (
    <section className="soft-card collection-action-bar">
      <h3 className="text-lg font-black">Collection actions</h3>
      <div className="mt-4 grid max-h-80 gap-2 overflow-auto">
        {ownedItems.length ? ownedItems.map((item) => (
          <label key={item.id} className={`collection-select-row ${selected.includes(item.id) ? "selected" : ""}`}>
            <input checked={selected.includes(item.id)} type="checkbox" onChange={() => toggle(item.id)} />
            <span className="collection-mini-art" />
            <span>{item.cardName}<em>{item.serialNo}</em></span>
            <strong>{selected.includes(item.id) ? "✓" : ""}</strong>
          </label>
        )) : sampleCollectionCards.slice(0, 3).map((item, index) => (
          <label key={item.code} className={`collection-select-row preview ${index === 1 ? "selected" : ""}`}>
            <input disabled type="checkbox" checked={index === 1} readOnly />
            <span className="collection-mini-art" />
            <span>{item.name}<em>{item.code} · {item.coin}</em></span>
            <strong>{index === 1 ? "✓" : ""}</strong>
          </label>
        ))}
      </div>
      {addresses.length ? (
        <select className="mt-4 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4" value={addressId} onChange={(event) => setAddressId(event.target.value)}>
          {addresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.addressLine1}</option>)}
        </select>
      ) : (
        <input className="mt-4 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4" placeholder="Address ID for shipping (save an address first)" value={addressId} onChange={(event) => setAddressId(event.target.value)} />
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button className="plain-button rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending} type="button" onClick={() => submit("exchange")}>Redeem coin</button>
        <button className="gold-button rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending || !addressId} type="button" onClick={() => submit("shipping")}>Request ship →</button>
      </div>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
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
        const response = await fetch("/api/ynot/admin/top-ups", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ topUpId, action, note }) });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "Review failed.");
        setMessage(`${action} complete.`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Review failed."); }
    });
  }
  return <div className="mt-2 grid gap-2"><input className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" placeholder="Admin note" value={note} onChange={(event) => setNote(event.target.value)} /><div className="flex gap-2"><button className="gold-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit("approve")} type="button">Approve</button><button className="danger-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit("reject")} type="button">Reject</button></div>{message && <p className="text-xs text-[var(--muted)]">{message}</p>}</div>;
}

export function AdminPaymentMethodForm() {
  const [code, setCode] = useState("main-transfer");
  const [displayName, setDisplayName] = useState("Main bank / PromptPay");
  const [type, setType] = useState<"bank_transfer" | "promptpay_qr">("promptpay_qr");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [promptpayId, setPromptpayId] = useState("");
  const [instructions, setInstructions] = useState("Transfer manually and upload slip for admin review.");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      try {
        await postJson("/api/ynot/admin/payment-methods", { code, displayName, type, bankName, accountName, accountNumber, promptpayId, instructions, isActive: true });
        setMessage("Payment method saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Payment method could not be saved.");
      }
    });
  }
  return (
    <section className="soft-card rounded-[28px] p-5">
      <h3 className="text-lg font-black">Payment method settings</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" />
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={type} onChange={(event) => setType(event.target.value as "bank_transfer" | "promptpay_qr")}><option value="promptpay_qr">PromptPay QR</option><option value="bank_transfer">Bank transfer</option></select>
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={promptpayId} onChange={(event) => setPromptpayId(event.target.value)} placeholder="PromptPay ID" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Bank name" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Account name" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Account number" />
      </div>
      <textarea className="mt-3 min-h-24 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
      <button className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending} onClick={submit} type="button">{isPending ? "Saving..." : "Save payment method"}</button>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
    </section>
  );
}

export function AdminCampaignForm() {
  const [slug, setSlug] = useState("new-campaign");
  const [titleTh, setTitleTh] = useState("แคมเปญใหม่");
  const [titleEn, setTitleEn] = useState("New campaign");
  const [series, setSeries] = useState<"pokemon" | "one_piece">("pokemon");
  const [mode, setMode] = useState<"instant_gacha" | "slot_pick">("instant_gacha");
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
          status: "draft",
          visibility: "private",
        });
        setMessage(`Campaign ${payload.campaign?.slug ?? slug} saved as draft.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Campaign could not be saved.");
      }
    });
  }

  return (
    <section className="soft-card rounded-[28px] p-5">
      <h3 className="text-lg font-black">Create campaign draft</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Slug" />
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={series} onChange={(event) => setSeries(event.target.value as "pokemon" | "one_piece")}>
          <option value="pokemon">Pokémon</option>
          <option value="one_piece">One Piece</option>
        </select>
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={titleTh} onChange={(event) => setTitleTh(event.target.value)} placeholder="Thai title" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={titleEn} onChange={(event) => setTitleEn(event.target.value)} placeholder="English title" />
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={mode} onChange={(event) => setMode(event.target.value as "instant_gacha" | "slot_pick")}>
          <option value="instant_gacha">Instant gacha</option>
          <option value="slot_pick">Slot pick</option>
        </select>
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" min={1} type="number" value={totalSlots} onChange={(event) => setTotalSlots(Number(event.target.value))} placeholder="Total slots" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" min={1} type="number" value={priceThb} onChange={(event) => setPriceThb(Number(event.target.value))} placeholder="Price THB" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" min={1} type="number" value={costCoins} onChange={(event) => setCostCoins(Number(event.target.value))} placeholder="Cost coins" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4 sm:col-span-2" value={displayTags} onChange={(event) => setDisplayTags(event.target.value)} placeholder="Pack labels, comma separated e.g. PSA10, New Exclusive" />
      </div>
      <p className="mt-2 text-xs font-bold text-[var(--muted)]">These labels show on the customer pack card, replacing fixed INSTANT / POKEMON tags.</p>
      <button className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending} onClick={submit} type="button">
        {isPending ? "Saving..." : "Save campaign draft"}
      </button>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
    </section>
  );
}

export function AdminCampaignActionPanel({ campaigns }: { campaigns: YnotCampaign[] }) {
  if (!campaigns.length) {
    return <section className="soft-card rounded-[28px] p-5 text-sm text-[var(--muted)]">Create a campaign draft before publishing.</section>;
  }

  return (
    <section className="soft-card rounded-[28px] p-5">
      <h3 className="text-lg font-black">Publish / close / tag campaigns</h3>
      <div className="mt-4 grid gap-3">
        {campaigns.map((campaign) => <AdminCampaignStatusRow key={campaign.id} campaign={campaign} />)}
      </div>
    </section>
  );
}

function AdminCampaignStatusRow({ campaign }: { campaign: YnotCampaign }) {
  const [status, setStatus] = useState<YnotCampaign["status"]>(campaign.status);
  const [visibility, setVisibility] = useState<YnotCampaign["visibility"]>(campaign.visibility);
  const [displayTags, setDisplayTags] = useState(tagsToInput(campaign.displayTags, campaign.series));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(nextStatus = status, nextVisibility = visibility) {
    startTransition(async () => {
      try {
        setMessage("");
        await requestJson("/api/ynot/admin/campaigns", { campaignId: campaign.id, status: nextStatus, visibility: nextVisibility, displayTags: inputToTags(displayTags) }, "PATCH");
        setStatus(nextStatus);
        setVisibility(nextVisibility);
        setMessage("Campaign status and customer card labels saved. Refresh to see the updated public page.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Campaign status could not be saved.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-black">{campaign.titleTh || campaign.titleEn}</p>
          <p className="text-xs text-[var(--muted)]">{campaign.slug} · {campaign.mode} · {campaign.totalSlots} slots</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" value={status} onChange={(event) => setStatus(event.target.value as YnotCampaign["status"])}>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
          <select className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" value={visibility} onChange={(event) => setVisibility(event.target.value as YnotCampaign["visibility"])}>
            <option value="private">Private</option>
            <option value="hidden">Hidden</option>
            <option value="public">Public</option>
          </select>
          <button className="gold-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit()} type="button">
            Save status
          </button>
        </div>
      </div>
      <label className="mt-3 block text-xs font-black uppercase tracking-[0.18em] text-[var(--muted)]">
        Customer card labels
        <input className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-xs normal-case tracking-normal text-[var(--foreground)]" value={displayTags} onChange={(event) => setDisplayTags(event.target.value)} placeholder="PSA10, New Exclusive" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="plain-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit("live", "public")} type="button">Make live public</button>
        <button className="plain-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit("closed", "public")} type="button">Close public</button>
        <button className="danger-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit("archived", "private")} type="button">Archive private</button>
      </div>
      {message && <p className="mt-2 text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}

export function AdminCardForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [series, setSeries] = useState<"pokemon" | "one_piece">("pokemon");
  const [grade, setGrade] = useState("Ungraded");
  const [tone, setTone] = useState<"red" | "gold" | "blue" | "green" | "rose" | "violet">("gold");
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const payload = await postJson("/api/ynot/admin/cards", { code, name, series, grade, tone, imageUrl });
        setMessage(`Card ${payload.card?.name ?? name} saved.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Card could not be saved.");
      }
    });
  }

  return (
    <section className="soft-card rounded-[28px] p-5">
      <h3 className="text-lg font-black">Create or update card</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Card code" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={name} onChange={(event) => setName(event.target.value)} placeholder="Card name" />
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={series} onChange={(event) => setSeries(event.target.value as "pokemon" | "one_piece")}>
          <option value="pokemon">Pokémon</option>
          <option value="one_piece">One Piece</option>
        </select>
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="Grade" />
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={tone} onChange={(event) => setTone(event.target.value as "red" | "gold" | "blue" | "green" | "rose" | "violet")}>
          <option value="gold">Gold</option>
          <option value="red">Red</option>
          <option value="blue">Blue</option>
          <option value="green">Green</option>
          <option value="rose">Rose</option>
          <option value="violet">Violet</option>
        </select>
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Image URL" />
      </div>
      <button className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending || !name.trim()} onClick={submit} type="button">
        {isPending ? "Saving..." : "Save card"}
      </button>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
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
  const [tone, setTone] = useState<"red" | "gold" | "blue" | "green" | "rose" | "violet">("gold");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function savePrize() {
    startTransition(async () => {
      try {
        setMessage("");
        await postJson("/api/ynot/admin/prizes", { campaignId, cardId, tier, rank, valueThb, tone });
        setMessage("Prize slot saved. Refresh to see the updated pool.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Prize slot could not be saved.");
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
        setMessage(error instanceof Error ? error.message : "Prize slot could not be deleted.");
      }
    });
  }

  return (
    <section className="soft-card rounded-[28px] p-5">
      <h3 className="text-lg font-black">Campaign prize pool</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">Attach catalog cards to campaign ranks so instant gacha can award collection items.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.titleTh || campaign.titleEn}</option>)}
        </select>
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={cardId} onChange={(event) => setCardId(event.target.value)}>
          {cards.map((card) => <option key={card.catalogCardId} value={card.catalogCardId}>{card.name}</option>)}
        </select>
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={tier} onChange={(event) => setTier(event.target.value as "normal" | "high")}>
          <option value="normal">Normal prize</option>
          <option value="high">High tier prize</option>
        </select>
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" min={1} type="number" value={rank} onChange={(event) => setRank(Number(event.target.value))} placeholder="Rank" />
        <input className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" min={0} type="number" value={valueThb} onChange={(event) => setValueThb(Number(event.target.value))} placeholder="Value THB" />
        <select className="h-12 rounded-2xl border border-white/10 bg-black/25 px-4" value={tone} onChange={(event) => setTone(event.target.value as typeof tone)}>
          {["gold", "red", "blue", "green", "rose", "violet"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <button className="gold-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black" disabled={isPending || !campaignId || !cardId} onClick={savePrize} type="button">
        {isPending ? "Saving..." : "Save campaign prize slot"}
      </button>
      {message && <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold">{message}</p>}
      <div className="mt-5 grid max-h-96 gap-2 overflow-auto">
        {prizes.map((prize) => (
          <div key={prize.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm">
            <div>
              <p className="font-black">{prize.campaignTitle} · {prize.tier} #{prize.rank}</p>
              <p className="text-[var(--muted)]">{prize.cardName} · ฿{(prize.valueThb ?? 0).toLocaleString()}</p>
            </div>
            <button className="danger-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => deletePrize(prize.id)} type="button">Delete</button>
          </div>
        ))}
        {!prizes.length && <p className="text-sm text-[var(--muted)]">No prize slots assigned yet.</p>}
      </div>
    </section>
  );
}

export function AdminUserRoleForm({ profileId, currentRole, currentActive }: { profileId: string; currentRole: string | null; currentActive: boolean }) {
  const [role, setRole] = useState<"staff" | "admin" | "owner">(
    currentRole === "owner" || currentRole === "admin" || currentRole === "staff" ? currentRole : "staff",
  );
  const [isActive, setIsActive] = useState(currentRole ? currentActive : true);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await requestJson("/api/ynot/admin/users", { profileId, role, isActive }, "PATCH");
        setMessage("Role saved.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Role could not be saved.");
      }
    });
  }

  return (
    <div className="grid gap-2">
      <select className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" value={role} onChange={(event) => setRole(event.target.value as "staff" | "admin" | "owner")}>
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
        <option value="owner">Owner</option>
      </select>
      <label className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
        <input checked={isActive} type="checkbox" onChange={(event) => setIsActive(event.target.checked)} />
        Active admin
      </label>
      <button className="plain-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={submit} type="button">
        {isPending ? "Saving..." : "Save role"}
      </button>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}

export function AdminMergeActions({ mergeRequestId }: { mergeRequestId: string }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(action: "approve" | "reject") {
    startTransition(async () => {
      try {
        await requestJson("/api/ynot/admin/merge-requests", { mergeRequestId, action, note }, "PATCH");
        setMessage(`${action === "approve" ? "Merge completed" : "Merge rejected"}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Merge review failed.");
      }
    });
  }

  return (
    <div className="grid gap-2">
      <input className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" placeholder="Admin note" value={note} onChange={(event) => setNote(event.target.value)} />
      <div className="flex gap-2">
        <button className="gold-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit("approve")} type="button">Approve merge</button>
        <button className="danger-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} onClick={() => submit("reject")} type="button">Reject merge</button>
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
        await fetch("/api/ynot/admin/exchange", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchangeOrderId: order.id, action, note, coinValue }) }).then(async (response) => {
          if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Exchange review failed.");
        });
        setMessage(`${action} complete.`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Exchange review failed."); }
    });
  }
  return <div className="mt-3 grid gap-2"><input className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" type="number" value={coinValue} onChange={(event) => setCoinValue(Number(event.target.value))} /><input className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" placeholder="Admin note" value={note} onChange={(event) => setNote(event.target.value)} /><div className="flex gap-2"><button className="gold-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} type="button" onClick={() => submit("approve")}>Approve</button><button className="danger-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} type="button" onClick={() => submit("reject")}>Reject</button></div>{message && <p className="text-xs text-[var(--muted)]">{message}</p>}</div>;
}

export function AdminShippingActions({ request }: { request: YnotShippingRequest }) {
  const [status, setStatus] = useState(request.status);
  const [trackingProvider, setTrackingProvider] = useState(request.trackingProvider ?? "");
  const [trackingNumber, setTrackingNumber] = useState(request.trackingNumber ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      try {
        await fetch("/api/ynot/admin/shipping", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ shippingRequestId: request.id, status, trackingProvider, trackingNumber, note }) }).then(async (response) => {
          if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Shipping update failed.");
        });
        setMessage("Shipping updated.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Shipping update failed."); }
    });
  }
  return <div className="mt-3 grid gap-2"><select className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" value={status} onChange={(event) => setStatus(event.target.value as YnotShippingRequest["status"])}><option value="submitted">Submitted</option><option value="packing">Packing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select><input className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" placeholder="Carrier" value={trackingProvider} onChange={(event) => setTrackingProvider(event.target.value)} /><input className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" placeholder="Tracking number" value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} /><input className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs" placeholder="Admin note" value={note} onChange={(event) => setNote(event.target.value)} /><button className="gold-button rounded-xl px-3 py-2 text-xs font-black" disabled={isPending} type="button" onClick={submit}>Update shipping</button>{message && <p className="text-xs text-[var(--muted)]">{message}</p>}</div>;
}
