import { handleWorkflow, readString } from "../../_workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleWorkflow(request, {
    role: "owner",
    rateBucket: "reject",
    invoke: (supabase, admin, body) => {
      const reason = readString(body, "reason");
      if (!reason) {
        return Promise.resolve({ error: { message: "rejection_reason_required" } });
      }
      return supabase.rpc("reject_campaign", {
        p_admin_id: admin.adminId,
        p_round_id: id,
        p_reason: reason,
      });
    },
  });
}
