import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSourceRoot = path.join(appRoot, "src");
const localMockEnvironment = {
  MARKETPLACE_ENVIRONMENT: "local",
  YNOT_MARKETPLACE_ENABLED: "true",
  YNOT_MARKETPLACE_MOCK_DATA: "true",
};
const originalLocalMockEnvironment = Object.fromEntries(
  Object.keys(localMockEnvironment).map((name) => [name, process.env[name]]),
);

function enableLocalMockEnvironment() {
  Object.assign(process.env, localMockEnvironment);
}

test.afterEach(() => {
  for (const [name, value] of Object.entries(originalLocalMockEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export {};",
        shortCircuit: true,
      };
    }
    if (["next/headers", "next/navigation", "next/server"].includes(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }

    let candidate = null;
    if (specifier.startsWith("@/")) {
      candidate = path.join(appSourceRoot, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      candidate = path.resolve(
        path.dirname(fileURLToPath(context.parentURL)),
        specifier,
      );
    }

    if (candidate) {
      for (const suffix of [
        "",
        ".ts",
        ".tsx",
        ".js",
        ".mjs",
        "/index.ts",
        "/index.tsx",
      ]) {
        const resolved = `${candidate}${suffix}`;
        if (!isFile(resolved)) continue;
        const url = pathToFileURL(resolved);
        if (
          resolved.endsWith("/local-mock-runtime.ts") &&
          context.parentURL
        ) {
          url.search = new URL(context.parentURL).search;
        }
        return { url: url.href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});

function readApp(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

async function importApp(relativePath) {
  return import(pathToFileURL(path.join(appRoot, relativePath)).href);
}

async function importAppInstance(relativePath, instance) {
  const url = pathToFileURL(path.join(appRoot, relativePath));
  url.searchParams.set("mock-bundle", instance);
  return import(url.href);
}

function mockMarketplaceAccount(accountId) {
  return {
    accountId,
    buyerStatus: "active",
    sellerStatus: "active",
    payoutStatus: "verified",
    sellerTermsVersion: null,
    sellerTermsAcceptedAt: null,
    buyerTermsVersion: null,
    buyerTermsAcceptedAt: null,
    lastProfileVerifiedAt: null,
    lastSeenAt: null,
    createdAt: null,
    updatedAt: null,
    capabilities: {
      canBrowse: true,
      canCheckout: true,
      canSell: true,
      canAcceptSellerTerms: false,
      canReceivePayout: true,
      isMarketplaceOperator: false,
      isMarketplaceOwner: false,
    },
  };
}

const mockProfile = {
  profileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  authSource: "supabase",
};

const mockShippingSnapshot = {
  id: "mock-address-bangkok",
  label: "Local mock address",
  recipientName: "Mock Buyer",
  phone: "0800000000",
  summary: "Bangkok, Thailand",
  deliveryNote: null,
};

const mockPaymentInstructions = {
  method: "bank_transfer",
  currency: "THB",
  bankName: "Mock bank",
  accountName: "YNOT Mock",
  accountNumber: "0000000000",
  promptPayId: null,
  paymentWindowMinutes: 30,
  receiverConfigured: true,
  acceptedImageTypes: ["JPG", "PNG", "WEBP"],
};

async function loadNotifierModule() {
  const notifierModule = await importApp(
    "src/features/marketplace-ui/checkout/notify-cart-state-changed.ts",
  ).catch(() => null);
  assert.ok(notifierModule, "missing cart state change notifier");
  return notifierModule;
}

async function captureUnhandledRejections(run) {
  const reasons = [];
  const listener = (reason) => reasons.push(reason);
  process.on("unhandledRejection", listener);
  try {
    const returned = run();
    await new Promise((resolve) => setImmediate(resolve));
    return { reasons, returned };
  } finally {
    process.off("unhandledRejection", listener);
  }
}

function functionBody(source, signature) {
  const signatureIndex = source.indexOf(signature);
  assert.notEqual(signatureIndex, -1, `missing function: ${signature}`);
  const bodyStart = source.indexOf("{", signatureIndex);
  assert.notEqual(bodyStart, -1, `missing function body: ${signature}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  assert.fail(`unterminated function body: ${signature}`);
}

const CART_CLIENT = "src/features/ynot/MarketplaceCartWatchlistClient.tsx";
const CART_PAGE = "src/app/(store)/marketplace/cart/page.tsx";
const CHECKOUT_FLOW = "src/features/marketplace-ui/checkout/CheckoutFlow.tsx";
const ORDER_DETAIL = "src/app/(store)/marketplace/orders/[orderId]/page.tsx";
const GROUP_ROUTE = "src/app/api/ynot/marketplace/checkout/groups/route.ts";
const GROUP_ROUTE_ALIAS = "src/app/api/marketplace/checkout/groups/route.ts";
const ORDERS = "src/lib/marketplace/orders.ts";
const OFFICIAL_SHOP = "src/lib/marketplace/official-shop.ts";

test("package exposes the scoped cart checkout regression test", () => {
  const packageJson = JSON.parse(readApp("package.json"));
  assert.equal(
    packageJson.scripts["test:marketplace-cart-checkout"],
    "node --test scripts/test-marketplace-cart-checkout.mjs",
  );
  assert.equal(packageJson.engines?.node, ">=22.15.0");
  const packageLock = JSON.parse(readApp("package-lock.json"));
  assert.equal(packageLock.packages?.[""]?.engines?.node, ">=22.15.0");
});

test("local mock accounts are stable per profile and isolate cart state", async () => {
  enableLocalMockEnvironment();
  const [accounts, cart] = await Promise.all([
    importAppInstance(
      "src/lib/marketplace/account-bridge.ts",
      "profile-account-isolation",
    ),
    importAppInstance(
      "src/lib/marketplace/cart-watchlist.ts",
      "profile-cart-isolation",
    ),
  ]);
  const firstProfile = {
    profileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01",
    authSource: "supabase",
  };
  const secondProfile = {
    profileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
    authSource: "supabase",
  };

  const firstAccount = await accounts.getMarketplaceAccountForProfile(
    firstProfile,
  );
  const firstAccountReplay = await accounts.ensureMarketplaceAccountForProfile(
    firstProfile,
    {
      idempotencyKey: "profile-account-isolation",
      requestHash: "profile-account-isolation",
    },
  );
  const secondAccount = await accounts.getMarketplaceAccountForProfile(
    secondProfile,
  );
  assert.equal(firstAccount.accountId, firstAccountReplay.accountId);
  assert.notEqual(firstAccount.accountId, secondAccount.accountId);
  assert.notEqual(firstAccount.accountId, firstProfile.profileId);
  assert.notEqual(secondAccount.accountId, secondProfile.profileId);

  const firstCart = await cart.getMarketplaceCustomerCartState(
    firstAccount,
    firstProfile.profileId,
  );
  await cart.removeMarketplaceCartItem({
    account: firstAccount,
    listingId: firstCart.items[0].listingId,
    actorProfileId: firstProfile.profileId,
    requestId: "profile-cart-isolation",
    idempotencyKey: "profile-cart-isolation",
    requestHash: "profile-cart-isolation",
  });
  assert.equal(
    (
      await cart.getMarketplaceCustomerCartState(
        firstAccount,
        firstProfile.profileId,
      )
    ).summary.cartCount,
    1,
  );
  assert.equal(
    (
      await cart.getMarketplaceCustomerCartState(
        secondAccount,
        secondProfile.profileId,
      )
    ).summary.cartCount,
    2,
  );
});

test("local mock checkout locks reject overlapping groups and release atomically", async () => {
  enableLocalMockEnvironment();
  const [cart, orders] = await Promise.all([
    importAppInstance("src/lib/marketplace/cart-watchlist.ts", "listing-lock-cart"),
    importAppInstance("src/lib/marketplace/orders.ts", "listing-lock-orders"),
  ]);
  const firstAccount = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
  );
  const secondAccount = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
  );
  const firstListingId = (
    await cart.getMarketplaceCustomerCartState(
      firstAccount,
      mockProfile.profileId,
    )
  ).items.find((item) => item.listing.listing_source === "official_shop")
    ?.listingId;
  assert.ok(firstListingId);
  const secondListingId = "14141414-1414-4141-8141-141414141403";

  const firstCheckout = await orders.createOfficialPendingPaymentOrder({
    listingId: firstListingId,
    profile: mockProfile,
    account: firstAccount,
    shippingSnapshot: mockShippingSnapshot,
    paymentInstructions: mockPaymentInstructions,
    requestId: "listing-lock-first",
    idempotencyKey: "listing-lock-first",
    requestHash: "3000000000000000000000000000000000000000000000000000000000000001",
  });

  await assert.rejects(
    orders.createMultiListingCheckout({
      listingIds: [firstListingId, secondListingId],
      profile: mockProfile,
      account: secondAccount,
      shippingSnapshot: mockShippingSnapshot,
      paymentInstructions: mockPaymentInstructions,
      requestId: "listing-lock-overlap",
      idempotencyKey: "listing-lock-overlap",
      requestHash:
        "3000000000000000000000000000000000000000000000000000000000000002",
    }),
    (error) =>
      error?.code === "marketplace_listing_unavailable" &&
      error?.status === 409,
  );

  const independentCheckout = await orders.createOfficialPendingPaymentOrder({
    listingId: secondListingId,
    profile: mockProfile,
    account: secondAccount,
    shippingSnapshot: mockShippingSnapshot,
    paymentInstructions: mockPaymentInstructions,
    requestId: "listing-lock-independent",
    idempotencyKey: "listing-lock-independent",
    requestHash: "3000000000000000000000000000000000000000000000000000000000000003",
  });
  await orders.releaseMarketplacePendingPaymentOrder({
    pendingOrderId: independentCheckout.pendingPaymentOrderId,
    profile: mockProfile,
    account: secondAccount,
    requestId: "listing-lock-independent-release",
    idempotencyKey: "listing-lock-independent-release",
    requestHash: "listing-lock-independent-release",
    releaseReason: "buyer_cancelled",
  });

  const releaseInput = {
    pendingOrderId: firstCheckout.pendingPaymentOrderId,
    profile: mockProfile,
    account: firstAccount,
    requestId: "listing-lock-first-release",
    idempotencyKey: "listing-lock-first-release",
    requestHash: "listing-lock-first-release",
    releaseReason: "buyer_cancelled",
  };
  await orders.releaseMarketplacePendingPaymentOrder(releaseInput);
  const cartAfterRelease = await cart.getMarketplaceCustomerCartState(
    firstAccount,
    mockProfile.profileId,
  );
  assert.equal(
    cartAfterRelease.items.some((item) => item.listingId === firstListingId),
    true,
  );

  const checkoutAfterRelease =
    await orders.createOfficialPendingPaymentOrder({
      listingId: firstListingId,
      profile: mockProfile,
      account: secondAccount,
      shippingSnapshot: mockShippingSnapshot,
      paymentInstructions: mockPaymentInstructions,
      requestId: "listing-lock-after-release",
      idempotencyKey: "listing-lock-after-release",
      requestHash:
        "3000000000000000000000000000000000000000000000000000000000000004",
    });
  await orders.releaseMarketplacePendingPaymentOrder({
    ...releaseInput,
    pendingOrderId: checkoutAfterRelease.pendingPaymentOrderId,
    account: secondAccount,
    requestId: "listing-lock-after-release-cleanup",
    idempotencyKey: "listing-lock-after-release-cleanup",
    requestHash: "listing-lock-after-release-cleanup",
  });
});

test("local mock create and release commands replay by idempotency key and reject conflicts", async () => {
  enableLocalMockEnvironment();
  const [cart, orders] = await Promise.all([
    importAppInstance("src/lib/marketplace/cart-watchlist.ts", "idempotency-cart"),
    importAppInstance("src/lib/marketplace/orders.ts", "idempotency-orders"),
  ]);
  const account = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
  );
  const initial = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  const listingId = initial.items.find(
    (item) => item.listing.listing_source === "official_shop",
  )?.listingId;
  assert.ok(listingId);
  const createInput = {
    listingId,
    profile: mockProfile,
    account,
    shippingSnapshot: mockShippingSnapshot,
    paymentInstructions: mockPaymentInstructions,
    requestId: "idempotent-create",
    idempotencyKey: "idempotent-create",
    requestHash: "4000000000000000000000000000000000000000000000000000000000000001",
  };

  const created = await orders.createOfficialPendingPaymentOrder(createInput);
  assert.deepEqual(
    await orders.createOfficialPendingPaymentOrder({
      ...createInput,
      requestId: "idempotent-create-retry",
    }),
    created,
  );
  assert.equal(
    (
      await cart.getMarketplaceCustomerCartState(
        account,
        mockProfile.profileId,
      )
    ).summary.cartCount,
    1,
  );
  await assert.rejects(
    orders.createOfficialPendingPaymentOrder({
      ...createInput,
      requestHash:
        "4000000000000000000000000000000000000000000000000000000000000002",
    }),
    (error) =>
      error?.code === "marketplace_idempotency_conflict" &&
      error?.status === 409,
  );

  const releaseInput = {
    pendingOrderId: created.pendingPaymentOrderId,
    profile: mockProfile,
    account,
    requestId: "idempotent-release",
    idempotencyKey: "idempotent-release",
    requestHash: "idempotent-release-hash",
    releaseReason: "buyer_cancelled",
  };
  const released = await orders.releaseMarketplacePendingPaymentOrder(
    releaseInput,
  );
  assert.deepEqual(
    await orders.releaseMarketplacePendingPaymentOrder({
      ...releaseInput,
      requestId: "idempotent-release-retry",
    }),
    released,
  );
  assert.equal(
    (
      await cart.getMarketplaceCustomerCartState(
        account,
        mockProfile.profileId,
      )
    ).summary.cartCount,
    2,
  );
  await assert.rejects(
    orders.releaseMarketplacePendingPaymentOrder({
      ...releaseInput,
      requestHash: "idempotent-release-conflict",
    }),
    (error) =>
      error?.code === "marketplace_idempotency_conflict" &&
      error?.status === 409,
  );

  const recreated = await orders.createOfficialPendingPaymentOrder({
    ...createInput,
    requestId: "idempotent-create-new-key",
    idempotencyKey: "idempotent-create-new-key",
  });
  assert.notEqual(recreated.pendingPaymentOrderId, created.pendingPaymentOrderId);
  assert.equal(
    (
      await orders.getBuyerPendingPaymentOrder({
        pendingOrderId: recreated.pendingPaymentOrderId,
        account,
      })
    ).order_state,
    "pending_payment",
  );
  await orders.releaseMarketplacePendingPaymentOrder({
    ...releaseInput,
    pendingOrderId: recreated.pendingPaymentOrderId,
    requestId: "idempotent-create-new-key-cleanup",
    idempotencyKey: "idempotent-create-new-key-cleanup",
    requestHash: "idempotent-create-new-key-cleanup",
  });
});

test("local mock expiry command fails expired checkout, restores cart, and unlocks listing", async () => {
  enableLocalMockEnvironment();
  const [cart, orders] = await Promise.all([
    importAppInstance("src/lib/marketplace/cart-watchlist.ts", "expiry-cart"),
    importAppInstance("src/lib/marketplace/orders.ts", "expiry-orders"),
  ]);
  const account = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
  );
  const initial = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  const listingId = initial.items.find(
    (item) => item.listing.listing_source === "official_shop",
  )?.listingId;
  assert.ok(listingId);
  const realDateNow = Date.now;
  let clock = Date.parse("2026-07-15T00:00:00.000Z");
  Date.now = () => clock;
  try {
    const created = await orders.createOfficialPendingPaymentOrder({
      listingId,
      profile: mockProfile,
      account,
      shippingSnapshot: mockShippingSnapshot,
      paymentInstructions: mockPaymentInstructions,
      requestId: "expiry-create",
      idempotencyKey: "expiry-create",
      requestHash:
        "5000000000000000000000000000000000000000000000000000000000000001",
    });
    clock += 16 * 60_000;
    const expired = await orders.expireMarketplacePendingPaymentOrders({
      requestId: "expiry-command",
      limit: 10,
    });
    assert.equal(expired.expiredCount, 1);
    assert.deepEqual(expired.expiredPendingOrderIds, [created.pendingPaymentOrderId]);
    assert.equal(
      (
        await orders.getBuyerPendingPaymentOrder({
          pendingOrderId: created.pendingPaymentOrderId,
          account,
        })
      ).order_state,
      "expired",
    );
    assert.deepEqual(await orders.listBuyerPendingPaymentOrders(account), []);
    assert.equal(
      (
        await cart.getMarketplaceCustomerCartState(
          account,
          mockProfile.profileId,
        )
      ).summary.cartCount,
      2,
    );

    const terminalRelease =
      await orders.releaseMarketplacePendingPaymentOrder({
        pendingOrderId: created.pendingPaymentOrderId,
        profile: mockProfile,
        account,
        requestId: "expiry-terminal-release",
        idempotencyKey: "expiry-terminal-release",
        requestHash: "expiry-terminal-release",
        releaseReason: "buyer_cancelled",
      });
    assert.equal(terminalRelease.orderState, "expired");
    assert.equal(terminalRelease.paymentState, "failed");
    assert.equal(terminalRelease.releaseReason, "expired");
    assert.equal(
      (
        await cart.getMarketplaceCustomerCartState(
          account,
          mockProfile.profileId,
        )
      ).summary.cartCount,
      2,
    );

    const recreated = await orders.createOfficialPendingPaymentOrder({
      listingId,
      profile: mockProfile,
      account,
      shippingSnapshot: mockShippingSnapshot,
      paymentInstructions: mockPaymentInstructions,
      requestId: "expiry-recreate",
      idempotencyKey: "expiry-recreate",
      requestHash:
        "5000000000000000000000000000000000000000000000000000000000000002",
    });
    await orders.releaseMarketplacePendingPaymentOrder({
      pendingOrderId: recreated.pendingPaymentOrderId,
      profile: mockProfile,
      account,
      requestId: "expiry-recreate-cleanup",
      idempotencyKey: "expiry-recreate-cleanup",
      requestHash: "expiry-recreate-cleanup",
      releaseReason: "buyer_cancelled",
    });
  } finally {
    Date.now = realDateNow;
  }
});

test("local mock runtime evicts oldest terminal checkouts after its bounded history", async () => {
  enableLocalMockEnvironment();
  const [cart, orders] = await Promise.all([
    importAppInstance("src/lib/marketplace/cart-watchlist.ts", "eviction-cart"),
    importAppInstance("src/lib/marketplace/orders.ts", "eviction-orders"),
  ]);
  const account = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
  );
  const listingId = (
    await cart.getMarketplaceCustomerCartState(
      account,
      mockProfile.profileId,
    )
  ).items.find((item) => item.listing.listing_source === "official_shop")
    ?.listingId;
  assert.ok(listingId);

  let oldestPendingOrderId = null;
  let newestPendingOrderId = null;
  for (let index = 0; index <= 100; index += 1) {
    const created = await orders.createOfficialPendingPaymentOrder({
      listingId,
      profile: mockProfile,
      account,
      shippingSnapshot: mockShippingSnapshot,
      paymentInstructions: mockPaymentInstructions,
      requestId: `terminal-eviction-create-${index}`,
      idempotencyKey: `terminal-eviction-create-${index}`,
      requestHash: index.toString(16).padStart(64, "6"),
    });
    oldestPendingOrderId ??= created.pendingPaymentOrderId;
    newestPendingOrderId = created.pendingPaymentOrderId;
    await orders.releaseMarketplacePendingPaymentOrder({
      pendingOrderId: created.pendingPaymentOrderId,
      profile: mockProfile,
      account,
      requestId: `terminal-eviction-release-${index}`,
      idempotencyKey: `terminal-eviction-release-${index}`,
      requestHash: `terminal-eviction-release-${index}`,
      releaseReason: "buyer_cancelled",
    });
  }

  await assert.rejects(
    orders.getBuyerPendingPaymentOrder({
      pendingOrderId: oldestPendingOrderId,
      account,
    }),
    (error) =>
      error?.code === "marketplace_pending_order_not_found" &&
      error?.status === 404,
  );
  assert.equal(
    (
      await orders.getBuyerPendingPaymentOrder({
        pendingOrderId: newestPendingOrderId,
        account,
      })
    ).order_state,
    "cancelled",
  );
});

test("local mock account-state bounds evict inactive history without losing active checkout state", async () => {
  enableLocalMockEnvironment();
  const [cart, orders] = await Promise.all([
    importAppInstance("src/lib/marketplace/cart-watchlist.ts", "account-bound-cart"),
    importAppInstance("src/lib/marketplace/orders.ts", "account-bound-orders"),
  ]);
  const activeAccount = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
  );
  const activeCart = await cart.getMarketplaceCustomerCartState(
    activeAccount,
    mockProfile.profileId,
  );
  const activeListingId = activeCart.items.find(
    (item) => item.listing.listing_source === "official_shop",
  )?.listingId;
  assert.ok(activeListingId);
  const activeWatchlist = await cart.getMarketplaceWatchlistState(
    activeAccount,
    mockProfile.profileId,
  );
  await cart.removeMarketplaceWatchlistItem({
    account: activeAccount,
    listingId: activeWatchlist.items[0].listingId,
    actorProfileId: mockProfile.profileId,
    requestId: "account-bound-active-watchlist",
    idempotencyKey: "account-bound-active-watchlist",
    requestHash: "account-bound-active-watchlist",
  });
  const activeCheckout = await orders.createOfficialPendingPaymentOrder({
    listingId: activeListingId,
    profile: mockProfile,
    account: activeAccount,
    shippingSnapshot: mockShippingSnapshot,
    paymentInstructions: mockPaymentInstructions,
    requestId: "account-bound-active-checkout",
    idempotencyKey: "account-bound-active-checkout",
    requestHash:
      "7000000000000000000000000000000000000000000000000000000000000001",
  });

  const accountForIndex = (index) =>
    mockMarketplaceAccount(
      `cccccccc-cccc-4ccc-8ccc-${index.toString(16).padStart(12, "0")}`,
    );
  const oldestInactiveAccount = accountForIndex(0);
  const oldestCart = await cart.getMarketplaceCustomerCartState(
    oldestInactiveAccount,
    mockProfile.profileId,
  );
  const oldestWatchlist = await cart.getMarketplaceWatchlistState(
    oldestInactiveAccount,
    mockProfile.profileId,
  );
  await cart.removeMarketplaceCartItem({
    account: oldestInactiveAccount,
    listingId: oldestCart.items[0].listingId,
    actorProfileId: mockProfile.profileId,
    requestId: "account-bound-oldest-cart",
    idempotencyKey: "account-bound-oldest-cart",
    requestHash: "account-bound-oldest-cart",
  });
  await cart.removeMarketplaceWatchlistItem({
    account: oldestInactiveAccount,
    listingId: oldestWatchlist.items[0].listingId,
    actorProfileId: mockProfile.profileId,
    requestId: "account-bound-oldest-watchlist",
    idempotencyKey: "account-bound-oldest-watchlist",
    requestHash: "account-bound-oldest-watchlist",
  });

  for (let index = 1; index <= 110; index += 1) {
    await cart.getMarketplaceCustomerCartState(
      accountForIndex(index),
      mockProfile.profileId,
    );
  }

  await orders.releaseMarketplacePendingPaymentOrder({
    pendingOrderId: activeCheckout.pendingPaymentOrderId,
    profile: mockProfile,
    account: activeAccount,
    requestId: "account-bound-active-release",
    idempotencyKey: "account-bound-active-release",
    requestHash: "account-bound-active-release",
    releaseReason: "buyer_cancelled",
  });
  assert.equal(
    (
      await cart.getMarketplaceCustomerCartState(
        activeAccount,
        mockProfile.profileId,
      )
    ).summary.cartCount,
    2,
  );
  assert.equal(
    (
      await cart.getMarketplaceWatchlistState(
        activeAccount,
        mockProfile.profileId,
      )
    ).summary.watchlistCount,
    1,
  );
  assert.equal(
    (
      await cart.getMarketplaceCustomerCartState(
        oldestInactiveAccount,
        mockProfile.profileId,
      )
    ).summary.cartCount,
    2,
  );
  assert.equal(
    (
      await cart.getMarketplaceWatchlistState(
        oldestInactiveAccount,
        mockProfile.profileId,
      )
    ).summary.watchlistCount,
    2,
  );
});

test("local mock cart state survives separate route-bundle module evaluation", async () => {
  enableLocalMockEnvironment();

  const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const [firstBundle, secondBundle] = await Promise.all([
    importAppInstance(
      "src/lib/marketplace/cart-watchlist.ts",
      "cart-state-first",
    ),
    importAppInstance(
      "src/lib/marketplace/cart-watchlist.ts",
      "cart-state-second",
    ),
  ]);
  const account = mockMarketplaceAccount(accountId);
  const initial = await firstBundle.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  assert.equal(initial.summary.cartCount, 2);

  await firstBundle.removeMarketplaceCartItem({
    account,
    listingId: initial.items[0].listingId,
    actorProfileId: mockProfile.profileId,
    requestId: "mock-cart-state-remove",
    idempotencyKey: "mock-cart-state-remove",
    requestHash: "mock-cart-state-remove",
  });

  const reloaded = await secondBundle.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  assert.equal(reloaded.summary.cartCount, 1);
  assert.equal(
    reloaded.items.some((item) => item.listingId === initial.items[0].listingId),
    false,
  );

  const initialWatchlist = await firstBundle.getMarketplaceWatchlistState(
    account,
    mockProfile.profileId,
  );
  assert.equal(initialWatchlist.summary.watchlistCount, 2);
  await firstBundle.removeMarketplaceWatchlistItem({
    account,
    listingId: initialWatchlist.items[0].listingId,
    actorProfileId: mockProfile.profileId,
    requestId: "mock-watchlist-state-remove",
    idempotencyKey: "mock-watchlist-state-remove",
    requestHash: "mock-watchlist-state-remove",
  });

  const reloadedWatchlist = await secondBundle.getMarketplaceWatchlistState(
    account,
    mockProfile.profileId,
  );
  assert.equal(reloadedWatchlist.summary.watchlistCount, 1);
  assert.equal(
    reloadedWatchlist.items.some(
      (item) => item.listingId === initialWatchlist.items[0].listingId,
    ),
    false,
  );
});

test("local mock single official checkout persists and restores its consumed cart row", async () => {
  enableLocalMockEnvironment();

  const account = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  );
  const [cart, orders] = await Promise.all([
    importAppInstance(
      "src/lib/marketplace/cart-watchlist.ts",
      "single-checkout-cart-route",
    ),
    importAppInstance(
      "src/lib/marketplace/orders.ts",
      "single-checkout-orders-route",
    ),
  ]);
  const initial = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  const officialListingId = initial.items.find(
    (item) => item.listing.listing_source === "official_shop",
  )?.listingId;
  assert.ok(officialListingId);
  assert.equal(initial.summary.cartCount, 2);

  const created = await orders.createOfficialPendingPaymentOrder({
    listingId: officialListingId,
    profile: mockProfile,
    account,
    shippingSnapshot: mockShippingSnapshot,
    paymentInstructions: mockPaymentInstructions,
    requestId: "mock-single-checkout-create",
    idempotencyKey: "mock-single-checkout-create",
    requestHash:
      "111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000",
  });
  const afterCheckout = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  assert.equal(afterCheckout.summary.cartCount, 1);
  assert.equal(
    afterCheckout.items.some((item) => item.listingId === officialListingId),
    false,
  );

  const pending = await orders.getBuyerPendingPaymentOrder({
    pendingOrderId: created.pendingPaymentOrderId,
    account,
  });
  assert.equal(pending.id, created.pendingPaymentOrderId);
  assert.equal(pending.checkout_group_id, null);
  assert.equal(pending.listing_id, officialListingId);
  assert.deepEqual(
    (await orders.listBuyerPendingPaymentOrders(account)).map((row) => row.id),
    [created.pendingPaymentOrderId],
  );

  const releaseInput = {
    pendingOrderId: created.pendingPaymentOrderId,
    profile: mockProfile,
    account,
    requestId: "mock-single-checkout-release",
    idempotencyKey: "mock-single-checkout-release",
    requestHash: "mock-single-checkout-release",
    releaseReason: "buyer_cancelled",
  };
  const released = await orders.releaseMarketplacePendingPaymentOrder(
    releaseInput,
  );
  assert.equal(released.pendingPaymentOrderId, created.pendingPaymentOrderId);
  assert.equal(released.orderState, "cancelled");
  assert.equal(released.paymentState, "failed");

  const restored = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  assert.equal(restored.summary.cartCount, 2);
  assert.equal(
    restored.items.some((item) => item.listingId === officialListingId),
    true,
  );
  assert.deepEqual(await orders.listBuyerPendingPaymentOrders(account), []);

  await cart.removeMarketplaceCartItem({
    account,
    listingId: officialListingId,
    actorProfileId: mockProfile.profileId,
    requestId: "mock-single-checkout-remove-restored",
    idempotencyKey: "mock-single-checkout-remove-restored",
    requestHash: "mock-single-checkout-remove-restored",
  });
  assert.deepEqual(
    await orders.releaseMarketplacePendingPaymentOrder({
      ...releaseInput,
      requestId: "mock-single-checkout-release-again",
      idempotencyKey: "mock-single-checkout-release-again",
      requestHash: "mock-single-checkout-release-again",
    }),
    released,
  );
  assert.equal(
    (
      await cart.getMarketplaceCustomerCartState(
        account,
        mockProfile.profileId,
      )
    ).summary.cartCount,
    1,
  );
});

test("local mock pending-order reads do not cross account ownership", async () => {
  enableLocalMockEnvironment();

  const account = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  );
  const intruder = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
  );
  const [cart, orders] = await Promise.all([
    importAppInstance(
      "src/lib/marketplace/cart-watchlist.ts",
      "single-ownership-cart-route",
    ),
    importAppInstance(
      "src/lib/marketplace/orders.ts",
      "single-ownership-orders-route",
    ),
  ]);
  const initial = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  const officialListingId = initial.items.find(
    (item) => item.listing.listing_source === "official_shop",
  )?.listingId;
  assert.ok(officialListingId);

  const created = await orders.createOfficialPendingPaymentOrder({
    listingId: officialListingId,
    profile: mockProfile,
    account,
    shippingSnapshot: mockShippingSnapshot,
    paymentInstructions: mockPaymentInstructions,
    requestId: "mock-single-ownership-create",
    idempotencyKey: "mock-single-ownership-create",
    requestHash:
      "22223333444455556666777788889999aaaabbbbccccddddeeeeffff00001111",
  });

  assert.deepEqual(
    (await orders.listBuyerPendingPaymentOrders(account)).map((row) => row.id),
    [created.pendingPaymentOrderId],
  );
  assert.deepEqual(await orders.listBuyerPendingPaymentOrders(intruder), []);
  await assert.rejects(
    orders.getBuyerPendingPaymentOrder({
      pendingOrderId: created.pendingPaymentOrderId,
      account: intruder,
    }),
    (error) =>
      error?.code === "marketplace_pending_order_not_found" &&
      error?.status === 404,
  );
  await orders.releaseMarketplacePendingPaymentOrder({
    pendingOrderId: created.pendingPaymentOrderId,
    profile: mockProfile,
    account,
    requestId: "mock-single-ownership-cleanup",
    idempotencyKey: "mock-single-ownership-cleanup",
    requestHash: "mock-single-ownership-cleanup",
    releaseReason: "buyer_cancelled",
  });
});

test("local mock cart checkout persists lookup and release across route bundles", async () => {
  enableLocalMockEnvironment();

  const account = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  );
  const wrongAccount = mockMarketplaceAccount(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  );
  const [cart, orders] = await Promise.all([
    importAppInstance(
      "src/lib/marketplace/cart-watchlist.ts",
      "checkout-cart-route",
    ),
    importAppInstance("src/lib/marketplace/orders.ts", "checkout-orders-route"),
  ]);
  const initial = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  const firstOfficialListingId = initial.items.find(
    (item) => item.listing.listing_source === "official_shop",
  )?.listingId;
  assert.ok(firstOfficialListingId);

  const secondOfficialListingId =
    "14141414-1414-4141-8141-141414141403";
  await cart.addMarketplaceCartItem({
    account,
    listingId: secondOfficialListingId,
    actorProfileId: mockProfile.profileId,
    requestId: "mock-checkout-cart-add",
    idempotencyKey: "mock-checkout-cart-add",
    requestHash: "mock-checkout-cart-add",
  });
  const beforeCheckout = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  assert.equal(beforeCheckout.summary.cartCount, 3);

  const created = await orders.createMultiListingCheckout({
    listingIds: [firstOfficialListingId, secondOfficialListingId],
    profile: mockProfile,
    account,
    shippingSnapshot: mockShippingSnapshot,
    paymentInstructions: mockPaymentInstructions,
    requestId: "mock-checkout-create",
    idempotencyKey: "mock-checkout-create",
    requestHash:
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  });
  const afterCheckout = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  assert.equal(afterCheckout.summary.cartCount, 1);
  const secondChildPendingOrderId = created.items[1].pendingPaymentOrderId;
  assert.notEqual(
    secondChildPendingOrderId,
    created.items[0].pendingPaymentOrderId,
  );

  const pending = await orders.getBuyerPendingPaymentOrder({
    pendingOrderId: secondChildPendingOrderId,
    account,
  });
  assert.equal(pending.id, secondChildPendingOrderId);
  assert.equal(pending.checkout_group_id, created.checkoutGroupId);
  assert.equal(pending.buyer_total_satang, created.buyerTotalSatang);

  const pendingList = await orders.listBuyerPendingPaymentOrders(account);
  assert.deepEqual(
    pendingList.map((row) => row.id).sort(),
    created.items.map((item) => item.pendingPaymentOrderId).sort(),
  );

  const releaseInput = {
    pendingOrderId: secondChildPendingOrderId,
    profile: mockProfile,
    account,
    requestId: "mock-checkout-release",
    idempotencyKey: "mock-checkout-release",
    requestHash: "mock-checkout-release",
    releaseReason: "buyer_cancelled",
  };
  for (const [pendingOrderId, releaseAccount] of [
    [secondChildPendingOrderId, wrongAccount],
    ["ffffffff-ffff-4fff-8fff-ffffffffffff", account],
  ]) {
    await assert.rejects(
      orders.releaseMarketplacePendingPaymentOrder({
        ...releaseInput,
        pendingOrderId,
        account: releaseAccount,
      }),
      (error) =>
        error?.code === "marketplace_pending_order_not_found" &&
        error?.status === 404,
    );
  }

  const released = await orders.releaseMarketplacePendingPaymentOrder(
    releaseInput,
  );
  assert.equal(released.checkoutGroupId, created.checkoutGroupId);
  assert.equal(released.checkoutState, "cancelled");
  assert.equal(released.paymentState, "failed");

  const restored = await cart.getMarketplaceCustomerCartState(
    account,
    mockProfile.profileId,
  );
  assert.equal(restored.summary.cartCount, 3);
  assert.deepEqual(
    restored.items
      .filter((item) =>
        [firstOfficialListingId, secondOfficialListingId].includes(
          item.listingId,
        ),
      )
      .map((item) => item.listingId)
      .sort(),
    [firstOfficialListingId, secondOfficialListingId].sort(),
  );
  assert.deepEqual(await orders.listBuyerPendingPaymentOrders(account), []);

  assert.deepEqual(
    await orders.releaseMarketplacePendingPaymentOrder({
      ...releaseInput,
      requestId: "mock-checkout-release-again",
      idempotencyKey: "mock-checkout-release-again",
      requestHash: "mock-checkout-release-again",
    }),
    released,
  );
});

test("cart lets a shopper select every available listing for one checkout", () => {
  const source = readApp(CART_CLIENT);
  assert.match(source, /selectedListingIds/);
  assert.match(source, /type=["']checkbox["']/);
  assert.match(source, /Pay for all selected items/);
  assert.match(source, /Proceed to checkout/);
  assert.match(source, /selectedListingIds\.length\s*>=\s*1/);
  assert.doesNotMatch(source, /selectedListingIds\.length\s*<=\s*3/);
  assert.doesNotMatch(source, /slice\(0, 3\)/);
  assert.match(source, /selectedItems\.length\s*===\s*1/);
  assert.doesNotMatch(source, /multiSelectionHasUserSeller/);
});

test("cart allows mixed seller sources in one payment flow and links shoppers directly to checkout", () => {
  const cartSource = readApp(CART_CLIENT);
  const listingActionsSource = readApp(
    "src/features/ynot/MarketplaceListingActionsClient.tsx",
  );

  assert.match(cartSource, /Pay for all selected items/);
  assert.match(cartSource, /Shipping is quoted for each fulfilment source/);
  assert.match(listingActionsSource, /View cart & checkout/);
});

test("cart server page supplies complete addresses and payment instructions to checkout", () => {
  const source = readApp(CART_PAGE);
  assert.match(source, /getProfileAddresses/);
  assert.match(source, /isCompleteShippingAddress/);
  assert.match(source, /getMarketplacePaymentInstructions/);
  assert.match(source, /checkoutAddresses=/);
  assert.match(source, /paymentInstructions=/);
  assert.match(source, /checkoutEnabled=/);
});

test("cart uses the shared checkout state machine with listingIds", () => {
  const cartSource = readApp(CART_CLIENT);
  const flowSource = readApp(CHECKOUT_FLOW);
  assert.match(cartSource, /<CheckoutFlow/);
  assert.match(cartSource, /listings=/);
  assert.match(cartSource, /\/api\/marketplace\/checkout\/groups/);
  assert.match(cartSource, /\/api\/marketplace\/checkout\/official/);
  assert.match(cartSource, /\/api\/marketplace\/checkout\/user-seller/);
  assert.match(flowSource, /listingIds/);
  assert.match(flowSource, /checkoutListings\.map/);
  assert.match(flowSource, /pendingPaymentOrderId/);
  assert.match(flowSource, /buyerTotalSatang/);
});

test("group checkout route accepts only the guarded cart fields and calls the group service", () => {
  assert.ok(existsSync(path.join(appRoot, GROUP_ROUTE)), "missing canonical group route");
  assert.ok(existsSync(path.join(appRoot, GROUP_ROUTE_ALIAS)), "missing public group route alias");
  const source = readApp(GROUP_ROUTE);
  for (const field of ["listingIds", "shippingAddressId", "addressConfirmed"]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /allowedFields:\s*\[[^\]]*["']listingIds["']/s);
  assert.match(source, /createMultiListingCheckout/);
  assert.match(source, /assertMarketplacePaymentReceiverConfigured/);
  assert.match(source, /assertMarketplaceCheckoutAddress/);
});

test("orders service creates, releases, and submits proof atomically through group RPCs", () => {
  const source = readApp(ORDERS);
  assert.match(source, /export async function createMultiListingCheckout/);
  assert.match(
    source,
    /createMultiListingCheckout[\s\S]{0,900}if\s*\(marketplaceConfig\(\)\.mockData\)/,
  );
  assert.match(source, /marketplace_create_multi_listing_checkout/);
  assert.match(source, /marketplace_checkout_items/);
  assert.match(source, /marketplace_release_checkout_group/);
  assert.match(source, /marketplace_submit_checkout_payment_proof/);
  assert.match(source, /marketplace_checkout_groups/);
  assert.match(source, /marketplace_expire_checkout_groups/);
});

test("manual payment review dispatches a grouped official checkout atomically", () => {
  const source = readApp(OFFICIAL_SHOP);
  assert.match(source, /marketplace_checkout_items/);
  assert.match(source, /marketplace_record_checkout_payment_result/);
  assert.match(source, /p_checkout_group_id/);
  assert.match(source, /providerAmountSatang/);
});

test("admin proof lookup resolves every child order through its checkout group", () => {
  const source = readApp(ORDERS);
  assert.match(source, /export async function getMarketplaceOrderProofPath/);
  assert.match(source, /marketplace_checkout_items/);
  assert.match(source, /checkout_group_id/);
  assert.match(source, /proofQuery\.eq\("checkout_group_id", checkoutGroupId\)/);
});

test("grouped payment resume shows the aggregate checkout amount and fee breakdown", () => {
  const ordersSource = readApp(ORDERS);
  const detailSource = readApp(ORDER_DETAIL);

  for (const field of [
    "item_subtotal_satang",
    "shipping_fee_satang",
    "buyer_service_fee_satang",
    "buyer_total_satang",
  ]) {
    assert.match(ordersSource, new RegExp(field));
  }
  assert.match(
    ordersSource,
    /marketplace_checkout_groups[\s\S]{0,700}item_subtotal_satang[\s\S]{0,220}shipping_fee_satang[\s\S]{0,220}buyer_service_fee_satang/,
  );
  assert.ok(
    detailSource.indexOf("const pendingOrder") <
      detailSource.indexOf("const paymentProofOrder"),
    "the aggregate group must be loaded before the payment summary is built",
  );
  assert.match(detailSource, /pendingOrder\?\.checkout_group_id/);
  assert.match(detailSource, /pendingOrder\.item_subtotal_satang/);
  assert.match(detailSource, /pendingOrder\.shipping_fee_satang/);
  assert.match(detailSource, /pendingOrder\.buyer_service_fee_satang/);
  assert.match(detailSource, /pendingOrder\.buyer_total_satang/);
});

test("cart checkout does not split user-seller listings away from the selected group", () => {
  const source = readApp(CART_CLIENT);
  assert.doesNotMatch(source, /User-seller items still use individual checkout/);
  assert.match(source, /checkoutEndpoint="\/api\/marketplace\/checkout\/groups"/);
});

test("cart state notifications return void and run asynchronously", async () => {
  const { notifyCartStateChanged } = await loadNotifierModule();
  let called = false;

  const returned = notifyCartStateChanged(() => {
    called = true;
  });

  assert.equal(returned, undefined);
  assert.equal(called, false);
  await Promise.resolve();
  assert.equal(called, true);
});

test("cart state notifications isolate synchronous callback failures", async () => {
  const { notifyCartStateChanged } = await loadNotifierModule();
  let called = false;

  const { reasons, returned } = await captureUnhandledRejections(() =>
    notifyCartStateChanged(() => {
      called = true;
      throw new Error("sync refresh failure");
    }),
  );

  assert.equal(returned, undefined);
  assert.equal(called, true);
  assert.deepEqual(reasons, []);
});

test("cart state notifications isolate rejected callback promises", async () => {
  const { notifyCartStateChanged } = await loadNotifierModule();

  const { reasons, returned } = await captureUnhandledRejections(() =>
    notifyCartStateChanged(() => Promise.reject(new Error("async refresh failure"))),
  );

  assert.equal(returned, undefined);
  assert.deepEqual(reasons, []);
});

test("successful cart checkout transitions refresh the shared summary without duplicating mutations", () => {
  const flowSource = readApp(CHECKOUT_FLOW);
  const cartSource = readApp(CART_CLIENT);
  const createBody = functionBody(
    flowSource,
    "async function createPendingOrder()",
  );
  const releaseBody = functionBody(flowSource, "async function releaseOrder()");

  assert.match(
    flowSource,
    /onCartStateChanged\?:\s*\(\)\s*=>\s*void\s*\|\s*Promise<void>/,
  );
  assert.match(
    flowSource,
    /import\s*\{\s*notifyCartStateChanged\s*\}\s*from\s*"\.\/notify-cart-state-changed"/,
  );
  assert.match(
    cartSource,
    /const\s*\{[^}]*refreshCartSummary[^}]*\}\s*=\s*useMarketplaceCart\(\)/s,
  );
  assert.equal(
    cartSource.match(/onCartStateChanged=\{refreshCartSummary\}/g)?.length ?? 0,
    2,
  );

  assert.equal(createBody.match(/fetch\(checkoutEndpoint/g)?.length ?? 0, 1);
  assert.equal(
    createBody.match(/notifyCartStateChanged\(onCartStateChanged\)/g)?.length ?? 0,
    1,
  );
  const createParse = createBody.indexOf("const body = await parseJson(response);");
  const createSetOrder = createBody.indexOf("setOrder(body?.order ?? null);");
  const createSetPay = createBody.indexOf('setStep("pay");');
  const createNotify = createBody.indexOf(
    "notifyCartStateChanged(onCartStateChanged);",
  );
  const createCatch = createBody.indexOf("} catch");
  assert.ok(
    createParse >= 0 &&
      createParse < createSetOrder &&
      createSetOrder < createSetPay &&
      createSetPay < createNotify &&
      createNotify < createCatch,
  );
  assert.doesNotMatch(
    createBody.slice(createCatch),
    /notifyCartStateChanged\(/,
  );

  assert.equal(
    releaseBody.match(/notifyCartStateChanged\(onCartStateChanged\)/g)?.length ?? 0,
    1,
  );
  const releaseParse = releaseBody.indexOf("await parseJson(response);");
  const releaseNotify = releaseBody.indexOf(
    "notifyCartStateChanged(onCartStateChanged);",
  );
  const releaseToast = releaseBody.indexOf('toast("Order cancelled", "info");');
  const releaseClearOrder = releaseBody.indexOf("setOrder(null);");
  const releaseReview = releaseBody.indexOf('setStep("review");');
  const releaseCatch = releaseBody.indexOf("} catch");
  assert.ok(
    releaseParse >= 0 &&
      releaseParse < releaseNotify &&
      releaseNotify < releaseToast &&
      releaseToast < releaseClearOrder &&
      releaseClearOrder < releaseReview &&
      releaseReview < releaseCatch,
  );
  assert.doesNotMatch(
    releaseBody.slice(releaseCatch),
    /notifyCartStateChanged\(/,
  );
});
