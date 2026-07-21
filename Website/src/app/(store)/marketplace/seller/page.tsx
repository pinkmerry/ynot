import { redirect } from "next/navigation";
import {
  SellForm,
  type SellFormEditSubmission,
} from "@/features/marketplace-ui/sell/SellForm";
import {
  cardConditionOptions,
  cardGradeOptions,
  cardLanguageOptions,
  cardReleaseYearOptions,
  catalogCategoryOptions,
  gradingServiceOptions,
} from "@/features/ynot/card-catalog-metadata";
import {
  resolveAdminSession,
  resolveCurrentProfile,
} from "@/lib/auth/resolve-current-profile";
import {
  getMockMarketplaceAccount,
  getMarketplaceAccountForProfile,
} from "@/lib/marketplace/account-bridge";
import { marketplaceConfig } from "@/lib/marketplace/config";
import { getSellerSubmissionDetail } from "@/lib/marketplace/seller-consignment";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";

export const dynamic = "force-dynamic";

type SellerPageSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MarketplaceSellerPage({
  searchParams,
}: {
  searchParams?: SellerPageSearchParams;
}) {
  const profile = await resolveCurrentProfile();
  const config = marketplaceConfig();
  const mockMode = config.mockData;
  if (!profile?.profileId && !mockMode) {
    redirect("/packs");
  }

  const admin = profile ? await resolveAdminSession(profile) : null;
  const devOwnerPreview = isDevAuthAllowed() && admin?.adminRole === "owner";
  const allowed =
    mockMode || (config.ownerOnly ? admin?.adminRole === "owner" || devOwnerPreview : true);

  if (!allowed) {
    redirect("/packs");
  }
  if (config.unavailableReason !== null) {
    redirect("/marketplace");
  }

  const account = profile
    ? await getMarketplaceAccountForProfile(profile, admin)
    : getMockMarketplaceAccount(admin);

  const submissionId = firstParam((searchParams ? await searchParams : {}).submission);

  // Edit-mode prefill only: there is no seller-submission list rendered on
  // this page (the sell form is the whole page; "My listings" lives on the
  // orders page), so we only fetch a single submission when ?submission=ID
  // is present instead of loading the full list unconditionally.
  const editDetail = submissionId
    ? await getSellerSubmissionDetail({ submissionId, account }).catch(() => null)
    : null;

  const editSubmission: SellFormEditSubmission | null = editDetail
    ? {
        id: editDetail.id,
        submissionNumber: editDetail.submission_number,
        status: editDetail.status,
        version: editDetail.version,
        itemType: editDetail.item_type,
        titleSnapshot: editDetail.title_snapshot,
        conditionCode: editDetail.condition_code,
        askingPriceSatang: editDetail.asking_price_satang,
        gradeLabel: editDetail.grade_label,
        language: editDetail.language,
        certNumber: editDetail.cert_number,
        conditionNotes: editDetail.condition_notes,
        sellerNote: editDetail.seller_note,
        referenceCardId: editDetail.reference_card_id,
        referenceVariantId: editDetail.reference_variant_id,
        variantSnapshot: editDetail.variant_snapshot ?? {},
        referenceSnapshot: editDetail.reference_snapshot ?? {},
        photos: (editDetail.photos ?? []).map((photo) => ({
          id: photo.id,
          previewUrl: `/api/marketplace/seller/submissions/${editDetail.id}/photos/${photo.id}/file`,
        })),
      }
    : null;

  const sellerActive = mockMode || account?.sellerStatus === "active";

  return (
    <div className="store-home-grid marketplace-detail-page">
      <div className="store-main-stack">
        <SellForm
          sellerActive={sellerActive}
          mockMode={mockMode}
          options={{
            categoryOptions: catalogCategoryOptions,
            conditionOptions: cardConditionOptions,
            gradingServiceOptions,
            gradeOptions: cardGradeOptions,
            languageOptions: cardLanguageOptions,
            releaseYearOptions: cardReleaseYearOptions,
          }}
          editSubmission={editSubmission}
        />
      </div>
    </div>
  );
}
