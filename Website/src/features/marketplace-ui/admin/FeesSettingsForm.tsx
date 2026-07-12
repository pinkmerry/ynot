"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { MarketplaceMoneyPolicy } from "@/lib/marketplace/types";
import { MpBtn, MpPanel, MpSwitch } from "../shared/MpPrimitives";

/**
 * Fees & settings save form. POSTs to POST /api/marketplace/admin/money-policy
 * (src/app/api/ynot/marketplace/admin/money-policy/route.ts), the exact
 * same route <MarketplaceMoneyPolicyControls> (src/features/ynot/
 * MarketplaceMoneyPolicyControls.tsx) already uses from the overview page
 * -- this form is not a fork, it is a second, fuller-featured caller of the
 * same contract. allowedFields is exactly MONEY_POLICY_FIELDS =
 * ["sellerFeeBps", "buyerServiceFeeBps", "shippingFeeSatang",
 * "payoutHoldDays", "disputeWindowDays", "listingAutoLive",
 * "slipAutoVerify", "adminNote", "expectedPolicyId"].
 *
 * updateMarketplaceMoneyPolicy (money.ts) validates sellerFeeBps/
 * buyerServiceFeeBps/shippingFeeSatang with policyInteger, which has no
 * fallback and throws marketplace_*_invalid if the field is missing --
 * those three are therefore sent on every save, whether or not they
 * changed. expectedPolicyId rides along with them unconditionally too,
 * set to the policyId this form last rendered -- it is optimistic-
 * concurrency metadata about the load, not an editable value, so it is
 * never diffed. marketplace_admin_set_money_policy raises
 * "marketplace_money_policy_stale" (mapped to 409 in
 * supabase-adapter.ts) if the active policy has moved on since this form
 * loaded it (20260712110000_marketplace_money_policy_expected_state.sql)
 * -- guards against a stale tab silently clobbering another admin's
 * save. payoutHoldDays/disputeWindowDays (optionalPolicyInteger),
 * listingAutoLive/slipAutoVerify (optionalPolicyBoolean), and adminNote
 * (policyNote) all pass a missing value straight through as "leave this
 * field unchanged" -- those five are the ones actually diffed against the
 * loaded policy and only included in the POST body when the admin edited
 * them this save.
 *
 * Escrow release has no control on this screen -- it is not a configurable
 * money-policy field at all (escrow only ever releases via
 * marketplace_release_seller_payout after verification passes, see
 * PayoutActions.tsx), so it renders as a static "Always on" row instead of
 * a toggle wired to nothing real.
 *
 * No window.confirm here (unlike PayoutActions' money-moving actions) --
 * this is a policy-configuration save, not a single-record money
 * transaction, and the existing MarketplaceMoneyPolicyControls sibling
 * this form shares a contract with doesn't confirm its save either.
 */

function nextIdempotencyKey() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `marketplace:admin:money-policy:${suffix}`;
}

/**
 * Basis points -> percent input text, e.g. 1000 -> "10", 1050 -> "10.50".
 * Mirrors MarketplaceMoneyPolicyControls.tsx's bpsToPercent/percentToBps
 * exactly. Kept file-local rather than imported from that component --
 * same independence OrdersScreen.tsx documents for its own
 * paymentStateBadge: two independently-tested admin surfaces, not worth
 * coupling over a two-line pure conversion.
 */
function bpsToPercent(value: number) {
  return (value / 100).toFixed(2).replace(/\.00$/, "");
}

function percentToBps(value: string): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) return null;
  return Math.round(numberValue * 100);
}

/** Satang -> THB input text. Mirrors OrderActions.tsx's thbInputFor. */
function thbInputFor(satang: number) {
  return (satang / 100).toFixed(2).replace(/\.00$/, "");
}

/** THB input text -> whole satang, bounded to the RPC's shipping_fee max
 * (1,000,000 satang = 10,000 THB, see money.ts's policyInteger call). */
function thbInputToSatang(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000) return null;
  return Math.round(amount * 100);
}

