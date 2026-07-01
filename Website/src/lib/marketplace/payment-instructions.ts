import "server-only";

import type { MarketplacePaymentInstructions } from "./types";
export type { MarketplacePaymentInstructions } from "./types";

function envText(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getMarketplacePaymentInstructions(): MarketplacePaymentInstructions {
  const bankName = envText("SLIP2GO_BANK_NAME");
  const accountName = envText("SLIP2GO_BANK_ACCOUNT_NAME");
  const accountNumber = envText("SLIP2GO_BANK_ACCOUNT_NUMBER");
  const promptPayId = envText("SLIP2GO_PROMPTPAY_ID");

  return {
    method: "bank_transfer",
    currency: "THB",
    bankName,
    accountName,
    accountNumber,
    promptPayId,
    paymentWindowMinutes: 30,
    receiverConfigured: Boolean(accountName && (accountNumber || promptPayId)),
    acceptedImageTypes: ["JPG", "PNG", "WEBP"],
  };
}
