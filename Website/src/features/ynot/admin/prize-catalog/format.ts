export function languageLabel(language: string): string {
  switch (language.toLowerCase()) {
    case "english": return "EN";
    case "japanese": return "JP";
    case "korean": return "KR";
    case "chinese": return "CN";
    default: return language.toUpperCase();
  }
}