function dayInteger(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function digitsOnly(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function decimalOnly(value: string) {
  return value.replace(/[^0-9.]/g, "");
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

interface SettingsRowProps {
  label: string;
  hint: string;
  children: ReactNode;
}

function SettingsRow({ label, hint, children }: SettingsRowProps) {
  return (
    <div className="mp-row mpa-settings-row">
      <div className="mp-stack" style={{ gap: 2, flex: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
        <span className="mp-small mp-mute">{hint}</span>
      </div>
      {children}
    </div>
  );
}

export interface FeesSettingsFormProps {
  policy: MarketplaceMoneyPolicy;
}

export function FeesSettingsForm({ policy }: FeesSettingsFormProps) {
  const router = useRouter();
  const [sellerFeePercent, setSellerFeePercent] = useState(bpsToPercent(policy.sellerFeeBps));
  const [buyerFeePercent, setBuyerFeePercent] = useState(bpsToPercent(policy.buyerServiceFeeBps));
  const [shippingThb, setShippingThb] = useState(thbInputFor(policy.shippingFeeSatang));
  const [payoutHoldDays, setPayoutHoldDays] = useState(String(policy.payoutHoldDays));
  const [disputeWindowDays, setDisputeWindowDays] = useState(String(policy.disputeWindowDays));
  const [listingAutoLive, setListingAutoLive] = useState(policy.listingAutoLive);
  const [slipAutoVerify, setSlipAutoVerify] = useState(policy.slipAutoVerify);
  const [adminNote, setAdminNote] = useState(policy.adminNote ?? "");
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  async function save() {
    setStatus({ kind: "idle" });

    const sellerFeeBps = percentToBps(sellerFeePercent);
    const buyerServiceFeeBps = percentToBps(buyerFeePercent);
    const shippingFeeSatang = thbInputToSatang(shippingThb);
    if (sellerFeeBps === null || buyerServiceFeeBps === null || shippingFeeSatang === null) {
      setStatus({ kind: "error", message: "Seller fee, buyer fee, and shipping fee must be valid." });
      return;
    }

    const payoutHold = dayInteger(payoutHoldDays, 0, 30);
    const disputeWindow = dayInteger(disputeWindowDays, 0, 14);
    if (payoutHold === null || disputeWindow === null) {
      setStatus({
        kind: "error",
        message: "Payout hold must be 0-30 days and dispute window 0-14 days.",
      });
      return;
    }

    // Changed-fields-only diff -- see the file doc comment for exactly
    // which fields the server treats as optional vs. required.
    const body: Record<string, unknown> = {
      sellerFeeBps,
      buyerServiceFeeBps,
      shippingFeeSatang,
      expectedPolicyId: policy.policyId,
    };
    if (payoutHold !== policy.payoutHoldDays) body.payoutHoldDays = payoutHold;
    if (disputeWindow !== policy.disputeWindowDays) body.disputeWindowDays = disputeWindow;
    if (listingAutoLive !== policy.listingAutoLive) body.listingAutoLive = listingAutoLive;
    if (slipAutoVerify !== policy.slipAutoVerify) body.slipAutoVerify = slipAutoVerify;
    if (adminNote.trim() !== (policy.adminNote ?? "").trim()) body.adminNote = adminNote.trim();

    setStatus({ kind: "busy" });
    try {
      const response = await fetch("/api/marketplace/admin/money-policy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": nextIdempotencyKey(),
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        if (response.status === 401) {
          setStatus({ kind: "error", message: "Login is required. Refresh and sign back in." });
          return;
        }
        setStatus({
          kind: "error",
          message: payload?.error ?? "That action could not be completed.",
        });
        return;
      }
      setStatus({ kind: "success", message: "Marketplace policy updated." });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  }

  const isSaving = status.kind === "busy";

  return (
    <MpPanel className="mp-stack">
      <SettingsRow
        label="Seller fee"
        hint="Percentage taken from every community sale. Official shop sales are not charged."
      >
        <div className="mp-row" style={{ gap: 7 }}>
          <input
            className="mp-input mpa-num-input"
            inputMode="decimal"
            aria-label="Seller fee percent"
            value={sellerFeePercent}
            onChange={(event) => setSellerFeePercent(decimalOnly(event.target.value))}
          />
          <span className="mp-mono" style={{ fontWeight: 700 }}>
            %
          </span>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Buyer service fee"
        hint="Percentage added to the buyer's total on every checkout, community and official."
      >
        <div className="mp-row" style={{ gap: 7 }}>
          <input
            className="mp-input mpa-num-input"
            inputMode="decimal"
            aria-label="Buyer service fee percent"
            value={buyerFeePercent}
            onChange={(event) => setBuyerFeePercent(decimalOnly(event.target.value))}
          />
          <span className="mp-mono" style={{ fontWeight: 700 }}>
            %
          </span>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Buyer shipping fee"
        hint="Charged when the buyer chooses home delivery instead of keeping the card in their bag."
      >
        <div className="mp-row" style={{ gap: 7 }}>
          <span className="mp-mono" style={{ fontWeight: 700 }}>
            ฿
          </span>
          <input
            className="mp-input mpa-num-input"
            inputMode="decimal"
            aria-label="Shipping fee in Thai baht"
            value={shippingThb}
            onChange={(event) => setShippingThb(decimalOnly(event.target.value))}
          />
        </div>
      </SettingsRow>

      <SettingsRow
        label="Payout hold"
        hint="Payout releases when the buyer confirms receipt, or automatically this many days after shipping."
      >
        <div className="mp-row" style={{ gap: 7 }}>
          <input
            className="mp-input mpa-num-input"
            inputMode="numeric"
            aria-label="Payout hold days"
            value={payoutHoldDays}
            onChange={(event) => setPayoutHoldDays(digitsOnly(event.target.value))}
          />
          <span className="mp-mono" style={{ fontWeight: 700 }}>
            days
          </span>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Dispute window"
        hint="How long after delivery a buyer can open a dispute. Payout is frozen while a dispute is open."
      >
        <div className="mp-row" style={{ gap: 7 }}>
          <input
            className="mp-input mpa-num-input"
            inputMode="numeric"
            aria-label="Dispute window days"
            value={disputeWindowDays}
            onChange={(event) => setDisputeWindowDays(digitsOnly(event.target.value))}
          />
          <span className="mp-mono" style={{ fontWeight: 700 }}>
            days
          </span>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Listings go live automatically"
        hint="Off = every new community listing waits for admin approval first."
      >
        <MpSwitch
          checked={listingAutoLive}
          onChange={setListingAutoLive}
          ariaLabel="Listings go live automatically"
        />
      </SettingsRow>

      <SettingsRow
        label="Slip2GO verification"
        hint="Automatic payment-slip checking. Off = every slip goes to manual review."
      >
        <MpSwitch
          checked={slipAutoVerify}
          onChange={setSlipAutoVerify}
          ariaLabel="Slip2GO automatic verification"
        />
      </SettingsRow>

      <SettingsRow
        label="Escrow release"
        hint="Money moves to the seller payout queue only after vault verification passes. This cannot be disabled."
      >
        <span className="mp-badge mp-badge-official">Always on</span>
      </SettingsRow>

      <div className="mp-stack" style={{ gap: 8, paddingTop: 14 }}>
        <label className="mp-stack" style={{ gap: 6 }}>
          <span className="mp-small mp-mute" style={{ fontWeight: 700 }}>
            Admin note
          </span>
          <textarea
            className="mp-textarea"
            rows={2}
            maxLength={1000}
            placeholder="Note for the record (optional)"
            aria-label="Admin note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
        </label>

        <div className="mp-row" style={{ gap: 12 }}>
          <span className="mp-small mp-mute">
            Policy {policy.policyId ? policy.policyId.slice(0, 8) : "fallback"}
          </span>
          <span className="mp-spacer" />
          <MpBtn variant="primary" onClick={save} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </MpBtn>
        </div>

        {status.kind === "error" ? (
          <p className="mp-alert mp-alert-rose mp-small">{status.message}</p>
        ) : null}
        {status.kind === "success" ? (
          <p className="mp-alert mp-alert-green mp-small">{status.message}</p>
        ) : null}
      </div>
    </MpPanel>
  );
}
