import "server-only";

import type {
  ResolvedAdminSession,
  ResolvedProfileSession,
} from "@/lib/auth/resolve-current-profile";
import { marketplaceConfig } from "./config";
import {
  createMarketplaceSupabaseClient,
  marketplaceRpcError,
  MarketplaceServiceError,
} from "./supabase-adapter";

type MarketplaceAccountCapabilities = {
  canBrowse: boolean;
  canCheckout: boolean;
  canSell: boolean;
  canAcceptSellerTerms: boolean;
  canReceivePayout: boolean;
  isMarketplaceOperator: boolean;
  isMarketplaceOwner: boolean;
};

export type SafeMarketplaceAccount = {
  accountId: string;
  buyerStatus: string;
  sellerStatus: string;
  payoutStatus: string;
  sellerTermsVersion: string | null;
  sellerTermsAcceptedAt: string | null;
  buyerTermsVersion: string | null;
  buyerTermsAcceptedAt: string | null;
  lastProfileVerifiedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  capabilities: MarketplaceAccountCapabilities;
};

type MarketplaceAccountRow = {
  id: string;
  buyer_status: string;
  seller_status: string;
  payout_status: string;
  seller_terms_version: string | null;
  seller_terms_accepted_at: string | null;
  buyer_terms_version: string | null;
  buyer_terms_accepted_at: string | null;
  last_profile_verified_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function accountCapabilities(
  account: {
    buyerStatus: string;
    sellerStatus: string;
    payoutStatus: string;
  },
  admin?: ResolvedAdminSession | null,
): MarketplaceAccountCapabilities {
  return {
    canBrowse: true,
    canCheckout: account.buyerStatus === "active",
    canSell: account.sellerStatus === "active",
    canAcceptSellerTerms:
      account.sellerStatus === "none" ||
      account.sellerStatus === "pending_terms",
    canReceivePayout: account.payoutStatus === "verified",
    isMarketplaceOperator: Boolean(admin?.adminRole),
    isMarketplaceOwner: admin?.adminRole === "owner",
  };
}

function normalizeRpcAccount(
  data: unknown,
  admin?: ResolvedAdminSession | null,
): SafeMarketplaceAccount {
  if (!isRecord(data) || typeof data.id !== "string") {
    throw new MarketplaceServiceError(
      "marketplace_account_response_invalid",
      "Marketplace account response was invalid.",
      502,
    );
  }

  const buyerStatus = textOrNull(data.buyerStatus) ?? "blocked";
  const sellerStatus = textOrNull(data.sellerStatus) ?? "none";
  const payoutStatus = textOrNull(data.payoutStatus) ?? "not_started";

  return {
    accountId: data.id,
    buyerStatus,
    sellerStatus,
    payoutStatus,
    sellerTermsVersion: textOrNull(data.sellerTermsVersion),
    sellerTermsAcceptedAt: textOrNull(data.sellerTermsAcceptedAt),
    buyerTermsVersion: textOrNull(data.buyerTermsVersion),
    buyerTermsAcceptedAt: textOrNull(data.buyerTermsAcceptedAt),
    lastProfileVerifiedAt: textOrNull(data.lastProfileVerifiedAt),
    lastSeenAt: textOrNull(data.lastSeenAt),
    createdAt: textOrNull(data.createdAt),
    updatedAt: textOrNull(data.updatedAt),
    capabilities: accountCapabilities(
      { buyerStatus, sellerStatus, payoutStatus },
      admin,
    ),
  };
}

function normalizeRowAccount(
  row: MarketplaceAccountRow,
  admin?: ResolvedAdminSession | null,
): SafeMarketplaceAccount {
  return {
    accountId: row.id,
    buyerStatus: row.buyer_status,
    sellerStatus: row.seller_status,
    payoutStatus: row.payout_status,
    sellerTermsVersion: row.seller_terms_version,
    sellerTermsAcceptedAt: row.seller_terms_accepted_at,
    buyerTermsVersion: row.buyer_terms_version,
    buyerTermsAcceptedAt: row.buyer_terms_accepted_at,
    lastProfileVerifiedAt: row.last_profile_verified_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    capabilities: accountCapabilities(
      {
        buyerStatus: row.buyer_status,
        sellerStatus: row.seller_status,
        payoutStatus: row.payout_status,
      },
      admin,
    ),
  };
}

export function safeMarketplaceAccountResponse(
  account: SafeMarketplaceAccount | null,
  admin?: ResolvedAdminSession | null,
) {
  if (!account) {
    return {
      account: null,
      capabilities: {
        canBrowse: true,
        canCheckout: false,
        canSell: false,
        canAcceptSellerTerms: false,
        canReceivePayout: false,
        isMarketplaceOperator: Boolean(admin?.adminRole),
        isMarketplaceOwner: admin?.adminRole === "owner",
      } satisfies MarketplaceAccountCapabilities,
    };
  }

  return {
    account: {
      ...account,
      capabilities: accountCapabilities(account, admin),
    },
  };
}

export function getMockMarketplaceAccount(admin?: ResolvedAdminSession | null) {
  const now = new Date().toISOString();
  return normalizeRpcAccount(
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      buyerStatus: "active",
      sellerStatus: "active",
      payoutStatus: "verified",
      sellerTermsVersion: "seller-terms-v1",
      sellerTermsAcceptedAt: now,
      buyerTermsVersion: "buyer-terms-v1",
      buyerTermsAcceptedAt: now,
      lastProfileVerifiedAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    admin,
  );
}

export async function getMarketplaceAccountForProfile(
  profile: ResolvedProfileSession,
  admin?: ResolvedAdminSession | null,
) {
  if (marketplaceConfig().mockData) {
    return getMockMarketplaceAccount(admin);
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase
    .from("marketplace_accounts")
    .select(
      [
        "id",
        "buyer_status",
        "seller_status",
        "payout_status",
        "seller_terms_version",
        "seller_terms_accepted_at",
        "buyer_terms_version",
        "buyer_terms_accepted_at",
        "last_profile_verified_at",
        "last_seen_at",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("ynot_profile_id", profile.profileId)
    .maybeSingle()) as {
    data: MarketplaceAccountRow | null;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return result.data ? normalizeRowAccount(result.data, admin) : null;
}

export async function ensureMarketplaceAccountForProfile(
  profile: ResolvedProfileSession,
  options: {
    admin?: ResolvedAdminSession | null;
    actorProfileId?: string | null;
    requestId?: string | null;
    idempotencyKey: string;
    requestHash: string;
  },
) {
  if (marketplaceConfig().mockData) {
    return getMockMarketplaceAccount(options.admin);
  }

  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_get_or_create_account", {
    p_ynot_profile_id: profile.profileId,
    p_display_name: profile.displayName ?? null,
    p_avatar_url: null,
    p_auth_source: profile.authSource,
    p_profile_status: "active",
    p_request_id: options.requestId ?? null,
    p_actor_ynot_profile_id:
      options.actorProfileId ?? options.admin?.profileId ?? profile.profileId,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeRpcAccount(result.data, options.admin);
}

export async function acceptMarketplaceSellerTerms(
  profile: ResolvedProfileSession,
  account: SafeMarketplaceAccount,
  options: {
    requestId?: string | null;
    admin?: ResolvedAdminSession | null;
    idempotencyKey: string;
    requestHash: string;
  },
) {
  const config = marketplaceConfig();
  const supabase = createMarketplaceSupabaseClient();
  const result = (await supabase.rpc("marketplace_accept_seller_terms", {
    p_marketplace_account_id: account.accountId,
    p_ynot_profile_id: profile.profileId,
    p_terms_version: config.sellerTermsVersion,
    p_request_id: options.requestId ?? null,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
  })) as {
    data: unknown;
    error: { message?: string; code?: string } | null;
  };

  if (result.error) throw marketplaceRpcError(result.error);
  return normalizeRpcAccount(result.data, options?.admin);
}
