import { NextResponse } from "next/server";
import {
  getCachedPublicTournamentSpotlight,
  getTournamentAdmin,
} from "@/lib/tournaments/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = getTournamentAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  try {
    const tournament = await getCachedPublicTournamentSpotlight();
    const response = NextResponse.json({ tournament });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[tournaments] failed to fetch active tournament", error);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
