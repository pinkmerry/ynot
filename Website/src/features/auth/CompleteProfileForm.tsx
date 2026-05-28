"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  profileId: string;
  defaultEmail: string;
  displayName: string;
  nextPath: string;
};

type Step = "enter-email" | "enter-code";

export function CompleteProfileForm({ defaultEmail, displayName, nextPath }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("enter-email");
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // When the server reports an identity review request, we stop auto-
  // redirecting and let the user read the banner. The "Continue" button then
  // does the redirect on click.
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/email-otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, purpose: "verify_email" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not send code.");
        return;
      }
      setStep("enter-code");
      setInfo(`We sent a 6-digit code to ${email}.`);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/email-otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        identityReviewRequired?: boolean;
        identityReviewMessage?: string | null;
      };
      if (!res.ok) {
        setError(body.error ?? "That code didn't work.");
        return;
      }
      if (body.identityReviewRequired) {
        // Hold the banner and wait for the user to click Continue. Without
        // this, the router.replace below would unmount the form before the
        // message renders.
        setReviewMessage(
          body.identityReviewMessage
            ?? "This email already belongs to another profile. An admin review was created to link only your login identity.",
        );
        return;
      }
      router.replace(nextPath || "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-template-shell mobile-safe">
      <section className="glass auth-phone phone-surface">
        <div className="auth-top-bar">
          <h1>Verify Email</h1>
        </div>
        <div className="auth-hero-mark" aria-hidden>📧</div>
        <p className="sequence-label text-center">{`// HELLO · ${displayName.toUpperCase()}`}</p>
        <p className="text-center text-sm text-[var(--muted)]">
          Verifying your email lets you log in from anywhere and keeps your wallet safe.
        </p>

        {error && (
          <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">{error}</p>
        )}
        {info && (
          <p className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">{info}</p>
        )}
        {reviewMessage && (
          <div className="space-y-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-3 py-3 text-sm font-semibold text-amber-100">
            <p>{reviewMessage}</p>
            <button
              type="button"
              className="auth-cta"
              onClick={() => {
                router.replace(nextPath || "/");
                router.refresh();
              }}
            >
              Continue
            </button>
          </div>
        )}

        {step === "enter-email" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
          >
            <label className="block space-y-1 text-sm font-bold text-white">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
                placeholder="you@example.com"
              />
            </label>
            <button type="submit" disabled={busy} className="auth-cta">
              {busy ? "Sending…" : "Send 6-digit code"}
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode();
            }}
          >
            <label className="block space-y-1 text-sm font-bold text-white">
              <span>6-digit code</span>
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center text-2xl tracking-[0.5em] text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
                placeholder="000000"
              />
            </label>
            <button type="submit" disabled={busy || code.length !== 6} className="auth-cta">
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
            <button
              type="button"
              className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)] underline"
              onClick={() => {
                setStep("enter-email");
                setCode("");
                setError(null);
                setInfo(null);
              }}
            >
              Change email
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
