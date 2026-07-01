import "server-only";

export function marketplaceRequestId(request: Request) {
  return (
    request.headers.get("x-request-id") ||
    request.headers.get("cf-ray") ||
    crypto.randomUUID()
  );
}
