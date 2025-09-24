import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

type SteamResponse = {
  response?: {
    result?: number;
    player_count?: number;
  };
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STEAM_APP_ID = Deno.env.get("STEAM_APP_ID") ?? "4570";
const REQUEST_TIMEOUT_MS = Number(Deno.env.get("STEAM_TIMEOUT_MS") ?? 5000);

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

async function fetchPlayerCount(appId: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return { success: false, playerCount: null as number | null };
    }

    const data = (await response.json()) as SteamResponse;
    const playerCount = data?.response?.player_count ?? null;
    const success = data?.response?.result === 1 && typeof playerCount === "number";

    return {
      success,
      playerCount: success ? playerCount : null,
    };
  } catch (error) {
    console.error("Steam API error", error);
    return { success: false, playerCount: null as number | null };
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async req => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Missing Supabase environment variables" },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: existing } = await supabase
    .from("steam_player_count")
    .select("player_count, updated_at")
    .eq("id", 1)
    .single();

  const { success, playerCount: liveCount } = await fetchPlayerCount(STEAM_APP_ID);
  const resolvedCount = success
    ? liveCount
    : typeof existing?.player_count === "number"
      ? existing.player_count
      : null;
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from("steam_player_count")
    .upsert({
      id: 1,
      app_id: STEAM_APP_ID,
      player_count: resolvedCount,
      updated_at: nowIso,
      success,
    });

  if (upsertError) {
    console.error("Supabase upsert error", upsertError);
    return jsonResponse(
      {
        error: "Failed to persist player count",
        details: upsertError.message,
      },
      { status: 500 }
    );
  }

  return jsonResponse({
    appId: STEAM_APP_ID,
    playerCount: resolvedCount,
    success,
    lastUpdated: nowIso,
    stale: !success && resolvedCount !== null,
    source: success ? "steam" : "cache",
  });
});
