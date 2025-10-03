import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichReplayProfiles } from '@/lib/replay-player-matching';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper function to get client IP hash
function getClientIpHash(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const ip = cfConnectingIp || forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  return createHash('sha256').update(ip).digest('hex');
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  const idRaw = params.id;
  const id = parseInt(idRaw, 10);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  // Fetch replay metadata
  const { data: meta, error: metaError } = await supabaseAdmin
    .from('replay_metadata')
    .select('*')
    .eq('id', id)
    .eq('status', 'published') // Only show published replays
    .maybeSingle();

  if (metaError || !meta) {
    console.error('Failed to fetch replay by ID:', id, metaError);
    return NextResponse.json({ error: 'replay_not_found' }, { status: 404 });
  }

  // Get download count
  const { data: statsRow } = await supabaseAdmin
    .from('replay_download_stats')
    .select('download_count')
    .eq('path', meta.path)
    .maybeSingle();

  const downloadCount = typeof statsRow?.download_count === 'number'
    ? statsRow.download_count
    : 0;

  // Enrich profiles with player links
  let enrichedProfiles = null;
  if (Array.isArray(meta.profiles) && meta.profiles.length > 0) {
    try {
      enrichedProfiles = await enrichReplayProfiles(meta.path, meta.profiles, meta.map_name);
    } catch (error) {
      console.error('Failed to enrich profiles for replay', id, error);
      enrichedProfiles = meta.profiles; // Fallback
    }
  }

  // Check ownership for edit/delete buttons
  const clientIpHash = getClientIpHash(req);
  const canEdit = Boolean(meta.uploader_ip_hash && meta.uploader_ip_hash === clientIpHash);

  const replay = {
    id: meta.id,
    path: meta.path,
    originalName: meta.original_name,
    replayName: meta.replay_name,
    mapName: meta.map_name,
    matchDurationSeconds: meta.match_duration_seconds,
    matchDurationLabel: meta.match_duration_label,
    profiles: enrichedProfiles,
    submittedName: meta.submitted_name,
    submittedComment: meta.submitted_comment,
    status: meta.status,
    winnerTeam: meta.winner_team ?? null,
    uploadedAt: meta.created_at ?? meta.updated_at ?? null,
    downloads: downloadCount,
    canEdit,
  };

  return NextResponse.json({ replay }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
  });
}
