import { cookies } from "next/headers";
import { getActiveDraw, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { readSessionCookie, verifyAdminSession } from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";

type DrawAction = "close_sales" | "create_next" | "publish_next" | "reopen_sales";

type DrawLifecycleBody = {
  action?: unknown;
};

function uniqueNextSlug(sourceSlug: string) {
  const base = sourceSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "lucky-draw";
  return `${base}-next-${Date.now().toString(36)}`;
}

function isDrawAction(value: unknown): value is DrawAction {
  return value === "close_sales" || value === "create_next" || value === "publish_next" || value === "reopen_sales";
}

async function countUnsettledOrders(supabase: ReturnType<typeof createServiceSupabaseClient>, drawRoundId: string) {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("draw_round_id", drawRoundId)
    .in("status", ["pending_payment_review", "approved_for_pick"]);

  if (error) throw error;
  return count ?? 0;
}

async function copyRoundPrizes(supabase: ReturnType<typeof createServiceSupabaseClient>, sourceDrawId: string, nextDrawId: string) {
  const { data, error } = await supabase
    .from("draw_round_prizes")
    .select("card_id,tier,rank,value_thb,tone")
    .eq("draw_round_id", sourceDrawId);

  if (error) throw error;
  if (!data?.length) return;

  const { error: insertError } = await supabase.from("draw_round_prizes").insert(
    data.map((prize) => ({
      draw_round_id: nextDrawId,
      card_id: prize.card_id,
      tier: prize.tier,
      rank: prize.rank,
      value_thb: prize.value_thb,
      tone: prize.tone,
    })),
  );

  if (insertError) throw insertError;
}

async function auditDrawAction(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  session: NonNullable<Awaited<ReturnType<typeof verifyAdminSession>>>,
  eventType: string,
  drawRoundId: string,
  metadata: Json = {},
) {
  await supabase.from("audit_events").insert({
    actor_admin_id: session.adminId,
    event_type: eventType,
    draw_round_id: drawRoundId,
    metadata,
  });
}

async function closeSales(supabase: ReturnType<typeof createServiceSupabaseClient>, session: NonNullable<Awaited<ReturnType<typeof verifyAdminSession>>>) {
  const activeDraw = await getActiveDraw(supabase, { statuses: ["live"], priority: ["live"] });
  if (!activeDraw) return Response.json({ error: "No live draw is accepting orders." }, { status: 404 });

  const { error } = await supabase
    .from("draw_rounds")
    .update({ status: "closed" })
    .eq("id", activeDraw.id);

  if (error) throw error;
  await auditDrawAction(supabase, session, "draw_sales_closed", activeDraw.id, { slug: activeDraw.slug });
  return Response.json({ ok: true });
}

async function reopenSales(supabase: ReturnType<typeof createServiceSupabaseClient>, session: NonNullable<Awaited<ReturnType<typeof verifyAdminSession>>>) {
  const closedDraw = await getActiveDraw(supabase, { statuses: ["closed"], priority: ["closed"] });
  if (!closedDraw) return Response.json({ error: "No closed draw is available to reopen." }, { status: 404 });

  const { data: draft } = await supabase
    .from("draw_rounds")
    .select("id")
    .eq("status", "draft")
    .limit(1)
    .maybeSingle();

  if (draft) {
    return Response.json({ error: "Publish or archive the draft before reopening sales." }, { status: 409 });
  }

  const { error } = await supabase
    .from("draw_rounds")
    .update({ status: "live" })
    .eq("id", closedDraw.id);

  if (error) throw error;
  await auditDrawAction(supabase, session, "draw_sales_reopened", closedDraw.id, { slug: closedDraw.slug });
  return Response.json({ ok: true });
}

async function createNextDraw(supabase: ReturnType<typeof createServiceSupabaseClient>, session: NonNullable<Awaited<ReturnType<typeof verifyAdminSession>>>) {
  const { data: existingDraft, error: draftError } = await supabase
    .from("draw_rounds")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftError) throw draftError;
  if (existingDraft) return Response.json({ ok: true, drawId: existingDraft.id, reusedDraft: true });

  const sourceDraw = await getActiveDraw(supabase, { statuses: ["closed", "live"], priority: ["closed", "live"] });
  if (!sourceDraw) return Response.json({ error: "No draw is available to copy." }, { status: 404 });
  if (sourceDraw.status !== "closed") {
    return Response.json({ error: "Close sales before creating the next draw." }, { status: 409 });
  }

  const unsettledOrders = await countUnsettledOrders(supabase, sourceDraw.id);
  if (unsettledOrders > 0) {
    return Response.json({ error: "Settle pending payments and picks before creating the next draw." }, { status: 409 });
  }

  const nextDraw: Omit<Database["public"]["Tables"]["draw_rounds"]["Insert"], "id" | "created_at" | "updated_at"> = {
    slug: uniqueNextSlug(sourceDraw.slug),
    status: "draft",
    series: sourceDraw.series,
    title_th: sourceDraw.title_th,
    title_en: sourceDraw.title_en,
    price_thb: sourceDraw.price_thb,
    total_slots: sourceDraw.total_slots,
    order_code_prefix: sourceDraw.order_code_prefix,
    facebook_live_url: sourceDraw.facebook_live_url,
    youtube_embed_url: sourceDraw.youtube_embed_url,
    promptpay_id: sourceDraw.promptpay_id,
    promptpay_qr_image_url: sourceDraw.promptpay_qr_image_url,
    featured_cards: sourceDraw.featured_cards,
    chase_cards: sourceDraw.chase_cards,
    bank_name: sourceDraw.bank_name,
    bank_account_name: sourceDraw.bank_account_name,
    bank_account_number: sourceDraw.bank_account_number,
    starts_at: null,
    created_by: session.adminId,
  };

  const { data: createdDraw, error } = await supabase
    .from("draw_rounds")
    .insert(nextDraw)
    .select("*")
    .single();

  if (error) throw error;

  await supabase.rpc("create_draw_slots", { p_draw_round_id: createdDraw.id });
  await copyRoundPrizes(supabase, sourceDraw.id, createdDraw.id);
  await auditDrawAction(supabase, session, "draw_next_created", createdDraw.id, {
    sourceDrawId: sourceDraw.id,
    sourceSlug: sourceDraw.slug,
  });

  return Response.json({ ok: true, drawId: createdDraw.id });
}

