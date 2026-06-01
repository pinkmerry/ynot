import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type OptionKind = "set" | "variant" | "language" | "release_year" | "brand";

const OPTION_KINDS: OptionKind[] = [
  "set",
  "variant",
  "language",
  "release_year",
  "brand",
];

function optionKind(value: unknown): OptionKind | null {
  return OPTION_KINDS.includes(value as OptionKind) ? (value as OptionKind) : null;
}

function optionName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

async function readBody(request: Request) {
  return request
    .json()
    .catch(() => null) as Promise<Record<string, unknown> | null>;
}

async function requireAdmin(request: Request, action: string) {
  if (!isSupabaseConfigured()) {
    return {
      error: Response.json({ error: "Supabase is not configured." }, { status: 503 }),
    };
  }
  const admin = await resolveAdminSession();
  if (!admin) {
    return {
      error: Response.json({ error: "Admin access is required." }, { status: 403 }),
    };
  }
  const limited = await enforceRateLimit(
    request,
    `ynot:admin:card-options:${action}`,
    { limit: 60, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return { error: limited };
  return { admin };
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request, "list");
  if (gate.error) return gate.error;

  const kind = optionKind(new URL(request.url).searchParams.get("kind"));
  if (!kind) {
    return Response.json({ error: "Unknown option kind." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("card_options")
    .select("id, name")
    .eq("kind", kind)
    .order("name", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ options: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request, "create");
  if (gate.error) return gate.error;

  const body = await readBody(request);
  const kind = optionKind(body?.kind);
  const name = optionName(body?.name);
  if (!kind) return Response.json({ error: "Unknown option kind." }, { status: 400 });
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  // Reuse an existing option with the same name (case-insensitive) instead of duplicating.
  const { data: existing } = await supabase
    .from("card_options")
    .select("id, name")
    .eq("kind", kind)
    .ilike("name", name)
    .maybeSingle();
  if (existing) return Response.json({ option: existing });

  const { data, error } = await supabase
    .from("card_options")
    .insert({ kind, name })
    .select("id, name")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ option: data });
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin(request, "update");
  if (gate.error) return gate.error;

  const body = await readBody(request);
  const id = typeof body?.id === "string" ? body.id : "";
  const name = optionName(body?.name);
  if (!id) return Response.json({ error: "Option id is required." }, { status: 400 });
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("card_options")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ option: data });
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin(request, "delete");
  if (gate.error) return gate.error;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "Option id is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("card_options").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
