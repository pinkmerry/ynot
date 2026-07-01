import "server-only";

export type MarketplacePaymentInstructions = {
  method: "bank_transfer";
  currency: "THB";
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  promptPayId: string | null;
  paymentWindowMinutes: number;
  receiverConfigured: boolean;
  acceptedImageTypes: readonly string[];
};

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
