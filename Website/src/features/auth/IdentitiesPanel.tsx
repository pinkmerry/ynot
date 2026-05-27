"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type IdentityRow = {
  id: string;
  provider: "email" | "google" | "line";
  providerSubject: string;
  email: string | null;
  displayName: string | null;
  linkedAt: string;
  lastSeenAt: string | null;
};

type Profile = {
  id: string;
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

const PROVIDER_LABEL: Record<IdentityRow["provider"], string> = {
  email: "Email & password",
  google: "Google",
  line: "LINE",
};

export function IdentitiesPanel({ profile, identities }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const emailVerified = Boolean(profile.emailVerifiedAt);
  const phoneVerified = Boolean(profile.phoneVerifiedAt);

  async function unlink(identityId: string) {
    if (identities.length <= 1) {
      setError("You can't remove your last login method.");
      return;
    }
    if (!confirm("Remove this login method from your account?")) return;
    setBusy(identityId);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/identities/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not unlink.");
        return;
      }
      setInfo("Login method removed.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mobile-safe space-y-4 px-4 py-6">
      <header className="space-y-1">
        <p className="sequence-label">{`// ${profile.displayName.toUpperCase()}`}</p>
        <h1 className="text-2xl font-black text-white">Login methods</h1>
        <p className="text-sm text-[var(--muted)]">
          Add a backup login so you never lose access to your wallet and collection.
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
            <p className="text-sm font-bold text-white">Email anchor</p>
            <p className="text-xs text-[var(--muted)]">{profile.email ?? "Not set"}</p>
          </div>
          {emailVerified ? (
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">Verified</span>
          ) : (
            <Link href="/complete-profile?next=/account/identities" className="auth-cta-sm">
              Verify
            </Link>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Phone anchor</p>
            <p className="text-xs text-[var(--muted)]">{profile.phone ?? "Not set"}</p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            {phoneVerified ? "Verified" : "Coming soon"}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">Linked logins</h2>
        {identities.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No linked logins yet.</p>
        ) : (
          identities.map((identity) => (
            <article
              key={identity.id}
              className="glass flex items-center justify-between rounded-3xl border border-white/10 bg-black/30 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{PROVIDER_LABEL[identity.provider]}</p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {identity.email ?? identity.providerSubject}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  Linked {new Date(identity.linkedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === identity.id || identities.length <= 1}
                onClick={() => unlink(identity.id)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white disabled:opacity-40"
                title={identities.length <= 1 ? "Add another login first" : "Remove this login method"}
              >
                {busy === identity.id ? "…" : "Unlink"}
              </button>
            </article>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">Add another login</h2>
        <form action="/api/auth/google/start" method="get">
          <input type="hidden" name="next" value="/account/identities" />
          <button type="submit" className="auth-social google-button w-full">
            G Link Google
          </button>
        </form>
        {!profile.hasLine && process.env.NEXT_PUBLIC_ENABLE_LINE_LOGIN === "true" && (
          <a className="auth-social line-button block w-full" href="/api/line/login/start?mode=connect&next=/account/identities">
            LINE Link LINE
          </a>
        )}
        {!emailVerified && (
          <Link href="/complete-profile?next=/account/identities" className="auth-cta block w-full text-center">
            Verify email
          </Link>
        )}
      </section>
    </main>
  );
}
