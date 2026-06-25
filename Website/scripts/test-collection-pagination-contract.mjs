import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const dataSrc = readFileSync(
  fileURLToPath(new URL("../src/features/ynot/data.ts", import.meta.url)),
  "utf8",
);

function sliceFn(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const rest = source.slice(start + startMarker.length);
  const nextIndex = rest.search(/\n(?:async function |function |export )/);
  return source.slice(
    start,
    start + startMarker.length + (nextIndex === -1 ? rest.length : nextIndex),
  );
}

test("Customer Bag paginated reads are stable when many rewards share acquired_at", () => {
  const fn = sliceFn(dataSrc, "export async function getCollection");
  const collectionRead = fn.slice(
    fn.indexOf('.from("collection_items")'),
    fn.indexOf("if (error) throw error;"),
  );

  assert.match(
    collectionRead,
    /\.order\("acquired_at", \{ ascending: false \}\)[\s\S]*\.order\("id", \{ ascending: false \}\)[\s\S]*\.range\(offset, pageEnd\)/,
    "collection pagination must use a unique tie-breaker before offset range paging",
  );
});
