import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET(_request: NextRequest): Response {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json(
      {
        error: 'supabase_unavailable',
        message:
          'Install the latest site build and read steam player count from Supabase directly.',
      },
      { status: 410 }
    );
  }

  const query = new URLSearchParams();
  query.set('select', 'player_count,updated_at,success,app_id');
  query.set('id', 'eq.1');

  const url = `${supabaseUrl}/rest/v1/steam_player_count?${query.toString()}`;

  return NextResponse.redirect(url, 308);
}
