import {
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { prepareMarketplaceMutation } from "@/lib/marketplace/mutation-guard";
import {
  marketplaceErrorResponse,
} from "@/lib/marketplace/route-guards";
import {
  createMarketplaceSupabaseClient,
  MarketplaceServiceError,
} from "@/lib/marketplace/supabase-adapter";
import {
  attachSellerSubmissionPhotoMetadata,
  normalizeSellerPhotoDisplayOrder,
  normalizeSellerPhotoRole,
} from "@/lib/marketplace/seller-consignment";
import {
  allowedSlipTypes,
  extensionForVerifiedImage,
  maxSlipBytes,
  requestExceedsUploadLimit,
  verifyImageMagicBytes,
} from "@/lib/uploads/magic-bytes";

export const dynamic = "force-dynamic";

const sellerPhotoBucketName = "marketplace-seller-submission-photos";

async function sha256Hex(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function cleanFileName(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 120) || "seller-photo"
  );
}

function storageObjectAlreadyExists(error: {
  error?: string;
  message?: string;
  status?: number | string;
  statusCode?: number | string;
}) {
  const status = String(error.status ?? error.statusCode ?? "");
  const material = `${error.error ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    status === "409" ||
    material.includes("already exists") ||
    material.includes("duplicate")
  );
}

function getSellerPhotoFile(form: FormData) {
  const file = form.get("sellerPhoto") ?? form.get("photo");
  if (!(file instanceof File)) {
    throw new MarketplaceServiceError(
      "marketplace_seller_photo_required",
      "Seller item photo is required.",
      400,
    );
  }
  if (file.size <= 0 || file.size > maxSlipBytes) {
    throw new MarketplaceServiceError(
      "marketplace_seller_photo_invalid",
      "Seller item photo is invalid.",
      400,
    );
  }
  return file;
}

function expectedVersionFromForm(form: FormData) {
  const raw = form.get("expectedVersion");
  if (raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new MarketplaceServiceError(
      "marketplace_version_invalid",
      "Marketplace request is invalid.",
      400,
    );
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new MarketplaceServiceError(
      "marketplace_version_invalid",
      "Marketplace request is invalid.",
      400,
    );
  }
  return parsed;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ submissionId: string }> },
) {
  const mutation = await prepareMarketplaceMutation(request, {
    method: "POST",
    action: "sellerSubmission",
    rateLimit: {
      key: "ynot:marketplace:seller:submissions:photos",
      limit: 20,
      windowMs: 60_000,
    },
    readBody: false,
  });
  if (!mutation.ok) return mutation.response;

  const { access, idempotencyKey, profile, requestId } = mutation;

  try {
    if (requestExceedsUploadLimit(request)) {
      throw new MarketplaceServiceError(
        "marketplace_seller_photo_invalid",
        "Seller item photo is invalid.",
        413,
      );
    }
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new MarketplaceServiceError(
        "marketplace_seller_photo_invalid",
        "Seller item photo is invalid.",
        415,
      );
    }

    const { submissionId } = await ctx.params;
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account?.accountId || !account.capabilities.canSell) {
      throw new MarketplaceServiceError(
        "marketplace_seller_account_required",
        "Marketplace seller account is required.",
        403,
      );
    }
    const form = await request.formData();
    const sellerPhoto = getSellerPhotoFile(form);
    const expectedVersion = expectedVersionFromForm(form);
    const photoRole = normalizeSellerPhotoRole(form.get("photoRole"));
    const displayOrder = normalizeSellerPhotoDisplayOrder(form.get("displayOrder"));
    const magicCheck = await verifyImageMagicBytes(sellerPhoto);
    if (!magicCheck.ok) {
      throw new MarketplaceServiceError(
        "marketplace_seller_photo_invalid",
        magicCheck.error,
        400,
      );
    }
    if (!allowedSlipTypes.has(magicCheck.contentType)) {
      throw new MarketplaceServiceError(
        "marketplace_seller_photo_invalid",
        "Seller item photo is invalid.",
        400,
      );
    }

    const fileBuffer = await sellerPhoto.arrayBuffer();
    const fileSha256 = await sha256Hex(fileBuffer);
    const fileName = cleanFileName(sellerPhoto.name);
    const extension = extensionForVerifiedImage(magicCheck.contentType);
    const orderedRole = `${String(displayOrder).padStart(2, "0")}-${photoRole}`;
    const storageSafeIdempotencyKey = cleanFileName(idempotencyKey);
    const storagePath = [
      account.accountId,
      submissionId,
      `${orderedRole}-${storageSafeIdempotencyKey}-${fileSha256.slice(0, 12)}-${fileName}.${extension}`,
    ].join("/");

    const supabase = createMarketplaceSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(sellerPhotoBucketName)
      .upload(storagePath, sellerPhoto, {
        contentType: magicCheck.contentType,
        upsert: false,
      });
    const uploadedPhotoNow = !uploadError;
    if (uploadError && !storageObjectAlreadyExists(uploadError)) {
      throw new MarketplaceServiceError(
        "marketplace_seller_photo_invalid",
        "Seller item photo could not be stored.",
        500,
        uploadError.message,
      );
    }

    try {
      const canonicalBody = JSON.stringify({
        contentType: magicCheck.contentType,
        displayOrder,
        expectedVersion: expectedVersion ?? null,
        fileSha256,
        fileSizeBytes: sellerPhoto.size,
        photoRole,
        storagePath,
        submissionId,
      });
      const photo = await attachSellerSubmissionPhotoMetadata({
        submissionId,
        body: {
          expectedVersion,
          storagePath,
          photoRole,
          displayOrder,
          fileSha256,
          fileSizeBytes: sellerPhoto.size,
          contentType: magicCheck.contentType,
        },
        profile,
        account,
        requestId,
        idempotencyKey,
        requestHash: await mutation.requestHashForTargetBody(
          "seller_submission.photo.attach",
          submissionId,
          canonicalBody,
        ),
      });

      return Response.json({ ok: true, request_id: requestId, photo });
    } catch (error) {
      if (uploadedPhotoNow) {
        await supabase.storage.from(sellerPhotoBucketName).remove([storagePath]);
      }
      throw error;
    }
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
