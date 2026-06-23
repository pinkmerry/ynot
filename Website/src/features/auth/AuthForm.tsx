import Link from "next/link";
import {
  completeSignUpWithPasswordAction,
  requestPendingSignUpCodeAction,
  resendSignUpEmailCodeAction,
  signInWithPasswordAction,
  verifySignUpEmailCodeAction,
} from "./actions";
import { SignupPasswordFields } from "./SignupPasswordFields";
import { I18nText } from "../ynot/i18n";

type AuthFormProps = {
  mode: "login" | "signup";
  error?: string;
  message?: string;
  next?: string;
  verifyEmail?: string;
  setupEmail?: string;
  setupToken?: string;
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

export function AuthForm({
  mode,
  error,
  message,
  next,
  verifyEmail,
  setupEmail,
  setupToken,
}: AuthFormProps) {
  const isSignup = mode === "signup";
  const nextPath = safeNextPath(next);
  const alternateHref = withNext(isSignup ? "/login" : "/signup", nextPath);
  const normalizedVerifyEmail =
    isSignup && verifyEmail ? verifyEmail.trim().toLowerCase() : "";
  const normalizedSetupEmail =
    isSignup && setupEmail ? setupEmail.trim().toLowerCase() : "";
  const isSignupVerification = Boolean(normalizedVerifyEmail);
  const isSignupPasswordSetup = Boolean(normalizedSetupEmail && setupToken);
  const title = isSignupVerification
    ? <I18nText en="Verify Email" th="ยืนยันอีเมล" />
    : isSignupPasswordSetup
      ? <I18nText en="Create Password" th="สร้างรหัสผ่าน" />
      : isSignup
        ? <I18nText en="Sign Up" th="สมัครสมาชิก" />
        : <I18nText en="Log In" th="เข้าสู่ระบบ" />;

  return (
    <main className="auth-template-shell mobile-safe">
      <section className="glass auth-phone phone-surface">
        <div className="auth-top-bar">
          <h1>{title}</h1>
          <Link href={alternateHref}>
            {isSignup ? (
              <I18nText en="LOG IN" th="เข้าสู่ระบบ" />
            ) : (
              <I18nText en="SIGN UP" th="สมัครสมาชิก" />
            )}
          </Link>
        </div>

        <div className="auth-hero-mark" aria-hidden>🎴</div>
        <p className="sequence-label text-center">
          <I18nText
            en="// INITIATE · COLLECTION SEQUENCE"
            th="// เริ่มต้น · เส้นทางนักสะสม"
          />
        </p>

        {error && <p className="rounded-2xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">{error}</p>}
        {message && <p className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-100">{message}</p>}

        {isSignupVerification ? (
          <>
            <p className="text-center text-sm font-semibold leading-relaxed text-[var(--muted)]">
              <I18nText en="Enter the 6-digit code sent to" th="กรอกรหัส 6 หลักที่ส่งไปยัง" />{" "}
              {normalizedVerifyEmail}.{" "}
              <I18nText
                en="You will create your password after verification."
                th="หลังยืนยันแล้วคุณจะสร้างรหัสผ่านได้"
              />
            </p>

            <form action={verifySignUpEmailCodeAction} className="space-y-3">
              <input type="hidden" name="email" value={normalizedVerifyEmail} />
              <input type="hidden" name="next" value={nextPath} />
              <label className="block space-y-1 text-sm font-bold text-white">
                <span><I18nText en="6-digit code" th="รหัส 6 หลัก" /></span>
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center text-2xl text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
                  placeholder="000000"
                />
              </label>
              <button type="submit" className="primary-action auth-submit">
                <I18nText en="Verify and continue" th="ยืนยันและไปต่อ" />
              </button>
            </form>

            <form action={resendSignUpEmailCodeAction} className="space-y-2 text-center">
              <input type="hidden" name="email" value={normalizedVerifyEmail} />
              <input type="hidden" name="next" value={nextPath} />
              <button
                type="submit"
                className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)] underline underline-offset-4"
              >
                <I18nText en="Send a new code" th="ส่งรหัสใหม่" />
              </button>
            </form>

            <p className="text-center text-sm text-[var(--muted)]">
              <I18nText en="Used the wrong email?" th="ใช้อีเมลผิด?" />{" "}
              <Link href={withNext("/signup", nextPath)} className="font-black text-[var(--gold)] underline-offset-4 hover:underline">
                <I18nText en="Start again" th="เริ่มใหม่" />
              </Link>
            </p>
          </>
        ) : isSignupPasswordSetup ? (
          <>
            <p className="text-center text-sm font-semibold leading-relaxed text-[var(--muted)]">
              <I18nText en="Email verified for" th="ยืนยันอีเมลแล้วสำหรับ" />{" "}
              {normalizedSetupEmail}.{" "}
              <I18nText
                en="Create a password to finish your account."
                th="สร้างรหัสผ่านเพื่อสมัครสมาชิกให้เสร็จ"
              />
            </p>

            <form action={completeSignUpWithPasswordAction} className="space-y-3">
              <input type="hidden" name="email" value={normalizedSetupEmail} />
              <input type="hidden" name="setupToken" value={setupToken} />
              <input type="hidden" name="next" value={nextPath} />
              <SignupPasswordFields />
              <button type="submit" className="primary-action auth-submit">
                <I18nText en="Create account" th="สร้างบัญชี" />
              </button>
            </form>

            <p className="text-center text-sm text-[var(--muted)]">
              <I18nText en="Need a new code?" th="ต้องการรหัสใหม่?" />{" "}
              <Link href={withNext("/signup", nextPath)} className="font-black text-[var(--gold)] underline-offset-4 hover:underline">
                <I18nText en="Start again" th="เริ่มใหม่" />
              </Link>
            </p>
          </>
        ) : (
          <>
            <a
              className="auth-social google-button"
              href={`/api/auth/google/start?next=${encodeURIComponent(nextPath)}`}
            >
              G{" "}
              {isSignup ? (
                <I18nText en="Sign up with Google" th="สมัครด้วย Google" />
              ) : (
                <I18nText en="Continue with Google" th="เข้าสู่ระบบด้วย Google" />
              )}
            </a>

            {process.env.NEXT_PUBLIC_ENABLE_LINE_LOGIN === "true" && (
              <a
                className="auth-social line-button"
                href={`/api/line/login/start?mode=login&next=${encodeURIComponent(nextPath)}`}
              >
                LINE{" "}
                {isSignup ? (
                  <I18nText en="Sign up with LINE" th="สมัครด้วย LINE" />
                ) : (
                  <I18nText en="Continue with LINE" th="เข้าสู่ระบบด้วย LINE" />
                )}
              </a>
            )}

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              <span className="h-px bg-white/10" />
              <I18nText en="OR" th="หรือ" />
              <span className="h-px bg-white/10" />
            </div>

            {isSignup && (
              <p className="text-center text-sm font-semibold leading-relaxed text-[var(--muted)]">
                <I18nText
                  en="Enter your email first. We will send a 6-digit code, then you can create your password."
                  th="กรอกอีเมลก่อน เราจะส่งรหัส 6 หลัก จากนั้นคุณจะสร้างรหัสผ่านได้"
                />
              </p>
            )}

            <form action={isSignup ? requestPendingSignUpCodeAction : signInWithPasswordAction} className="space-y-3">
              <input type="hidden" name="next" value={nextPath} />
              <label className="block space-y-1 text-sm font-bold text-white">
                <span><I18nText en="Email" th="อีเมล" /></span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
                  placeholder="you@example.com"
                />
              </label>
              {!isSignup && (
                <label className="block space-y-1 text-sm font-bold text-white">
                  <span><I18nText en="Password" th="รหัสผ่าน" /></span>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="current-password"
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
                    placeholder="••••••••"
                  />
                </label>
              )}
              <button type="submit" className="primary-action auth-submit">
                {isSignup ? (
                  <I18nText en="Send code" th="ส่งรหัส" />
                ) : (
                  <I18nText en="Log in" th="เข้าสู่ระบบ" />
                )}
              </button>
            </form>

            <p className="text-center text-sm text-[var(--muted)]">
              {isSignup ? (
                <I18nText en="Already have an account?" th="มีบัญชีอยู่แล้ว?" />
              ) : (
                <I18nText en="New customer?" th="ลูกค้าใหม่?" />
              )}{" "}
              <Link href={alternateHref} className="font-black text-[var(--gold)] underline-offset-4 hover:underline">
                {isSignup ? (
                  <I18nText en="Log in" th="เข้าสู่ระบบ" />
                ) : (
                  <I18nText en="Create account" th="สร้างบัญชี" />
                )}
              </Link>
            </p>

            <p className="auth-note">
              <I18nText
                en="One account can connect email, Google, and LINE. Admin and payment features stay server-managed."
                th="หนึ่งบัญชีสามารถเชื่อมอีเมล, Google และ LINE ได้ ระบบแอดมินและการชำระเงินยังจัดการบนเซิร์ฟเวอร์"
              />
            </p>
          </>
        )}
      </section>
    </main>
  );
}
