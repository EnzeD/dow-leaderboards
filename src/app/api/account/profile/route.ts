import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { sanitizeEmail, upsertAppUser } from "@/lib/app-users";
import { getSupabaseAdmin } from "@/lib/premium/activation-server";

export async function POST(request: NextRequest) {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rawProfileId =
    body?.profileId ?? body?.profile_id ?? body?.profileID ?? body?.id;

  const profileId = Number.parseInt(rawProfileId, 10);

  if (!Number.isFinite(profileId) || profileId <= 0) {
    return NextResponse.json({ error: "invalid_profile_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 500 });
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("profile_id, current_alias, country, xp")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (playerError) {
    console.error("[account] failed to lookup player", playerError);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (!player) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const { error } = await upsertAppUser({
    supabase,
    auth0Sub: session.user.sub,
    email: sanitizeEmail(session.user.email ?? undefined),
    emailVerified: session.user.email_verified ?? null,
    additionalFields: {
      primary_profile_id: player.profile_id,
    },
  });

  if (error) {
    console.error("[account] failed to link profile", error);
    return NextResponse.json({ error: "link_failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      profile: {
        profileId: player.profile_id,
        alias: player.current_alias ?? null,
        country: player.country ?? null,
      },
    },
    { status: 200 },
  );
}

export async function DELETE() {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 500 });
  }

  const { error } = await supabase
    .from("app_users")
    .update({ primary_profile_id: null })
    .eq("auth0_sub", session.user.sub);

  if (error) {
    console.error("[account] failed to unlink profile", error);
    return NextResponse.json({ error: "unlink_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
