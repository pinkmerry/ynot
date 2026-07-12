/**
 * Shared types between StockModal.tsx and its split-out fields component
 * (StockModalFields.tsx). Framework-free -- no client directive, no React
 * import, and (unlike sell/sellFormTypes.ts, which has nothing server-side
 * to avoid) no import from official-shop.ts either: that lib file starts
 * with `import "server-only"`, so every client-side stock file re-declares
 * OfficialItemType locally instead of importing it -- same reason
 * PayoutActionRow/OrderActionsOrder/DisputeActionRefund/
 * ModerationActionReport are all narrow LOCAL row types in their own
 * Actions files rather than importing the wider lib row type.
 */

export type OfficialItemType = "card" | "sealed_box" | "sealed_pack";

export type StockConditionCode = "sealed" | "raw" | "graded";

export interface StockFormState {
  itemType: OfficialItemType;
  title: string;
  conditionCode: StockConditionCode;
  setLabel: string;
  language: string;
  gradeService: string;
  gradeValue: string;
  certNumber: string;
  priceThb: string;
  quantityTotal: string;
  publicDescription: string;
  photoUrls: string[];
  sourceReferenceId: string;
  procurementNote: string;
  adminNote: string;
}

export const BLANK_STOCK_FORM: StockFormState = {
  itemType: "card",
  title: "",
  conditionCode: "raw",
  setLabel: "",
  language: "english",
  gradeService: "psa",
  gradeValue: "",
  certNumber: "",
  priceThb: "",
  quantityTotal: "1",
  publicDescription: "",
  photoUrls: [],
  sourceReferenceId: "",
  procurementNote: "",
  adminNote: "",
};
