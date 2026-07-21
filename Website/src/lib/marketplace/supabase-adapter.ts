import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  marketplaceConfig,
  type MarketplaceUnavailableReason,
} from "./config";

export class MarketplaceServiceError extends Error {
  code: string;
  status: number;
  internalMessage: string | null;

  constructor(
    code: string,
    message: string,
    status = 500,
    internalMessage?: string | null,
  ) {
    super(message);
    this.name = "MarketplaceServiceError";
    this.code = code;
    this.status = status;
    this.internalMessage = internalMessage ?? null;
  }
}

export class MarketplaceUnavailableError extends MarketplaceServiceError {
  reason: MarketplaceUnavailableReason;

  constructor(reason: MarketplaceUnavailableReason) {
    super(reason, marketplaceUnavailableMessage(reason), 503);
    this.name = "MarketplaceUnavailableError";
    this.reason = reason;
  }
}

function marketplaceUnavailableMessage(reason: MarketplaceUnavailableReason) {
  switch (reason) {
    case "marketplace_disabled":
      return "Marketplace is not enabled.";
    case "marketplace_supabase_url_missing":
      return "Marketplace Supabase URL is not configured.";
    case "marketplace_environment_missing":
      return "Marketplace environment is not configured.";
    case "marketplace_environment_invalid":
      return "Marketplace environment is invalid.";
    case "marketplace_supabase_project_ref_missing":
      return "Marketplace Supabase project ref is not configured.";
    case "marketplace_expected_supabase_project_ref_missing":
      return "Marketplace expected Supabase project ref is not configured.";
    case "marketplace_supabase_project_ref_mismatch":
      return "Marketplace Supabase project ref does not match this environment.";
    case "marketplace_supabase_environment_mismatch":
      return "Marketplace Supabase URL does not match this environment.";
    case "marketplace_supabase_service_role_missing":
      return "Marketplace Supabase service role key is not configured.";
  }
}

