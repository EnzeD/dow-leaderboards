import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enrichReplayProfiles } from '@/lib/replay-player-matching';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

type Params = {
  params: {
    id: string;
  };
};

export async function GET(request: NextRequest, { params }: Params) {
  const id = parseInt(params.id, 10);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid replay ID' }, { status: 400 });
  }

  try {
    // Fetch replay metadata
    const { data: meta, error: metaError } = await supabase
      .from('replay_metadata')
      .select('*')
      .eq('id', id)
      .eq('published', true)
      .single();

    if (metaError || !meta) {
      return NextResponse.json({ error: 'Replay not found' }, { status: 404 });
    }

    // Fetch player profiles linked to this replay
    const { data: links, error: linksError } = await supabase
      .from('replay_player_links')
      .select('*')
      .eq('replay_path', meta.path);

    const profiles = links || [];

    // Enrich profiles with database player info
    const enrichedProfiles = await enrichReplayProfiles(
      meta.path,
      profiles.map(p => ({ alias: p.alias, faction: p.faction, team: p.team })),
      meta.map_name
    );

    // Check ownership (for potential edit/delete buttons in future)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const ipHash = createHash('sha256').update(clientIp).digest('hex');
    const isOwner = meta.uploader_ip_hash === ipHash;

    // Return replay with enriched data
    return NextResponse.json({
      id: meta.id,
      path: meta.path,
      originalName: meta.original_name,
      replayName: meta.replay_name,
      submittedName: meta.submitted_name,
      submittedComment: meta.submitted_comment,
      mapName: meta.map_name,
      matchDurationSeconds: meta.match_duration_seconds,
      matchDurationLabel: meta.match_duration_label,
      winnerTeam: meta.winner_team,
      uploadedAt: meta.uploaded_at,
      downloads: meta.downloads,
      profiles: enrichedProfiles,
      isOwner,
    });
  } catch (error) {
    console.error('Error fetching replay:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
