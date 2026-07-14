import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutSnapshotContainsPaymentReceiver,
  marketplacePaymentReceiverSnapshot,
  marketplaceReceiverFromCheckoutSnapshot,
  selectMarketplaceReceiverRow,
  withMarketplacePaymentReceiverSnapshot,
} from "../src/lib/marketplace/payment-receiver.ts";
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
