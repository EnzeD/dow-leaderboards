import { supabase } from '@/lib/supabase';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const STEAM_APP_ID = process.env.STEAM_APP_ID || '3556750'; // DoW:DE

// Cache headers for CDN
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=1800',
};

async function fetchFromSteam(): Promise<{ playerCount: number | null; success: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${STEAM_APP_ID}`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return { playerCount: null, success: false };
    }

    const data = await response.json();
    const playerCount = data?.response?.player_count;
    const success = data?.response?.result === 1 && typeof playerCount === 'number';

    return {
      playerCount: success ? playerCount : null,
      success
    };
  } catch (error) {
    console.error('Steam API error:', error);
    return { playerCount: null, success: false };
  }
}

export async function GET() {
  try {
    // First, check if we have cached data in Supabase
    const { data: cached, error: fetchError } = await supabase
      .from('steam_player_count')
      .select('player_count, updated_at, success')
      .eq('id', 1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is fine
      console.error('Supabase fetch error:', fetchError);
    }

    const now = Date.now();
    const lastUpdate = cached?.updated_at ? new Date(cached.updated_at).getTime() : 0;
    const age = now - lastUpdate;

    // If cache is fresh (less than 30 minutes old) and successful, return it
    if (cached && age < CACHE_TTL_MS && cached.success) {
      return Response.json(
        {
          appId: STEAM_APP_ID,
          playerCount: cached.player_count,
          success: true,
          lastUpdated: cached.updated_at,
          cached: true,
        },
        { headers: CACHE_HEADERS }
      );
    }

    // Cache is stale or doesn't exist, fetch fresh data from Steam
    const { playerCount, success } = await fetchFromSteam();

    // Update Supabase with new data
    const { error: updateError } = await supabase
      .from('steam_player_count')
      .upsert({
        id: 1,
        app_id: STEAM_APP_ID,
        player_count: playerCount,
        updated_at: new Date().toISOString(),
        success,
      });

    if (updateError) {
      console.error('Supabase update error:', updateError);
    }

    return Response.json(
      {
        appId: STEAM_APP_ID,
        playerCount,
        success,
        lastUpdated: new Date().toISOString(),
        cached: false,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Player count API error:', error);

    // Try to return stale data if available
    try {
      const { data: stale } = await supabase
        .from('steam_player_count')
        .select('player_count, updated_at')
        .eq('id', 1)
        .single();

      if (stale?.player_count !== null) {
        return Response.json(
          {
            appId: STEAM_APP_ID,
            playerCount: stale.player_count,
            success: false,
            lastUpdated: stale.updated_at,
            cached: true,
            stale: true,
          },
          { headers: CACHE_HEADERS }
        );
      }
    } catch {}

    return Response.json(
      {
        appId: STEAM_APP_ID,
        playerCount: null,
        success: false,
        lastUpdated: new Date().toISOString(),
        error: 'Failed to fetch player count',
      },
      { status: 502, headers: CACHE_HEADERS }
    );
  }
}