import { AdminShippingConsole } from "@/features/ynot/admin/AdminShippingConsole";
import { AdminGate } from "@/features/ynot/components";
import { getShipping, getYnotDashboardSlice } from "@/features/ynot/data";
import { AdminFrame, AdminIcon } from "@/features/ynot/admin";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  const [data, shipping] = await Promise.all([
    getYnotDashboardSlice({ wallet: false }),
    getShipping(undefined, true),
  ]);
  const active = shipping.filter(
    (request) => request.status === "submitted" || request.status === "packing",
  ).length;

  return (
    <AdminGate viewer={data.viewer}>
      <AdminFrame
        viewer={data.viewer}
        active="/admin/shipping"
        trail={["Admin", "Operations", "Shipping"]}
        eyebrow="Admin shipping"
        title="Shipping fulfilment"
        desc="Review every customer shipment with user, reward, pack source, address, tracking, and status history."
        badges={{ "/admin/shipping": active || undefined }}
        actions={
          <span className="btn btn-primary">
            <AdminIcon name="truck" />
            {active} active
          </span>
        }
      >
        <AdminShippingConsole requests={shipping} />
      </AdminFrame>
    </AdminGate>
  );
}
