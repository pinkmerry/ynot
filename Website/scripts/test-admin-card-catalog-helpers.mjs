import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/features/ynot/admin-card-catalog-helpers.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const cjsModule = { exports: {} };
vm.runInNewContext(outputText, {
  exports: cjsModule.exports,
  module: cjsModule,
  require,
});
const helpers = cjsModule.exports;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const cards = [
  {
    catalogCardId: "card-b",
    code: "OP-001",
    name: "Luffy Wanted",
    searchCode: "op-001",
    searchName: "luffy wanted",
    series: "One Piece",
    stockTotal: 4,
    stockAvailable: 2,
    stockReserved: 1,
    stockAllocated: 1,
  },
  {
    catalogCardId: "card-a",
    code: "PK-002",
    name: "Charizard",
    searchCode: "pk-002",
    searchName: "charizard",
    series: "Pokemon",
    stockTotal: 0,
  },
  {
    catalogCardId: "card-c",
    name: "Ace",
    series: "One Piece",
  },
];

test("normalizes code and matches duplicates by code first", () => {
  assert.equal(helpers.normalizeAdminCardCode(" op 001 "), "OP-001");
  assert.equal(
    helpers.findAdminCardDuplicate(cards, {
      code: "op 001",
      name: "Different Name",
    })?.catalogCardId,
    "card-b",
  );
});

test("matches normalized name only when code is blank", () => {
  assert.equal(
    helpers.findAdminCardDuplicate(cards, {
      code: "",
      name: " Luffy---Wanted ",
    })?.catalogCardId,
    "card-b",
  );
  assert.equal(
    helpers.findAdminCardDuplicate(cards, {
      code: "NEW-001",
      name: "Luffy Wanted",
    }),
    null,
  );
});

test("summarizes duplicate inventory and pack usage", () => {
  const duplicate = helpers.findAdminCardDuplicate(cards, { code: "OP-001" });
  const usage = helpers.adminCardDuplicateUsage(duplicate, [
    { cardId: "card-b" },
    { cardId: "card-b" },
    { cardId: "card-a" },
  ]);
  assert.deepEqual(plain(usage), {
    stockTotal: 4,
    stockAvailable: 2,
    stockReserved: 1,
    stockAllocated: 1,
    prizeAssignmentCount: 2,
  });
});

test("filters by series, preserves search, and sorts A-Z", () => {
  const rows = cards.map((card) => ({ card }));
  const visible = helpers.filterAdminCardCatalogRows(rows, {
    query: "",
    seriesFilter: "One Piece",
    sortMode: "az",
    searchText: (row) => `${row.card.name} ${row.card.code ?? ""}`.toLowerCase(),
  });
  assert.deepEqual(
    plain(visible.map((row) => row.card.name)),
    ["Ace", "Luffy Wanted"],
  );

  const searched = helpers.filterAdminCardCatalogRows(rows, {
    query: "pk-002",
    seriesFilter: "all",
    sortMode: "default",
    searchText: (row) => `${row.card.name} ${row.card.code ?? ""}`.toLowerCase(),
  });
  assert.deepEqual(
    plain(searched.map((row) => row.card.catalogCardId)),
    ["card-a"],
  );
});
