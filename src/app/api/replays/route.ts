import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Buffer } from 'node:buffer';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { parseReplay } from 'dowde-replay-parser';
import { enrichReplayProfiles, matchReplayPlayersToDatabase, saveReplayPlayerLinks, fetchPlayerStatsFromRelic, getGameModeFromMapName } from '@/lib/replay-player-matching';
import { Filter } from 'bad-words';
import { generateSignedReplayUrl, getClientIpHash, REPLAYS_BUCKET, supabaseAdmin } from './shared';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB prototype limit
const MAX_UPLOADS_PER_HOUR = 20; // Rate limit per IP

const profanityFilter = new Filter();

const sanitizeBaseName = (input: string): string => {
  return input
    .replace(/\.rec$/i, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
};

const buildObjectKey = (originalName: string): string => {
  const base = sanitizeBaseName(originalName).slice(0, 80) || 'replay';
  return `${randomUUID()}__${base}.rec`;
};

const sanitizeInput = (input: string, maxLength: number): string => {
  return input
    .slice(0, maxLength)
    .trim()
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove potential XSS patterns
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (path) {
    try {
      const { url, downloadCount, alreadyDownloaded } = await generateSignedReplayUrl(req, path);

      return NextResponse.json({
        url,
        downloadCount,
        alreadyDownloaded
      }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'signed_url_failed';
      return NextResponse.json({ error: code || 'signed_url_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  // Get client IP hash for ownership verification
  const clientIpHash = getClientIpHash(req);

  // Query 1: Get metadata (contains all paths and data we need)
  const { data: metaRows, error: metaError } = await supabaseAdmin
    .from('replay_metadata')
    .select('path, original_name, replay_name, map_name, match_duration_seconds, match_duration_label, profiles, raw_metadata, submitted_name, submitted_comment, status, uploader_ip_hash, winner_team, updated_at, created_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (metaError) {
    console.error('Failed to fetch replay metadata', metaError);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }

  const paths = (metaRows || []).map(row => row.path);

  // Query 2: Get download stats
  const { data: statsRows, error: statsError } = paths.length
    ? await supabaseAdmin
        .from('replay_download_stats')
        .select('path, download_count')
        .in('path', paths)
    : { data: [], error: null };

  if (statsError) {
    console.error('Failed to fetch replay download stats', statsError);
  }

  const downloadMap = new Map<string, number>();
  statsRows?.forEach(row => {
    const key = typeof row.path === 'string' ? row.path : null;
    const count = typeof row.download_count === 'number' ? row.download_count : Number(row.download_count ?? 0);
    if (key) {
      downloadMap.set(key, Number.isFinite(count) ? count : 0);
    }
  });

  // Use metadata rows directly (already filtered by status='published')
  const publishedItems = (metaRows || []).map(meta => ({ meta }));

  // Batch fetch all player links and details for ALL replays in 2 queries
  const allPaths = publishedItems.map(({ meta }) => meta.path);

  // Query 3: Get all player links
  const { data: allLinks } = allPaths.length > 0
    ? await supabaseAdmin
        .from('replay_player_links')
        .select('replay_path, replay_player_alias, profile_id, match_confidence, match_method, rating, rank, leaderboard_id')
        .in('replay_path', allPaths)
    : { data: [] };

  // Group links by replay path
  const linksByPath = new Map<string, any[]>();
  (allLinks || []).forEach(link => {
    if (!linksByPath.has(link.replay_path)) {
      linksByPath.set(link.replay_path, []);
    }
    linksByPath.get(link.replay_path)!.push(link);
  });

  // Get all unique profile IDs
  const allProfileIds = Array.from(new Set((allLinks || []).map(link => parseInt(link.profile_id))));

  // Query 4: Get all player details
  const { data: allPlayerDetails } = allProfileIds.length > 0
    ? await supabaseAdmin
        .from('player_search_index')
        .select('profile_id, current_alias, country, level, max_rating')
        .in('profile_id', allProfileIds)
    : { data: [] };

  const playerDetailsMap = new Map(
    (allPlayerDetails || []).map(player => [player.profile_id, player])
  );

  // Now build replays synchronously with all data pre-fetched
  const replays = publishedItems.map(({ meta }) => {
    const fallbackName = meta.path.includes('__') ? meta.path.split('__').pop() ?? meta.path : meta.path;
    const originalName = meta.original_name || fallbackName;

    // Enrich profiles using pre-fetched data
    let enrichedProfiles = null;
    if (Array.isArray(meta?.profiles) && meta.profiles.length > 0) {
      const links = linksByPath.get(meta.path) || [];
      const linkMap = new Map(links.map(link => [link.replay_player_alias, link]));

      enrichedProfiles = meta.profiles.map((profile: any) => {
        const link = linkMap.get(profile.alias);
        const enriched: any = { ...profile };

        if (link) {
          const playerDetail = playerDetailsMap.get(parseInt(link.profile_id));
          enriched.profile_id = link.profile_id;
          enriched.match_confidence = link.match_confidence;

          if (playerDetail) {
            enriched.current_alias = playerDetail.current_alias;
            enriched.country = playerDetail.country;
            enriched.level = playerDetail.level;
            enriched.max_rating = playerDetail.max_rating;
          }

          if (link.rating !== undefined && link.rating !== null) {
            enriched.faction_rating = link.rating;
          }
          if (link.rank !== undefined && link.rank !== null) {
            enriched.faction_rank = link.rank;
          }
        }

        return enriched;
      });
    }

    // Check if current user can edit this replay
    const canEdit = Boolean(meta.uploader_ip_hash && meta.uploader_ip_hash === clientIpHash);

    return {
      path: meta.path,
      originalName,
      size: null, // Storage metadata removed for performance
      uploadedAt: meta.created_at ?? meta.updated_at ?? null,
      downloads: downloadMap.get(meta.path) ?? 0,
      replayName: meta.replay_name,
      mapName: meta.map_name,
      matchDurationSeconds: meta.match_duration_seconds,
      matchDurationLabel: meta.match_duration_label,
      profiles: enrichedProfiles,
      submittedName: meta.submitted_name,
      submittedComment: meta.submitted_comment,
      status: meta.status,
      winnerTeam: meta.winner_team ?? null,
      canEdit,
    };
  });

  replays.sort((a, b) => {
    const downloadDelta = (b.downloads ?? 0) - (a.downloads ?? 0);
    if (downloadDelta !== 0) return downloadDelta;
    const timeA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const timeB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return timeB - timeA;
  });

  return NextResponse.json({ replays }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  // Check rate limit before processing upload
  const ipHash = getClientIpHash(req);
  const { data: canUpload, error: rateLimitError } = await supabaseAdmin
    .rpc('check_upload_rate_limit', {
      ip_hash_input: ipHash,
      max_uploads: MAX_UPLOADS_PER_HOUR,
      window_hours: 1
    });

  if (rateLimitError) {
    console.error('Rate limit check failed', rateLimitError);
  } else if (canUpload === false) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded' },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error) {
    console.error('Failed to parse upload form data', error);
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const file = formData.get('replay');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_replay' }, { status: 400 });
  }

  const fileName = file.name ?? 'replay.rec';

  if (!fileName.toLowerCase().endsWith('.rec')) {
    return NextResponse.json({ error: 'invalid_extension' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }

  const objectKey = buildObjectKey(fileName);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabaseAdmin
      .storage
      .from(REPLAYS_BUCKET)
      .upload(objectKey, buffer, {
        contentType: 'application/octet-stream',
        upsert: false,
        metadata: {
          originalName: fileName,
        },
      });

    if (error) {
      console.error('Failed to upload replay', error);
      return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
    }

    // Attempt to parse the replay for metadata
    let meta: any = null;
    let matchDurationSeconds: number | null = null;
    let matchDurationLabel: string | null = null;
    try {
      const tmpPath = joinPath(tmpdir(), `${objectKey.replace(/\//g, '_')}`);
      await writeFile(tmpPath, buffer);
      const parsed = parseReplay(tmpPath) as any;
      await unlink(tmpPath).catch(() => {});

      // parsed.matchduration is like "MM:SS" string
      const md = typeof parsed?.matchduration === 'string' ? parsed.matchduration : null;
      if (md && /^\d{1,2}:\d{2}$/.test(md)) {
        const [m, s] = md.split(':').map((v: string) => Number(v));
        if (Number.isFinite(m) && Number.isFinite(s)) {
          matchDurationSeconds = m * 60 + s;
          matchDurationLabel = md;
        }
      }
      // Normalize faction names to match the rest of the codebase
      const normalizedProfiles = Array.isArray(parsed?.profiles)
        ? parsed.profiles.map((p: any) => ({
            ...p,
            faction: p.faction === 'Tau Empire' ? 'Tau' : p.faction
          }))
        : null;

      meta = {
        replay_name: typeof parsed?.replayname === 'string' ? parsed.replayname : null,
        map_name: typeof parsed?.mapname === 'string' ? parsed.mapname : null,
        profiles: normalizedProfiles,
        raw_metadata: parsed ?? null,
      };
    } catch (parseError: any) {
      // Check if this is specifically a non-DoW:DE replay file
      const errorMessage = parseError?.message || '';
      if (errorMessage.includes('Not a valid replay file for Warhammer 40,000: Dawn of War - Definitive Edition')) {
        console.log('Invalid DoW:DE replay file detected, removing from storage:', objectKey);

        // Delete the invalid file from storage
        const { error: deleteError } = await supabaseAdmin
          .storage
          .from(REPLAYS_BUCKET)
          .remove([objectKey]);

        if (deleteError) {
          console.error('Failed to delete invalid replay file:', deleteError);
        }

        // Return specific error for non-DoW:DE files
        return NextResponse.json({ error: 'invalid_dowde_replay' }, { status: 400 });
      }

      // For other parse errors, continue with null metadata
      console.error('Replay parse failed', parseError);
      meta = {
        replay_name: null,
        map_name: null,
        profiles: null,
        raw_metadata: { error: 'parse_failed' },
      };
      matchDurationSeconds = null;
      matchDurationLabel = null;
    }

    // Persist metadata row (status pending until user submits name/comment)
    const { error: metaError } = await supabaseAdmin
      .from('replay_metadata')
      .upsert({
        path: objectKey,
        original_name: fileName,
        replay_name: meta.replay_name,
        map_name: meta.map_name,
        match_duration_seconds: matchDurationSeconds,
        match_duration_label: matchDurationLabel,
        profiles: meta.profiles,
        raw_metadata: meta.raw_metadata,
        status: 'pending',
        uploader_ip_hash: ipHash,
        updated_at: new Date().toISOString(),
      });

    if (metaError) {
      console.error('Failed to upsert replay metadata', metaError);
    }

    // Automatically attempt to link players to database if profiles were parsed
    if (Array.isArray(meta.profiles) && meta.profiles.length > 0) {
      try {
        const matches = await matchReplayPlayersToDatabase(objectKey);
        if (matches.length > 0) {
          // Determine game mode from map name
          const gameMode = getGameModeFromMapName(meta.map_name);

          // Fetch ELO data for each matched player
          const enrichedMatches = await Promise.all(matches.map(async (match) => {
            // Find the profile with this alias to get their faction
            const profile = meta.profiles.find((p: any) => p.alias === match.alias);
            if (!profile?.faction) {
              return match;
            }

            // Fetch player stats from Relic API
            const stats = await fetchPlayerStatsFromRelic(match.profile_id, profile.faction, gameMode);

            return {
              ...match,
              faction: profile.faction,
              rating: stats?.rating,
              rank: stats?.rank,
              leaderboard_id: stats?.leaderboardId
            };
          }));

          await saveReplayPlayerLinks(objectKey, enrichedMatches);
          console.log(`Linked ${enrichedMatches.length} players with ELO data for replay ${objectKey}`);
        }
      } catch (linkError) {
        console.error('Failed to auto-link players for replay', objectKey, linkError);
        // Don't fail the upload for this
      }
    }
  } catch (error) {
    console.error('Unexpected error while uploading replay', error);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }

  // Fetch the metadata row to return it in the response for immediate UI preview
  const { data: metaRow } = await supabaseAdmin
    .from('replay_metadata')
    .select('path, original_name, replay_name, map_name, match_duration_seconds, match_duration_label, profiles, submitted_name, submitted_comment, status, winner_team')
    .eq('path', objectKey)
    .maybeSingle();

  // Enrich profiles with player links for immediate preview
  let enrichedProfiles = null;
  if (metaRow && Array.isArray(metaRow.profiles) && metaRow.profiles.length > 0) {
    try {
      enrichedProfiles = await enrichReplayProfiles(objectKey, metaRow.profiles, metaRow.map_name);
    } catch (error) {
      console.error('Failed to enrich profiles for upload response', error);
      enrichedProfiles = metaRow.profiles; // Fallback to original profiles
    }
  }

  return NextResponse.json({
    success: true,
    replay: metaRow ? {
      path: metaRow.path,
      originalName: metaRow.original_name,
      replayName: metaRow.replay_name,
      mapName: metaRow.map_name,
      matchDurationSeconds: metaRow.match_duration_seconds,
      matchDurationLabel: metaRow.match_duration_label,
      profiles: enrichedProfiles,
      submittedName: metaRow.submitted_name ?? null,
      submittedComment: metaRow.submitted_comment ?? null,
      status: metaRow.status ?? 'pending',
      winnerTeam: metaRow.winner_team ?? null,
    } : null
  }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function PATCH(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const path = typeof payload?.path === 'string' ? payload.path : null;
  if (!path) {
    return NextResponse.json({ error: 'missing_path' }, { status: 400 });
  }

  // Verify ownership if this is not the initial publish (status change from pending to published)
  const statusRaw = payload?.status;
  const submittedNameRaw = payload?.submittedName;
  const submittedCommentRaw = payload?.submittedComment;
  const winnerTeamRaw = payload?.winnerTeam;

  // Get current status to determine if this is initial publish
  const { data: currentMeta } = await supabaseAdmin
    .from('replay_metadata')
    .select('status, uploader_ip_hash')
    .eq('path', path)
    .maybeSingle();

  // If replay already published, verify IP ownership for edits
  if (currentMeta?.status === 'published') {
    const ipHash = getClientIpHash(req);
    const { data: isOwner } = await supabaseAdmin
      .rpc('verify_replay_ownership', {
        path_input: path,
        ip_hash_input: ipHash
      });

    if (!isOwner) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }
  }

  // Sanitize and filter profanity
  let submittedName: string | null = null;
  let submittedComment: string | null = null;

  if (typeof submittedNameRaw === 'string') {
    const sanitized = sanitizeInput(submittedNameRaw, 200);
    submittedName = sanitized ? profanityFilter.clean(sanitized) : null;
  }

  if (typeof submittedCommentRaw === 'string') {
    const sanitized = sanitizeInput(submittedCommentRaw, 1000);
    submittedComment = sanitized ? profanityFilter.clean(sanitized) : null;
  }

  const status = typeof statusRaw === 'string' ? statusRaw : 'published';

  // Validate winnerTeam if provided
  let winnerTeam: number | null = null;
  if (winnerTeamRaw !== undefined && winnerTeamRaw !== null) {
    const parsed = Number(winnerTeamRaw);
    if (parsed === 1 || parsed === 2) {
      winnerTeam = parsed;
    } else if (winnerTeamRaw === null || winnerTeamRaw === '') {
      winnerTeam = null;
    }
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (submittedName !== null) update.submitted_name = submittedName;
  if (submittedComment !== null) update.submitted_comment = submittedComment;
  if (status) update.status = status;
  if (winnerTeamRaw !== undefined) update.winner_team = winnerTeam;

  const { error } = await supabaseAdmin
    .from('replay_metadata')
    .update(update)
    .eq('path', path);

  if (error) {
    console.error('Failed to update replay metadata', error);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'missing_path' }, { status: 400 });
  }

  // Verify ownership
  const ipHash = getClientIpHash(req);
  const { data: result } = await supabaseAdmin
    .rpc('delete_replay_with_verification', {
      path_input: path,
      ip_hash_input: ipHash
    });

  if (!result?.success) {
    return NextResponse.json({ error: result?.error || 'delete_failed' }, { status: 403 });
  }

  // Delete from storage bucket
  const { error: storageError } = await supabaseAdmin
    .storage
    .from(REPLAYS_BUCKET)
    .remove([path]);

  if (storageError) {
    console.error('Failed to delete replay file from storage', storageError);
    // Don't fail the request if storage deletion fails (metadata already deleted)
  }

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
