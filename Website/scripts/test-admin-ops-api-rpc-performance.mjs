import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(join(appRoot, path), "utf8");
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.ok(start > -1, `${startMarker} must exist`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${endMarker} must exist after ${startMarker}`);
  return text.slice(start, end);
}

function assertRawErrorMessageIsNotReturned(route) {
  const propertyKey = String.raw`(?:\[[^\]]+\]|\b[A-Za-z_$][\w$]*|["'][^"']+["'])`;
  const directMessageValue =
    String.raw`(?:\(\s*)*[A-Za-z_$][\w$]*(?:\s*\)\s*)?` +
    String.raw`(?:\s*(?:\?\.|\.)\s*(?:\(\s*)?[A-Za-z_$][\w$]*(?:\s*\)\s*)?)*` +
    String.raw`\s*(?:\?\.|\.)\s*message\b`;
  const rawMessageLeak = new RegExp(`${propertyKey}\\s*:\\s*${directMessageValue}`);
  for (const objectBody of responseJsonObjectBodies(route)) {
    assert.doesNotMatch(objectBody, rawMessageLeak);
  }
}

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ADMIN_UI_PATHS = ["src/features/ynot", "src/app/admin"];

function sourceExtension(path) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function sourceFiles(paths) {
  const files = [];
  for (const path of paths) {
    collectSourceFiles(join(appRoot, path), files);
  }
  return files.map((path) => ({
    path,
    text: readFileSync(path, "utf8"),
  }));
}

function collectSourceFiles(path, files) {
  if (!existsSync(path)) return;
  const stats = statSync(path);
  if (stats.isFile()) {
    if (!path.endsWith(".d.ts") && SOURCE_EXTENSIONS.has(sourceExtension(path))) {
      files.push(path);
    }
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (["__generated__", "__snapshots__", "node_modules"].includes(entry.name)) continue;
      collectSourceFiles(fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    if (!SOURCE_EXTENSIONS.has(sourceExtension(entry.name))) continue;
    files.push(fullPath);
  }
}

function responseJsonObjectBodies(text) {
  const bodies = [];
  const marker = "Response.json(";
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) break;
    let cursor = markerIndex + marker.length;
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
    if (text[cursor] === "{") {
      const end = matchingBraceIndex(text, cursor);
      if (end > cursor) bodies.push(text.slice(cursor + 1, end));
    }
    searchFrom = markerIndex + marker.length;
  }
  return bodies;
}

function matchingBraceIndex(text, start) {
  let depth = 0;
  let stringQuote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1] ?? "";
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (stringQuote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        stringQuote = "";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchingParenIndex(text, start) {
  let depth = 0;
  let stringQuote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1] ?? "";
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (stringQuote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        stringQuote = "";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function callBodies(text, callPattern) {
  const bodies = [];
  for (const match of text.matchAll(callPattern)) {
    const openParen = text.indexOf("(", match.index ?? 0);
    if (openParen === -1) continue;
    const closeParen = matchingParenIndex(text, openParen);
    if (closeParen > openParen) bodies.push(text.slice(openParen + 1, closeParen));
  }
  return bodies;
}

function sourceBlocksAround(paths, markerPattern) {
  return sourceFiles(paths).flatMap((file) => {
    const blocks = [];
    for (const match of file.text.matchAll(new RegExp(markerPattern, "g"))) {
      blocks.push(componentBlockAround(file.text, match.index ?? 0));
    }
    return blocks;
  });
}

function successPathsAround(paths, markerPattern) {
  return sourceBlocksAround(paths, markerPattern).map(successPathAfterCall);
}

function componentBlockAround(text, markerIndex) {
  const componentBoundary =
    /^((?:export\s+)?(?:function|class)\s+[A-Z][\w$]*|(?:export\s+)?const\s+[A-Z][\w$]*)/gm;
  let start = 0;
  let match;
  while ((match = componentBoundary.exec(text)) && match.index <= markerIndex) {
    start = match.index;
  }
  componentBoundary.lastIndex = markerIndex + 1;
  const next = componentBoundary.exec(text);
  return text.slice(start, next?.index ?? text.length);
}

function successfulResponsePath(block) {
  const guardIndex = block.search(/if\s*\(!response\.ok\)/);
  assert.ok(guardIndex > -1, "review mutation must guard failed responses");
  const afterGuard = block.slice(indexAfterFailedResponseGuard(block, guardIndex));
  const catchIndex = afterGuard.search(/\n\s*\}\s*catch\s*\(/);
  return catchIndex > -1 ? afterGuard.slice(0, catchIndex) : afterGuard;
}

function indexAfterFailedResponseGuard(block, guardIndex) {
  const conditionEnd = block.indexOf(")", guardIndex);
  assert.ok(conditionEnd > guardIndex, "failed response guard condition must close");
  let cursor = conditionEnd + 1;
  while (/\s/.test(block[cursor] ?? "")) cursor += 1;
  if (block[cursor] === "{") {
    const guardEnd = matchingBraceIndex(block, cursor);
    assert.ok(guardEnd > cursor, "failed response guard block must close");
    return guardEnd + 1;
  }
  const statementEnd = block.indexOf(";", cursor);
  assert.ok(statementEnd > cursor, "failed response guard statement must end");
  return statementEnd + 1;
}

function successPathAfterCall(block) {
  const callIndex = block.search(
    /(?:fetch|requestJson|postJson)\(\s*["']\/api\/ynot\/admin\/(?:payment-methods|categories)["']/,
  );
  assert.ok(callIndex > -1, "admin save API call must exist");
  const statementStart = block.lastIndexOf("\n", callIndex) + 1;
  const afterCall = block.slice(statementStart);
  const catchIndex = afterCall.search(/\n\s*\}\s*catch\s*\(/);
  return catchIndex > -1 ? afterCall.slice(0, catchIndex) : afterCall;
}

function saveMutationSuccessPaths(path) {
  return successPathsAround(
    ADMIN_UI_PATHS,
    `[\"']\\/api\\/ynot\\/admin\\/${path}[\"']`,
  ).filter((successPath) => !/\bDELETE\b/.test(successPath));
}

