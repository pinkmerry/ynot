type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type AdminErrorOptions = {
  detail?: string | null;
  hint?: string | null;
  blockers?: string[];
  extra?: Record<string, unknown>;
};

type KnownError = {
  code: string;
  error: string;
  status?: number;
};

export type KnownErrorMap = Record<string, KnownError>;

function errorParts(error: unknown) {
  const maybe = error as SupabaseErrorLike;
  return {
    code: typeof maybe?.code === "string" ? maybe.code : undefined,
    detail: typeof maybe?.details === "string" ? maybe.details : null,
    hint: typeof maybe?.hint === "string" ? maybe.hint : null,
    message: typeof maybe?.message === "string" ? maybe.message : undefined,
  };
}

export function adminErrorText(error: unknown) {
  const { code, detail, hint, message } = errorParts(error);
  return [code, message, detail, hint].filter(Boolean).join(" ");
}

export function adminErrorResponse(
  code: string,
  error: string,
  status = 409,
  options: AdminErrorOptions = {},
) {
  return Response.json(
    {
      ok: false,
      code,
      error,
      ...(options.detail === undefined ? {} : { detail: options.detail }),
      ...(options.hint === undefined ? {} : { hint: options.hint }),
      ...(options.blockers === undefined ? {} : { blockers: options.blockers }),
      ...(options.extra ?? {}),
    },
    { status },
  );
}

export function mappedAdminErrorResponse(
  error: unknown,
  knownErrors: KnownErrorMap,
  fallback: {
    code: string;
    error: string;
    status?: number;
  },
) {
  const text = adminErrorText(error);
  const match = Object.entries(knownErrors).find(([symbol]) =>
    text.includes(symbol),
  );
  const parts = errorParts(error);

  if (match) {
    const [, mapped] = match;
    return adminErrorResponse(mapped.code, mapped.error, mapped.status ?? 409, {
      detail: parts.detail,
      hint: parts.hint,
    });
  }

  return adminErrorResponse(
    parts.code ?? fallback.code,
    parts.message ?? fallback.error,
    fallback.status ?? 409,
    {
      detail: parts.detail,
      hint: parts.hint,
    },
  );
}

export const cardStockErrorMap: KnownErrorMap = {
  card_required: {
    code: "CARD_STOCK_CARD_REQUIRED",
    error: "Choose a card before adjusting global stock.",
    status: 400,
  },
  invalid_stock_quantity_delta: {
    code: "CARD_STOCK_INVALID_QUANTITY",
    error: "Enter a non-zero stock quantity within the allowed adjustment range.",
    status: 400,
  },
  card_not_found: {
    code: "CARD_STOCK_CARD_NOT_FOUND",
    error: "The selected card no longer exists. Refresh the catalog and try again.",
    status: 404,
  },
  insufficient_available_card_stock: {
    code: "CARD_STOCK_INSUFFICIENT_AVAILABLE",
    error:
      "Not enough available global stock can be removed for this card. Check active reservations or lower the remove quantity.",
    status: 409,
  },
};

export const campaignLifecycleErrorMap: KnownErrorMap = {
  campaign_required: {
    code: "CAMPAIGN_REQUIRED",
    error: "Choose a random pack before running this lifecycle action.",
    status: 400,
  },
  campaign_not_found: {
    code: "CAMPAIGN_NOT_FOUND",
    error: "This random pack no longer exists. Refresh the admin page and try again.",
    status: 404,
  },
  campaign_must_be_draft: {
    code: "CAMPAIGN_MUST_BE_DRAFT",
    error: "Only draft/private random packs can be submitted or changed.",
  },
  campaign_must_be_pending_review: {
    code: "CAMPAIGN_MUST_BE_PENDING_REVIEW",
    error: "This random pack is not waiting for owner review.",
  },
  campaign_must_be_approved: {
    code: "CAMPAIGN_MUST_BE_APPROVED",
    error: "Owner approval is required before publishing this random pack.",
  },
  approved_campaign_inventory_locked: {
    code: "CAMPAIGN_INVENTORY_LOCKED",
    error: "Approved pack inventory is locked. Archive it or create a new draft before changing settings.",
  },
  prize_inventory_required: {
    code: "CAMPAIGN_PRIZE_INVENTORY_REQUIRED",
    error: "Add prize inventory before submitting this random pack for owner review.",
  },
  planned_prize_quantity_must_equal_total_slots: {
    code: "CAMPAIGN_PRIZE_QUANTITY_MISMATCH",
    error: "Prize quantity must equal the total pack quantity before owner review.",
  },
  launch_prize_pool_required: {
    code: "CAMPAIGN_LAUNCH_PRIZE_POOL_REQUIRED",
    error: "At least one prize must be available when the random pack launches.",
  },
  insufficient_card_stock: {
    code: "CAMPAIGN_INSUFFICIENT_CARD_STOCK",
    error: "Global card stock is not sufficient to reserve this random pack. Add stock to the selected prize cards or lower planned quantities.",
  },
  campaign_has_awarded_inventory: {
    code: "CAMPAIGN_HAS_AWARDED_INVENTORY",
    error: "This random pack has awarded inventory, so it cannot be removed. Close or archive it for history instead.",
  },
  reserved_stock_must_match_planned_quantity: {
    code: "CAMPAIGN_RESERVED_STOCK_MISMATCH",
    error: "Reserved stock no longer matches the planned prize quantity. Refresh and re-submit owner review.",
  },
  materialized_stock_must_match_planned_quantity: {
    code: "CAMPAIGN_MATERIALIZED_STOCK_MISMATCH",
    error: "Approved stock no longer matches the planned prize quantity. Recheck owner review before publishing.",
  },
  approved_inventory_not_ready_for_publish: {
    code: "CAMPAIGN_APPROVED_INVENTORY_NOT_READY",
    error: "Approved prize inventory is not ready for publish. Recheck the owner approval queue.",
  },
  approved_prize_units_must_match_planned_quantity: {
    code: "CAMPAIGN_APPROVED_PRIZE_QUANTITY_MISMATCH",
    error: "Approved prize units must match the planned quantity before publish.",
  },
};
