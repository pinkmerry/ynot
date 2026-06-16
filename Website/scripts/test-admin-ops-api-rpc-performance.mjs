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
  const variableBodies = responseBodyVariableExpressions(route);
  for (const bodyExpression of responseJsonBodyExpressions(route)) {
    assert.equal(
      hasRawMessageValue(bodyExpression, variableBodies),
      false,
      "Response.json body must not return a raw .message value",
    );
  }
  for (const helperArgument of returnedResponseHelperArguments(route)) {
    assert.equal(
      hasRawMessageValue(helperArgument, variableBodies),
      false,
      "response helper arguments must not return a raw .message value",
    );
  }
}

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ADMIN_UI_PATHS = ["src/features/ynot", "src/app/admin"];
const TOP_UP_REVIEW_RELOAD_OR_REFETCH_RE =
  /router\.(?:refresh|reload)\(\)|(?:window\.)?location\.reload\(\)|\b(?:loadTopUps|fetchTopUps)\s*\(|\b(?:fetch|requestJson|postJson|patchJson|putJson)\(\s*["']\/api\/ynot\/admin\/top-ups["']/;

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

function responseJsonBodyExpressions(text) {
  const variableBodies = responseBodyVariableExpressions(text);
  const expressions = [];
  const marker = "Response.json(";
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) break;
    const openParen = markerIndex + marker.length - 1;
    const closeParen = matchingParenIndex(text, openParen);
    if (closeParen === -1) break;
    const firstArg = splitTopLevel(text.slice(openParen + 1, closeParen))[0]?.trim() ?? "";
    if (firstArg) expressions.push(variableBodies.get(firstArg) ?? firstArg);
    searchFrom = markerIndex + marker.length;
  }
  return expressions;
}

function responseBodyVariableExpressions(text) {
  const expressions = new Map();
  for (const match of text.matchAll(/\b(?:const|let)\s+(\w+)\b[^=;]*=/g)) {
    const name = match[1];
    const valueStart = (match.index ?? 0) + match[0].length;
    const statementEnd = topLevelStatementEnd(text, match.index ?? 0);
    if (statementEnd > valueStart) {
      expressions.set(name, text.slice(valueStart, statementEnd).trim());
    }
  }
  for (const match of text.matchAll(
    /\b(?:const|let)\s*\{([\s\S]*?)\}\s*=\s*([A-Za-z_$][\w$]*)\s*;/g,
  )) {
    for (const field of splitTopLevel(match[1])) {
      const fieldMatch = /^\s*message(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(field);
      if (fieldMatch) expressions.set(fieldMatch[1] ?? "message", `${match[2]}.message`);
    }
  }
  return expressions;
}

function returnedResponseHelperArguments(text) {
  const variableBodies = responseBodyVariableExpressions(text);
  const expressions = [];
  const returnCallPattern = /\breturn\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
  for (const match of text.matchAll(returnCallPattern)) {
    const callee = match[1];
    if (callee === "Response.json") continue;
    if (!/response/i.test(callee)) continue;
    const openParen = text.indexOf("(", (match.index ?? 0) + match[0].length - 1);
    if (openParen === -1) continue;
    const closeParen = matchingParenIndex(text, openParen);
    if (closeParen <= openParen) continue;
    for (const argument of splitTopLevel(text.slice(openParen + 1, closeParen))) {
      expressions.push(variableBodies.get(argument) ?? argument);
    }
  }
  return expressions;
}

function hasRawMessageValue(expression, variables = new Map(), seen = new Set()) {
  const trimmed = stripOuterParens(expression.trim());
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed) && variables.has(trimmed)) {
    if (seen.has(trimmed)) return false;
    seen.add(trimmed);
    return hasRawMessageValue(variables.get(trimmed), variables, seen);
  }
  if (isDirectMessageMemberExpression(trimmed, 0)) return true;
  if (trimmed.startsWith("{")) {
    const closeBrace = matchingBraceIndex(trimmed, 0);
    if (closeBrace === -1) return false;
    const objectBody = trimmed.slice(1, closeBrace);
    for (const valueStart of objectValueStarts(objectBody)) {
      const valueEnd = endOfTopLevelValue(objectBody, valueStart);
      if (
        hasRawMessageValue(
          stripTrailingComma(objectBody.slice(valueStart, valueEnd)),
          variables,
          new Set(seen),
        )
      ) {
        return true;
      }
    }
  }
  if (trimmed.startsWith("[")) {
    const closeBracket = matchingBracketIndex(trimmed, 0);
    if (closeBracket === -1) return false;
    return splitTopLevel(trimmed.slice(1, closeBracket)).some((value) =>
      hasRawMessageValue(value, variables, new Set(seen)),
    );
  }
  return false;
}

function stripTrailingComma(value) {
  return value.trim().replace(/,\s*$/, "");
}

function stripOuterParens(value) {
  let current = value;
  while (current.startsWith("(")) {
    const closeParen = matchingParenIndex(current, 0);
    if (closeParen !== current.length - 1) break;
    current = current.slice(1, -1).trim();
  }
  return current;
}

function objectValueStarts(objectBody) {
  const starts = [];
  let index = 0;
  while (index < objectBody.length) {
    const colonIndex = nextTopLevelColon(objectBody, index);
    if (colonIndex === -1) break;
    let cursor = colonIndex + 1;
    while (/\s/.test(objectBody[cursor] ?? "")) cursor += 1;
    starts.push(cursor);
    index = endOfTopLevelValue(objectBody, cursor);
  }
  return starts;
}

function nextTopLevelColon(text, start) {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let stringQuote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
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
    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === ":" && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      return index;
    }
  }
  return -1;
}

