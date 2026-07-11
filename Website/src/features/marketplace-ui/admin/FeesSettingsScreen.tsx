import type { MarketplaceMoneyPolicy } from "@/lib/marketplace/types";
import { FeesSettingsForm } from "./FeesSettingsForm";

/**
 * Marketplace admin Fees & settings screen -- headline plus the
 * FeesSettingsForm client island. Recreated (data-driven, not 1:1 markup)
 * from marketplace-admin-2.jsx's AdminSettings (prototype:
 * /Users/pinkmerry/Downloads/ynott/project/marketplace-admin-2.jsx:
 * 263-300).
 *
 * The prototype keeps every field in local useState with a "Settings
 * saved" toast and no real persistence. The real contract is the same
 * money-policy RPC the overview page's <MarketplaceMoneyPolicyControls>
 * panel already uses (GET/POST /api/marketplace/admin/money-policy,
 * src/lib/marketplace/money.ts) -- this screen does not fork that policy
 * logic, it reuses the exact same POST contract from a dedicated settings
 * page with the full trust-control field set
 * (payoutHoldDays/disputeWindowDays/listingAutoLive/slipAutoVerify) that
 * the overview's compact panel doesn't expose.
 *
 * Pure presentational server component: the page (page.tsx) loads `policy`
 * up front via buildMarketplaceOpsSnapshot's already-gated `moneyPolicy`
 * field and passes it down as a prop -- this file only renders it, same
 * split as PayoutsScreen.tsx/page.tsx.
 */
export interface FeesSettingsScreenProps {
  policy: MarketplaceMoneyPolicy;
}

export function FeesSettingsScreen({ policy }: FeesSettingsScreenProps) {
  return (
    <>
      <div className="mp-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
        <div className="mp-stack" style={{ gap: 5 }}>
          <span className="mp-eyebrow">Platform</span>
          <h1 className="mp-h1" style={{ fontSize: 26 }}>
            Fees &amp; settings
          </h1>
          <p className="mp-lead" style={{ fontSize: 13 }}>
            Marketplace economics and trust controls. Changes apply to every
            sale from the moment you save.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        <FeesSettingsForm policy={policy} />
      </div>
    </>
  );
}
