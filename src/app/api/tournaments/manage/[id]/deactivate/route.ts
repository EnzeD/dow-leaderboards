import { NextResponse } from "next/server";
import {
  getTournamentManagerContext,
  isTrustedJsonMutation,
  isUuid,
  privateNoStore,
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

  const { error } = await context.supabase
    .from("tournament_spotlight")
    .delete()
    .eq("singleton", true)
    .eq("tournament_id", params.id);

  if (error) {
    console.error("[tournaments] failed to deactivate tournament", error);
    return privateNoStore(
      NextResponse.json({ error: "deactivation_failed" }, { status: 500 }),
    );
  }

  return privateNoStore(
    NextResponse.json({ success: true, activeTournamentId: null }),
  );
}
