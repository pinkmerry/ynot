import { fromDrawConfig, getActiveDraw, isSupabaseConfigured, syncRoundPrizeCards } from "@/lib/lucky-draw/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-compat";
import type { ChaseCard, DrawConfig, FeaturedCard } from "@/lib/lucky-draw/types";
import type { Database, Json } from "@/lib/supabase/types";

type UpdateDrawBody = {
  draw?: Partial<DrawConfig>;
  featuredCards?: FeaturedCard[];
  chaseCards?: ChaseCard[];
};

export async function PATCH(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const session = await resolveAdminSession();
    if (!session) {
      return Response.json({ error: "Admin access is required." }, { status: 403 });
    }

    let body: UpdateDrawBody;
    try {
      body = (await request.json()) as UpdateDrawBody;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!body.draw && !body.featuredCards && !body.chaseCards) {
      return Response.json({ error: "Missing draw settings." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const activeDraw = await getActiveDraw(supabase);
    if (!activeDraw) {
      return Response.json({ error: "No draw round exists yet." }, { status: 404 });
    }
    if (activeDraw.status !== "draft") {
      return Response.json(
        { error: "Draw settings and prize cards can only be changed on a draft/private draw before owner approval." },
        { status: 409 },
      );
    }

    const nextDraw: DrawConfig = {
      slug: activeDraw.slug,
      status: activeDraw.status,
      titleTh: body.draw?.titleTh ?? activeDraw.title_th,
      titleEn: body.draw?.titleEn ?? activeDraw.title_en,
      series: body.draw?.series ?? (activeDraw.series === "pokemon" ? "Pokemon" : "One Piece"),
      price: body.draw?.price ?? activeDraw.price_thb,
      totalSlots: body.draw?.totalSlots ?? activeDraw.total_slots,
      orderCodePrefix: body.draw?.orderCodePrefix ?? activeDraw.order_code_prefix ?? "LD",
      facebookUrl: body.draw?.facebookUrl ?? activeDraw.facebook_live_url ?? "",
      youtubeUrl: body.draw?.youtubeUrl ?? activeDraw.youtube_embed_url ?? "",
      promptPay: body.draw?.promptPay ?? activeDraw.promptpay_id ?? "",
      qrImageUrl: body.draw?.qrImageUrl ?? activeDraw.promptpay_qr_image_url ?? "",
      bankName: body.draw?.bankName ?? activeDraw.bank_name ?? "",
      accountName: body.draw?.accountName ?? activeDraw.bank_account_name ?? "",
      accountNumber: body.draw?.accountNumber ?? activeDraw.bank_account_number ?? "",
    };

    const patch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {
      ...fromDrawConfig(nextDraw),
      ...(body.featuredCards ? { featured_cards: body.featuredCards as unknown as Json } : {}),
      ...(body.chaseCards ? { chase_cards: body.chaseCards as unknown as Json } : {}),
      status: "draft",
      visibility: "private",
      approval_status: "pending_review",
      approval_requested_by: session.adminId,
      approval_requested_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      approval_notes: "Legacy draw settings or prize cards changed. Owner review is required before publish.",
    };

    let { error } = await supabase.from("draw_rounds").update(patch).eq("id", activeDraw.id);
    if (error && isMissingColumnError(error)) {
      const legacyPatch: Database["public"]["Tables"]["draw_rounds"]["Update"] = {
        ...fromDrawConfig(nextDraw),
        ...(body.featuredCards ? { featured_cards: body.featuredCards as unknown as Json } : {}),
        ...(body.chaseCards ? { chase_cards: body.chaseCards as unknown as Json } : {}),
        status: "draft",
        visibility: "private",
      };
      ({ error } = await supabase
        .from("draw_rounds")
        .update(legacyPatch)
        .eq("id", activeDraw.id));
    }
    if (error) throw error;

    if (body.featuredCards || body.chaseCards) {
      await syncRoundPrizeCards(
        supabase,
        activeDraw.id,
        body.featuredCards ?? [],
        body.chaseCards ?? [],
      );
    }

    if (nextDraw.totalSlots !== activeDraw.total_slots) {
      await supabase.rpc("create_draw_slots", { p_draw_round_id: activeDraw.id });
    }

    await supabase.from("audit_events").insert({
      actor_admin_id: session.adminId,
      event_type: "draw_updated",
      draw_round_id: activeDraw.id,
      metadata: { slug: activeDraw.slug, approvalStatus: "pending_review" },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to update draw settings", error);
    return Response.json({ error: error instanceof Error ? error.message : "Draw settings could not be saved." }, { status: 500 });
  }
}
