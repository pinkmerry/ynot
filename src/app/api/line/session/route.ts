import { createServiceSupabaseClient } from "@/lib/supabase/server";

type LineVerifyResponse = {
  sub?: string;
  name?: string;
  picture?: string;
};

const lineChannelId =
  process.env.LINE_LOGIN_CHANNEL_ID ??
  process.env.NEXT_PUBLIC_LINE_LIFF_ID?.split("-")[0] ??
  "2009942829";

export async function POST(request: Request) {
  let idToken: unknown;

  try {
    const body = (await request.json()) as { idToken?: unknown };
    idToken = body.idToken;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof idToken !== "string" || idToken.length === 0) {
    return Response.json({ error: "Missing LINE ID token." }, { status: 400 });
  }

  const form = new URLSearchParams({
    id_token: idToken,
    client_id: lineChannelId,
  });

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!response.ok) {
    return Response.json({ error: "LINE ID token verification failed." }, { status: 401 });
  }

  const verified = (await response.json()) as LineVerifyResponse;
  if (!verified.sub) {
    return Response.json({ error: "LINE profile did not include a user ID." }, { status: 401 });
  }

  const profile = {
    lineUserId: verified.sub,
    displayName: verified.name ?? "LINE Customer",
    pictureUrl: verified.picture,
  };

  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from("profiles").upsert(
      {
        line_user_id: profile.lineUserId,
        line_display_name: profile.displayName,
        line_picture_url: profile.pictureUrl ?? null,
      },
      { onConflict: "line_user_id" },
    );
  } catch {
    // Local LIFF testing can work before Supabase env vars are installed.
  }

  return Response.json(profile);
}
