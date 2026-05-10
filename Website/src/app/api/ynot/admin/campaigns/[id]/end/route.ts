import { handleWorkflow } from "../../_workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleWorkflow(request, {
    role: "owner",
    rateBucket: "end",
    invoke: (supabase, admin) =>
      supabase.rpc("end_campaign", {
        p_admin_id: admin.adminId,
        p_round_id: id,
      }),
  });
}
