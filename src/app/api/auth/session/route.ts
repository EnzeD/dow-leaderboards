import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getSupabaseAdmin } from "@/lib/premium/activation-server";
import { getLevelFromXP } from "@/lib/xp-levels";

const sanitizeEmail = (email: string | undefined): string | null => {
  if (!email) return null;
  return email.trim().toLowerCase();
};

export async function GET() {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const supabase = getSupabaseAdmin();

  let appUser: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    premium_expires_at: string | null;
    primary_profile_id: number | null;
  } | null = null;
  let profile:
    | {
        profileId: number;
        alias: string | null;
        country: string | null;
        level: number | null;
      }
    | null = null;

  if (supabase) {
    const { error } = await supabase
      .from("app_users")
      .upsert(
        {
          auth0_sub: session.user.sub,
          email: sanitizeEmail(session.user.email ?? undefined),
          email_verified: session.user.email_verified ?? null,
        },
        { onConflict: "auth0_sub" },
      );

    if (error) {
      console.error("[auth] failed to upsert app_users", error);
    } else {
      const { data, error: fetchError } = await supabase
        .from("app_users")
        .select(
          "stripe_customer_id, stripe_subscription_id, premium_expires_at, primary_profile_id",
        )
        .eq("auth0_sub", session.user.sub)
        .maybeSingle();

      if (fetchError) {
        console.error("[auth] failed to fetch app_users row", fetchError);
      } else if (data) {
        appUser = {
          stripe_customer_id: data.stripe_customer_id ?? null,
          stripe_subscription_id: data.stripe_subscription_id ?? null,
          premium_expires_at: data.premium_expires_at ?? null,
          primary_profile_id: data.primary_profile_id ?? null,
        };

        if (appUser.primary_profile_id) {
          const { data: player, error: playerError } = await supabase
            .from("players")
            .select("profile_id, current_alias, country, xp")
            .eq("profile_id", appUser.primary_profile_id)
            .maybeSingle();

          if (playerError) {
            console.error("[auth] failed to fetch linked profile", playerError);
          } else if (player) {
            profile = {
              profileId: player.profile_id,
              alias: player.current_alias ?? null,
              country: player.country ?? null,
              level: getLevelFromXP(player.xp ?? undefined),
            };
          }
        }
      }
    }
  } else {
    console.warn("[auth] Supabase service role unavailable, skipping app_users sync");
  }

  const responsePayload = {
    user: {
      sub: session.user.sub,
      email: session.user.email ?? null,
      emailVerified: session.user.email_verified ?? null,
      name: session.user.name ?? null,
      picture: session.user.picture ?? null,
    },
    appUser,
    profile,
  };

  return NextResponse.json(responsePayload, { status: 200 });
}
