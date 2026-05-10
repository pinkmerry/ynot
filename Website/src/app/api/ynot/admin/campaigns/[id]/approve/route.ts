import { handleWorkflow, readString } from "../../_workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleWorkflow(request, {
    role: "owner",
    rateBucket: "approve",
    invoke: (supabase, admin, body) =>
      supabase.rpc("approve_campaign", {
        p_admin_id: admin.adminId,
        p_round_id: id,
        p_notes: readString(body, "notes"),
      }),
  });
}
