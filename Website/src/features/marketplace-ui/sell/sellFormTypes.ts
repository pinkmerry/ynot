/**
 * Shared types between SellForm.tsx and its split-out panel components
 * (SellIdentityPanel, SellSummaryRail). Framework-free — no client directive,
 * no imports — so any of those files can depend on it without pulling in
 * React or Next.
 */

export interface SellCatalogOptions {
  categoryOptions: readonly { value: string; label: string }[];
  conditionOptions: readonly { value: string; label: string }[];
  gradingServiceOptions: readonly { value: string; label: string }[];
  gradeOptions: readonly string[];
  languageOptions: readonly { value: string; label: string }[];
  releaseYearOptions: readonly number[];
}

export type SellFieldValues = {
  name: string;
  series: string;
  category: string;
  set: string;
  code: string;
  variant: string;
  print: string;
  language: string;
  year: string;
  condition: "sealed" | "raw" | "graded";
  grader: string;
  grade: string;
  cert: string;
  priceThb: string;
};

export type SellPayoutPreview = {
  priceSatang: number;
  feeSatang: number;
  feeLabel: string;
  payoutSatang: number;
} | null;
