import Link from "next/link";
import { signInWithPasswordAction, signUpWithPasswordAction } from "./actions";

type AuthFormProps = {
  mode: "login" | "signup";
  error?: string;
  message?: string;
  next?: string;
};

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const base = new URL("https://ynot.local");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function withNext(path: string, nextPath: string) {
  if (nextPath === "/") return path;
  const params = new URLSearchParams({ next: nextPath });
  return `${path}?${params.toString()}`;
}

export function AuthForm({ mode, error, message, next }: AuthFormProps) {
  const isSignup = mode === "signup";
  const nextPath = safeNextPath(next);
  const alternateHref = withNext(isSignup ? "/login" : "/signup", nextPath);

  return (
    <main className="auth-template-shell mobile-safe">
      <section className="glass auth-phone phone-surface">
        <div className="auth-top-bar">
          <h1>{isSignup ? "Sign Up" : "Log In"}</h1>
          <Link href={alternateHref}>{isSignup ? "LOG IN" : "SIGN UP"}</Link>
        </div>

        <div className="auth-hero-mark" aria-hidden>🎴</div>
        <p className="sequence-label text-center">{"// INITIATE · COLLECTION SEQUENCE"}</p>

        {error && <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">{error}</p>}
        {message && <p className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">{message}</p>}

        <a
          className="auth-social google-button"
          href={`/api/auth/google/start?next=${encodeURIComponent(nextPath)}`}
        >
          G {isSignup ? "Sign up" : "Continue"} with Google
        </a>

        {process.env.NEXT_PUBLIC_ENABLE_LINE_LOGIN === "true" && (
          <a
            className="auth-social line-button"
            href={`/api/line/login/start?mode=login&next=${encodeURIComponent(nextPath)}`}
          >
            LINE {isSignup ? "Sign up" : "Continue"} with LINE
          </a>
        )}

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
          <span className="h-px bg-white/10" />
          OR
          <span className="h-px bg-white/10" />
        </div>

        <form action={isSignup ? signUpWithPasswordAction : signInWithPasswordAction} className="space-y-3">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block space-y-1 text-sm font-bold text-white">
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
              placeholder="you@example.com"
            />
          </label>
          <label className="block space-y-1 text-sm font-bold text-white">
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
              placeholder="Minimum 8 characters"
            />
          </label>
          {isSignup && (
            <label className="block space-y-1 text-sm font-bold text-white">
              <span>Confirm password</span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
                placeholder="Repeat password"
              />
            </label>
          )}
          <button type="submit" className="primary-action auth-submit">
            {isSignup ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--muted)]">
          {isSignup ? "Already have an account?" : "New customer?"} {" "}
          <Link href={alternateHref} className="font-black text-[var(--gold)] underline-offset-4 hover:underline">
            {isSignup ? "Log in" : "Create account"}
          </Link>
        </p>

        <p className="auth-note">
          One account can connect email, Google, and LINE. Admin and payment features stay server-managed.
        </p>
      </section>
    </main>
  );
}
