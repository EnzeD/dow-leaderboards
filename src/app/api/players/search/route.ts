import { NextRequest } from 'next/server';
import { supabase, type PlayerSearchResult } from '@/lib/supabase';
import { getLevelFromXP } from '@/lib/xp-levels';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    if (!query || query.length < 2) {
      return Response.json({
        results: [],
        error: "Query must be at least 2 characters"
      }, { status: 400 });
    }

    // Search players by current_alias with case-insensitive matching
    // Use ilike for partial matching and order by relevance
    const { data: players, error } = await supabase
      .from('players')
      .select(`
        profile_id,
        current_alias,
        country,
        steam_id64,
        xp
      `)
      .not('current_alias', 'is', null)
      .ilike('current_alias', `%${query}%`)
      .order('current_alias')
      .limit(limit);

    if (error) {
      console.error('Database search error:', error);
      return Response.json({
        results: [],
        error: "Search failed"
      }, { status: 500 });
    }

    // Transform and prioritize exact matches
    const results: PlayerSearchResult[] = (players || [])
      .map(player => ({
        profile_id: player.profile_id,
        current_alias: player.current_alias || '',
        country: player.country,
        steam_id64: player.steam_id64,
        level: getLevelFromXP(player.xp ?? undefined),
        xp: player.xp
      }))
      .sort((a, b) => {
        const aExact = a.current_alias.toLowerCase().startsWith(query.toLowerCase());
        const bExact = b.current_alias.toLowerCase().startsWith(query.toLowerCase());

        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        return a.current_alias.localeCompare(b.current_alias);
      });

    return Response.json({
      results,
      query,
      count: results.length,
      cached: false
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'
      }
    });

  } catch (error) {
    console.error('Player search API error:', error);
    return Response.json({
      results: [],
      error: "Internal server error"
    }, { status: 500 });
  }
}
