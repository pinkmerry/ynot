export function createMarketplaceCartSummaryRevisionGate() {
  let currentRevision = 0;

  return {
    beginRefresh() {
      currentRevision += 1;
      return currentRevision;
    },
    invalidate() {
      currentRevision += 1;
    },
    isCurrent(revision: number) {
      return revision === currentRevision;
    },
  };
}
