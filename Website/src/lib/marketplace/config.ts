import "server-only";

export const MARKETPLACE_SUPABASE_SERVICE_ROLE_ENV =
  "MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY" as const;

export type MarketplaceConfig = {
  enabled: boolean;
  ownerOnly: boolean;
  actions: MarketplaceActionFlags;
  environment: MarketplaceEnvironment | null;
  supabaseUrl: string | null;
  supabaseUrlProjectRef: string | null;
  supabaseProjectRef: string | null;
  expectedSupabaseProjectRef: string | null;
  serviceRoleKeyConfigured: boolean;
  mockData: boolean;
  sellerTermsVersion: string;
  buyerTermsVersion: string;
  defaultCurrency: "THB";
  unavailableReason: MarketplaceUnavailableReason | null;
};

export type MarketplaceAction =
  | "publicNav"
  | "browse"
  | "checkout"
  | "sellerSubmission"
  | "listingActivation"
  | "paymentProof"
  | "payoutRelease";

export type MarketplaceActionFlags = Record<MarketplaceAction, boolean>;

export type MarketplaceUnavailableReason =
  | "marketplace_disabled"
  | "marketplace_environment_missing"
  | "marketplace_environment_invalid"
  | "marketplace_supabase_url_missing"
  | "marketplace_supabase_project_ref_missing"
  | "marketplace_expected_supabase_project_ref_missing"
  | "marketplace_supabase_project_ref_mismatch"
  | "marketplace_supabase_environment_mismatch"
  | "marketplace_supabase_service_role_missing";

export type MarketplaceEnvironment = "local" | "sit" | "staging" | "production";

const MARKETPLACE_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "local",
  "sit",
  "staging",
  "production",
]);