async function publishNextDraw(supabase: ReturnType<typeof createServiceSupabaseClient>, session: NonNullable<Awaited<ReturnType<typeof verifyAdminSession>>>) {
  const draftDraw = await getActiveDraw(supabase, { statuses: ["draft"], priority: ["draft"] });
  if (!draftDraw) return Response.json({ error: "No draft draw is ready to publish." }, { status: 404 });

  const { error: archiveError } = await supabase
    .from("draw_rounds")
    .update({ status: "archived" })
    .neq("id", draftDraw.id)
    .in("status", ["live", "closed"]);

  if (archiveError) throw archiveError;

  const { error: publishError } = await supabase
    .from("draw_rounds")
    .update({ status: "live", starts_at: new Date().toISOString() })
    .eq("id", draftDraw.id);

  if (publishError) throw publishError;

  await supabase.rpc("create_draw_slots", { p_draw_round_id: draftDraw.id });
  await auditDrawAction(supabase, session, "draw_next_published", draftDraw.id, { slug: draftDraw.slug });

  return Response.json({ ok: true, drawId: draftDraw.id });
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const session = await verifyAdminSession(readSessionCookie(await cookies()));
    if (!session) {
      return Response.json({ error: "Admin access is required." }, { status: 403 });
    }

    let body: DrawLifecycleBody;
    try {
      body = (await request.json()) as DrawLifecycleBody;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!isDrawAction(body.action)) {
      return Response.json({ error: "Unsupported draw lifecycle action." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    if (body.action === "close_sales") return await closeSales(supabase, session);
    if (body.action === "reopen_sales") return await reopenSales(supabase, session);
    if (body.action === "create_next") return await createNextDraw(supabase, session);
    return await publishNextDraw(supabase, session);
  } catch (error) {
    console.error("Failed to update draw lifecycle", error);
    return Response.json({ error: error instanceof Error ? error.message : "Draw lifecycle could not be updated." }, { status: 500 });
  }
}
