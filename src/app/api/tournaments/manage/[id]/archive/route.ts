import { NextResponse } from "next/server";
import {
  getTournamentManagerContext,
  isTrustedJsonMutation,
  isUuid,
  privateNoStore,
  serializeTournament,
  TOURNAMENT_SELECT,
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

  const body = await request.json().catch(() => null);
  const updatedAt =
    body && typeof body === "object" && typeof body.updatedAt === "string"
      ? body.updatedAt
      : null;
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    return privateNoStore(
      NextResponse.json({ error: "invalid_version" }, { status: 400 }),
    );
  }

  const { data, error } = await context.supabase
    .from("tournaments")
    .update({ state: "archived", updated_by: context.auth0Sub })
    .eq("id", params.id)
    .eq("state", "draft")
    .eq("updated_at", updatedAt)
    .select(TOURNAMENT_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[tournaments] failed to archive tournament", error);
    return privateNoStore(
      NextResponse.json({ error: "archive_failed" }, { status: 500 }),
    );
  }
  if (!data) {
    return privateNoStore(
      NextResponse.json({ error: "stale_or_missing" }, { status: 409 }),
    );
  }

  const { error: spotlightError } = await context.supabase
    .from("tournament_spotlight")
    .delete()
    .eq("singleton", true)
    .eq("tournament_id", params.id);

  if (spotlightError) {
    console.error("[tournaments] failed to clear archived spotlight", spotlightError);
  }

  return privateNoStore(
    NextResponse.json({
      tournament: serializeTournament(data),
      activeTournamentId: null,
    }),
  );
}