export function createMarketplaceSupabaseClient() {
  const config = marketplaceConfig();
  if (config.unavailableReason) {
    throw new MarketplaceUnavailableError(config.unavailableReason);
  }

  const serviceRoleKey = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
  if (!config.supabaseUrl || !serviceRoleKey) {
    throw new MarketplaceUnavailableError(
      !config.supabaseUrl
        ? "marketplace_supabase_url_missing"
        : "marketplace_supabase_service_role_missing",
    );
  }

  return createClient(config.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const SAFE_RPC_ERRORS: Record<string, { message: string; status: number }> = {
  marketplace_account_not_found: {
    message: "Marketplace account was not found.",
    status: 404,
  },
  marketplace_account_required: {
    message: "Marketplace account is required.",
    status: 400,
  },
  marketplace_admin_required: {
    message: "Marketplace admin access is required.",
    status: 403,
  },
  marketplace_admin_note_required: {
    message: "Marketplace admin note is required.",
    status: 400,
  },
  marketplace_admin_note_invalid: {
    message: "Marketplace admin note is invalid.",
    status: 400,
  },
  marketplace_alert_not_active: {
    message: "Marketplace product alert is not active.",
    status: 409,
  },
  marketplace_alert_product_missing: {
    message: "Marketplace product was not found.",
    status: 404,
  },
  marketplace_auth_source_invalid: {
    message: "Marketplace account request is invalid.",
    status: 400,
  },
  marketplace_dispute_already_open: {
    message: "A dispute is already open for this order.",
    status: 409,
  },
  marketplace_dispute_not_deliverable: {
    message: "Marketplace order is not eligible for a dispute.",
    status: 409,
  },
  marketplace_dispute_reason_invalid: {
    message: "Marketplace dispute reason is invalid.",
    status: 400,
  },
  marketplace_dispute_window_closed: {
    message: "Marketplace dispute window has closed for this order.",
    status: 422,
  },
  marketplace_idempotency_conflict: {
    message: "Idempotency key was already used for a different request.",
    status: 409,
  },
  marketplace_idempotency_key_invalid: {
    message: "A valid idempotency key is required.",
    status: 400,
  },
  marketplace_idempotency_key_required: {
    message: "A valid idempotency key is required.",
    status: 400,
  },
  marketplace_evidence_required: {
    message: "Marketplace evidence is required.",
    status: 422,
  },
  marketplace_inventory_not_found: {
    message: "Marketplace inventory was not found.",
    status: 404,
  },
  marketplace_inventory_not_publishable: {
    message: "Marketplace inventory is not ready to publish.",
    status: 409,
  },
  marketplace_inventory_state_invalid: {
    message: "Marketplace inventory state does not allow this action.",
    status: 409,
  },
  marketplace_item_type_invalid: {
    message: "Official shop supports cards, sealed boxes, and sealed packs.",
    status: 400,
  },
  marketplace_listing_not_available: {
    message: "Marketplace listing is not available.",
    status: 409,
  },
  marketplace_listing_not_found: {
    message: "Marketplace listing was not found.",
    status: 404,
  },
  marketplace_listing_not_reportable: {
    message: "Marketplace listing is not reportable.",
    status: 409,
  },
  marketplace_listing_state_invalid: {
    message: "Marketplace listing state does not allow this action.",
    status: 409,
  },
  marketplace_login_required: {
    message: "Login is required.",
    status: 401,
  },
  marketplace_official_stock_only: {
    message: "Official shop inventory must use official stock.",
    status: 422,
  },
  marketplace_official_active_order_exists: {
    message: "Official inventory has an active order and cannot be changed.",
    status: 409,
  },
  marketplace_official_active_pending_order_exists: {
    message: "Official inventory has an active pending payment order and cannot be changed.",
    status: 409,
  },
  marketplace_order_not_found: {
    message: "Marketplace order was not found.",
    status: 404,
  },
  marketplace_order_not_paid: {
    message: "Marketplace order must be paid before fulfilment.",
    status: 409,
  },
  marketplace_payment_amount_mismatch: {
    message: "Marketplace payment amount does not match the order total.",
    status: 409,
  },
  marketplace_payment_duplicate: {
    message: "This payment proof was already used.",
    status: 409,
  },
  marketplace_payment_evidence_required: {
    message: "Marketplace payment evidence is required.",
    status: 422,
  },
  marketplace_payment_proof_invalid: {
    message: "Payment proof is invalid.",
    status: 400,
  },
  marketplace_payment_proof_required: {
    message: "Payment proof is required.",
    status: 400,
  },
  marketplace_payment_result_invalid: {
    message: "Marketplace payment result is invalid.",
    status: 400,
  },
  marketplace_payment_state_invalid: {
    message: "Marketplace payment state does not allow this action.",
    status: 409,
  },
  marketplace_payment_status_invalid: {
    message: "Marketplace payment status is invalid.",
    status: 400,
  },
  marketplace_buyer_service_fee_invalid: {
    message: "Marketplace buyer service fee is invalid.",
    status: 400,
  },
  marketplace_provider_event_id_required: {
    message: "Marketplace provider event id is required.",
    status: 400,
  },
  marketplace_provider_event_payload_conflict: {
    message: "Marketplace provider event payload conflicts with a previous event.",
    status: 409,
  },
  marketplace_provider_invalid: {
    message: "Marketplace payment provider is invalid.",
    status: 400,
  },
  marketplace_provider_amount_invalid: {
    message: "Marketplace provider payment amount is invalid.",
    status: 400,
  },
  marketplace_provider_currency_invalid: {
    message: "Marketplace provider payment currency is invalid.",
    status: 400,
  },
  marketplace_provider_payload_hash_invalid: {
    message: "Marketplace provider payload hash is invalid.",
    status: 400,
  },
  marketplace_pending_order_expired: {
    message: "Marketplace pending order expired.",
    status: 409,
  },
  marketplace_pending_order_not_found: {
    message: "Marketplace pending order was not found.",
    status: 404,
  },
  marketplace_payout_not_eligible: {
    message: "Marketplace seller payout is blocked by payment, refund, or reconciliation state.",
    status: 409,
  },
  marketplace_payout_not_found: {
    message: "Marketplace seller payout was not found.",
    status: 404,
  },
  marketplace_profile_not_active: {
    message: "Marketplace profile is not active.",
    status: 403,
  },
  marketplace_proof_missing: {
    message: "No payment proof on file.",
    status: 404,
  },
  marketplace_proof_url_failed: {
    message: "Could not create proof link.",
    status: 500,
  },
  marketplace_release_reason_invalid: {
    message: "Marketplace release reason is invalid.",
    status: 400,
  },
  marketplace_report_not_open: {
    message: "Marketplace listing report is not open.",
    status: 409,
  },
  marketplace_report_resolution_invalid: {
    message: "Marketplace report resolution is invalid.",
    status: 400,
  },
  marketplace_request_hash_invalid: {
    message: "Marketplace request hash is invalid.",
    status: 400,
  },
  marketplace_request_hash_required: {
    message: "Marketplace request hash is required.",
    status: 400,
  },
  marketplace_reconciliation_action_invalid: {
    message: "Marketplace reconciliation action is invalid.",
    status: 400,
  },
  marketplace_reconciliation_not_found: {
    message: "Marketplace reconciliation item was not found.",
    status: 404,
  },
  marketplace_seller_fee_invalid: {
    message: "Marketplace seller fee is invalid.",
    status: 400,
  },
  marketplace_shipping_fee_invalid: {
    message: "Marketplace shipping fee is invalid.",
    status: 400,
  },
  marketplace_money_policy_stale: {
    message: "Money policy changed since you loaded it. Refresh and review again.",
    status: 409,
  },
  marketplace_shipping_snapshot_invalid: {
    message: "Marketplace shipping address snapshot is invalid.",
    status: 400,
  },
  marketplace_refund_amount_invalid: {
    message: "Marketplace refund amount is invalid.",
    status: 400,
  },
  marketplace_refund_not_found: {
    message: "Marketplace refund request was not found.",
    status: 404,
  },
  marketplace_refund_state_invalid: {
    message: "Marketplace refund state is invalid.",
    status: 400,
  },
  marketplace_refund_state_stale: {
    message: "This dispute changed since you loaded it. Refresh and review again.",
    status: 409,
  },
  marketplace_version_conflict: {
    message: "Marketplace record changed. Refresh and try again.",
    status: 409,
  },
  marketplace_seller_terms_version_required: {
    message: "Seller terms version is required.",
    status: 400,
  },
  marketplace_seller_terms_required: {
    message: "Seller terms must be accepted before submitting items.",
    status: 403,
  },
  marketplace_seller_submission_not_editable: {
    message: "This seller submission is already in the intake workflow and cannot be edited.",
    status: 409,
  },
  marketplace_seller_submission_not_found: {
    message: "Marketplace seller submission was not found.",
    status: 404,
  },
  marketplace_seller_item_type_invalid: {
    message: "Marketplace seller submissions support cards, sealed boxes, and sealed packs.",
    status: 400,
  },
  marketplace_seller_source_forbidden: {
    message: "Marketplace seller submissions must use physical intake, not gacha or customer-bag rewards.",
    status: 422,
  },
  marketplace_title_required: {
    message: "Marketplace title is required.",
    status: 400,
  },
  marketplace_condition_required: {
    message: "Marketplace condition is required.",
    status: 400,
  },
  marketplace_price_invalid: {
    message: "Marketplace price is invalid.",
    status: 400,
  },
  marketplace_photo_urls_invalid: {
    message: "Marketplace product photos are invalid.",
    status: 400,
  },
  marketplace_quantity_invalid: {
    message: "Marketplace quantity is invalid.",
    status: 400,
  },
  marketplace_fee_invalid: {
    message: "Marketplace fee is invalid.",
    status: 400,
  },
  ynot_profile_required: {
    message: "Login is required.",
    status: 401,
  },
};

export function marketplaceRpcError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return new MarketplaceServiceError(
    "marketplace_request_failed",
    "Marketplace request failed.",
  );

  const message = error.message ?? "Marketplace request failed.";
  const code = message
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const supabaseCode = error.code ?? "";
  const safeCode = SAFE_RPC_ERRORS[code]
    ? code
    : SAFE_RPC_ERRORS[supabaseCode]
      ? supabaseCode
      : null;
  const safe = safeCode ? SAFE_RPC_ERRORS[safeCode] : null;

  return new MarketplaceServiceError(
    safeCode ?? "marketplace_request_failed",
    safe?.message ?? "Marketplace request failed.",
    safe?.status ?? 500,
    message,
  );
}
