import { buildLlmsText } from "@/lib/seo/public-answer-pages";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsText({ full: true }), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
