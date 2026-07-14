import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutSnapshotContainsPaymentReceiver,
  marketplacePaymentReceiverSnapshot,
  marketplaceReceiverFromBridgePayload,
  marketplaceReceiverFromCheckoutSnapshot,
  selectMarketplaceReceiverRow,
  withMarketplacePaymentReceiverSnapshot,
} from "../src/lib/marketplace/payment-receiver.ts";
import {
  buildMarketplacePaymentReceiverBridgeConfig,
  MARKETPLACE_AUTH_BRIDGE_HEADER,
  MARKETPLACE_PAYMENT_RECEIVER_BRIDGE_PATH,
} from "../src/lib/auth/marketplace-bridge-config.ts";
import {
  fetchMarketplaceReceiverViaBridge,
  resolveMarketplaceReceiverForRuntime,
} from "../src/lib/marketplace/payment-receiver-bridge.ts";
import { hasSlip2GoReceiverCheck } from "../src/lib/slip2go/client.ts";

const canonical = {
  code: "bank-transfer",
  bank_name: "Kasikornbank",
  account_name: "YNOT",
  account_number: "123-4-56789-0",
  promptpay_id: "0812345678",
};

test("canonical bank-transfer wins even when legacy main-transfer sorts first", () => {
  const legacy = { ...canonical, code: "main-transfer" };
  assert.equal(selectMarketplaceReceiverRow([legacy, canonical]), canonical);
});

test("receiver selection falls back deterministically without a canonical row", () => {
  const legacy = { ...canonical, code: "main-transfer" };
  const alternate = { ...canonical, code: "alternate-transfer" };
  assert.equal(selectMarketplaceReceiverRow([legacy, alternate]), alternate);
  assert.equal(selectMarketplaceReceiverRow([legacy]), legacy);
  assert.equal(selectMarketplaceReceiverRow([]), null);
});

test("internal bridge payloads expose only normalized receiver fields", () => {
  assert.deepEqual(
    marketplaceReceiverFromBridgePayload({
      ok: true,
      receiver: {
        bankName: "  Kasikornbank  ",
        accountName: "  YNOT  ",
        accountNumber: "  123-4-56789-0  ",
        promptPayId: "  0812345678  ",
        ignored: "must not cross the boundary",
      },
    }),
    {
      bankName: "Kasikornbank",
      accountName: "YNOT",
      accountNumber: "123-4-56789-0",
      promptPayId: "0812345678",
    },
  );
  assert.equal(
    marketplaceReceiverFromBridgePayload({ ok: false, receiver: canonical }),
    null,
  );
  assert.equal(
    marketplaceReceiverFromBridgePayload({ ok: true, receiver: null }),
    null,
  );
});

test("receiver bridge config allows only the canonical production origin and local development", () => {
  const secret = "test-bridge-secret";
  assert.deepEqual(
    buildMarketplacePaymentReceiverBridgeConfig({
      rawUrl: "https://www.ynotopen.com/api/internal/marketplace/session?old=1",
      secret,
      nodeEnv: "production",
    }),
    {
      url: `https://www.ynotopen.com${MARKETPLACE_PAYMENT_RECEIVER_BRIDGE_PATH}`,
      secret,
    },
  );
  assert.equal(
    buildMarketplacePaymentReceiverBridgeConfig({
      rawUrl: "https://attacker.example/api/internal/marketplace/session",
      secret,
      nodeEnv: "production",
    }),
    null,
  );
  assert.equal(
    buildMarketplacePaymentReceiverBridgeConfig({
      rawUrl: "https://user:password@www.ynotopen.com/api/internal/marketplace/session",
      secret,
      nodeEnv: "production",
    }),
    null,
  );
  assert.deepEqual(
    buildMarketplacePaymentReceiverBridgeConfig({
      rawUrl: "http://localhost:8787/api/internal/marketplace/session",
      secret,
      nodeEnv: "development",
    }),
    {
      url: `http://localhost:8787${MARKETPLACE_PAYMENT_RECEIVER_BRIDGE_PATH}`,
      secret,
    },
  );
  assert.equal(
    buildMarketplacePaymentReceiverBridgeConfig({
      rawUrl: "https://preview.example/api/internal/marketplace/session",
      secret,
      nodeEnv: "development",
    }),
    null,
  );
});

test("receiver bridge fetch is no-store, non-redirecting, authenticated, and normalized", async () => {
  const config = {
    url: `https://www.ynotopen.com${MARKETPLACE_PAYMENT_RECEIVER_BRIDGE_PATH}`,
    secret: "test-bridge-secret",
  };
  let observedUrl;
  let observedInit;
  const receiver = await fetchMarketplaceReceiverViaBridge(
    config,
    async (url, init) => {
      observedUrl = url;
      observedInit = init;
      return Response.json({
        ok: true,
        receiver: {
          bankName: " Kasikornbank ",
          accountName: " YNOT ",
          accountNumber: " 123-4-56789-0 ",
          promptPayId: null,
        },
      });
    },
  );

  assert.equal(observedUrl, config.url);
  assert.equal(observedInit.method, "GET");
  assert.equal(observedInit.cache, "no-store");
  assert.equal(observedInit.redirect, "manual");
  assert.equal(
    observedInit.headers[MARKETPLACE_AUTH_BRIDGE_HEADER],
    config.secret,
  );
  assert.deepEqual(receiver, {
    bankName: "Kasikornbank",
    accountName: "YNOT",
    accountNumber: "123-4-56789-0",
    promptPayId: null,
  });
});

