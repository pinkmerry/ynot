// Card conversion endpoint (formerly "exchange order submit"). Calls the new
// submit_card_conversion RPC which auto-credits the user's wallet using the
// admin-locked convert_coin_value snapshot saved on each collection item.

import { handleCardConversionRequest } from "@/lib/ynot/card-conversion-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCardConversionRequest(request);
}
