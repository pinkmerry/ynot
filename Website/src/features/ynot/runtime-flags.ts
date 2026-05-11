const truthyValues = new Set(["1", "true", "yes", "on"]);
const falsyValues = new Set(["0", "false", "no", "off"]);

function envFlag(name: string): boolean | null {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const normalized = raw.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  return null;
}

export function allowDemoStorefront() {
  if (process.env.NODE_ENV === "production") return false;
  const explicit = envFlag("NEXT_PUBLIC_ENABLE_DEMO_STOREFRONT") ?? envFlag("ENABLE_DEMO_STOREFRONT");
  if (explicit !== null) return explicit;
  return true;
}

export function productionSafetyLabel() {
  return allowDemoStorefront() ? "Demo storefront fallback enabled" : "Production-safe real-data mode";
}
