"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStoreLanguage } from "../ynot/StorePreferences";
import { I18nText, localized } from "../ynot/i18n";

export type IdentityRow = {
  id: string;
  provider: "email" | "google" | "line";
  email: string | null;
  displayName: string | null;
  linkedAt: string;
  lastSeenAt: string | null;
};

type Profile = {
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  displayName: string;
  hasLine: boolean;
};

type Props = {
  profile: Profile;
  identities: IdentityRow[];
};

const providerLabel = {
  en: {
    email: "Email & password",
    google: "Google",
    line: "LINE",
  },
  th: {
    email: "อีเมลและรหัสผ่าน",
    google: "Google",
    line: "LINE",
  },
} as const;

export function IdentitiesPanel({ profile, identities }: Props) {
  const router = useRouter();
  const language = useStoreLanguage();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const emailVerified = Boolean(profile.emailVerifiedAt);
  const phoneVerified = Boolean(profile.phoneVerifiedAt);

  async function unlink(identityToken: string) {
    if (identities.length <= 1) {
      setError(
        language === "th"
          ? "คุณลบวิธีเข้าสู่ระบบสุดท้ายไม่ได้"
          : "You can't remove your last login method.",
      );
      return;
    }
    if (
      !confirm(
        language === "th"
          ? "ลบวิธีเข้าสู่ระบบนี้ออกจากบัญชีของคุณ?"
          : "Remove this login method from your account?",
      )
    ) return;
    setBusy(identityToken);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/identities/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          body.error ??
            (language === "th"
              ? "ลบวิธีเข้าสู่ระบบไม่สำเร็จ"
              : "Could not unlink."),
        );
        return;
      }
      setInfo(
        language === "th"
          ? "ลบวิธีเข้าสู่ระบบแล้ว"
          : "Login method removed.",
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mobile-safe space-y-4 px-4 py-6">
      <header className="space-y-1">
        <p className="sequence-label">{`// ${profile.displayName.toUpperCase()}`}</p>
        <h1 className="text-2xl font-black text-white">
          <I18nText en="Login methods" th="วิธีเข้าสู่ระบบ" />
        </h1>
        <p className="text-sm text-[var(--muted)]">
          <I18nText
            en="Add a backup login so you never lose access to your wallet and collection."
            th="เพิ่มวิธีเข้าสู่ระบบสำรอง เพื่อไม่ให้เสียสิทธิ์เข้าถึงวอลเล็ตและคอลเลกชัน"
          />
        </p>
      </header>

      {error && (
        <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">{error}</p>
      )}
      {info && (
        <p className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">{info}</p>
      )}

      <section className="glass space-y-3 rounded-3xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">
              <I18nText en="Email anchor" th="อีเมลหลัก" />
            </p>
            <p className="text-xs text-[var(--muted)]">
              {profile.email ?? <I18nText en="Not set" th="ยังไม่ได้ตั้งค่า" />}
            </p>
          </div>
          {emailVerified ? (
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
              <I18nText en="Verified" th="ยืนยันแล้ว" />
            </span>
          ) : (
            <Link href="/complete-profile?next=/account/identities" className="auth-cta-sm">
              <I18nText en="Verify" th="ยืนยัน" />
            </Link>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">
              <I18nText en="Phone anchor" th="เบอร์โทรหลัก" />
            </p>
            <p className="text-xs text-[var(--muted)]">
              {profile.phone ?? <I18nText en="Not set" th="ยังไม่ได้ตั้งค่า" />}
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            {phoneVerified ? (
              <I18nText en="Verified" th="ยืนยันแล้ว" />
            ) : (
              <I18nText en="Coming soon" th="เร็วๆ นี้" />
            )}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
          <I18nText en="Linked logins" th="วิธีเข้าสู่ระบบที่เชื่อมแล้ว" />
        </h2>
        {identities.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            <I18nText en="No linked logins yet." th="ยังไม่มีวิธีเข้าสู่ระบบที่เชื่อมไว้" />
          </p>
        ) : (
          identities.map((identity) => (
            <article
              key={identity.id}
              className="glass flex items-center justify-between rounded-3xl border border-white/10 bg-black/30 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  {providerLabel[language][identity.provider]}
                </p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {identity.email ??
                    identity.displayName ??
                    localized({ en: "Linked account", th: "บัญชีที่เชื่อมแล้ว" }, language)}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  {language === "th" ? "เชื่อมเมื่อ" : "Linked"}{" "}
                  {new Date(identity.linkedAt).toLocaleDateString(language === "th" ? "th-TH" : "en-US")}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === identity.id || identities.length <= 1}
                onClick={() => unlink(identity.id)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white disabled:opacity-40"
                title={
                  identities.length <= 1
                    ? localized({ en: "Add another login first", th: "เพิ่มวิธีเข้าสู่ระบบอื่นก่อน" }, language)
                    : localized({ en: "Remove this login method", th: "ลบวิธีเข้าสู่ระบบนี้" }, language)
                }
              >
                {busy === identity.id ? "…" : <I18nText en="Unlink" th="ยกเลิกเชื่อม" />}
              </button>
            </article>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
          <I18nText en="Add another login" th="เพิ่มวิธีเข้าสู่ระบบ" />
        </h2>
        <form action="/api/auth/google/start" method="get">
          <input type="hidden" name="mode" value="connect" />
          <input type="hidden" name="next" value="/account/identities" />
          <button type="submit" className="auth-social google-button w-full">
            G <I18nText en="Link Google" th="เชื่อม Google" />
          </button>
        </form>
        {!profile.hasLine && process.env.NEXT_PUBLIC_ENABLE_LINE_LOGIN === "true" && (
          <a className="auth-social line-button block w-full" href="/api/line/login/start?mode=connect&next=/account/identities">
            LINE <I18nText en="Link LINE" th="เชื่อม LINE" />
          </a>
        )}
        {!emailVerified && (
          <Link href="/complete-profile?next=/account/identities" className="auth-cta block w-full text-center">
            <I18nText en="Verify email" th="ยืนยันอีเมล" />
          </Link>
        )}
      </section>
    </main>
  );
}
