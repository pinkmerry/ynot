"use client";

import { useEffect, useRef, useState } from "react";
import {
  getSignupPasswordChecks,
  SIGNUP_PASSWORD_ERROR,
  SIGNUP_PASSWORD_MIN_LENGTH,
} from "./password-policy";
import { useStoreLanguage } from "../ynot/StorePreferences";
import { I18nText } from "../ynot/i18n";

function RequirementItem({
  label,
  labelTh,
  met,
  active,
}: {
  label: string;
  labelTh: string;
  met: boolean;
  active: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-bold ${
        met
          ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
          : active
            ? "border-white/15 bg-black/30 text-white"
            : "border-white/10 bg-black/20 text-white/75"
      }`}
    >
      <span><I18nText en={label} th={labelTh} /></span>
      <span
        className={`shrink-0 uppercase tracking-[0.16em] ${
          met ? "text-emerald-100" : "text-[var(--gold)]"
        }`}
      >
        {met ? (
          <I18nText en="Met" th="ครบแล้ว" />
        ) : (
          <I18nText en="Needed" th="ต้องมี" />
        )}
      </span>
    </li>
  );
}

export function SignupPasswordFields() {
  const language = useStoreLanguage();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
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
      hasTypedPassword && !passwordMeetsPolicy
        ? language === "th"
          ? "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร มีตัวเลข และมีอักขระพิเศษ"
          : SIGNUP_PASSWORD_ERROR
        : "",
    );
  }, [hasTypedPassword, language, passwordMeetsPolicy]);

  useEffect(() => {
    const confirmInput = confirmPasswordRef.current;
    if (!confirmInput) return;
    confirmInput.setCustomValidity(
      hasTypedConfirmPassword && password !== confirmPassword
        ? language === "th"
          ? "รหัสผ่านไม่ตรงกัน"
          : "Passwords do not match."
        : "",
    );
  }, [confirmPassword, hasTypedConfirmPassword, language, password]);

  return (
    <>
      <label className="block space-y-1 text-sm font-bold text-white">
        <span><I18nText en="Password" th="รหัสผ่าน" /></span>
        <input
          ref={passwordRef}
          name="password"
          type="password"
          required
          minLength={SIGNUP_PASSWORD_MIN_LENGTH}
          title={
            language === "th"
              ? "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร มีตัวเลข และมีอักขระพิเศษ"
              : SIGNUP_PASSWORD_ERROR
          }
          aria-describedby={showPasswordRequirements ? "signup-password-help" : undefined}
          autoComplete="off"
          data-1p-ignore="true"
          data-bwignore="true"
          data-lpignore="true"
          value={password}
          onBlur={() => setShowPasswordRequirements(false)}
          onChange={(event) => {
            setPassword(event.target.value);
            setShowPasswordRequirements(true);
          }}
          onKeyDown={() => setShowPasswordRequirements(true)}
          onPointerDown={() => setShowPasswordRequirements(true)}
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
          placeholder={
            language === "th"
              ? `อย่างน้อย ${SIGNUP_PASSWORD_MIN_LENGTH} ตัวอักษร`
              : `Minimum ${SIGNUP_PASSWORD_MIN_LENGTH} characters`
          }
        />
      </label>

      {showPasswordRequirements && (
        <div
          id="signup-password-help"
          className="rounded-2xl border border-white/10 bg-black/35 p-3 shadow-[0_18px_36px_rgba(0,0,0,0.24)]"
          aria-live="polite"
        >
          <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-white">
            <I18nText en="Password needs:" th="รหัสผ่านต้องมี:" />
          </p>
          <ul className="grid gap-2">
            <RequirementItem
              label={`At least ${SIGNUP_PASSWORD_MIN_LENGTH} characters`}
              labelTh={`อย่างน้อย ${SIGNUP_PASSWORD_MIN_LENGTH} ตัวอักษร`}
              met={checks.hasMinLength}
              active={hasTypedPassword}
            />
            <RequirementItem
              label="At least one number"
              labelTh="มีตัวเลขอย่างน้อย 1 ตัว"
              met={checks.hasNumber}
              active={hasTypedPassword}
            />
            <RequirementItem
              label="At least one special character"
              labelTh="มีอักขระพิเศษอย่างน้อย 1 ตัว"
              met={checks.hasSpecialCharacter}
              active={hasTypedPassword}
            />
          </ul>
        </div>
      )}

      <label className="block space-y-1 text-sm font-bold text-white">
        <span><I18nText en="Confirm password" th="ยืนยันรหัสผ่าน" /></span>
        <input
          ref={confirmPasswordRef}
          name="confirmPassword"
          type="password"
          required
          minLength={SIGNUP_PASSWORD_MIN_LENGTH}
          autoComplete="off"
          data-1p-ignore="true"
          data-bwignore="true"
          data-lpignore="true"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={hasTypedConfirmPassword && !passwordsMatch}
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none ring-[var(--gold)]/0 focus:ring-2"
          placeholder={language === "th" ? "กรอกรหัสผ่านอีกครั้ง" : "Repeat password"}
        />
        <p
          className={`text-xs font-semibold leading-relaxed ${
            passwordsMatch ? "text-emerald-100" : "text-[var(--muted)]"
          }`}
        >
          {passwordsMatch ? (
            <I18nText en="Passwords match." th="รหัสผ่านตรงกัน" />
          ) : (
            <I18nText
              en="Must match the password above."
              th="ต้องตรงกับรหัสผ่านด้านบน"
            />
          )}
        </p>
      </label>
    </>
  );
}
