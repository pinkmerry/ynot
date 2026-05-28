import "server-only";

export function enforceSameOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return Response.json(
      { error: "Cross-origin mutation requests are not allowed." },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  try {
    const requestOrigin = new URL(request.url).origin;
    const submittedOrigin = new URL(origin).origin;
    if (submittedOrigin === requestOrigin) return null;
  } catch {
    // Malformed Origin headers should not be treated as same-site.
  }

  return Response.json(
    { error: "Cross-origin mutation requests are not allowed." },
    { status: 403 },
  );
}
