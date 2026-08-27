import { NextResponse } from "next/server";
import {
  getTournamentManagerContext,
  invalidateTournamentSpotlightCache,
  isTrustedJsonMutation,
  isUuid,
  privateNoStore,
  utcDateToday,
} from "@/lib/tournaments/server";

type RouteContext = { params: { id: string } };

export async function POST(request: Request, { params }: RouteContext) {
  const context = await getTournamentManagerContext();
  if (!context.ok) {
    return privateNoStore(
      NextResponse.json({ error: context.error }, { status: context.status }),
    );
  }
  if (!isUuid(params.id) || !isTrustedJsonMutation(request)) {
    return privateNoStore(
      NextResponse.json({ error: "invalid_request" }, { status: 400 }),
    );
  }

  const { data: tournament, error: tournamentError } = await context.supabase
    .from("tournaments")
    .select("id, state, tournament_date")
    .eq("id", params.id)
    .maybeSingle();

  if (tournamentError) {
    console.error("[tournaments] failed to load tournament for activation", tournamentError);
    return privateNoStore(
      NextResponse.json({ error: "lookup_failed" }, { status: 500 }),
    );
  }
  if (!tournament) {
    return privateNoStore(
      NextResponse.json({ error: "not_found" }, { status: 404 }),
    );
  }
  if (tournament.state === "archived") {
    return privateNoStore(
      NextResponse.json({ error: "archived" }, { status: 409 }),
    );
  }
  if (tournament.tournament_date < utcDateToday()) {
    return privateNoStore(
      NextResponse.json({ error: "tournament_expired" }, { status: 409 }),
    );
  }

  const { error } = await context.supabase
    .from("tournament_spotlight")
    .upsert(
      {
        singleton: true,
        tournament_id: params.id,
        updated_by: context.auth0Sub,
      },
      { onConflict: "singleton" },
    );

  if (error) {
    console.error("[tournaments] failed to activate tournament", error);
    return privateNoStore(
      NextResponse.json({ error: "activation_failed" }, { status: 500 }),
    );
  }

  invalidateTournamentSpotlightCache();
  return privateNoStore(
    NextResponse.json({ success: true, activeTournamentId: params.id }),
  );
}
