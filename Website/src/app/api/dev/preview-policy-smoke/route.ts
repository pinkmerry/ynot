import { NextResponse } from "next/server";
import {
  clearPreviewRewardsForProfile,
  seedPreviewRewardPolicySmokePack,
} from "@/features/ynot/local-preview-rewards";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDevAuthAllowed()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("reset") !== "0") {
    clearPreviewRewardsForProfile();
  }

  const seed = await seedPreviewRewardPolicySmokePack();
  return NextResponse.json({ ok: true, seed });
}
