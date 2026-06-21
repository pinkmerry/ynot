// Compatibility conversion endpoint for older clients. The shared handler uses
// the quote/start/background conversion pipeline; this route must not own a
// separate committing path.

import { handleCardConversionRequest } from "@/lib/ynot/card-conversion-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCardConversionRequest(request);
}
