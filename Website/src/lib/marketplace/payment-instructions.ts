import "server-only";

import type { MarketplacePaymentInstructions } from "./types";
import { MarketplaceServiceError } from "./supabase-adapter";
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

export function assertMarketplacePaymentReceiverConfigured() {
  const instructions = getMarketplacePaymentInstructions();
  if (!instructions.receiverConfigured) {
    throw new MarketplaceServiceError(
      "marketplace_payment_receiver_unconfigured",
      "Checkout is temporarily unavailable because the payment receiver is not configured.",
      503,
    );
  }
  return instructions;
}
