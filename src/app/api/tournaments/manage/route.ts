import { NextResponse } from "next/server";
import {
  getTournamentManagerContext,
  isTrustedJsonMutation,
  privateNoStore,
  serializeTournament,
  TOURNAMENT_SELECT,
  tournamentPayload,
} from "@/lib/tournaments/server";
import { parseTournamentDraft } from "@/lib/tournaments/validation";

const managerError = (context: Extract<Awaited<ReturnType<typeof getTournamentManagerContext>>, { ok: false }>) =>
  privateNoStore(NextResponse.json({ error: context.error }, { status: context.status }));

export async function GET() {
  const context = await getTournamentManagerContext();
  if (!context.ok) return managerError(context);

  const [tournamentsResult, spotlightResult] = await Promise.all([
    context.supabase
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .order("updated_at", { ascending: false }),
    context.supabase
      .from("tournament_spotlight")
      .select("tournament_id")
      .eq("singleton", true)
      .maybeSingle(),
  ]);

  if (tournamentsResult.error || spotlightResult.error) {
    console.error("[tournaments] failed to load manager list", {
      tournamentsError: tournamentsResult.error,
      spotlightError: spotlightResult.error,
    });
    return privateNoStore(
      NextResponse.json({ error: "lookup_failed" }, { status: 500 }),
    );
  }

  return privateNoStore(
    NextResponse.json({
      tournaments: (tournamentsResult.data ?? []).map(serializeTournament),
      activeTournamentId: spotlightResult.data?.tournament_id ?? null,
    }),
  );
}
export async function POST(request: Request) {
  const context = await getTournamentManagerContext();
  if (!context.ok) return managerError(context);
  if (!isTrustedJsonMutation(request)) {
    return privateNoStore(
      NextResponse.json({ error: "invalid_request" }, { status: 400 }),
    );
  }

  const parsed = parseTournamentDraft(await request.json().catch(() => null));
  if (!parsed.ok) {
    return privateNoStore(
      NextResponse.json({ error: "invalid_payload", message: parsed.error }, { status: 400 }),
    );
  }

  const { data, error } = await context.supabase
    .from("tournaments")
    .insert({
      ...tournamentPayload(parsed.value),
      state: "draft",
      created_by: context.auth0Sub,
      updated_by: context.auth0Sub,
    })
    .select(TOURNAMENT_SELECT)
    .single();

  if (error) {
    console.error("[tournaments] failed to create tournament", error);
    return privateNoStore(
      NextResponse.json({ error: "create_failed" }, { status: 500 }),
    );
  }

  return privateNoStore(
    NextResponse.json({ tournament: serializeTournament(data) }, { status: 201 }),
  );
}
