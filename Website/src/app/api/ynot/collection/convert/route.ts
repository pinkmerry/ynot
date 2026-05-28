// New card-conversion endpoint. Reuses the same RPC as /api/ynot/exchange,
// but lives under /collection/convert so the collection page UI naming is
// consistent with the new feature. Both routes are safe to call.

import { handleCardConversionRequest } from "@/lib/ynot/card-conversion-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCardConversionRequest(request);
}
