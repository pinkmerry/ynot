"use client";

import { Empty, Metric, NumberField, SelectField, TextField } from "@/components/ui/lucky-draw";
import type { CardCatalogItem, ChaseCard, DrawConfig, FeaturedCard, Lang, Order } from "@/lib/lucky-draw/types";
import {
Check,
ChevronDown,
ExternalLink,
Lock,
Play,
QrCode,
Save,
Sparkles,
Trash2,
Upload
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { CardImageUploadResult, DrawLifecycleAction } from "../model";
import {
applyCatalogCard,
cardsShareCatalogIdentity,
copy,
drawStatusClass,
drawStatusLabel,
money,
newCardId,
normalizeOrderPrefixInput
} from "../model";
import { CardArtwork } from "../shared/CardArtwork";
import { SlipVerificationBadge } from "../shared/SlipVerificationBadge";

export function AdminView({
  draw,
  lang,
  orders,
  featuredCards,
  chaseCards,
  cardCatalog,
  onDraw,
  onApprove,
  onReject,
  onViewSlip,
  onAssignSlots,
  onQrUpload,
  onCardImageUpload,
  onFeaturedCards,
  onChaseCards,
  onSaveCards,
  onDrawLifecycle,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
  cardCatalog: CardCatalogItem[];
  onDraw: (draw: DrawConfig) => Promise<boolean>;
  onDrawLifecycle: (action: DrawLifecycleAction) => Promise<boolean>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onViewSlip: (id: string) => void;
  onAssignSlots: (id: string, slots: number[]) => void;
  onQrUpload: (file: File) => Promise<string>;
  onCardImageUpload: (file: File) => Promise<CardImageUploadResult | "">;
  onFeaturedCards: (cards: FeaturedCard[]) => void;
  onChaseCards: (cards: ChaseCard[]) => void;
  onSaveCards: (featuredCards: FeaturedCard[], chaseCards: ChaseCard[]) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [draft, setDraft] = useState(draw);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const pending = orders.filter((order) => order.status === "pending");
  const selectableOrders = orders.filter((order) => order.status === "approved" || order.status === "picked");
  const takenSlots = new Set(orders.flatMap((order) => order.slots));

  useEffect(() => {
    if (draftDirty) return;
    const syncDraft = window.setTimeout(() => setDraft(draw), 0);
    return () => window.clearTimeout(syncDraft);
  }, [draw, draftDirty]);

  function updateDraft(patch: Partial<DrawConfig>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDraftDirty(true);
  }

  async function saveDraft() {
    const ok = await onDraw(draft);
    if (!ok) return;
    setDraftDirty(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  async function handleQrUpload(file?: File) {
    if (!file) return;
    setQrUploading(true);
    const qrImageUrl = await onQrUpload(file);
    if (qrImageUrl) updateDraft({ qrImageUrl });
    setQrUploading(false);
  }

  return (
    <div className="space-y-4">
      <AdminLifecyclePanel
        draw={draw}
        lang={lang}
        orders={orders}
        onDrawLifecycle={onDrawLifecycle}
      />

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.admin}</p>
            <h2 className="mt-2 text-2xl font-black">{t.streamSettings}</h2>
          </div>
          <button className="gold-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black" onClick={() => void saveDraft()}>
            <Save className="h-4 w-4" />
            {saved ? t.saved : t.save}
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          <TextField label="Facebook Live URL" value={draft.facebookUrl} onChange={(value) => updateDraft({ facebookUrl: value })} />
          <TextField label="YouTube Embed URL" value={draft.youtubeUrl} onChange={(value) => updateDraft({ youtubeUrl: value })} />
        </div>
      </div>

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <h3 className="text-lg font-black">{t.drawSettings}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TextField label="Title TH" value={draft.titleTh} onChange={(value) => updateDraft({ titleTh: value })} />
          <TextField label="Title EN" value={draft.titleEn} onChange={(value) => updateDraft({ titleEn: value })} />
          <NumberField label="Price" value={draft.price} onChange={(value) => updateDraft({ price: value })} />
          <NumberField label="Total Slots" value={draft.totalSlots} onChange={(value) => updateDraft({ totalSlots: value })} />
          <TextField
            label={t.orderSlipDetail}
            value={draft.orderCodePrefix}
            onChange={(value) => updateDraft({ orderCodePrefix: normalizeOrderPrefixInput(value) })}
          />
        </div>
      </div>

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <h3 className="text-lg font-black">{t.paymentSettings}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TextField label="PromptPay" value={draft.promptPay} onChange={(value) => updateDraft({ promptPay: value })} />
          <TextField label="Bank" value={draft.bankName} onChange={(value) => updateDraft({ bankName: value })} />
          <TextField label="Account Name" value={draft.accountName} onChange={(value) => updateDraft({ accountName: value })} />
          <TextField label="Account Number" value={draft.accountNumber} onChange={(value) => updateDraft({ accountNumber: value })} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr] sm:items-center">
          <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-3xl bg-white p-3">
            {draft.qrImageUrl ? (
              <div className="relative h-full w-full">
                <Image
                  className="rounded-xl object-contain"
                  src={draft.qrImageUrl}
                  alt="Current payment QR"
                  fill
                  sizes="180px"
                  unoptimized
                />
              </div>
            ) : (
              <QrCode className="h-16 w-16 text-slate-900" />
            )}
          </div>
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/18 bg-white/[0.035] p-4 text-center">
            <Upload className="h-6 w-6 text-[var(--gold)]" />
            <span className="mt-2 text-sm font-black">{qrUploading ? "Uploading QR..." : "Upload payment QR"}</span>
            <span className="mt-1 text-xs text-[var(--muted)]">JPG, PNG, or WEBP · max 10 MB</span>
            <input
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={qrUploading}
              onChange={(event) => void handleQrUpload(event.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <AdminSlotEditor
        draw={draft}
        lang={lang}
        orders={selectableOrders}
        takenSlots={takenSlots}
        onAssignSlots={onAssignSlots}
      />

      <AdminCardEditor
        lang={lang}
        featuredCards={featuredCards}
        chaseCards={chaseCards}
        cardCatalog={cardCatalog}
        onCardImageUpload={onCardImageUpload}
        onFeaturedCards={onFeaturedCards}
        onChaseCards={onChaseCards}
        onSaveCards={onSaveCards}
      />

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black">{t.pending}</h3>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">{pending.length}</span>
        </div>
        <div className="mt-4 space-y-3">
          {pending.length === 0 && <Empty text="No pending slips" />}
          {pending.map((order) => (
            <div key={order.id} className="soft-card rounded-3xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-black">{order.id} / {order.lineName}</p>
                  <p className="mt-1 break-words text-sm text-[var(--muted)]">
                    {order.quantity} draws / {money(order.amount)} THB / {order.hasSlipFile ? order.slipName : t.manualSlip}
                  </p>
                  <SlipVerificationBadge lang={lang} order={order} />
                  {order.slipProviderMessage && (
                    <p className="mt-1 max-w-xl break-words text-xs text-[var(--muted)]">{order.slipProviderMessage}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
                  <button
                    className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold sm:px-4"
                    disabled={!order.hasSlipFile}
                    onClick={() => onViewSlip(order.id)}
                  >
                    <ExternalLink className="h-4 w-4 text-sky-300" />
                    {t.viewSlip}
                  </button>
                  <button className="plain-button flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold sm:px-4" onClick={() => onApprove(order.id)}>
                    <Check className="h-4 w-4 text-emerald-300" />
                    {t.approve}
                  </button>
                  <button className="danger-button flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold sm:px-4" onClick={() => onReject(order.id)}>
                    <Lock className="h-4 w-4" />
                    {t.reject}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminLifecyclePanel({
  draw,
  lang,
  orders,
  onDrawLifecycle,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  onDrawLifecycle: (action: DrawLifecycleAction) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [busyAction, setBusyAction] = useState<DrawLifecycleAction | "">("");
  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const awaitingPickCount = orders.filter((order) => order.status === "approved").length;

  async function runAction(action: DrawLifecycleAction) {
    setBusyAction(action);
    try {
      await onDrawLifecycle(action);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.drawLifecycle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-2xl font-black">{drawStatusLabel(draw.status, lang)}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${drawStatusClass(draw.status)}`}>
              {t.drawStatus}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Metric label={t.pendingPayments} value={String(pendingCount)} />
          <Metric label={t.awaitingPicks} value={String(awaitingPickCount)} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {draw.status === "live" && (
          <button
            className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
            disabled={Boolean(busyAction)}
            onClick={() => void runAction("close_sales")}
          >
            <Lock className="h-4 w-4 text-amber-200" />
            {busyAction === "close_sales" ? "Working..." : t.closeSales}
          </button>
        )}

        {draw.status === "closed" && (
          <>
            <button
              className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
              disabled={Boolean(busyAction)}
              onClick={() => void runAction("reopen_sales")}
            >
              <Play className="h-4 w-4 text-emerald-200" />
              {busyAction === "reopen_sales" ? "Working..." : t.reopenSales}
            </button>
            <button
              className="gold-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
              disabled={Boolean(busyAction)}
              onClick={() => void runAction("create_next")}
            >
              <Sparkles className="h-4 w-4" />
              {busyAction === "create_next" ? "Working..." : t.createNextDraw}
            </button>
          </>
        )}

        {draw.status === "draft" && (
          <button
            className="gold-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
            disabled={Boolean(busyAction)}
            onClick={() => void runAction("publish_next")}
          >
            <Play className="h-4 w-4" />
            {busyAction === "publish_next" ? "Working..." : t.publishNextDraw}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminCardEditor({
  lang,
  featuredCards,
  chaseCards,
  cardCatalog,
  onCardImageUpload,
  onFeaturedCards,
  onChaseCards,
  onSaveCards,
}: {
  lang: Lang;
  featuredCards: FeaturedCard[];
  chaseCards: ChaseCard[];
  cardCatalog: CardCatalogItem[];
  onCardImageUpload: (file: File) => Promise<CardImageUploadResult | "">;
  onFeaturedCards: (cards: FeaturedCard[]) => void;
  onChaseCards: (cards: ChaseCard[]) => void;
  onSaveCards: (featuredCards: FeaturedCard[], chaseCards: ChaseCard[]) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [cardsSaved, setCardsSaved] = useState(false);
  const [cardsSaving, setCardsSaving] = useState(false);
  const [uploadingCardId, setUploadingCardId] = useState("");
  const [addTier, setAddTier] = useState<"normal" | "high">("normal");

  function updateFeatured(index: number, patch: Partial<FeaturedCard>) {
    const sourceCard = featuredCards[index];
    const nextFeaturedCards = featuredCards.map((card, cardIndex) =>
      cardIndex === index || cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...patch } : card,
    );
    const nextChaseCards = chaseCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...patch } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function updateChase(index: number, patch: Partial<ChaseCard>) {
    const sourceCard = chaseCards[index];
    const sharedPatch: Partial<FeaturedCard> = {
      code: patch.code,
      name: patch.name,
      grade: patch.grade,
      series: patch.series,
      photoUrl: patch.photoUrl,
      photoStoragePath: patch.photoStoragePath,
    };
    const nextFeaturedCards = featuredCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...sharedPatch } : card,
    );
    const nextChaseCards = chaseCards.map((card, cardIndex) =>
      cardIndex === index ? { ...card, ...patch } : cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...sharedPatch } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function pickFeaturedCatalogCard(index: number, catalogCardId: string) {
    const catalogCard = cardCatalog.find((card) => card.catalogCardId === catalogCardId);
    if (!catalogCard) return;
    const sourceCard = featuredCards[index];
    const nextFeaturedCards = featuredCards.map((card, cardIndex) =>
      cardIndex === index || cardsShareCatalogIdentity(card, sourceCard) ? applyCatalogCard(card, catalogCard) : card,
    );
    const nextChaseCards = chaseCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...applyCatalogCard(card, catalogCard) } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function pickChaseCatalogCard(index: number, catalogCardId: string) {
    const catalogCard = cardCatalog.find((card) => card.catalogCardId === catalogCardId);
    if (!catalogCard) return;
    const sourceCard = chaseCards[index];
    const nextFeaturedCards = featuredCards.map((card) =>
      cardsShareCatalogIdentity(card, sourceCard) ? applyCatalogCard(card, catalogCard) : card,
    );
    const nextChaseCards = chaseCards.map((card, cardIndex) =>
      cardIndex === index || cardsShareCatalogIdentity(card, sourceCard) ? { ...card, ...applyCatalogCard(card, catalogCard) } : card,
    );
    onFeaturedCards(nextFeaturedCards);
    onChaseCards(nextChaseCards);
  }

  function addFeatured() {
    onFeaturedCards([
      ...featuredCards,
      { id: newCardId("poster"), name: "New Card", grade: "PSA 10", series: "One Piece" },
    ]);
  }

  function addChase() {
    const nextRank = chaseCards.length ? Math.max(...chaseCards.map((card) => card.rank)) + 1 : 1;
    const nextCard: ChaseCard = {
      rank: nextRank,
      id: newCardId("chase"),
      name: "New Chase Card",
      grade: "PSA 10",
      series: "One Piece",
      value: 10000,
    };
    onChaseCards([...chaseCards, nextCard]);
  }

  function addPrizeCard() {
    if (addTier === "high") {
      addChase();
      return;
    }
    addFeatured();
  }

  async function saveCards() {
    setCardsSaving(true);
    const saved = await onSaveCards(featuredCards, chaseCards);
    setCardsSaving(false);
    if (saved) {
      setCardsSaved(true);
      window.setTimeout(() => setCardsSaved(false), 1400);
    }
  }

  async function uploadFeaturedImage(index: number, file?: File) {
    if (!file) return;
    const card = featuredCards[index];
    const cardId = card.id ?? `featured-${index}`;
    setUploadingCardId(cardId);
    try {
      const upload = await onCardImageUpload(file);
      if (upload) {
        const imagePatch = { photoUrl: upload.imageUrl, photoStoragePath: upload.storagePath };
        const nextFeaturedCards = featuredCards.map((item, cardIndex) =>
          cardIndex === index
            ? { ...item, id: item.id ?? newCardId("poster"), ...imagePatch }
            : cardsShareCatalogIdentity(item, card)
              ? { ...item, ...imagePatch }
              : item,
        );
        const nextChaseCards = chaseCards.map((item) =>
          cardsShareCatalogIdentity(item, card) ? { ...item, ...imagePatch } : item,
        );
        onFeaturedCards(nextFeaturedCards);
        onChaseCards(nextChaseCards);
        await onSaveCards(nextFeaturedCards, nextChaseCards);
      }
    } finally {
      setUploadingCardId("");
    }
  }

  async function uploadChaseImage(index: number, file?: File) {
    if (!file) return;
    const card = chaseCards[index];
    const cardId = card.id ?? `chase-${index}`;
    setUploadingCardId(cardId);
    try {
      const upload = await onCardImageUpload(file);
      if (upload) {
        const imagePatch = { photoUrl: upload.imageUrl, photoStoragePath: upload.storagePath };
        const nextFeaturedCards = featuredCards.map((item) =>
          cardsShareCatalogIdentity(item, card) ? { ...item, ...imagePatch } : item,
        );
        const nextChaseCards = chaseCards.map((item, cardIndex) =>
          cardIndex === index
            ? { ...item, id: item.id ?? newCardId("chase"), ...imagePatch }
            : cardsShareCatalogIdentity(item, card)
              ? { ...item, ...imagePatch }
              : item,
        );
        onFeaturedCards(nextFeaturedCards);
        onChaseCards(nextChaseCards);
        await onSaveCards(nextFeaturedCards, nextChaseCards);
      }
    } finally {
      setUploadingCardId("");
    }
  }

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.cardSettings}</p>
          <h3 className="mt-2 text-lg font-black">{t.addPrizeCard}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{featuredCards.length} {t.normalPrize} / {chaseCards.length} {t.highTierPrize}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[220px_auto] sm:items-end">
          <SelectField
            label={t.prizeTier}
            value={addTier}
            options={[
              { label: t.normalPrize, value: "normal" },
              { label: t.highTierPrize, value: "high" },
            ]}
            onChange={(value) => setAddTier(value === "high" ? "high" : "normal")}
          />
          <button className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold" onClick={addPrizeCard}>
            <Sparkles className="h-4 w-4 text-[var(--gold)]" />
            {t.addCard}
          </button>
        </div>
      </div>

      <details className="admin-tier-panel mt-5" open>
        <summary className="block cursor-pointer outline-none">
          <div className="flex w-full min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">{t.normalPrize}</span>
              <span className="mt-1 block truncate text-sm text-[var(--muted)]">{featuredCards.length} cards shown on Home</span>
            </span>
            <ChevronDown className="tier-chevron h-5 w-5 shrink-0" />
          </div>
        </summary>
        <div className="mt-3 grid gap-3">
          {featuredCards.map((card, index) => (
            <details key={card.id ?? `featured-${index}`} className="card-edit-panel">
              <summary className="block cursor-pointer outline-none">
                <div className="flex w-full min-w-0 items-center gap-3">
                  <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <CardArtwork card={card} compact />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{index + 1}. {card.name}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted)]">{card.grade} / {card.series}</span>
                  </span>
                  <ChevronDown className="tier-chevron h-4 w-4 shrink-0" />
                </div>
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-[96px_1fr_0.7fr_1fr] sm:items-end">
                <label className="upload-target group cursor-pointer">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                    <CardArtwork card={card} compact />
                  </span>
                  <span className="mt-2 flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-[var(--gold)]">
                    {uploadingCardId === (card.id ?? `featured-${index}`) ? "Uploading..." : t.uploadPhoto}
                  </span>
                  <input
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void uploadFeaturedImage(index, event.target.files?.[0])}
                  />
                </label>
                <CardCatalogSelect
                  label={t.savedCard}
                  cards={cardCatalog}
                  emptyLabel={t.noSavedCards}
                  promptLabel={t.pickSavedCard}
                  onSelect={(catalogCardId) => pickFeaturedCatalogCard(index, catalogCardId)}
                />
                <TextField label={t.cardCode} value={card.code ?? ""} onChange={(value) => updateFeatured(index, { code: value })} />
                <TextField label={`Card ${index + 1}`} value={card.name} onChange={(value) => updateFeatured(index, { name: value })} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[0.7fr_0.7fr_auto] sm:items-end">
                <TextField label="Grade" value={card.grade} onChange={(value) => updateFeatured(index, { grade: value })} />
                <SelectField
                  label="Series"
                  value={card.series}
                  options={["One Piece", "Pokemon"]}
                  onChange={(value) => updateFeatured(index, { series: value as FeaturedCard["series"] })}
                />
                <button
                  className="danger-button flex h-12 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold"
                  disabled={featuredCards.length <= 1}
                  onClick={() => onFeaturedCards(featuredCards.filter((_, cardIndex) => cardIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                  {t.remove}
                </button>
              </div>
            </details>
          ))}
        </div>
      </details>

      <details className="admin-tier-panel mt-4" open>
        <summary className="block cursor-pointer outline-none">
          <div className="flex w-full min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold)]">{t.highTierPrize}</span>
              <span className="mt-1 block truncate text-sm text-[var(--muted)]">{chaseCards.length} cards shown as top value prizes</span>
            </span>
            <ChevronDown className="tier-chevron h-5 w-5 shrink-0" />
          </div>
        </summary>
        <div className="mt-3 grid gap-3">
          {chaseCards.map((card, index) => (
            <details key={card.id ?? `chase-${index}`} className="card-edit-panel">
              <summary>
                <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25">
                  <CardArtwork card={card} compact />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">#{card.rank} {card.name}</span>
                  <span className="mt-1 block truncate text-xs text-[var(--muted)]">฿{money(card.value)} / {card.grade}</span>
                </span>
                <ChevronDown className="tier-chevron h-4 w-4" />
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-[96px_0.45fr_0.8fr_1fr_1fr] sm:items-end">
                <label className="upload-target group cursor-pointer">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                    <CardArtwork card={card} compact />
                  </span>
                  <span className="mt-2 flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black text-[var(--gold)]">
                    {uploadingCardId === (card.id ?? `chase-${index}`) ? "Uploading..." : t.uploadPhoto}
                  </span>
                  <input
                    className="hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void uploadChaseImage(index, event.target.files?.[0])}
                  />
                </label>
                <NumberField label="Rank" value={card.rank} onChange={(value) => updateChase(index, { rank: Math.max(value, 1) })} />
                <CardCatalogSelect
                  label={t.savedCard}
                  cards={cardCatalog}
                  emptyLabel={t.noSavedCards}
                  promptLabel={t.pickSavedCard}
                  onSelect={(catalogCardId) => pickChaseCatalogCard(index, catalogCardId)}
                />
                <TextField label={t.cardCode} value={card.code ?? ""} onChange={(value) => updateChase(index, { code: value })} />
                <TextField label="Card" value={card.name} onChange={(value) => updateChase(index, { name: value })} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[0.65fr_auto] sm:items-end">
                <NumberField label="Value THB" value={card.value} onChange={(value) => updateChase(index, { value })} />
                <button
                  className="danger-button flex h-12 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold"
                  disabled={chaseCards.length <= 1}
                  onClick={() => onChaseCards(chaseCards.filter((_, cardIndex) => cardIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                  {t.remove}
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField label="Grade" value={card.grade} onChange={(value) => updateChase(index, { grade: value })} />
                <SelectField
                  label="Series"
                  value={card.series}
                  options={["One Piece", "Pokemon"]}
                  onChange={(value) => updateChase(index, { series: value as FeaturedCard["series"] })}
                />
              </div>
            </details>
          ))}
        </div>
      </details>
      <button
        className="gold-button mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black"
        disabled={cardsSaving}
        onClick={() => void saveCards()}
      >
        <Save className="h-4 w-4" />
        {cardsSaving ? "Saving..." : cardsSaved ? t.saved : t.save}
      </button>
    </div>
  );
}

function AdminSlotEditor({
  draw,
  lang,
  orders,
  takenSlots,
  onAssignSlots,
}: {
  draw: DrawConfig;
  lang: Lang;
  orders: Order[];
  takenSlots: Set<number>;
  onAssignSlots: (id: string, slots: number[]) => void;
}) {
  const t = copy[lang];
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const activeOrder = orders.find((order) => order.id === orderId) ?? orders[0];
  const slots = Array.from({ length: draw.totalSlots }, (_, index) => index + 1);

  function toggleAdminSlot(slot: number) {
    if (!activeOrder) return;
    const owned = activeOrder.slots.includes(slot);
    const unavailable = takenSlots.has(slot) && !owned;
    if (unavailable) return;

    const nextSlots = owned
      ? activeOrder.slots.filter((item) => item !== slot)
      : [...activeOrder.slots, slot].sort((a, b) => a - b);

    if (nextSlots.length > activeOrder.quantity) return;
    onAssignSlots(activeOrder.id, nextSlots);
  }

  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.manualPick}</p>
          <h3 className="mt-2 text-lg font-black">{t.pickedByAdmin}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {activeOrder
              ? `${activeOrder.id} · ${activeOrder.lineName} · ${activeOrder.slots.length}/${activeOrder.quantity}`
              : t.openPicks}
          </p>
        </div>
        <select
          className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)] sm:w-auto"
          value={activeOrder?.id ?? ""}
          onChange={(event) => setOrderId(event.target.value)}
        >
          {orders.length === 0 && <option value="">{t.openPicks}</option>}
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.id} · {order.lineName}
            </option>
          ))}
        </select>
      </div>

      {activeOrder ? (
        <>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-[var(--muted)]">
            {t.currentPicks}:{" "}
            <span className="font-black text-[var(--gold)]">
              {activeOrder.slots.length ? activeOrder.slots.join(", ") : "-"}
            </span>
          </div>
          <div className="slot-grid mt-4">
            {slots.map((slot) => {
              const owned = activeOrder.slots.includes(slot);
              const unavailable = takenSlots.has(slot) && !owned;
              return (
                <button
                  key={slot}
                  className={[
                    "slot-button aspect-square rounded-2xl border text-sm font-black transition",
                    unavailable ? "border-white/5 bg-black/35 text-white/20" : "",
                    owned ? "border-[var(--gold)] bg-[var(--gold)] text-slate-950 shadow-[0_0_22px_rgba(244,197,66,0.35)]" : "",
                    !owned && !unavailable ? "border-sky-300/25 bg-sky-300/10 text-sky-100 hover:border-sky-200" : "",
                  ].join(" ")}
                  disabled={unavailable}
                  onClick={() => toggleAdminSlot(slot)}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-4">
          <Empty text={t.openPicks} />
        </div>
      )}
    </div>
  );
}


function CardCatalogSelect({
  label,
  cards,
  emptyLabel,
  promptLabel,
  onSelect,
}: {
  label: string;
  cards: CardCatalogItem[];
  emptyLabel: string;
  promptLabel: string;
  onSelect: (catalogCardId: string) => void;
}) {
  const options = [
    { label: cards.length ? promptLabel : emptyLabel, value: "" },
    ...cards.map((card) => ({
      label: `${card.code ? `${card.code} · ` : ""}${card.name} · ${card.grade} · ${card.series}`,
      value: card.catalogCardId,
    })),
  ];

  return (
    <SelectField
      label={label}
      value=""
      options={options}
      onChange={(value) => {
        if (value) onSelect(value);
      }}
    />
  );
}
