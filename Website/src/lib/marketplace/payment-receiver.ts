import type { MarketplacePaymentInstructions } from "./types";

export type MarketplaceReceiver = Pick<
  MarketplacePaymentInstructions,
  "bankName" | "accountName" | "accountNumber" | "promptPayId"
>;

export type MarketplaceReceiverRow = {
  code: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  promptpay_id: string | null;
};

export type MarketplacePaymentReceiverSnapshot = MarketplaceReceiver & {
  version: 1;
};

type CheckoutSnapshot = {
  paymentReceiver?: MarketplacePaymentReceiverSnapshot;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableText(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function selectMarketplaceReceiverRow<
  Row extends MarketplaceReceiverRow,
>(rows: readonly Row[]): Row | null {
  return (
    rows.find((row) => row.code === "bank-transfer") ??
    rows.find((row) => row.code !== "main-transfer") ??
    rows[0] ??
    null
  );
}

export function marketplaceReceiverFromBridgePayload(
  payload: unknown,
): MarketplaceReceiver | null {
  const root = recordValue(payload);
  if (root?.ok !== true) return null;

  const receiver = recordValue(root.receiver);
  if (!receiver) return null;

  return {
    bankName: nullableText(receiver.bankName),
    accountName: nullableText(receiver.accountName),
    accountNumber: nullableText(receiver.accountNumber),
    promptPayId: nullableText(receiver.promptPayId),
  };
}

export function marketplacePaymentReceiverSnapshot(
  instructions: MarketplacePaymentInstructions,
): MarketplacePaymentReceiverSnapshot {
  return {
    version: 1,
    bankName: instructions.bankName,
    accountName: instructions.accountName,
    accountNumber: instructions.accountNumber,
    promptPayId: instructions.promptPayId,
  };
}

export function withMarketplacePaymentReceiverSnapshot<
  Snapshot extends object,
>(
  snapshot: Snapshot,
  instructions: MarketplacePaymentInstructions,
): Snapshot & CheckoutSnapshot {
  return {
    ...snapshot,
    paymentReceiver: marketplacePaymentReceiverSnapshot(instructions),
  };
}

export function marketplaceReceiverFromCheckoutSnapshot(
  snapshot: unknown,
): MarketplacePaymentReceiverSnapshot | null {
  const root = recordValue(snapshot);
  const receiver = recordValue(root?.paymentReceiver);
  if (receiver?.version !== 1) return null;

  const accountName = nullableText(receiver.accountName);
  const accountNumber = nullableText(receiver.accountNumber);
  const promptPayId = nullableText(receiver.promptPayId);

  return {
    version: 1,
    bankName: nullableText(receiver.bankName),
    accountName,
    accountNumber,
    promptPayId,
  };
}

export function checkoutSnapshotContainsPaymentReceiver(snapshot: unknown) {
  const root = recordValue(snapshot);
  return Boolean(
    root && Object.prototype.hasOwnProperty.call(root, "paymentReceiver"),
  );
}
