import type { ReactNode } from "react";

export type Language = "en" | "th";

export type LocalizedCopy<T> = Record<Language, T>;

export function I18nText({
  en,
  th,
}: {
  en: ReactNode;
  th: ReactNode;
}) {
  return (
    <>
      <span className="i18n-en">{en}</span>
      <span className="i18n-th">{th}</span>
    </>
  );
}

export function i18n(en: ReactNode, th: ReactNode) {
  return <I18nText en={en} th={th} />;
}

export function localized<T>(copy: LocalizedCopy<T>, language: Language): T {
  return copy[language] ?? copy.en;
}
