"use client";

import { Row } from "@/components/ui/lucky-draw";
import type { DrawConfig, Lang } from "@/lib/lucky-draw/types";
import {
Banknote,
Check,
Loader2,
LogIn,
QrCode,
Upload
} from "lucide-react";
import Image from "next/image";
import {
copy,
money,
promptPayDisplay
} from "../model";

export function CheckoutView({
  draw,
  lang,
  lineName,
  lineVerified,
  quantity,
  slipName,
  slipPreviewUrl,
  isSubmitting,
  onLineName,
  onQuantity,
  onSlip,
  onSubmit,
}: {
  draw: DrawConfig;
  lang: Lang;
  lineName: string;
  lineVerified: boolean;
  quantity: number;
  slipName: string;
  slipPreviewUrl: string;
  isSubmitting: boolean;
  onLineName: (value: string) => void;
  onQuantity: (value: number) => void;
  onSlip: (file: File | null) => void;
  onSubmit: () => void;
}) {
  const t = copy[lang];
  const cleanPromptPay = promptPayDisplay(draw.promptPay);
  return (
    <div className="glass rounded-[28px] p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.buyNow}</p>
      <h2 className="mt-2 text-2xl font-black">{t.payFirstTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t.payFirstBody}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{t.customer}</span>
          <input
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
            value={lineName}
            disabled={isSubmitting}
            onChange={(event) => onLineName(event.target.value)}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{t.draws}</span>
          <select
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 outline-none focus:border-[var(--gold)]"
            value={quantity}
            disabled={isSubmitting}
            onChange={(event) => onQuantity(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 8, 10].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="soft-card rounded-3xl p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black">
            <QrCode className="h-4 w-4 text-[var(--gold)]" />
            {cleanPromptPay ? "PromptPay" : "Payment QR"}
          </div>
          <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-white p-3 text-center text-slate-900">
            {draw.qrImageUrl ? (
              <div className="relative h-full w-full">
                <Image
                  className="rounded-xl object-contain"
                  src={draw.qrImageUrl}
                  alt="PromptPay QR"
                  fill
                  sizes="(max-width: 640px) calc(100vw - 112px), 280px"
                  unoptimized
                />
              </div>
            ) : (
            <div>
              <QrCode className="mx-auto h-20 w-20" />
              {cleanPromptPay && <p className="mt-3 text-sm font-black">{cleanPromptPay}</p>}
              <p className="text-xs text-slate-500">{money(quantity * draw.price)} THB</p>
            </div>
            )}
          </div>
          {draw.qrImageUrl && cleanPromptPay && (
            <div className="mt-3 text-center">
              <p className="text-sm font-black text-white">{cleanPromptPay}</p>
              <p className="text-xs text-[var(--muted)]">{money(quantity * draw.price)} THB</p>
            </div>
          )}
        </div>
        <div className="soft-card rounded-3xl p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-black">
            <Banknote className="h-4 w-4 text-[var(--gold)]" />
            {draw.bankName}
          </div>
          <dl className="space-y-3 text-sm">
            <Row label="Name" value={draw.accountName} />
            <Row label="Account" value={draw.accountNumber} />
            <Row label={t.total} value={`${money(quantity * draw.price)} THB`} strong />
          </dl>
        </div>
      </div>

      <label className={`mt-5 flex min-h-28 flex-col items-center justify-center rounded-3xl border border-dashed border-white/18 bg-white/[0.035] p-4 text-center ${isSubmitting ? "cursor-wait opacity-70" : "cursor-pointer"}`}>
        {slipPreviewUrl ? (
          <span className="relative block h-40 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <Image className="object-contain" src={slipPreviewUrl} alt={slipName || "Uploaded payment slip"} fill sizes="(max-width: 640px) calc(100vw - 64px), 360px" unoptimized />
          </span>
        ) : (
          <Upload className="h-6 w-6 text-[var(--gold)]" />
        )}
        <span className="mt-2 text-sm font-black">{slipName ? `${t.uploadSlip}: ${slipName}` : t.uploadSlip}</span>
        <span className="mt-1 text-xs text-[var(--muted)]">
          {slipName ? "Ready to submit" : "JPG, PNG, or WEBP"}
        </span>
        <input
          className="hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isSubmitting}
          onChange={(event) => onSlip(event.target.files?.[0] ?? null)}
        />
      </label>

      <button
        className="gold-button mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-black disabled:cursor-wait disabled:opacity-70"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        onClick={onSubmit}
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : lineVerified ? (
          <Check className="h-5 w-5" />
        ) : (
          <LogIn className="h-5 w-5" />
        )}
        {isSubmitting ? t.sendingOrder : lineVerified ? t.createOrder : t.loginLine}
      </button>
    </div>
  );
}
