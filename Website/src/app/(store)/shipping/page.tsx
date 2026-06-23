import { ShippingRequestExperience } from "@/features/ynot/client";
import { OrderList, PageHeader, YnotShell } from "@/features/ynot/components";
import { getYnotDashboardSlice } from "@/features/ynot/data";
import { I18nText, i18n } from "@/features/ynot/i18n";
import { requireCurrentProfile } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function ShippingPage() {
  await requireCurrentProfile("/shipping");
  const data = await getYnotDashboardSlice({
    collection: true,
    addresses: true,
    shipping: true,
  });
  return (
    <YnotShell viewer={data.viewer} walletBalance={data.wallet.balanceCoins}>
      <PageHeader
        eyebrow={i18n("07 · Real Shipping", "07 · จัดส่งจริง")}
        title={i18n("Pick cards to ship", "เลือกการ์ดเพื่อจัดส่ง")}
        description={i18n(
          "4 stages: pick → address → confirm → success.",
          "4 ขั้นตอน: เลือก → ที่อยู่ → ยืนยัน → สำเร็จ",
        )}
      />
      <div className="phone-page-shell shipping-phone grid gap-4 xl:grid-cols-[0.8fr_1fr]">
        <div className="inner-phone-header">
          <div className="phone-rule" aria-hidden><span /><span /><span /></div>
          <div className="template-top-bar centered">
            <h2>
              <I18nText en="Pick cards to ship" th="เลือกการ์ดเพื่อจัดส่ง" />
            </h2>
          </div>
          <div className="ranking-tabs collection-tabs">
            <span className="active"><I18nText en="Pending" th="รอดำเนินการ" /></span>
            <span><I18nText en="Awaiting ship" th="รอจัดส่ง" /></span>
            <span><I18nText en="Shipped" th="จัดส่งแล้ว" /></span>
          </div>
        </div>
        <ShippingRequestExperience collection={data.collection} addresses={data.addresses} />
        <OrderList title={i18n("Shipping history", "ประวัติการจัดส่ง")} orders={data.shipping} />
      </div>
    </YnotShell>
  );
}
