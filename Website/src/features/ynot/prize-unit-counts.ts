// Pure aggregation for prize-unit status counts. Deliberately dependency-free
// so it can be unit-tested in isolation and reused by readiness without the old
// N+1 count(*) storm (2 round-trips per prize). The caller fetches non-void
// units for a whole campaign in one query; this groups them in memory.

export type PrizeUnitStatusRow = {
  draw_round_prize_id: string | null;
  status: string | null;
};

export type PrizeUnitCount = {
  prizeId: string;
  nonVoidCount: number;
  availableCount: number;
};

/**
 * Aggregate one bulk fetch of NON-VOID prize-unit rows into per-prize counts.
 * `rows` must already exclude `void` units (caller filters `status != 'void'`).
 * Returns one entry per id in `prizeIds`, preserving order, each with the
 * non-void total and the `available` subtotal.
 */
export function aggregateNonVoidPrizeUnitCounts(
  prizeIds: readonly string[],
  rows: readonly PrizeUnitStatusRow[],
): PrizeUnitCount[] {
  const nonVoid = new Map<string, number>();
  const available = new Map<string, number>();
  for (const row of rows) {
    const prizeId = row.draw_round_prize_id;
    if (!prizeId) continue;
    if (row.status === "void") continue;
    nonVoid.set(prizeId, (nonVoid.get(prizeId) ?? 0) + 1);
    if (row.status === "available") {
      available.set(prizeId, (available.get(prizeId) ?? 0) + 1);
    }
  }
  return prizeIds.map((prizeId) => ({
    prizeId,
    nonVoidCount: nonVoid.get(prizeId) ?? 0,
    availableCount: available.get(prizeId) ?? 0,
  }));
}
