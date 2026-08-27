import { NextResponse } from "next/server";
import {
  getTournamentAdmin,
  serializeTournament,
  TOURNAMENT_SELECT,
  toPublicTournament,
  utcDateToday,
} from "@/lib/tournaments/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = getTournamentAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const { data: spotlight, error: spotlightError } = await supabase
    .from("tournament_spotlight")
    .select("tournament_id")
    .eq("singleton", true)
    .maybeSingle();

  if (spotlightError) {
    console.error("[tournaments] failed to fetch spotlight", spotlightError);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!spotlight?.tournament_id) {
    return NextResponse.json({ tournament: null }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT)
    .eq("id", spotlight.tournament_id)
    .eq("state", "draft")
    .gte("tournament_date", utcDateToday())
    .maybeSingle();

  if (error) {
    console.error("[tournaments] failed to fetch active tournament", error);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  const response = NextResponse.json({
    tournament: data ? toPublicTournament(serializeTournament(data)) : null,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