function assertTopUpReviewSuccessUsesReviewedResult(successPath) {
  const onReviewedUsesReviewedResult = callBodies(successPath, /\bonReviewed\s*/g).some((body) =>
    /\b(?:topUpId|result|status)\b/.test(body),
  );
  const setTopUpsUsesReviewedResult = callBodies(successPath, /\bsetTopUps\s*/g).some(
    (body) => /\b(?:topUpId|result|status)\b/.test(body) && /\b(?:filter|map|=>)\b/.test(body),
  );
  assert.ok(
    onReviewedUsesReviewedResult || setTopUpsUsesReviewedResult,
    "review success path must update local state/callback from the reviewed top-up id or result status",
  );
}

function payloadFieldNames(successPath, fieldName) {
  const names = new Set();
  for (const match of successPath.matchAll(
    new RegExp(`\\b(?:const|let)\\s+(\\w+)\\s*=\\s*payload\\.${fieldName}\\b`, "g"),
  )) {
    names.add(match[1]);
  }
  for (const match of successPath.matchAll(
    new RegExp(`\\b(?:const|let)\\s*\\{([\\s\\S]*?)\\}\\s*=\\s*payload\\b`, "g"),
  )) {
    const fields = match[1];
    for (const fieldMatch of fields.matchAll(
      new RegExp(`\\b${fieldName}\\b(?:\\s*:\\s*(\\w+))?`, "g"),
    )) {
      names.add(fieldMatch[1] ?? fieldName);
    }
  }
  return [...names];
}

function assertPayloadFieldDrivesMutation(successPath, fieldName, mutationPattern) {
  const names = payloadFieldNames(successPath, fieldName);
  const mutationBodies = callBodies(successPath, new RegExp(`\\b${mutationPattern}\\s*`, "gi"));
  const extractedPayloadUse = names.some((name) =>
    mutationBodies.some((body) => new RegExp(`\\b${name}\\b`).test(body)),
  );
  assert.ok(
    names.length > 0,
    `success path must extract payload.${fieldName}`,
  );
  assert.ok(
    extractedPayloadUse,
    `success path must drive the state/callback from payload.${fieldName}`,
  );
}

test("raw error leak guard allows mapped helpers but rejects direct message returns", () => {
  assert.doesNotThrow(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ code: "bad", error: mapError(dbError.message) }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ code: "bad", error: dbError.message }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ ok: false, message: dbError.message }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ ok: false, detail: dbError.message }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ [field]: dbError.message }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ error: (dbError).message }, { status: 400 });',
    );
  });
});

