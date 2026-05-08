"use client";

import { Metric,TextAreaField,TextField } from "@/components/ui/lucky-draw";
import type { Lang, Order, ProfileInfo } from "@/lib/lucky-draw/types";
import {
BadgeCheck,
Languages,
LogIn,
Save,
UserRound
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminRole } from "../model";
import { copy } from "../model";

export function ProfileView({
  lang,
  lineName,
  lineVerified,
  isAdmin,
  adminRole,
  orders,
  profileInfo,
  profileLoaded,
  profileSaving,
  onLogin,
  onLanguage,
  onSaveProfile,
}: {
  lang: Lang;
  lineName: string;
  lineVerified: boolean;
  isAdmin: boolean;
  adminRole: AdminRole | null;
  orders: Order[];
  profileInfo: ProfileInfo;
  profileLoaded: boolean;
  profileSaving: boolean;
  onLogin: () => void;
  onLanguage: () => void;
  onSaveProfile: (profileInfo: ProfileInfo) => Promise<boolean>;
}) {
  const t = copy[lang];
  const [draft, setDraft] = useState(profileInfo);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const approvedCount = orders.filter((order) => order.status === "approved" || order.status === "picked").length;
  const pickedCount = orders.filter((order) => order.status === "picked").length;
  const profileName = profileInfo.fullName || profileInfo.phone || "-";

  useEffect(() => {
    if (draftDirty) return;
    const syncDraft = window.setTimeout(() => setDraft(profileInfo), 0);
    return () => window.clearTimeout(syncDraft);
  }, [draftDirty, profileInfo]);

  function updateProfileDraft(patch: Partial<ProfileInfo>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDraftDirty(true);
  }

  async function saveProfileDraft() {
    const ok = await onSaveProfile(draft);
    if (!ok) return;
    setDraftDirty(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-[28px] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.profile}</p>
            <h2 className="mt-2 truncate text-2xl font-black">{t.lineAccount}</h2>
          </div>
          <UserRound className="h-8 w-8 shrink-0 text-[var(--gold)]" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoTile label={t.displayName} value={lineVerified ? lineName : "LINE Customer"} />
          <InfoTile label={t.loginStatus} value={lineVerified ? t.verifiedLine : t.loginLine} />
          <InfoTile label={t.accessLevel} value={isAdmin ? `${t.adminAccess}${adminRole ? ` / ${adminRole}` : ""}` : t.customerAccess} />
          <InfoTile label={t.contactInfo} value={profileLoaded ? profileName : "-"} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 font-bold" onClick={onLogin}>
            {lineVerified ? <BadgeCheck className="h-4 w-4 text-emerald-300" /> : <LogIn className="h-4 w-4" />}
            {lineVerified ? t.reconnectLine : t.loginLine}
          </button>
          <button className="plain-button flex h-12 items-center justify-center gap-2 rounded-2xl px-4 font-bold" onClick={onLanguage}>
            <Languages className="h-4 w-4 text-[var(--gold)]" />
            {t.language}: {lang.toUpperCase()}
          </button>
        </div>
      </div>

      {lineVerified ? (
        <div className="glass rounded-[28px] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.profileSettings}</p>
              <h3 className="mt-2 text-lg font-black">{t.shippingAddress}</h3>
            </div>
            <button
              className="gold-button flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
              disabled={profileSaving}
              onClick={() => void saveProfileDraft()}
            >
              <Save className="h-4 w-4" />
              {profileSaving ? "Saving..." : saved ? t.saved : t.saveProfile}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TextField label={t.fullName} value={draft.fullName} onChange={(value) => updateProfileDraft({ fullName: value })} />
            <TextField label={t.phone} value={draft.phone} onChange={(value) => updateProfileDraft({ phone: value })} />
          </div>

          <div className="mt-3 grid gap-3">
            <TextField label={t.addressLine1} value={draft.addressLine1} onChange={(value) => updateProfileDraft({ addressLine1: value })} />
            <TextField label={t.addressLine2} value={draft.addressLine2} onChange={(value) => updateProfileDraft({ addressLine2: value })} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField label={t.subdistrict} value={draft.subdistrict} onChange={(value) => updateProfileDraft({ subdistrict: value })} />
            <TextField label={t.district} value={draft.district} onChange={(value) => updateProfileDraft({ district: value })} />
            <TextField label={t.province} value={draft.province} onChange={(value) => updateProfileDraft({ province: value })} />
            <TextField label={t.postalCode} value={draft.postalCode} onChange={(value) => updateProfileDraft({ postalCode: value })} />
            <TextField label={t.country} value={draft.country} onChange={(value) => updateProfileDraft({ country: value })} />
          </div>

          <div className="mt-3">
            <TextAreaField label={t.deliveryNote} value={draft.deliveryNote} onChange={(value) => updateProfileDraft({ deliveryNote: value })} />
          </div>
        </div>
      ) : (
        <div className="glass rounded-[28px] p-4 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.profileSettings}</p>
          <h3 className="mt-2 text-lg font-black">{t.loginToEditProfile}</h3>
          <button className="gold-button mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black" onClick={onLogin}>
            <LogIn className="h-4 w-4" />
            {t.loginLine}
          </button>
        </div>
      )}

      <div className="glass rounded-[28px] p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold)]">{t.orderSummary}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label={t.orders} value={String(orders.length)} />
          <Metric label={t.paidOrders} value={String(approvedCount)} />
          <Metric label={t.pickedOrders} value={String(pickedCount)} />
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="soft-card min-w-0 rounded-3xl p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 truncate text-base font-black">{value}</p>
    </div>
  );
}
