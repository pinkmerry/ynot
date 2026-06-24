import "server-only";

import {
  LOCAL_PREVIEW_PROFILE_ID,
  LOCAL_PREVIEW_WALLET_BALANCE,
  previewWalletBonusForProfile,
} from "@/features/ynot/local-preview-rewards";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type PublicWalletSnapshot = {
  balanceCoins: number;
  version: number;
};

type WalletAccountRow = {
  balance_coins: number | null;
  version: number | null;
};

function publicWalletSnapshot(row: WalletAccountRow | null): PublicWalletSnapshot {
  return {
    balanceCoins: Math.max(0, Math.round(Number(row?.balance_coins ?? 0))),
    version: Math.max(0, Math.round(Number(row?.version ?? 0))),
  };
}

export async function readWalletSnapshot(
  profileId?: string | null,
): Promise<PublicWalletSnapshot> {
  if (!profileId || !isSupabaseConfigured()) {
    return { balanceCoins: 0, version: 0 };
  }

  if (isDevAuthAllowed() && profileId === LOCAL_PREVIEW_PROFILE_ID) {
    return {
      balanceCoins: LOCAL_PREVIEW_WALLET_BALANCE + previewWalletBonusForProfile(profileId),
      version: 0,
    };
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("wallet_accounts")
    .select("balance_coins,version")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) throw error;
  return publicWalletSnapshot((data ?? null) as WalletAccountRow | null);
}
