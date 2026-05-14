type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

function errorText(error: unknown) {
  const maybe = error as SupabaseErrorLike;
  return [maybe?.message, maybe?.details, maybe?.hint]
    .filter(Boolean)
    .join(" ");
}

export function isMissingColumnError(error: unknown, column?: string) {
  const maybe = error as SupabaseErrorLike;
  const text = errorText(error);
  if (maybe?.code !== "42703" && !/column .* does not exist/i.test(text)) {
    return false;
  }
  return column ? text.includes(column) : true;
}

export function isMissingFunctionError(error: unknown, functionName?: string) {
  const maybe = error as SupabaseErrorLike;
  const text = errorText(error);
  if (maybe?.code !== "42883" && !/function .* does not exist/i.test(text)) {
    return false;
  }
  return functionName ? text.includes(functionName) : true;
}

export function randomPackSchemaMissingResponse() {
  return Response.json(
    {
      code: "RANDOM_PACK_SCHEMA_MISSING",
      error:
        "Random pack owner approval schema is not applied yet. Apply the Supabase migration after the backup/PITR gate before using this action in production.",
    },
    { status: 409 },
  );
}