test("runtime receiver selection never recurses into core from Marketplace and falls back safely", async () => {
  const fallback = {
    bankName: "Fallback bank",
    accountName: "Fallback account",
    accountNumber: "9999999999",
    promptPayId: null,
  };
  let coreCalls = 0;
  let bridgeCalls = 0;
  const marketplaceReceiver = await resolveMarketplaceReceiverForRuntime({
    marketplaceRuntime: true,
    loadBridgeReceiver: async () => {
      bridgeCalls += 1;
      return null;
    },
    loadCoreReceiver: async () => {
      coreCalls += 1;
      return canonical;
    },
    fallbackReceiver: () => fallback,
  });
  assert.deepEqual(marketplaceReceiver, fallback);
  assert.equal(bridgeCalls, 1);
  assert.equal(coreCalls, 0);

  const coreReceiver = await resolveMarketplaceReceiverForRuntime({
    marketplaceRuntime: false,
    loadBridgeReceiver: async () => {
      throw new Error("website runtime must not call the Marketplace bridge");
    },
    loadCoreReceiver: async () => {
      coreCalls += 1;
      return canonical;
    },
    fallbackReceiver: () => fallback,
  });
  assert.equal(coreReceiver, canonical);
  assert.equal(coreCalls, 1);
});

test("malformed, non-200, and thrown bridge responses use the explicit fallback", async () => {
  const config = {
    url: `https://www.ynotopen.com${MARKETPLACE_PAYMENT_RECEIVER_BRIDGE_PATH}`,
    secret: "test-bridge-secret",
  };
  const fallback = {
    bankName: null,
    accountName: null,
    accountNumber: null,
    promptPayId: null,
  };
  const responses = [
    async () => Response.json({ ok: true, receiver: null }),
    async () => Response.json({ ok: false }, { status: 503 }),
    async () => {
      throw new Error("network unavailable");
    },
  ];

  for (const fetchImpl of responses) {
    const receiver = await resolveMarketplaceReceiverForRuntime({
      marketplaceRuntime: true,
      loadBridgeReceiver: () =>
        fetchMarketplaceReceiverViaBridge(config, fetchImpl),
      loadCoreReceiver: async () => {
        throw new Error("must not recurse into core");
      },
      fallbackReceiver: () => fallback,
    });
    assert.deepEqual(receiver, fallback);
  }
});

test("checkout snapshot preserves one immutable receiver for UI resume and proof", () => {
  const instructions = {
    method: "bank_transfer",
    currency: "THB",
    bankName: canonical.bank_name,
    accountName: canonical.account_name,
    accountNumber: canonical.account_number,
    promptPayId: canonical.promptpay_id,
    paymentWindowMinutes: 30,
    receiverConfigured: true,
    acceptedImageTypes: ["JPG", "PNG", "WEBP"],
  };
  const snapshot = withMarketplacePaymentReceiverSnapshot(
    { recipientName: "Buyer", province: "Bangkok" },
    instructions,
  );

  assert.equal(snapshot.recipientName, "Buyer");
  assert.deepEqual(
    marketplaceReceiverFromCheckoutSnapshot(snapshot),
    marketplacePaymentReceiverSnapshot(instructions),
  );
  assert.equal(
    marketplaceReceiverFromCheckoutSnapshot({
      ...snapshot,
      paymentReceiver: { ...snapshot.paymentReceiver, version: 2 },
    }),
    null,
  );
  assert.equal(checkoutSnapshotContainsPaymentReceiver(snapshot), true);
  assert.equal(
    checkoutSnapshotContainsPaymentReceiver({ recipientName: "Legacy buyer" }),
    false,
  );
});

test("Slip2Go readiness rejects malformed receivers before stock reservation", () => {
  const previousBankType = process.env.SLIP2GO_BANK_ACCOUNT_TYPE;
  const previousBankMap = process.env.SLIP2GO_BANK_ACCOUNT_TYPES_JSON;
  delete process.env.SLIP2GO_BANK_ACCOUNT_TYPE;
  delete process.env.SLIP2GO_BANK_ACCOUNT_TYPES_JSON;

  try {
    assert.equal(
      hasSlip2GoReceiverCheck({ promptPayId: "081-234-5678" }),
      true,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({ promptPayId: "12345" }),
      false,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({
        bankName: "Kasikornbank",
        bankAccountNumber: "123-4-56789-0",
        bankAccountName: "YNOT",
      }),
      true,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({
        bankName: "Unknown bank",
        bankAccountNumber: "123-4-56789-0",
        bankAccountName: "YNOT",
      }),
      false,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({
        bankName: "Kasikornbank",
        bankAccountNumber: "1",
        bankAccountName: "YNOT",
      }),
      false,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({
        bankName: "Kasikornbank",
        bankAccountNumber: "000-0-00000-0",
        bankAccountName: "YNOT",
      }),
      false,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({ bankName: "Kasikornbank" }),
      false,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({
        promptPayId: "081-234-5678",
        bankName: "Unknown bank",
        bankAccountNumber: "123-4-56789-0",
        bankAccountName: "YNOT",
      }),
      false,
    );
    assert.equal(
      hasSlip2GoReceiverCheck({
        promptPayId: "12345",
        bankName: "Kasikornbank",
        bankAccountNumber: "123-4-56789-0",
        bankAccountName: "YNOT",
      }),
      false,
    );
  } finally {
    if (previousBankType === undefined) {
      delete process.env.SLIP2GO_BANK_ACCOUNT_TYPE;
    } else {
      process.env.SLIP2GO_BANK_ACCOUNT_TYPE = previousBankType;
    }
    if (previousBankMap === undefined) {
      delete process.env.SLIP2GO_BANK_ACCOUNT_TYPES_JSON;
    } else {
      process.env.SLIP2GO_BANK_ACCOUNT_TYPES_JSON = previousBankMap;
    }
  }
});
