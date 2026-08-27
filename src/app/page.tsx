import HomeClient from "@/app/HomeClient";
import { getCachedPublicTournamentSpotlight } from "@/lib/tournaments/server";
import type { PublicTournament } from "@/lib/tournaments/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialTournament: PublicTournament | null = null;

  try {
    initialTournament = await getCachedPublicTournamentSpotlight();
  } catch (error) {
    console.error("[tournaments] failed to load server-rendered spotlight", error);
  }

  return <HomeClient initialTournament={initialTournament} />;
}