function endOfTopLevelValue(text, start) {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let stringQuote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
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
    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "," && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      return index + 1;
    }
  }
  return text.length;
}

function isDirectMessageMemberExpression(text, start) {
  let cursor = start;
  while (text[cursor] === "(" || /\s/.test(text[cursor] ?? "")) cursor += 1;
  if (!/[A-Za-z_$]/.test(text[cursor] ?? "")) return false;
  cursor += 1;
  while (/[\w$]/.test(text[cursor] ?? "")) cursor += 1;
  cursor = skipBalancedClosingParens(text, cursor);
  let sawMember = false;
  while (true) {
    cursor = skipSpaces(text, cursor);
    const operator = text.startsWith("?.", cursor) ? "?." : text[cursor] === "." ? "." : "";
    if (!operator) break;
    sawMember = true;
    cursor += operator.length;
    cursor = skipSpaces(text, cursor);
    while (text[cursor] === "(") cursor += 1;
    cursor = skipSpaces(text, cursor);
    if (!/[A-Za-z_$]/.test(text[cursor] ?? "")) return false;
    const memberStart = cursor;
    cursor += 1;
    while (/[\w$]/.test(text[cursor] ?? "")) cursor += 1;
    const memberName = text.slice(memberStart, cursor);
    cursor = skipBalancedClosingParens(text, cursor);
    if (memberName === "message") {
      const next = skipSpaces(text, cursor);
      return sawMember && text[next] !== "(" && text[next] !== "." && !text.startsWith("?.", next);
    }
  }
  return false;
}

function skipSpaces(text, start) {
  let cursor = start;
  while (/\s/.test(text[cursor] ?? "")) cursor += 1;
  return cursor;
}

function skipBalancedClosingParens(text, start) {
  let cursor = skipSpaces(text, start);
  while (text[cursor] === ")") {
    cursor = skipSpaces(text, cursor + 1);
  }
  return cursor;
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

function matchingBracketIndex(text, start) {
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
    if (char === "[") depth += 1;
    if (char === "]") {
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

function topLevelStatementEnd(text, start) {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let stringQuote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
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
    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === ";" && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      return index;
    }
  }
  return -1;
}

function splitTopLevel(text) {
  const values = [];
  let start = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let stringQuote = "";
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
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
    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "," && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const finalValue = text.slice(start).trim();
  if (finalValue) values.push(finalValue);
  return values;
}

function exportedFunctionBlock(text, name) {
  const match = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`).exec(text);
  assert.ok(match, `${name} route handler must exist`);
  const openBrace = text.indexOf("{", match.index);
  assert.ok(openBrace > match.index, `${name} route handler body must open`);
  const closeBrace = matchingBraceIndex(text, openBrace);
  assert.ok(closeBrace > openBrace, `${name} route handler body must close`);
  return text.slice(match.index, closeBrace + 1);
}

function firstMatch(text, pattern, message) {
  const match = pattern.exec(text);
  assert.ok(match, message);
  return match;
}

function assertTopUpGetParsesAndPassesListOptions(getRoute) {
  const urlMatch = firstMatch(
    getRoute,
    /\b(?:const|let)\s+(\w+)\s*=\s*new URL\(request\.url\)/,
    "GET must derive a URL object from request.url",
  );
  const urlName = urlMatch[1];
  const searchParams = `${urlName}.searchParams`;
  for (const param of ["limit", "status", "cursorCreatedAt"]) {
    assert.match(
      getRoute,
      new RegExp(`${escapeRegExp(searchParams)}\\.(?:get|getAll)\\(\\s*["']${param}["']\\s*\\)`),
      `GET must parse ${param} from ${searchParams}`,
    );
  }
  assertDeclarationInitializesFromSearchParam(getRoute, "limit", searchParams, "limit", "get");
  assertDeclarationInitializesFromSearchParam(getRoute, "statuses", searchParams, "status");
  assertDeclarationInitializesFromSearchParam(
    getRoute,
    "cursorCreatedAt",
    searchParams,
    "cursorCreatedAt",
    "get",
  );

  const getTopUpsBodies = callBodies(getRoute, /\bgetTopUps\s*/g);
  assert.ok(getTopUpsBodies.length > 0, "GET must call getTopUps");
  assert.ok(
    getTopUpsBodies.some((body) => {
      const optionsArg = splitTopLevel(body)[2]?.trim() ?? "";
      return topLevelObjectHasParsedFields(optionsArg, ["limit", "statuses", "cursorCreatedAt"]);
    }),
    "one GET getTopUps call must pass parsed limit, statuses, and cursorCreatedAt as direct options keys",
  );
}

function assertDeclarationInitializesFromSearchParam(
  text,
  variableName,
  searchParams,
  paramName,
  accessor = "(?:get|getAll)",
) {
  const declarationPattern = new RegExp(
    `\\b(?:const|let)\\s+${escapeRegExp(variableName)}\\b[^=;]*=`,
    "g",
  );
  for (const match of text.matchAll(declarationPattern)) {
    const statementEnd = topLevelStatementEnd(text, match.index ?? 0);
    if (statementEnd === -1) continue;
    const statement = text.slice(match.index, statementEnd + 1);
    const accessorPattern = new RegExp(
      `${escapeRegExp(searchParams)}\\.${accessor}\\(\\s*["']${escapeRegExp(paramName)}["']\\s*\\)`,
    );
    if (accessorPattern.test(statement)) return;
  }
  assert.fail(
    `${variableName} declaration initializer must derive ${paramName} from ${searchParams} before the declaration ends`,
  );
}

function topLevelObjectHasParsedFields(value, fieldNames) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return false;
  const closeBrace = matchingBraceIndex(trimmed, 0);
  if (closeBrace !== trimmed.length - 1) return false;
  const entries = splitTopLevel(trimmed.slice(1, -1));
  return fieldNames.every((fieldName) => {
    const shorthandPattern = new RegExp(`^\\s*${escapeRegExp(fieldName)}\\s*$`);
    const keyedPattern = new RegExp(
      `^\\s*(?:${escapeRegExp(fieldName)}|["']${escapeRegExp(fieldName)}["'])\\s*:\\s*([\\s\\S]+)$`,
    );
    return entries.some((entry) => {
      if (shorthandPattern.test(entry)) return true;
      const keyed = keyedPattern.exec(entry);
      return keyed ? returnedNamePattern(fieldName).test(keyed[1]) : false;
    });
  });
}

