import { handleWorkflow } from "../../_workflow";

export const dynamic = "force-dynamic";

const ALLOWED_MODES = new Set(["pure_random", "weighted", "inventory_gate"]);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleWorkflow(request, {
    role: "admin",
    rateBucket: "spin-config",
    invoke: (supabase, admin, body) => {
      const spinMode = typeof body.spinMode === "string" ? body.spinMode : "";
      if (!ALLOWED_MODES.has(spinMode)) {
        return Promise.resolve({ error: { message: "invalid_spin_mode" } });
      }
      const spinConfig =
        body.spinConfig && typeof body.spinConfig === "object" && !Array.isArray(body.spinConfig)
          ? (body.spinConfig as Record<string, unknown>)
          : {};
      return supabase.rpc("update_campaign_spin_config", {
        p_admin_id: admin.adminId,
        p_round_id: id,
        p_spin_mode: spinMode as "pure_random" | "weighted" | "inventory_gate",
        p_spin_config: spinConfig as never,
      });
    },
  });
}
