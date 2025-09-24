import { supabase } from '@/lib/supabase';

export const revalidate = 60;

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=900',
};

const STEAM_APP_ID = process.env.STEAM_APP_ID || '4570';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('steam_player_count')
      .select('player_count, updated_at, success, app_id')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Supabase fetch error:', error);
      return Response.json(
        {
          appId: STEAM_APP_ID,
          playerCount: null,
          success: false,
          cached: false,
          error: 'Failed to read cached player count',
        },
        { status: 502, headers: CACHE_HEADERS }
      );
    }

    if (!data) {
      return Response.json(
        {
          appId: STEAM_APP_ID,
          playerCount: null,
          success: false,
          cached: false,
          error: 'No cached player count available',
        },
        { status: 503, headers: CACHE_HEADERS }
      );
    }

    const playerCount =
      typeof data.player_count === 'number' ? data.player_count : null;

    return Response.json(
      {
        appId: data.app_id || STEAM_APP_ID,
        playerCount,
        success: Boolean(data.success && playerCount !== null),
        lastUpdated: data.updated_at,
        cached: true,
        stale: !data.success && playerCount !== null,
        source: 'supabase',
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Player count route error:', error);
    return Response.json(
      {
        appId: STEAM_APP_ID,
        playerCount: null,
        success: false,
        cached: false,
        error: 'Unexpected failure loading player count',
      },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}
