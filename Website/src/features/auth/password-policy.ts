export const SIGNUP_PASSWORD_MIN_LENGTH = 8;

export const SIGNUP_PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_-+={}[];:'\"\\|,.<>/?`~";

const SIGNUP_PASSWORD_NUMBER_RE = /\d/;
const SIGNUP_PASSWORD_SPECIAL_RE = /[!@#$%^&*()_\-+={}\[\];:'"\\|,.<>/?`~]/;

export const SIGNUP_PASSWORD_ERROR =
  "Password must be at least 8 characters and include at least one number and one special character.";

export function getSignupPasswordChecks(password: string) {
  return {
    hasMinLength: password.length >= SIGNUP_PASSWORD_MIN_LENGTH,
    hasNumber: SIGNUP_PASSWORD_NUMBER_RE.test(password),
    hasSpecialCharacter: SIGNUP_PASSWORD_SPECIAL_RE.test(password),
  };
}

export function isValidSignupPassword(password: string) {
  const checks = getSignupPasswordChecks(password);
  return checks.hasMinLength && checks.hasNumber && checks.hasSpecialCharacter;
}
