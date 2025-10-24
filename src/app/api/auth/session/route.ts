import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { sanitizeEmail, upsertAppUser } from "@/lib/app-users";
import {
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive,
} from "@/lib/premium/subscription-server";
import { getLevelFromXP } from "@/lib/xp-levels";
import { fetchSteamSummaryByProfile } from "@/lib/steam";

export async function GET() {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const supabase = getSupabaseAdmin();

  let appUser: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_subscription_status: string | null;
    stripe_subscription_cancel_at_period_end: boolean | null;
    premium_expires_at: string | null;
    primary_profile_id: number | null;
    has_used_trial: boolean | null;
  } | null = null;
  let subscription: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    status: string | null;
    cancelAtPeriodEnd: boolean | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    priceId: string | null;
    active: boolean;
  } | null = null;
  let profile:
    | {
        profileId: number;
        alias: string | null;
        country: string | null;
        level: number | null;
        steamId64: string | null;
        avatarUrl: string | null;
      }
    | null = null;

  if (supabase) {
    const { error } = await upsertAppUser({
      supabase,
      auth0Sub: session.user.sub,
      email: sanitizeEmail(session.user.email ?? undefined),
      emailVerified: session.user.email_verified ?? null,
    });

    if (error) {
      console.error("[auth] failed to upsert app_users", error);
    } else {
      const { data, error: fetchError } = await supabase
        .from("app_users")
        .select(
        "stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_subscription_cancel_at_period_end, premium_expires_at, primary_profile_id, has_used_trial",
      )
        .eq("auth0_sub", session.user.sub)
        .maybeSingle();

      if (fetchError) {
        console.error("[auth] failed to fetch app_users row", fetchError);
      } else if (data) {
        appUser = {
          stripe_customer_id: data.stripe_customer_id ?? null,
          stripe_subscription_id: data.stripe_subscription_id ?? null,
          stripe_subscription_status: data.stripe_subscription_status ?? null,
          stripe_subscription_cancel_at_period_end:
            data.stripe_subscription_cancel_at_period_end ?? null,
          premium_expires_at: data.premium_expires_at ?? null,
          primary_profile_id: data.primary_profile_id ?? null,
          has_used_trial: data.has_used_trial ?? null,
        };

        const snapshot = await fetchSubscriptionSnapshot(supabase, session.user.sub);
        if (snapshot) {
          subscription = {
            stripeCustomerId: snapshot.stripe_customer_id,
            stripeSubscriptionId: snapshot.stripe_subscription_id,
            status: snapshot.status,
            cancelAtPeriodEnd: snapshot.cancel_at_period_end ?? null,
            currentPeriodStart: snapshot.current_period_start,
            currentPeriodEnd: snapshot.current_period_end,
            priceId: snapshot.price_id,
            active: isStripeSubscriptionActive(snapshot),
          };
        }

        if (appUser.primary_profile_id) {
          const { data: player, error: playerError } = await supabase
            .from("players")
            .select("profile_id, current_alias, country, xp, steam_id64")
            .eq("profile_id", appUser.primary_profile_id)
            .maybeSingle();

          if (playerError) {
            console.error("[auth] failed to fetch linked profile", playerError);
          } else if (player) {
            let steamId64 = player.steam_id64 ?? null;
            let avatarUrl: string | null = null;

            if (steamId64) {
              const summary = await fetchSteamSummaryByProfile(player.profile_id, steamId64);

              if (summary) {
                avatarUrl =
                  summary.avatarFull ??
                  summary.avatarMedium ??
                  summary.avatar ??
                  null;
              }
            }

            profile = {
              profileId: player.profile_id,
              alias: player.current_alias ?? null,
              country: player.country ?? null,
              level: getLevelFromXP(player.xp ?? undefined),
              steamId64,
              avatarUrl,
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
    subscription,
    profile,
  };

  return NextResponse.json(responsePayload, { status: 200 });
}
