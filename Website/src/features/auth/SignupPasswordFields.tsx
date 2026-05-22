"use client";

import { useEffect, useRef, useState } from "react";
import {
  getSignupPasswordChecks,
  SIGNUP_PASSWORD_ERROR,
  SIGNUP_PASSWORD_MIN_LENGTH,
} from "./password-policy";

function RequirementItem({
  label,
  met,
  active,
}: {
  label: string;
  met: boolean;
  active: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-bold ${
        met
          ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
          : active
            ? "border-yellow-200/35 bg-yellow-200/10 text-yellow-50"
            : "border-white/10 bg-white/[0.03] text-[var(--muted)]"
      }`}
    >
      <span>{label}</span>
      <span className="shrink-0 uppercase tracking-[0.16em]">
        {met ? "Met" : "Needed"}
      </span>
    </li>
  );
}

export function SignupPasswordFields() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const checks = getSignupPasswordChecks(password);
  const hasTypedPassword = password.length > 0;
  const hasTypedConfirmPassword = confirmPassword.length > 0;
  const passwordMeetsPolicy =
    checks.hasMinLength && checks.hasNumber && checks.hasSpecialCharacter;
  const passwordsMatch =
    hasTypedPassword && hasTypedConfirmPassword && password === confirmPassword;

  useEffect(() => {
    const passwordInput = passwordRef.current;
    if (!passwordInput) return;
    passwordInput.setCustomValidity(
      hasTypedPassword && !passwordMeetsPolicy ? SIGNUP_PASSWORD_ERROR : "",
    );
  }, [hasTypedPassword, passwordMeetsPolicy]);

  useEffect(() => {
    const confirmInput = confirmPasswordRef.current;
    if (!confirmInput) return;
    confirmInput.setCustomValidity(
      hasTypedConfirmPassword && password !== confirmPassword
        ? "Passwords do not match."
        : "",
    );
  }, [confirmPassword, hasTypedConfirmPassword, password]);

  return (
    <>
      <label className="block space-y-1 text-sm font-bold text-white">
        <span>Password</span>
        <input
          ref={passwordRef}
          name="password"
          type="password"
          required
          minLength={SIGNUP_PASSWORD_MIN_LENGTH}
          title={SIGNUP_PASSWORD_ERROR}
          aria-describedby="signup-password-help"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
          placeholder={`Minimum ${SIGNUP_PASSWORD_MIN_LENGTH} characters`}
        />
      </label>

      <div id="signup-password-help" className="space-y-2" aria-live="polite">
        <p className="text-xs font-semibold leading-relaxed text-[var(--muted)]">
          Password needs:
        </p>
        <ul className="grid gap-2">
          <RequirementItem
            label={`At least ${SIGNUP_PASSWORD_MIN_LENGTH} characters`}
            met={checks.hasMinLength}
            active={hasTypedPassword}
          />
          <RequirementItem
            label="At least one number"
            met={checks.hasNumber}
            active={hasTypedPassword}
          />
          <RequirementItem
            label="At least one special character"
            met={checks.hasSpecialCharacter}
            active={hasTypedPassword}
          />
        </ul>
      </div>

      <label className="block space-y-1 text-sm font-bold text-white">
        <span>Confirm password</span>
        <input
          ref={confirmPasswordRef}
          name="confirmPassword"
          type="password"
          required
          minLength={SIGNUP_PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={hasTypedConfirmPassword && !passwordsMatch}
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
          placeholder="Repeat password"
        />
        <p
          className={`text-xs font-semibold leading-relaxed ${
            passwordsMatch ? "text-emerald-100" : "text-[var(--muted)]"
          }`}
        >
          {passwordsMatch ? "Passwords match." : "Must match the password above."}
        </p>
      </label>
    </>
  );
}