test("admin top-up route keeps review RPCs stable and adds bounded list protections", () => {
  const route = source("src/app/api/ynot/admin/top-ups/route.ts");
  assert.match(route, /approve_top_up_request/);
  assert.match(route, /reject_top_up_request/);
  assert.match(route, /export\s+async\s+function\s+GET\s*\([^)]*\)/);
  assert.match(route, /ynot:admin:top-ups:list/);
  assert.match(route, /(?:URLSearchParams|searchParams|\.url\b)/);
  assert.match(route, /status(?:es)?/i);
  assert.match(route, /cursor/i);
  assert.match(route, /limit/i);
  assert.match(route, /getTopUps\([\s\S]*\{[\s\S]*(?:status(?:es)?|cursor|limit)/i);
});

test("getTopUps supports admin status and cursor filtering without changing public redaction", () => {
  const data = source("src/features/ynot/data.ts");
  const getTopUps = between(data, "export async function getTopUps", "export function toTopUp");
  assert.match(getTopUps, /status(?:es)?/i);
  assert.match(getTopUps, /cursor/i);
  assert.match(getTopUps, /\.in\(\s*["']status["']/);
  assert.match(getTopUps, /\.(?:lt|lte)\(\s*["']created_at["']/);

  const publicTopUp = between(data, "export function publicTopUp", "export async function getCollection");
  assert.match(publicTopUp, /delete publicFields\.id/);
  assert.match(publicTopUp, /delete publicFields\.profileId/);
  assert.match(publicTopUp, /delete publicFields\.adminNote/);

  const publicPaymentMethod = between(
    publicTopUp,
    "paymentMethod: topUp.paymentMethod",
    "slipVerification: topUp.slipVerification",
  );
  assert.match(publicPaymentMethod, /type: topUp\.paymentMethod\.type/);
  assert.match(publicPaymentMethod, /displayName: topUp\.paymentMethod\.displayName/);
  assert.doesNotMatch(publicPaymentMethod, /id:/);
  assert.doesNotMatch(publicPaymentMethod, /code:/);
});

test("admin payment method routes require high privilege and return safe failures", () => {
  const paymentRoute = source("src/app/api/ynot/admin/payment-methods/route.ts");
  const qrRoute = source("src/app/api/ynot/admin/payment-methods/qr-image/route.ts");

  for (const route of [paymentRoute, qrRoute]) {
    assert.match(route, /enforceSameOriginMutation/);
    assert.match(route, /requireAdminRoleResponse/);
    assertRawErrorMessageIsNotReturned(route);
  }
});

test("admin shipping route validates IDs and maps RPC errors safely", () => {
  const shippingRoute = source("src/app/api/ynot/admin/shipping/route.ts");
  assert.match(shippingRoute, /const UUID_RE/);
  assert.match(shippingRoute, /adminShippingErrorMessage/);
  assert.match(shippingRoute, /update_shipping_request_status/);
  assertRawErrorMessageIsNotReturned(shippingRoute);
});

test("admin top-up UI removes reviewed rows without a full duplicate fetch", () => {
  const reviewMutationBlocks = sourceBlocksAround(
    ADMIN_UI_PATHS,
    "fetch\\(\\s*[\"']/api/ynot/admin/top-ups[\"']",
  );
  assert.ok(reviewMutationBlocks.length > 0, "admin top-up review mutation must exist");
  const reviewMutationSource = reviewMutationBlocks.join("\n");
  const reviewSuccessPath = reviewMutationBlocks.map(successfulResponsePath).join("\n");
  assert.match(reviewMutationSource, /method\s*:\s*["']PATCH["']/);
  assertTopUpReviewSuccessUsesReviewedResult(reviewSuccessPath);
  assert.doesNotMatch(reviewMutationSource, /router\.refresh\(\)/);
});

test("settings admin screen updates payment method state from the save payload", () => {
  const paymentSuccessPath = saveMutationSuccessPaths("payment-methods").join("\n");
  assert.match(
    paymentSuccessPath,
    /(?:const|let)\s+(?:\w+|\{[\s\S]*?\})\s*=\s*await\s+(?:postJson|requestJson)|\.json\(\)/,
  );
  assertPayloadFieldDrivesMutation(
    paymentSuccessPath,
    "paymentMethod",
    String.raw`(?:setMethodOptions|set[A-Za-z]*Payment[A-Za-z]*Methods)`,
  );
});

test("category admin screen updates parent category state from the save payload", () => {
  const categorySuccessPath = saveMutationSuccessPaths("categories").join("\n");
  assert.match(
    categorySuccessPath,
    /(?:const|let)\s+(?:\w+|\{[\s\S]*?\})\s*=\s*await\s+(?:requestJson|postJson)|\.json\(\)/,
  );
  assertPayloadFieldDrivesMutation(
    categorySuccessPath,
    "category",
    String.raw`(?:onSaved\?\.|setCategories)`,
  );
});
