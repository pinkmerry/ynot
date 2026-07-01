import "server-only";

import type { ResolvedAdminSession } from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "./config";
import {
  getActiveMarketplaceMoneyPolicy,
  marketplaceMoneyPolicy,
} from "./money";
import { mockMarketplaceOrders } from "./mock-data";
import { listOfficialOrderDashboard } from "./official-shop";
import {
  listMarketplaceQueueSummary,
  listMarketplaceReconciliationItems,
} from "./ops-hardening";
import { listSellerPayoutQueue } from "./payouts";
import { listAdminSellerSubmissionQueue } from "./seller-consignment";

const emptyOfficialOrderDashboard = {
  orders: [],
  summary: {
    paidRevenueSatang: 0,
    paidOrderCount: 0,
    paymentReviewCount: 0,
    fulfilmentOpenCount: 0,
    refundReviewCount: 0,
  },
};

const emptyQueueSummary = {
  paymentReviewCount: 0,
  refundOpenCount: 0,
  reconciliationOpenCount: 0,
  payoutBlockedCount: 0,
  providerEventOpenCount: 0,
};

function mockOfficialOrderDashboard() {
  const orders = mockMarketplaceOrders.filter(
    (order) => order.listing_source === "official_shop",
  );
  const summary = orders.reduce(
    (acc, order) => {
      if (order.payment_state === "paid" || order.payment_state === "valid") {
        acc.paidRevenueSatang += Number(order.buyer_total_satang ?? 0);
        acc.paidOrderCount += 1;
      }
      if (order.payment_state === "payment_submitted") {
        acc.paymentReviewCount += 1;
      }
      if (
        ["paid", "valid"].includes(order.payment_state) &&
        order.fulfilment_state !== "completed"
      ) {
        acc.fulfilmentOpenCount += 1;
      }
      if (order.refund_state === "requested") {
        acc.refundReviewCount += 1;
      }
      return acc;
    },
    {
      paidRevenueSatang: 0,
      paidOrderCount: 0,
      paymentReviewCount: 0,
      fulfilmentOpenCount: 0,
      refundReviewCount: 0,
    },
  );

  return { orders, summary };
}

function mockSellerPayoutQueue() {
  return mockMarketplaceOrders
    .filter((order) => order.listing_source === "user_seller")
    .map((order) => {
      const sellerFeeSatang = Math.floor(Number(order.item_price_satang ?? 0) * 0.1);
      return {
        id: `mock-payout-${order.id}`,
        order_id: order.id,
        listing_id: order.listing_id,
        payout_state: "held",
        item_price_satang: order.item_price_satang,
        seller_fee_satang: sellerFeeSatang,
        payout_amount_satang: Number(order.item_price_satang ?? 0) - sellerFeeSatang,
        currency: "THB" as const,
        release_eligible_at: null,
        released_at: null,
        paid_at: null,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };
    });
}

export async function buildMarketplaceOpsSnapshot(
  admin: ResolvedAdminSession | null,
) {
  const config = marketplaceConfig();
  const marketplaceAdminAllowed =
    config.unavailableReason === null &&
    (!config.ownerOnly || admin?.adminRole === "owner");
  const canReadMarketplaceQueues = marketplaceAdminAllowed && !config.mockData;

  const [
    dashboard,
    sellerPayouts,
    sellerSubmissions,
    moneyPolicy,
    queueSummary,
    reconciliationItems,
  ] = await Promise.all([
    canReadMarketplaceQueues
      ? listOfficialOrderDashboard()
      : config.mockData
        ? mockOfficialOrderDashboard()
        : emptyOfficialOrderDashboard,
    canReadMarketplaceQueues
      ? listSellerPayoutQueue()
      : config.mockData
        ? mockSellerPayoutQueue()
        : [],
    marketplaceAdminAllowed && admin
      ? listAdminSellerSubmissionQueue(admin)
      : [],
    marketplaceAdminAllowed
      ? getActiveMarketplaceMoneyPolicy()
      : marketplaceMoneyPolicy(),
    canReadMarketplaceQueues && admin
      ? listMarketplaceQueueSummary(admin)
      : emptyQueueSummary,
    canReadMarketplaceQueues && admin
      ? listMarketplaceReconciliationItems({ admin, state: "open" })
      : [],
  ]);

  const sellerPayoutTotalSatang = sellerPayouts.reduce(
    (total, payout) => total + Number(payout.payout_amount_satang ?? 0),
    0,
  );
  const sellerSubmissionTotalSatang = sellerSubmissions.reduce(
    (total, submission) => total + Number(submission.asking_price_satang ?? 0),
    0,
  );
  const sellerSubmissionReviewCount = sellerSubmissions.filter((submission) =>
    ["submitted", "submitted_for_review", "intake_instruction_sent", "received"].includes(
      submission.status,
    ),
  ).length;

  return {
    config,
    marketplaceAdminAllowed,
    canReadMarketplaceQueues,
    dashboard,
    sellerPayouts,
    sellerSubmissions,
    moneyPolicy,
    queueSummary,
    reconciliationItems,
    sellerPayoutTotalSatang,
    sellerSubmissionTotalSatang,
    sellerSubmissionReviewCount,
  };
}
