export const topUpPackages = [
  { id: "starter", label: "Starter", amountThb: 100, coins: 100 },
  { id: "player", label: "Player", amountThb: 500, coins: 500 },
  { id: "collector", label: "Collector", amountThb: 1000, coins: 1000 },
  { id: "whale", label: "Whale", amountThb: 3000, coins: 3000 },
] as const;

export type TopUpPackageId = (typeof topUpPackages)[number]["id"];

export function getTopUpPackage(packageId: string | null | undefined) {
  return topUpPackages.find((pkg) => pkg.id === packageId) ?? null;
}