function envFlag(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function firstEnvFlag(names: readonly string[], fallback: boolean) {
  for (const name of names) {
    if (process.env[name] !== undefined) return envFlag(name, fallback);
  }
  return fallback;
}

function marketplaceActionFlags(enabled: boolean): MarketplaceActionFlags {
  return {
    publicNav: firstEnvFlag(
      ["YNOT_MARKETPLACE_PUBLIC_NAV_ENABLED", "MARKETPLACE_PUBLIC_NAV_ENABLED"],
      enabled,
    ),
    browse: firstEnvFlag(
      ["YNOT_MARKETPLACE_BROWSE_ENABLED", "MARKETPLACE_BROWSE_ENABLED"],
      enabled,
    ),
    checkout: firstEnvFlag(
      ["YNOT_MARKETPLACE_CHECKOUT_ENABLED", "MARKETPLACE_CHECKOUT_ENABLED"],
      enabled,
    ),
    sellerSubmission: firstEnvFlag(
      [
        "YNOT_MARKETPLACE_SELLER_SUBMISSION_ENABLED",
        "MARKETPLACE_SELLER_SUBMISSION_ENABLED",
      ],
      enabled,
    ),
    listingActivation: firstEnvFlag(
      [
        "YNOT_MARKETPLACE_LISTING_ACTIVATION_ENABLED",
        "MARKETPLACE_LISTING_ACTIVATION_ENABLED",
      ],
      enabled,
    ),
    paymentProof: firstEnvFlag(
      [
        "YNOT_MARKETPLACE_PAYMENT_PROOF_ENABLED",
        "MARKETPLACE_PAYMENT_PROOF_ENABLED",
      ],
      enabled,
    ),
    payoutRelease: firstEnvFlag(
      [
        "YNOT_MARKETPLACE_PAYOUT_RELEASE_ENABLED",
        "MARKETPLACE_PAYOUT_RELEASE_ENABLED",
      ],
      enabled,
    ),
  };
}

function envText(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function marketplaceEnvironment(): MarketplaceEnvironment | null {
  const value = envText("MARKETPLACE_ENVIRONMENT")?.toLowerCase();
  if (!value || !MARKETPLACE_ENVIRONMENTS.has(value)) return null;
  return value as MarketplaceEnvironment;
}

function projectRefFromUrl(url: string | null) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") return "local";
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function environmentMatchesUrl(
  environment: MarketplaceEnvironment | null,
  urlProjectRef: string | null,
) {
  if (!environment || !urlProjectRef) return true;
  if (environment === "local") return urlProjectRef === "local";
  if (urlProjectRef === "local") return false;
  return true;
}

function marketplaceUnavailableReason(input: {
  enabled: boolean;
  environment: MarketplaceEnvironment | null;
  supabaseUrl: string | null;
  supabaseUrlProjectRef: string | null;
  supabaseProjectRef: string | null;
  expectedSupabaseProjectRef: string | null;
  serviceRoleKeyConfigured: boolean;
  mockData: boolean;
}): MarketplaceUnavailableReason | null {
  if (!input.enabled) return "marketplace_disabled";
  if (!envText("MARKETPLACE_ENVIRONMENT")) {
    return "marketplace_environment_missing";
  }
  if (!input.environment) return "marketplace_environment_invalid";
  if (input.mockData) return null;
  if (!input.supabaseUrl) return "marketplace_supabase_url_missing";
  if (!environmentMatchesUrl(input.environment, input.supabaseUrlProjectRef)) {
    return "marketplace_supabase_environment_mismatch";
  }
  if (!input.supabaseUrlProjectRef) {
    return "marketplace_supabase_project_ref_missing";
  }
  if (!input.expectedSupabaseProjectRef) {
    return "marketplace_expected_supabase_project_ref_missing";
  }
  if (input.supabaseUrlProjectRef !== input.expectedSupabaseProjectRef) {
    return "marketplace_supabase_project_ref_mismatch";
  }
  if (
    input.supabaseProjectRef &&
    input.supabaseProjectRef !== input.supabaseUrlProjectRef
  ) {
    return "marketplace_supabase_project_ref_mismatch";
  }
  if (!input.serviceRoleKeyConfigured) {
    return "marketplace_supabase_service_role_missing";
  }
  return null;
}

function localMockDataEnabled(environment: MarketplaceEnvironment | null) {
  return (
    environment === "local" &&
    process.env.NODE_ENV !== "production" &&
    envFlag("YNOT_MARKETPLACE_MOCK_DATA", false)
  );
}

export function marketplaceConfig(): MarketplaceConfig {
  const enabled = firstEnvFlag(
    ["YNOT_MARKETPLACE_ENABLED", "MARKETPLACE_ENABLED"],
    false,
  );
  const actions = marketplaceActionFlags(enabled);
  const ownerOnly = firstEnvFlag(
    ["YNOT_MARKETPLACE_OWNER_ONLY", "MARKETPLACE_OWNER_ONLY"],
    true,
  );
  const environment = marketplaceEnvironment();
  const supabaseUrl = envText("MARKETPLACE_SUPABASE_URL");
  const supabaseUrlProjectRef = projectRefFromUrl(supabaseUrl);
  const supabaseProjectRef = envText("MARKETPLACE_SUPABASE_PROJECT_REF");
  const expectedSupabaseProjectRef = envText(
    "MARKETPLACE_EXPECTED_SUPABASE_PROJECT_REF",
  );
  const serviceRoleKeyConfigured = Boolean(
    envText(MARKETPLACE_SUPABASE_SERVICE_ROLE_ENV),
  );
  const mockData = localMockDataEnabled(environment);

  const unavailableReason = marketplaceUnavailableReason({
    enabled,
    environment,
    supabaseUrl,
    supabaseUrlProjectRef,
    supabaseProjectRef,
    expectedSupabaseProjectRef,
    serviceRoleKeyConfigured,
    mockData,
  });

  return {
    enabled,
    ownerOnly,
    actions,
    environment,
    supabaseUrl,
    supabaseUrlProjectRef,
    supabaseProjectRef,
    expectedSupabaseProjectRef,
    serviceRoleKeyConfigured,
    mockData,
    sellerTermsVersion:
      envText("MARKETPLACE_SELLER_TERMS_VERSION") ?? "seller-terms-v1",
    buyerTermsVersion:
      envText("MARKETPLACE_BUYER_TERMS_VERSION") ?? "buyer-terms-v1",
    defaultCurrency: "THB",
    unavailableReason,
  };
}

export function isMarketplaceConfigured() {
  return marketplaceConfig().unavailableReason === null;
}
