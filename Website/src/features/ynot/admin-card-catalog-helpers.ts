export type AdminCardSeriesFilter = "all" | "Pokemon" | "One Piece";
export type AdminCardCatalogSortMode = "default" | "az";

export type AdminCardDuplicateCard = {
  catalogCardId: string;
  code?: string | null;
  name: string;
  searchCode?: string | null;
  searchName?: string | null;
  stockTotal?: number;
  stockAvailable?: number;
  stockReserved?: number;
  stockAllocated?: number;
};

export type AdminCardDuplicatePrize = {
  cardId: string;
};

export type AdminCardDuplicateUsage = {
  stockTotal: number;
  stockAvailable: number;
  stockReserved: number;
  stockAllocated: number;
  prizeAssignmentCount: number;
};

type CatalogFilterRow = {
  card: {
    catalogCardId: string;
    code?: string | null;
    name: string;
    series: "Pokemon" | "One Piece";
  };
};

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeAdminCardCode(value: unknown) {
  const clean = text(value, 48)
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || null;
}

export function normalizeAdminCardName(value: unknown) {
  return (
    text(value)
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || "card"
  );
}

export function findAdminCardDuplicate<T extends AdminCardDuplicateCard>(
  cards: T[],
  draft: { code?: unknown; name?: unknown },
) {
  const draftCode = normalizeAdminCardCode(draft.code);
  if (draftCode) {
    const searchCode = draftCode.toLowerCase();
    return (
      cards.find((card) => {
        const cardSearchCode =
          card.searchCode ?? normalizeAdminCardCode(card.code)?.toLowerCase();
        return cardSearchCode === searchCode;
      }) ?? null
    );
  }

  if (!text(draft.name)) return null;
  const searchName = normalizeAdminCardName(draft.name);
  return (
    cards.find(
      (card) =>
        (card.searchName ?? normalizeAdminCardName(card.name)) === searchName,
    ) ?? null
  );
}

export function adminCardDuplicateUsage(
  card: AdminCardDuplicateCard,
  prizes: AdminCardDuplicatePrize[],
): AdminCardDuplicateUsage {
  return {
    stockTotal: card.stockTotal ?? 0,
    stockAvailable: card.stockAvailable ?? 0,
    stockReserved: card.stockReserved ?? 0,
    stockAllocated: card.stockAllocated ?? 0,
    prizeAssignmentCount: prizes.filter(
      (prize) => prize.cardId === card.catalogCardId,
    ).length,
  };
}

function sortByCardName<T extends CatalogFilterRow>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const nameCompare = left.card.name.localeCompare(right.card.name);
    if (nameCompare) return nameCompare;
    const codeCompare = (left.card.code ?? "").localeCompare(
      right.card.code ?? "",
    );
    if (codeCompare) return codeCompare;
    return left.card.catalogCardId.localeCompare(right.card.catalogCardId);
  });
}

export function filterAdminCardCatalogRows<T extends CatalogFilterRow>(
  rows: T[],
  options: {
    query: string;
    seriesFilter: AdminCardSeriesFilter;
    sortMode: AdminCardCatalogSortMode;
    searchText: (row: T) => string;
  },
) {
  const normalizedQuery = options.query.trim().toLowerCase();
  let visible = rows;

  if (options.seriesFilter !== "all") {
    visible = visible.filter((row) => row.card.series === options.seriesFilter);
  }

  if (normalizedQuery) {
    visible = visible.filter((row) =>
      options.searchText(row).includes(normalizedQuery),
    );
  }

  return options.sortMode === "az" ? sortByCardName(visible) : visible;
}
