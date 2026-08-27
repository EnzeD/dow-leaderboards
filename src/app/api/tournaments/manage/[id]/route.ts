import { NextResponse } from "next/server";
import {
  getTournamentManagerContext,
  isTrustedJsonMutation,
  isUuid,
  privateNoStore,
  serializeTournament,
  TOURNAMENT_SELECT,
  tournamentPayload,
} from "@/lib/tournaments/server";
import { parseTournamentDraft } from "@/lib/tournaments/validation";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, { params }: RouteContext) {
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

  const parsed = parseTournamentDraft(body);
  if (!parsed.ok) {
    return privateNoStore(
      NextResponse.json({ error: "invalid_payload", message: parsed.error }, { status: 400 }),
    );
  }

  const { data, error } = await context.supabase
    .from("tournaments")
    .update({
      ...tournamentPayload(parsed.value),
      updated_by: context.auth0Sub,
    })
    .eq("id", params.id)
    .eq("state", "draft")
    .eq("updated_at", updatedAt)
    .select(TOURNAMENT_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[tournaments] failed to update tournament", error);
    return privateNoStore(
      NextResponse.json({ error: "update_failed" }, { status: 500 }),
    );
  }
  if (!data) {
    const { data: current } = await context.supabase
      .from("tournaments")
      .select("id, state")
      .eq("id", params.id)
      .maybeSingle();
    if (!current) {
      return privateNoStore(
        NextResponse.json({ error: "not_found" }, { status: 404 }),
      );
    }
    if (current.state === "archived") {
      return privateNoStore(
        NextResponse.json({ error: "archived" }, { status: 409 }),
      );
    }
    return privateNoStore(
      NextResponse.json({ error: "stale_version" }, { status: 409 }),
    );
  }

  return privateNoStore(
    NextResponse.json({ tournament: serializeTournament(data) }),
  );
}
