export type MarketplaceScheduledEnv = {
  MARKETPLACE_ENVIRONMENT?: string;
  MARKETPLACE_SUPABASE_URL?: string;
  MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY?: string;
};

function marketplaceSupabaseRpcHeaders(env: MarketplaceScheduledEnv) {
  const serviceKey = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("marketplace_expiry_missing_service_role_key");
  }
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
}

async function callMarketplaceSupabaseRpc(
  env: MarketplaceScheduledEnv,
  functionName: string,
  args: Record<string, unknown>,
) {
  const supabaseUrl = env.MARKETPLACE_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) {
    throw new Error("marketplace_expiry_missing_supabase_url");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: marketplaceSupabaseRpcHeaders(env),
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 160);
    throw new Error(`marketplace_expiry_rpc_failed:${functionName}:${response.status}:${detail}`);
  }

  return response.json().catch(() => null);
}

async function expireMarketplacePendingPaymentOrders(
  env: MarketplaceScheduledEnv,
) {
  if (!env.MARKETPLACE_ENVIRONMENT) return;
  if (!env.MARKETPLACE_SUPABASE_URL || !env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  try {
    await callMarketplaceSupabaseRpc(
      env,
      "marketplace_expire_pending_payment_orders",
      {
        p_request_id: `cloudflare-cron:${new Date().toISOString()}`,
        p_limit: 100,
      },
    );
  } catch (error) {
    console.warn("marketplace_pending_order_expiry_failed", {
      reason: error instanceof Error ? error.message.split(":").slice(0, 3).join(":") : "unknown",
    });
  }
}

export async function runMarketplaceScheduledJobs(
  env: MarketplaceScheduledEnv,
) {
  await expireMarketplacePendingPaymentOrders(env);
}
