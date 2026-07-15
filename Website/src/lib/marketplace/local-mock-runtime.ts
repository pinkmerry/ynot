import "server-only";

export type LocalMarketplaceMockCartRow = {
  id: string;
  listing_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

export type LocalMarketplaceMockWatchlistRow = {
  id: string;
  listing_id: string;
  created_at: string;
  updated_at: string;
};

export type LocalMarketplaceMockCheckoutItem = {
  position: number;
  listingId: string;
  listingSource: "official_shop" | "user_seller";
  pendingPaymentOrderId: string;
  orderId: string;
  itemPriceSatang: number;
  shippingFeeSatang: number;
  buyerServiceFeeSatang: number;
  buyerTotalSatang: number;
};

type RemovedLocalMarketplaceMockCartRow = {
  index: number;
  row: LocalMarketplaceMockCartRow;
};

export type LocalMarketplaceMockPendingCheckout = {
  buyerAccountId: string;
  checkoutGroupId: string | null;
  checkoutState:
    | "pending_payment"
    | "payment_submitted"
    | "cancelled"
    | "expired"
    | "paid";
  paymentState: "pending_payment" | "payment_submitted" | "failed" | "paid";
  releaseReason: "buyer_cancelled" | "expired" | null;
  items: LocalMarketplaceMockCheckoutItem[];
  itemSubtotalSatang: number;
  shippingFeeSatang: number;
  buyerServiceFeeSatang: number;
  buyerTotalSatang: number;
  currency: "THB";
  shippingSnapshot: object;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  removedCartRows: RemovedLocalMarketplaceMockCartRow[];
};

type LocalMarketplaceMockRuntime = {
  cartRowsByAccount: Map<string, LocalMarketplaceMockCartRow[]>;
  watchlistRowsByAccount: Map<string, LocalMarketplaceMockWatchlistRow[]>;
  pendingCheckoutsByFirstPendingId: Map<
    string,
    LocalMarketplaceMockPendingCheckout
  >;
  firstPendingIdByPendingId: Map<string, string>;
  activeFirstPendingIdByListingId: Map<string, string>;
  idempotencyRecordsByCommandKey: Map<
    string,
    { requestHash: string; response: unknown }
  >;
};

const runtimeSymbol = Symbol.for("ynot.localMarketplaceMockRuntime");
const MAX_ACCOUNT_STATE_ENTRIES = 100;
const MAX_TERMINAL_CHECKOUTS = 100;
const MAX_IDEMPOTENCY_RECORDS = 500;

function localMarketplaceMockRuntime(): LocalMarketplaceMockRuntime {
  const globalRecord = globalThis as typeof globalThis & {
    [runtimeSymbol]?: Partial<LocalMarketplaceMockRuntime>;
  };
  const runtime = (globalRecord[runtimeSymbol] ??= {});

  runtime.cartRowsByAccount ??= new Map();
  runtime.watchlistRowsByAccount ??= new Map();
  runtime.pendingCheckoutsByFirstPendingId ??= new Map();
  runtime.firstPendingIdByPendingId ??= new Map();
  runtime.activeFirstPendingIdByListingId ??= new Map();
  runtime.idempotencyRecordsByCommandKey ??= new Map();

  return runtime as LocalMarketplaceMockRuntime;
}

export function localMarketplaceMockCartRows() {
  return localMarketplaceMockRuntime().cartRowsByAccount;
}

export function localMarketplaceMockWatchlistRows() {
  return localMarketplaceMockRuntime().watchlistRowsByAccount;
}

export function touchLocalMarketplaceMockAccountState(accountId: string) {
  const runtime = localMarketplaceMockRuntime();
  for (const rowsByAccount of [
    runtime.cartRowsByAccount,
    runtime.watchlistRowsByAccount,
  ]) {
    const rows = rowsByAccount.get(accountId);
    if (rows) {
      rowsByAccount.delete(accountId);
      rowsByAccount.set(accountId, rows);
    }
  }

  const activeAccountIds = new Set(
    [...runtime.pendingCheckoutsByFirstPendingId.values()]
      .filter(isActiveCheckout)
      .map((checkout) => checkout.buyerAccountId),
  );
  while (
    runtime.cartRowsByAccount.size > MAX_ACCOUNT_STATE_ENTRIES ||
    runtime.watchlistRowsByAccount.size > MAX_ACCOUNT_STATE_ENTRIES
  ) {
    const source =
      runtime.cartRowsByAccount.size >= runtime.watchlistRowsByAccount.size
        ? runtime.cartRowsByAccount
        : runtime.watchlistRowsByAccount;
    const accountToEvict = [...source.keys()].find(
      (candidate) =>
        candidate !== accountId && !activeAccountIds.has(candidate),
    );
    if (!accountToEvict) break;
    runtime.cartRowsByAccount.delete(accountToEvict);
    runtime.watchlistRowsByAccount.delete(accountToEvict);
  }
}

function isActiveCheckout(checkout: LocalMarketplaceMockPendingCheckout) {
  return ["pending_payment", "payment_submitted"].includes(
    checkout.checkoutState,
  );
}

function restoreCartAndReleaseLocks(
  runtime: LocalMarketplaceMockRuntime,
  checkout: LocalMarketplaceMockPendingCheckout,
) {
  const cartRows = runtime.cartRowsByAccount.get(checkout.buyerAccountId);
  if (cartRows) {
    for (const removed of [...checkout.removedCartRows].sort(
      (left, right) => left.index - right.index,
    )) {
      if (cartRows.some((row) => row.listing_id === removed.row.listing_id)) {
        continue;
      }
      cartRows.splice(Math.min(removed.index, cartRows.length), 0, removed.row);
    }
  }

  const firstPendingId = checkout.items[0]?.pendingPaymentOrderId;
  for (const item of checkout.items) {
    if (
      firstPendingId &&
      runtime.activeFirstPendingIdByListingId.get(item.listingId) ===
        firstPendingId
    ) {
      runtime.activeFirstPendingIdByListingId.delete(item.listingId);
    }
  }
}

function deleteCheckout(
  runtime: LocalMarketplaceMockRuntime,
  checkout: LocalMarketplaceMockPendingCheckout,
) {
  const firstPendingId = checkout.items[0]?.pendingPaymentOrderId;
  if (!firstPendingId) return;
  runtime.pendingCheckoutsByFirstPendingId.delete(firstPendingId);
  for (const item of checkout.items) {
    runtime.firstPendingIdByPendingId.delete(item.pendingPaymentOrderId);
    if (
      runtime.activeFirstPendingIdByListingId.get(item.listingId) ===
      firstPendingId
    ) {
      runtime.activeFirstPendingIdByListingId.delete(item.listingId);
    }
  }
}

function pruneTerminalCheckouts(runtime: LocalMarketplaceMockRuntime) {
  const terminal = [...runtime.pendingCheckoutsByFirstPendingId.values()]
    .filter((checkout) => !isActiveCheckout(checkout))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  while (terminal.length > MAX_TERMINAL_CHECKOUTS) {
    const oldest = terminal.shift();
    if (oldest) deleteCheckout(runtime, oldest);
  }
}

function terminalizeCheckout(
  runtime: LocalMarketplaceMockRuntime,
  checkout: LocalMarketplaceMockPendingCheckout,
  releaseReason: "buyer_cancelled" | "expired",
) {
  restoreCartAndReleaseLocks(runtime, checkout);
  checkout.checkoutState =
    releaseReason === "expired" ? "expired" : "cancelled";
  checkout.paymentState = "failed";
  checkout.releaseReason = releaseReason;
  checkout.updatedAt = new Date(Date.now()).toISOString();
  pruneTerminalCheckouts(runtime);
  return checkout;
}

function expireCheckouts(
  runtime: LocalMarketplaceMockRuntime,
  limit = Number.POSITIVE_INFINITY,
) {
  const expired: LocalMarketplaceMockPendingCheckout[] = [];
  for (const checkout of runtime.pendingCheckoutsByFirstPendingId.values()) {
    if (expired.length >= limit) break;
    if (
      isActiveCheckout(checkout) &&
      Date.parse(checkout.expiresAt) <= Date.now()
    ) {
      expired.push(terminalizeCheckout(runtime, checkout, "expired"));
    }
  }
  return expired;
}

function checkoutForPendingId(pendingOrderId: string) {
  const runtime = localMarketplaceMockRuntime();
  expireCheckouts(runtime);
  const firstPendingId =
    runtime.firstPendingIdByPendingId.get(pendingOrderId) ?? pendingOrderId;
  return runtime.pendingCheckoutsByFirstPendingId.get(firstPendingId) ?? null;
}

export function runLocalMarketplaceMockIdempotentCommand<T>(
  input: {
    buyerAccountId: string;
    scope: string;
    idempotencyKey: string;
    requestHash: string;
  },
  command: () => T,
) {
  const runtime = localMarketplaceMockRuntime();
  const commandKey = `${input.buyerAccountId}\u0000${input.scope}\u0000${input.idempotencyKey}`;
  const existing = runtime.idempotencyRecordsByCommandKey.get(commandKey);
  if (existing) {
    return existing.requestHash === input.requestHash
      ? { status: "replayed" as const, response: existing.response as T }
      : { status: "conflict" as const };
  }

  const response = command();
  runtime.idempotencyRecordsByCommandKey.set(commandKey, {
    requestHash: input.requestHash,
    response,
  });
  while (
    runtime.idempotencyRecordsByCommandKey.size > MAX_IDEMPOTENCY_RECORDS
  ) {
    const oldestKey = runtime.idempotencyRecordsByCommandKey.keys().next().value;
    if (typeof oldestKey !== "string") break;
    runtime.idempotencyRecordsByCommandKey.delete(oldestKey);
  }
  return { status: "executed" as const, response };
}

export function persistLocalMarketplaceMockPendingCheckout(
  input: Omit<
    LocalMarketplaceMockPendingCheckout,
    | "checkoutState"
    | "paymentState"
    | "releaseReason"
    | "createdAt"
    | "updatedAt"
    | "removedCartRows"
  >,
) {
  const firstPendingId = input.items[0]?.pendingPaymentOrderId;
  if (!firstPendingId) {
    throw new Error("Local marketplace mock checkout requires at least one item.");
  }

  const runtime = localMarketplaceMockRuntime();
  expireCheckouts(runtime);
  const existing = runtime.pendingCheckoutsByFirstPendingId.get(firstPendingId);
  if (existing) return { status: "listing_unavailable" as const };

  if (
    input.items.some((item) =>
      runtime.activeFirstPendingIdByListingId.has(item.listingId),
    )
  ) {
    return { status: "listing_unavailable" as const };
  }

  const listingIds = new Set(input.items.map((item) => item.listingId));
  const cartRows = runtime.cartRowsByAccount.get(input.buyerAccountId);
  const removedCartRows: RemovedLocalMarketplaceMockCartRow[] = [];
  if (cartRows) {
    const remainingRows = cartRows.filter((row, index) => {
      if (!listingIds.has(row.listing_id)) return true;
      removedCartRows.push({ index, row });
      return false;
    });
    cartRows.splice(0, cartRows.length, ...remainingRows);
  }

  const now = new Date(Date.now()).toISOString();
  const checkout: LocalMarketplaceMockPendingCheckout = {
    ...input,
    checkoutState: "pending_payment",
    paymentState: "pending_payment",
    releaseReason: null,
    createdAt: now,
    updatedAt: now,
    removedCartRows,
  };
  runtime.pendingCheckoutsByFirstPendingId.set(firstPendingId, checkout);
  for (const item of input.items) {
    runtime.firstPendingIdByPendingId.set(
      item.pendingPaymentOrderId,
      firstPendingId,
    );
    runtime.activeFirstPendingIdByListingId.set(item.listingId, firstPendingId);
  }
  return { status: "persisted" as const, checkout };
}

export function getLocalMarketplaceMockPendingCheckout(
  buyerAccountId: string,
  pendingOrderId: string,
) {
  const checkout = checkoutForPendingId(pendingOrderId);
  return checkout?.buyerAccountId === buyerAccountId ? checkout : null;
}

export function listLocalMarketplaceMockPendingCheckouts(
  buyerAccountId: string,
) {
  const runtime = localMarketplaceMockRuntime();
  expireCheckouts(runtime);
  return [...
    runtime.pendingCheckoutsByFirstPendingId.values(),
  ]
    .filter(
      (checkout) =>
        checkout.buyerAccountId === buyerAccountId &&
        ["pending_payment", "payment_submitted"].includes(
          checkout.checkoutState,
        ),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function releaseLocalMarketplaceMockPendingCheckout(input: {
  buyerAccountId: string;
  pendingOrderId: string;
  releaseReason: "buyer_cancelled" | "expired";
}) {
  const checkout = getLocalMarketplaceMockPendingCheckout(
    input.buyerAccountId,
    input.pendingOrderId,
  );
  if (!checkout) return { status: "not_found" as const };
  if (
    checkout.checkoutState === "paid" ||
    checkout.paymentState === "paid"
  ) {
    return { status: "invalid_state" as const };
  }
  if (!isActiveCheckout(checkout)) {
    return { status: "released" as const, checkout };
  }
  terminalizeCheckout(
    localMarketplaceMockRuntime(),
    checkout,
    input.releaseReason,
  );
  return { status: "released" as const, checkout };
}

export function expireLocalMarketplaceMockPendingCheckouts(limit: number) {
  return expireCheckouts(localMarketplaceMockRuntime(), limit);
}
