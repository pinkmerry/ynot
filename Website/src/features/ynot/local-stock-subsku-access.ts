export function isLocalStockSubSkuHost(host: string | null | undefined) {
  const normalized = (host ?? "").trim().toLowerCase();
  const hostname = normalized.split(":")[0] ?? "";
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    normalized.startsWith("[::1]")
  );
}
