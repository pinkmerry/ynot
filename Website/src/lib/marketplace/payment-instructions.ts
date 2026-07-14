import "server-only";

import {
  isMarketplaceWorkerRuntime,
  marketplacePaymentReceiverBridgeConfig,
} from "@/lib/auth/marketplace-auth-bridge";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { hasSlip2GoReceiverCheck } from "@/lib/slip2go/client";
import type { MarketplacePaymentInstructions } from "./types";
import {
  checkoutSnapshotContainsPaymentReceiver,
  marketplaceReceiverFromCheckoutSnapshot,
  selectMarketplaceReceiverRow,
  type MarketplaceReceiver,
} from "./payment-receiver";
import { MarketplaceServiceError } from "./supabase-adapter";
import {
  fetchMarketplaceReceiverViaBridge,
  resolveMarketplaceReceiverForRuntime,
} from "./payment-receiver-bridge";
export type { MarketplacePaymentInstructions } from "./types";

function envText(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function paymentInstructions(
  receiver: MarketplaceReceiver,
): MarketplacePaymentInstructions {
  const normalizedReceiver = {
    bankName: receiver.bankName?.trim() || null,
    accountName: receiver.accountName?.trim() || null,
    accountNumber: receiver.accountNumber?.trim() || null,
    promptPayId: receiver.promptPayId?.trim() || null,
  };
  return {
    method: "bank_transfer",
    currency: "THB",
    ...normalizedReceiver,
    paymentWindowMinutes: 30,
    receiverConfigured: Boolean(
      normalizedReceiver.accountName &&
        hasSlip2GoReceiverCheck({
          promptPayId: normalizedReceiver.promptPayId,
          bankName: normalizedReceiver.bankName,
          bankAccountNumber: normalizedReceiver.accountNumber,
          bankAccountName: normalizedReceiver.accountName,
        }),
    ),
    acceptedImageTypes: ["JPG", "PNG", "WEBP"],
  };
}

function envReceiver(): MarketplaceReceiver {
  return {
    bankName: envText("SLIP2GO_BANK_NAME"),
    accountName: envText("SLIP2GO_BANK_ACCOUNT_NAME"),
    accountNumber: envText("SLIP2GO_BANK_ACCOUNT_NUMBER"),
    promptPayId: envText("SLIP2GO_PROMPTPAY_ID"),
  };
}

export async function getCoreMarketplaceReceiver(): Promise<MarketplaceReceiver | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from("payment_methods")
    .select(
      "code,bank_name,account_name,account_number,promptpay_id,sort_order",
    )
    .eq("is_active", true)
    .eq("type", "bank_transfer")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const receiver = selectMarketplaceReceiverRow(data ?? []);
  if (!receiver) return null;

  return {
    bankName: receiver.bank_name,
    accountName: receiver.account_name,
    accountNumber: receiver.account_number,
    promptPayId: receiver.promptpay_id,
  };
}

async function getMarketplaceReceiverViaBridge(): Promise<MarketplaceReceiver | null> {
  const config = marketplacePaymentReceiverBridgeConfig();
  if (!config) {
    console.warn("marketplace_payment_receiver_bridge_not_configured");
    return null;
  }

  return fetchMarketplaceReceiverViaBridge(config, fetch, (status) => {
    console.warn("marketplace_payment_receiver_bridge_failed", status);
  });
}

export async function getMarketplacePaymentInstructions(): Promise<MarketplacePaymentInstructions> {
  const receiver = await resolveMarketplaceReceiverForRuntime({
    marketplaceRuntime: isMarketplaceWorkerRuntime(),
    loadBridgeReceiver: getMarketplaceReceiverViaBridge,
    loadCoreReceiver: getCoreMarketplaceReceiver,
    fallbackReceiver: envReceiver,
    onLookupError: (error) => {
      console.warn("marketplace_payment_receiver_lookup_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return paymentInstructions(receiver);
}

export function getMarketplacePaymentInstructionsFromSnapshot(
  snapshot: unknown,
) {
  const receiver = marketplaceReceiverFromCheckoutSnapshot(snapshot);
  if (receiver) return paymentInstructions(receiver);
  if (!checkoutSnapshotContainsPaymentReceiver(snapshot)) return null;

  return paymentInstructions({
    bankName: null,
    accountName: null,
    accountNumber: null,
    promptPayId: null,
  });
}

export function assertMarketplacePaymentInstructionsConfigured(
  instructions: MarketplacePaymentInstructions,
) {
  if (!instructions.receiverConfigured) {
    throw new MarketplaceServiceError(
      "marketplace_payment_receiver_unconfigured",
      "Checkout is temporarily unavailable because the payment receiver is not configured.",
      503,
    );
  }
  return instructions;
}

export async function assertMarketplacePaymentReceiverConfigured() {
  return assertMarketplacePaymentInstructionsConfigured(
    await getMarketplacePaymentInstructions(),
  );
}