function assertTopUpGetReturnsRateLimitBeforeList(getRoute) {
  const getTopUpsIndex = getRoute.search(/\bgetTopUps\s*\(/);
  assert.ok(getTopUpsIndex > -1, "GET must call getTopUps");

  const rateLimitPattern =
    /\b(?:const|let)\s+(\w+)\s*=\s*await\s+enforceRateLimit\(\s*(?:(?:request\s*,\s*)?["']ynot:admin:top-ups:list["']|request\s*,\s*["']ynot:admin:top-ups:list["'])[\s\S]*?\)\s*;/g;
  let rateLimitMatch;
  while ((rateLimitMatch = rateLimitPattern.exec(getRoute))) {
    const rateLimitName = rateLimitMatch[1];
    const rateLimitIndex = rateLimitMatch.index;
    const returnPattern = new RegExp(
      `if\\s*\\(\\s*${escapeRegExp(rateLimitName)}\\s*\\)\\s*return\\s+${escapeRegExp(rateLimitName)}\\s*;`,
    );
    const returnMatch = returnPattern.exec(getRoute.slice(rateLimitIndex, getTopUpsIndex));
    if (returnMatch) return;
  }
  assert.fail("GET must return the ynot:admin:top-ups:list rate-limit response before getTopUps");
}

function assertAdminPostGuardsBeforeMutation(route, mutationPattern) {
  const postRoute = exportedFunctionBlock(route, "POST");
  const sameOrigin = assignedGuardReturn(
    postRoute,
    /enforceSameOriginMutation\(\s*request\s*\)/g,
  );
  const role = assignedGuardReturn(
    postRoute,
    /requireAdminRoleResponse\(\s*admin\s*,\s*\[\s*["']owner["']\s*,\s*["']admin["']\s*\]\s*\)/g,
  );
  const bodyParseIndex = postRoute.search(/request\.(?:json|formData)\s*\(/);
  const mutationIndex = postRoute.search(mutationPattern);

  assert.ok(sameOrigin, "POST must return same-origin guard failures inside the handler");
  assert.ok(role, "POST must return owner/admin role guard failures inside the handler");
  assert.ok(bodyParseIndex > -1, "POST must parse a request body/form inside the handler");
  assert.ok(mutationIndex > -1, "POST must perform the admin mutation inside the handler");
  assert.ok(sameOrigin.index < bodyParseIndex, "same-origin guard must run before body/form parsing");
  assert.ok(role.index < bodyParseIndex, "role guard must run before body/form parsing");
  assert.ok(sameOrigin.returnIndex < bodyParseIndex, "same-origin guard response must return before body/form parsing");
  assert.ok(role.returnIndex < bodyParseIndex, "role guard response must return before body/form parsing");
  assert.ok(sameOrigin.index < mutationIndex, "same-origin guard must run before mutation");
  assert.ok(role.index < mutationIndex, "role guard must run before mutation");
  assert.ok(sameOrigin.returnIndex < mutationIndex, "same-origin guard response must return before mutation");
  assert.ok(role.returnIndex < mutationIndex, "role guard response must return before mutation");
}

function assignedGuardReturn(text, callPattern) {
  for (const match of text.matchAll(callPattern)) {
    const callIndex = match.index ?? 0;
    const prefix = text.slice(0, callIndex);
    const assignmentMatch = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s*)?$/.exec(prefix);
    if (!assignmentMatch) continue;
    const guardName = assignmentMatch[1];
    const statementEnd = text.indexOf(";", callIndex);
    if (statementEnd === -1) continue;
    const afterAssignment = text.slice(statementEnd + 1);
    const returnPattern = new RegExp(
      `if\\s*\\(\\s*${escapeRegExp(guardName)}\\s*\\)\\s*return\\s+${escapeRegExp(guardName)}\\s*;`,
    );
    const returnMatch = returnPattern.exec(afterAssignment);
    if (!returnMatch) continue;
    return {
      index: callIndex,
      returnIndex: statementEnd + 1 + returnMatch.index,
    };
  }
  return null;
}

function assertShippingRequestIdValidatedBeforeRpc(patchRoute) {
  const rpcIndex = rpcCallIndex(patchRoute, "update_shipping_request_status");
  assert.ok(rpcIndex > -1, 'shipping route must call supabase.rpc("update_shipping_request_status", ...)');
  const beforeRpc = patchRoute.slice(0, rpcIndex);
  const validatorExpression =
    /(?:\b(?:UUID_RE|[A-Za-z_$][\w$]*(?:Uuid|UUID|uuid)[\w$]*)\.test\(\s*shippingRequestId\s*\)|\b(?:isUuid|isUUID|validateUuid|validateUUID|isValidUuid|isValidUUID)\(\s*shippingRequestId\s*\))/;
  const directValidation =
    new RegExp(
      `if\\s*\\(\\s*!\\s*(?:${validatorExpression.source})\\s*\\)[\\s\\S]{0,200}\\breturn\\b`,
    ).test(beforeRpc) ||
    new RegExp(
      `if\\s*\\(\\s*(?:${validatorExpression.source})\\s*(?:===|==)\\s*false\\s*\\)[\\s\\S]{0,200}\\breturn\\b`,
    ).test(beforeRpc);
  const assignedValidation = (() => {
    for (const match of beforeRpc.matchAll(/\b(?:const|let)\s+(\w+)\b[^=;]*=/g)) {
      const valueStart = (match.index ?? 0) + match[0].length;
      const statementEnd = topLevelStatementEnd(beforeRpc, match.index ?? 0);
      if (statementEnd <= valueStart) continue;
      const initializer = beforeRpc.slice(valueStart, statementEnd);
      if (!validatorExpression.test(initializer)) continue;
      const validationName = match[1];
      const afterAssignment = beforeRpc.slice(statementEnd + 1);
      if (
        new RegExp(
          `if\\s*\\(\\s*!\\s*${escapeRegExp(validationName)}\\s*\\)[\\s\\S]{0,180}\\breturn\\b`,
        ).test(afterAssignment) ||
        new RegExp(
          `if\\s*\\(\\s*${escapeRegExp(validationName)}\\s*(?:===|==)\\s*false\\s*\\)[\\s\\S]{0,180}\\breturn\\b`,
        ).test(afterAssignment)
      ) {
        return true;
      }
    }
    return false;
  })();
  assert.ok(
    directValidation || assignedValidation,
    "shippingRequestId must be validated by a concrete UUID helper or regex before the RPC",
  );
}

function assertPublicTopUpDoesNotReExposePrivateFields(publicTopUp) {
  const privateFields = ["id", "profileId", "adminNote", "providerReference", "rawPayload"];
  const lastDeleteIndex = Math.max(
    ...privateFields.map((field) => publicTopUp.indexOf(`delete publicFields.${field}`)),
  );
  assert.ok(lastDeleteIndex > -1, "publicTopUp must delete private top-level fields before return");
  const afterRedaction = publicTopUp.slice(lastDeleteIndex);
  for (const privateField of privateFields) {
    assert.doesNotMatch(
      afterRedaction,
      new RegExp(`\\b${privateField}\\s*:`),
      `publicTopUp must not explicitly re-expose ${privateField} after redaction`,
    );
    assert.doesNotMatch(
      afterRedaction,
      new RegExp(`\\bpublicFields\\.${privateField}\\s*=`),
      `publicTopUp must not reassign ${privateField} after redaction`,
    );
  }
}

function assertShippingRpcErrorMappedSafely(patchRoute) {
  const rpcIndex = rpcCallIndex(patchRoute, "update_shipping_request_status");
  assert.ok(rpcIndex > -1, 'shipping route must call supabase.rpc("update_shipping_request_status", ...)');
  const errorBranch = ifBranchBody(patchRoute, /\bif\s*\(\s*error\s*\)/g, rpcIndex);
  assert.ok(errorBranch, "shipping RPC error branch must exist after the RPC");
  assert.match(errorBranch, /\badminShippingErrorMessage\(\s*error\s*\)/);
  assert.doesNotMatch(errorBranch, /\badminShippingErrorMessage\(\s*error\.message\s*\)/);
}

function ifBranchBody(text, pattern, afterIndex = 0) {
  pattern.lastIndex = afterIndex;
  const match = pattern.exec(text);
  if (!match) return "";
  let cursor = (match.index ?? 0) + match[0].length;
  while (/\s/.test(text[cursor] ?? "")) cursor += 1;
  if (text[cursor] === "{") {
    const closeBrace = matchingBraceIndex(text, cursor);
    return closeBrace > cursor ? text.slice(cursor + 1, closeBrace) : "";
  }
  const statementEnd = text.indexOf(";", cursor);
  return statementEnd > cursor ? text.slice(cursor, statementEnd + 1) : "";
}

function assertRpcCall(block, rpcName) {
  assert.ok(
    callBodies(block, /\bsupabase\.rpc\s*/g).some((body) =>
      new RegExp(`^\\s*["']${escapeRegExp(rpcName)}["']`).test(body),
    ),
    `PATCH must call supabase.rpc("${rpcName}", ...)`,
  );
}

function rpcCallIndex(block, rpcName) {
  for (const match of block.matchAll(/\bsupabase\.rpc\s*/g)) {
    const body = callBodies(block.slice(match.index ?? 0), /^\s*supabase\.rpc\s*/g)[0] ?? "";
    if (new RegExp(`^\\s*["']${escapeRegExp(rpcName)}["']`).test(body)) {
      return match.index ?? -1;
    }
  }
  return -1;
}

function assertPublicSlipVerificationIsSafe(publicTopUp) {
  const marker = "slipVerification:";
  const markerIndex = publicTopUp.indexOf(marker);
  assert.ok(markerIndex > -1, "publicTopUp must define slipVerification");
  assert.match(
    publicTopUp.slice(markerIndex, markerIndex + 180),
    /slipVerification:\s*topUp\.slipVerification\s*\?\s*\{/,
    "publicTopUp must map slipVerification through an explicit public object",
  );
  const objectStart = publicTopUp.indexOf("{", markerIndex);
  assert.ok(objectStart > markerIndex, "publicTopUp must map slipVerification to a public object");
  const objectEnd = matchingBraceIndex(publicTopUp, objectStart);
  assert.ok(objectEnd > objectStart, "public slipVerification object must close");
  const slipVerification = publicTopUp.slice(objectStart + 1, objectEnd);

  assertPublicObjectUsesOnlyKeys(
    slipVerification,
    ["status", "amount", "transferredAt"],
    "slipVerification",
  );
  assert.match(slipVerification, /\bstatus\s*:/);
  assert.match(slipVerification, /\bamount\s*:/);
  assert.match(slipVerification, /\btransferredAt\s*:/);
  for (const privateField of [
    "id",
    "providerCode",
    "providerMessage",
    "providerReference",
    "rawPayload",
    "uploadedAt",
    "verifiedAt",
    "duplicateOfSlipId",
  ]) {
    assert.doesNotMatch(
      slipVerification,
      new RegExp(`\\b${privateField}\\s*:`),
      `public slipVerification must not expose ${privateField}`,
    );
  }
}

function assertPublicObjectUsesOnlyKeys(objectBody, allowedKeys, label) {
  assert.doesNotMatch(objectBody, /\.\.\./, `public ${label} must not use object spreads`);
  const entries = splitTopLevel(objectBody).filter(Boolean);
  const allowed = new Set(allowedKeys);
  for (const entry of entries) {
    const key = objectEntryKey(entry);
    assert.ok(key, `public ${label} entry must use an explicit key`);
    assert.ok(
      allowed.has(key),
      `public ${label} must not expose unexpected key ${key}`,
    );
  }
  for (const key of allowedKeys) {
    assert.ok(
      entries.some((entry) => objectEntryKey(entry) === key),
      `public ${label} must expose ${key}`,
    );
  }
}

function objectEntryKey(entry) {
  const trimmed = entry.trim();
  if (trimmed.startsWith("...")) return "";
  const colonIndex = nextTopLevelColon(trimmed, 0);
  if (colonIndex === -1) return /^[A-Za-z_$][\w$]*$/.test(trimmed) ? trimmed : "";
  return trimmed.slice(0, colonIndex).trim().replace(/^["']|["']$/g, "");
}

function publicObjectFor(publicTopUp, marker) {
  const markerIndex = publicTopUp.indexOf(marker);
  assert.ok(markerIndex > -1, `${marker} must exist`);
  const objectStart = publicTopUp.indexOf("{", markerIndex);
  assert.ok(objectStart > markerIndex, `${marker} must map to a public object`);
  const objectEnd = matchingBraceIndex(publicTopUp, objectStart);
  assert.ok(objectEnd > objectStart, `${marker} public object must close`);
  return publicTopUp.slice(objectStart + 1, objectEnd);
}

function componentBlockAround(text, markerIndex) {
  const componentBoundary =
    /^((?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+[A-Z][\w$]*|(?:export\s+)?class\s+[A-Z][\w$]*|(?:export\s+)?const\s+[A-Z][\w$]*)/gm;
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

function saveMutationSuccessPaths(path) {
  return adminApiCalls(path)
    .filter((call) => call.isSaveMutation)
    .map((call) => call.successPath);
}

function adminApiCalls(path) {
  const escapedPath = escapeRegExp(`/api/ynot/admin/${path}`);
  const callPattern = new RegExp(
    `\\b(fetch|requestJson|postJson)\\s*\\(\\s*["']${escapedPath}["']`,
    "g",
  );
  const files = sourceFiles(ADMIN_UI_PATHS);
  const sourceContext = files.map((file) => file.text).join("\n");
  return files.flatMap((file) => {
    const calls = [];
    for (const match of file.text.matchAll(callPattern)) {
      const callIndex = match.index ?? 0;
      const componentBlock = componentBlockAround(file.text, callIndex);
      const componentOffset = file.text.lastIndexOf(componentBlock, callIndex);
      const callInComponentIndex = Math.max(0, callIndex - componentOffset);
      const openParen = componentBlock.indexOf("(", callInComponentIndex);
      if (openParen === -1) continue;
      const closeParen = matchingParenIndex(componentBlock, openParen);
      if (closeParen <= openParen) continue;
      const callBody = componentBlock.slice(openParen + 1, closeParen);
      const statementStart = componentBlock.lastIndexOf("\n", callInComponentIndex) + 1;
      const afterCall = componentBlock.slice(statementStart);
      const catchIndex = afterCall.search(/\n\s*\}\s*catch\s*\(/);
      const successPath = catchIndex > -1 ? afterCall.slice(0, catchIndex) : afterCall;
      calls.push({
        callee: match[1],
        callBody,
        componentBlock,
        fileText: file.text,
        sourceContext,
        successPath,
        isDelete: callHasMethod(match[1], callBody, "DELETE"),
        isPatch: callHasMethod(match[1], callBody, "PATCH"),
        isSaveMutation: callIsSaveMutation(match[1], callBody),
      });
    }
    return calls;
  });
}

function callHasMethod(callee, callBody, method) {
  const args = splitTopLevel(callBody);
  if (callee === "fetch") {
    return new RegExp(`\\bmethod\\s*:\\s*["']${escapeRegExp(method)}["']`).test(args[1] ?? "");
  }
  if (callee === "requestJson" || callee === "postJson") {
    if (callee === "postJson" && method === "POST") return true;
    if (callee === "requestJson" && !args[2] && method === "POST") return true;
    return new RegExp(`^["']${escapeRegExp(method)}["']$`).test((args[2] ?? "").trim());
  }
  return false;
}

function callIsSaveMutation(callee, callBody) {
  if (callee === "postJson") return true;
  if (callee === "requestJson") {
    const methodArg = (splitTopLevel(callBody)[2] ?? "").trim();
    return !/^["'](?:DELETE|GET)["']$/.test(methodArg);
  }
  return ["POST", "PATCH", "PUT"].some((method) => callHasMethod(callee, callBody, method));
}

function assertTopUpReviewSuccessUsesReviewedResult(successPath, componentBlock, adminUiSource) {
  const returnedNames = returnedReviewResultNames(successPath);
  assert.ok(
    returnedNames.length > 0,
    "review success path must extract a returned payload result or reviewed top-up",
  );
  const reviewCallbackNames = reviewCallbackNamesUsedWithReturnedResult(successPath, returnedNames);
  const onReviewedUsesReviewedResult = reviewCallbackNames.length > 0;
  const setTopUpsUsesReviewedResult = callBodies(successPath, /\bsetTopUps\s*/g).some(
    (body) =>
      returnedNames.some((name) => returnedNamePattern(name).test(body)) &&
      /\b(?:filter|map|=>)\b/.test(body),
  );
  let callbackUsesReturnedArgument = false;
  const callbackBlocks = reviewCallbackBlocksForMatchedMutation(
    componentBlock,
    adminUiSource,
    reviewCallbackNames,
  );
  for (const block of callbackBlocks) {
    const paramName = callbackParameterName(block);
    const usesReturnedArgument =
      paramName &&
      callBodies(block, /\bsetTopUps\s*/g).some(
        (body) =>
          returnedNamePattern(paramName).test(body) &&
          /\b(?:filter|map|=>)\b/.test(body),
      );
    if (usesReturnedArgument) {
      assertNoTopUpReviewReloadOrRefetch(block);
      callbackUsesReturnedArgument = true;
      break;
    }
  }
  assert.ok(
    setTopUpsUsesReviewedResult || (onReviewedUsesReviewedResult && callbackUsesReturnedArgument),
    "review success path must update local state/callback from the returned payload result",
  );
}

function assertNoTopUpReviewReloadOrRefetch(block) {
  assert.doesNotMatch(block, TOP_UP_REVIEW_RELOAD_OR_REFETCH_RE);
}

function reviewCallbackNamesUsedWithReturnedResult(successPath, returnedNames) {
  const names = new Set();
  for (const match of successPath.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const callbackName = match[1];
    if (["setTopUps", "fetch", "requestJson", "postJson", "Response", "JSON"].includes(callbackName)) {
      continue;
    }
    const openParen = successPath.indexOf("(", match.index ?? 0);
    const closeParen = matchingParenIndex(successPath, openParen);
    if (closeParen <= openParen) continue;
    const body = successPath.slice(openParen + 1, closeParen);
    if (returnedNames.some((name) => returnedNamePattern(name).test(body))) {
      names.add(callbackName);
    }
  }
  return [...names];
}

function reviewCallbackBlocksForMatchedMutation(componentBlock, sourceText, callbackNames) {
  const blocks = [];
  const name = componentName(componentBlock);
  for (const callbackName of callbackNames) {
    blocks.push(...reviewCallbackBlocks(componentBlock, [callbackName]));
    if (!name) continue;
    for (const tag of jsxOpeningTags(sourceText, name)) {
      const propPattern = new RegExp(
        `\\b${escapeRegExp(callbackName)}\\s*=\\s*\\{\\s*([A-Za-z_$][\\w$]*)\\s*\\}`,
      );
      const propMatch = propPattern.exec(tag.text);
      if (!propMatch) continue;
      blocks.push(...reviewCallbackBlocks(componentBlockAround(sourceText, tag.index), [propMatch[1]]));
    }
  }
  return blocks;
}

function componentName(componentBlock) {
  const match =
    /\b(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Z][\w$]*)\s*\(/.exec(componentBlock) ??
    /\b(?:export\s+)?const\s+([A-Z][\w$]*)\b/.exec(componentBlock) ??
    /\b(?:export\s+)?class\s+([A-Z][\w$]*)\b/.exec(componentBlock);
  return match?.[1] ?? "";
}

function jsxOpeningTags(sourceText, componentNameValue) {
  const tags = [];
  const pattern = new RegExp(`<${escapeRegExp(componentNameValue)}\\b`, "g");
  for (const match of sourceText.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = jsxOpeningTagEnd(sourceText, start);
    if (end > start) {
      tags.push({
        index: start,
        text: sourceText.slice(start, end + 1),
      });
    }
  }
  return tags;
}

function jsxOpeningTagEnd(sourceText, start) {
  let braceDepth = 0;
  let stringQuote = "";
  for (let index = start; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (stringQuote) {
      if (char === stringQuote && sourceText[index - 1] !== "\\") stringQuote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === ">" && braceDepth === 0) return index;
  }
  return -1;
}

function reviewCallbackBlocks(successPath, names = ["handleReviewed", "onReviewed"]) {
  const blocks = [];
  if (names.length === 0) return blocks;
  const namePattern = names.map(escapeRegExp).join("|");
  const patterns = [
    new RegExp(`\\b(?:const|let)\\s+(?:${namePattern})\\s*=\\s*(?:\\([^)]*\\)|\\w+)\\s*=>`, "g"),
    new RegExp(`\\bfunction\\s+(?:${namePattern})\\s*\\([^)]*\\)\\s*\\{`, "g"),
  ];
  for (const pattern of patterns) {
    for (const match of successPath.matchAll(pattern)) {
      const index = match.index ?? 0;
      const openBrace = successPath.indexOf("{", index);
      if (openBrace === -1) continue;
      const closeBrace = matchingBraceIndex(successPath, openBrace);
      if (closeBrace > openBrace) blocks.push(successPath.slice(index, closeBrace + 1));
    }
  }
  return blocks;
}

function callbackParameterName(block) {
  const functionMatch = /\bfunction\s+\w+\s*\(\s*(\w+)/.exec(block);
  if (functionMatch) return functionMatch[1];
  const arrowMatch =
    /\b(?:const|let)\s+\w+\s*=\s*(?:\(\s*(\w+)|(\w+))/.exec(block);
  return arrowMatch?.[1] ?? arrowMatch?.[2] ?? "";
}

function returnedReviewResultNames(successPath) {
  const responsePayloadNames = new Set();
  const returnedNames = new Set();
  for (const match of successPath.matchAll(
    /\b(?:const|let)\s+(\w+)\s*=\s*await\s+response\.json\s*\(/g,
  )) {
    responsePayloadNames.add(match[1]);
  }
  for (const match of successPath.matchAll(
    /\b(?:const|let)\s*\{([\s\S]*?)\}\s*=\s*await\s+response\.json\s*\(/g,
  )) {
    addReturnedReviewFields(returnedNames, match[1]);
  }
  for (const payloadName of responsePayloadNames) {
    for (const match of successPath.matchAll(
      new RegExp(
        `\\b(?:const|let)\\s+(\\w+)\\s*=\\s*${payloadName}\\.(?:result|topUp|reviewedTopUp)\\b`,
        "g",
      ),
    )) {
      returnedNames.add(match[1]);
    }
    for (const match of successPath.matchAll(
      new RegExp(`\\b(?:const|let)\\s*\\{([\\s\\S]*?)\\}\\s*=\\s*${payloadName}\\b`, "g"),
    )) {
      addReturnedReviewFields(returnedNames, match[1]);
    }
    for (const field of ["result", "topUp", "reviewedTopUp"]) {
      if (new RegExp(`\\b${payloadName}\\.${field}\\b`).test(successPath)) {
        returnedNames.add(`${payloadName}.${field}`);
      }
    }
  }
  return [...returnedNames];
}

function addReturnedReviewFields(names, fields) {
  for (const fieldMatch of fields.matchAll(
    /\b(result|topUp|reviewedTopUp)\b(?:\s*:\s*(\w+))?/g,
  )) {
    names.add(fieldMatch[2] ?? fieldMatch[1]);
  }
}

function returnedNamePattern(name) {
  return new RegExp(`(^|[^\\w$])${escapeRegExp(name)}([^\\w$]|$)`);
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
    mutationBodies.some((body) => returnedNamePattern(name).test(body)),
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("raw error leak guard allows mapped helpers but rejects direct message returns", () => {
  assert.doesNotThrow(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ code: "bad", error: mapError(dbError.message) }, { status: 400 });',
    );
  });
  assert.doesNotThrow(() => {
    assertRawErrorMessageIsNotReturned(
      'return adminErrorResponse(409, adminShippingErrorMessage(error));',
    );
  });
  assert.doesNotThrow(() => {
    assertRawErrorMessageIsNotReturned(
      'return adminErrorResponse("bad", topUpReviewErrorMessage(error.message), 500);',
    );
  });
  assert.doesNotThrow(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ code: "bad", error: safeMessage(error) }, { status: 400 });',
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
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ error: ((dbError)).message }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ error: dbError.message ?? "fallback" }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ error: error.message ? error.message : "fallback" }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json(error.message, { status: 500 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const body = { error: dbError.message }; return Response.json(body);',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const body = { error: ((dbError)).message }; return Response.json(body);',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const body = error.message; return Response.json(body, { status: 500 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const msg = error.message; return Response.json({ error: msg }, { status: 500 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const msg = error.message; return Response.json({ errors: [msg] }, { status: 500 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const { message: msg } = error; return Response.json({ error: msg }, { status: 500 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const { message: msg } = error; return Response.json({ errors: [msg] }, { status: 500 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const { message } = error; return Response.json({ errors: [message] }, { status: 500 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ error: { message: dbError.message } }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return Response.json({ errors: [dbError.message] }, { status: 400 });',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return adminErrorResponse("bad", error.message, 500);',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const body = { error: dbError.message }; return adminErrorResponse("bad", body, 500);',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'const body = dbError.message; return adminErrorResponse("bad", body, 500);',
    );
  });
  assert.throws(() => {
    assertRawErrorMessageIsNotReturned(
      'return someResponseHelper({ error: dbError.message });',
    );
  });
});

test("shipping UUID validation helper requires invalid-id rejection before RPC", () => {
  assert.doesNotThrow(() => {
    assertShippingRequestIdValidatedBeforeRpc(`
      export async function PATCH(request: Request) {
        const shippingRequestId = "11111111-1111-4111-8111-111111111111";
        if (!UUID_RE.test(shippingRequestId)) return Response.json({ error: "Invalid" });
        await supabase.rpc("update_shipping_request_status", { p_shipping_request_id: shippingRequestId });
      }
    `);
  });
  assert.doesNotThrow(() => {
    assertShippingRequestIdValidatedBeforeRpc(`
      export async function PATCH(request: Request) {
        const shippingRequestId = "11111111-1111-4111-8111-111111111111";
        const isValid = isUuid(shippingRequestId);
        if (!isValid) return Response.json({ error: "Invalid" });
        await supabase.rpc("update_shipping_request_status", { p_shipping_request_id: shippingRequestId });
      }
    `);
  });
  assert.throws(() => {
    assertShippingRequestIdValidatedBeforeRpc(`
      export async function PATCH(request: Request) {
        const shippingRequestId = "11111111-1111-4111-8111-111111111111";
        if (UUID_RE.test(shippingRequestId)) return Response.json({ error: "Invalid" });
        await supabase.rpc("update_shipping_request_status", { p_shipping_request_id: shippingRequestId });
      }
    `);
  });
});

test("admin top-up route keeps review RPCs stable and adds bounded list protections", () => {
  const route = source("src/app/api/ynot/admin/top-ups/route.ts");
  const getRoute = exportedFunctionBlock(route, "GET");
  const patchRoute = exportedFunctionBlock(route, "PATCH");
  assertRpcCall(patchRoute, "approve_top_up_request");
  assertRpcCall(patchRoute, "reject_top_up_request");
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(getRoute, /ynot:admin:top-ups:list/);
  assert.match(getRoute, /new URL\(request\.url\)/);
  assertTopUpGetParsesAndPassesListOptions(getRoute);
  assertTopUpGetReturnsRateLimitBeforeList(getRoute);
});

test("getTopUps supports admin status and cursor filtering without changing public redaction", () => {
  const data = source("src/features/ynot/data.ts");
  const getTopUps = between(data, "export async function getTopUps", "export function toTopUp");
  assert.match(getTopUps, /statuses\?: readonly/);
  assert.match(getTopUps, /cursorCreatedAt\?: string/);
  assert.match(getTopUps, /\.in\("status", statuses\)/);
  assert.match(getTopUps, /\.lt\("created_at", options\.cursorCreatedAt\)/);

  const publicTopUp = between(data, "export function publicTopUp", "export async function getCollection");
  assert.match(publicTopUp, /delete publicFields\.id/);
  assert.match(publicTopUp, /delete publicFields\.profileId/);
  assert.match(publicTopUp, /delete publicFields\.adminNote/);
  assert.match(publicTopUp, /delete publicFields\.providerReference/);
  assert.match(publicTopUp, /delete publicFields\.rawPayload/);
  assertPublicTopUpDoesNotReExposePrivateFields(publicTopUp);

  const publicPaymentMethod = between(
    publicTopUp,
    "paymentMethod: topUp.paymentMethod",
    "slipVerification: topUp.slipVerification",
  );
  assertPublicObjectUsesOnlyKeys(
    publicObjectFor(publicTopUp, "paymentMethod: topUp.paymentMethod"),
    ["type", "displayName"],
    "paymentMethod",
  );
  assert.match(publicPaymentMethod, /type: topUp\.paymentMethod\.type/);
  assert.match(publicPaymentMethod, /displayName: topUp\.paymentMethod\.displayName/);
  assert.doesNotMatch(publicPaymentMethod, /\.\.\.\s*topUp\.paymentMethod/);
  assert.doesNotMatch(publicPaymentMethod, /id:/);
  assert.doesNotMatch(publicPaymentMethod, /code:/);
  assert.doesNotMatch(publicTopUp, /\.\.\.\s*topUp\.slipVerification/);
  assertPublicSlipVerificationIsSafe(publicTopUp);
});

test("admin payment method routes require high privilege and return safe failures", () => {
  const paymentRoute = source("src/app/api/ynot/admin/payment-methods/route.ts");
  const qrRoute = source("src/app/api/ynot/admin/payment-methods/qr-image/route.ts");

  for (const [route, mutationPattern] of [
    [paymentRoute, /\.from\(\s*["']payment_methods["']\s*\)/],
    [qrRoute, /\.storage\b/],
  ]) {
    assertAdminPostGuardsBeforeMutation(route, mutationPattern);
    assertRawErrorMessageIsNotReturned(route);
  }
});

test("admin shipping route validates IDs and maps RPC errors safely", () => {
  const shippingRoute = source("src/app/api/ynot/admin/shipping/route.ts");
  const patchRoute = exportedFunctionBlock(shippingRoute, "PATCH");
  assertRpcCall(patchRoute, "update_shipping_request_status");
  assertShippingRequestIdValidatedBeforeRpc(patchRoute);
  assertShippingRpcErrorMappedSafely(patchRoute);
  assertRawErrorMessageIsNotReturned(shippingRoute);
});

test("admin top-up UI removes reviewed rows without a full duplicate fetch", () => {
  const reviewMutationCalls = adminApiCalls("top-ups").filter((call) => call.isPatch);
  assert.ok(reviewMutationCalls.length > 0, "admin top-up PATCH review mutation must exist");
  for (const reviewMutationCall of reviewMutationCalls) {
    const reviewSuccessPath = successfulResponsePath(reviewMutationCall.successPath);
    assertTopUpReviewSuccessUsesReviewedResult(
      reviewSuccessPath,
      reviewMutationCall.componentBlock,
      reviewMutationCall.sourceContext,
    );
    assertNoTopUpReviewReloadOrRefetch(reviewSuccessPath);
  }
});

test("settings admin screen updates payment method state from the save payload", () => {
  const paymentSuccessPaths = saveMutationSuccessPaths("payment-methods");
  assert.ok(paymentSuccessPaths.length > 0, "payment-method save success paths must exist");
  for (const paymentSuccessPath of paymentSuccessPaths) {
    assert.match(
      paymentSuccessPath,
      /(?:const|let)\s+(?:\w+|\{[\s\S]*?\})\s*=\s*await\s+(?:postJson|requestJson)|\.json\(\)/,
    );
    assertPayloadFieldDrivesMutation(
      paymentSuccessPath,
      "paymentMethod",
      String.raw`(?:setMethodOptions|set[A-Za-z]*Payment[A-Za-z]*Methods|onSaved\?\.|onPaymentMethodSaved\?\.)`,
    );
  }
});

test("category admin screen updates parent category state from the save payload", () => {
  const categorySuccessPaths = saveMutationSuccessPaths("categories");
  assert.ok(categorySuccessPaths.length > 0, "category save success paths must exist");
  for (const categorySuccessPath of categorySuccessPaths) {
    assert.match(
      categorySuccessPath,
      /(?:const|let)\s+(?:\w+|\{[\s\S]*?\})\s*=\s*await\s+(?:requestJson|postJson)|\.json\(\)/,
    );
    assertPayloadFieldDrivesMutation(
      categorySuccessPath,
      "category",
      String.raw`(?:onSaved\?\.|set[A-Za-z]*Categories)`,
    );
  }
});
