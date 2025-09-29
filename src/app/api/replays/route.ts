import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Buffer } from 'node:buffer';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { parseReplay } from 'dowde-replay-parser';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REPLAYS_BUCKET = process.env.SUPABASE_REPLAYS_BUCKET ?? 'replays';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB prototype limit
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour access window

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (path) {
    const { data, error } = await supabaseAdmin
      .storage
      .from(REPLAYS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      console.error('Failed to create signed URL for replay', error);
      return NextResponse.json({ error: 'signed_url_failed' }, { status: 500 });
    }

    let downloadCount: number | null = null;
    const { data: incremented, error: incrementError } = await supabaseAdmin
      .rpc('increment_replay_download', { path_input: path });

    if (incrementError) {
      console.error('Failed to increment replay download count', incrementError);
    } else if (typeof incremented === 'number') {
      downloadCount = Number(incremented);
    }

    return NextResponse.json({ url: data.signedUrl, downloadCount }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const { data: items, error } = await supabaseAdmin
    .storage
    .from(REPLAYS_BUCKET)
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) {
    console.error('Failed to list replays', error);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }

  const fileItems = items?.filter(item => item.name && !item.name.endsWith('/')) ?? [];
  const paths = fileItems.map(item => item.name);

  const { data: statsRows, error: statsError } = paths.length
    ? await supabaseAdmin
        .from('replay_download_stats')
        .select('path, download_count')
        .in('path', paths)
    : { data: [], error: null };

  if (statsError) {
    console.error('Failed to fetch replay download stats', statsError);
  }

  // Load parsed metadata rows for these paths
  const { data: metaRows, error: metaError } = paths.length
    ? await supabaseAdmin
        .from('replay_metadata')
        .select('path, original_name, replay_name, map_name, match_duration_seconds, match_duration_label, profiles, raw_metadata, submitted_name, submitted_comment, status')
        .in('path', paths)
    : { data: [], error: null };

  if (metaError) {
    console.error('Failed to fetch replay metadata', metaError);
  }

  const metadataMap = new Map<string, any>();
  metaRows?.forEach(row => {
    if (typeof row?.path === 'string') {
      metadataMap.set(row.path, row);
    }
  });

  const downloadMap = new Map<string, number>();
  statsRows?.forEach(row => {
    const key = typeof row.path === 'string' ? row.path : null;
    const count = typeof row.download_count === 'number' ? row.download_count : Number(row.download_count ?? 0);
    if (key) {
      downloadMap.set(key, Number.isFinite(count) ? count : 0);
    }
  });

  // Only show published replays in the public list
  const replays = fileItems
    .map(item => {
      const fallbackName = item.name.includes('__') ? item.name.split('__').pop() ?? item.name : item.name;
      const originalName = typeof item.metadata?.originalName === 'string'
        ? item.metadata.originalName
        : fallbackName;
      const meta = metadataMap.get(item.name);
      if (!meta || meta.status !== 'published') {
        return null;
      }

      return {
        path: item.name,
        originalName,
        size: item.metadata?.size ?? null,
        uploadedAt: item.created_at ?? item.updated_at ?? null,
        downloads: downloadMap.get(item.name) ?? 0,
        // Metadata (parsed + user submitted)
        replayName: typeof meta?.replay_name === 'string' ? meta.replay_name : null,
        mapName: typeof meta?.map_name === 'string' ? meta.map_name : null,
        matchDurationSeconds: typeof meta?.match_duration_seconds === 'number' ? meta.match_duration_seconds : null,
        matchDurationLabel: typeof meta?.match_duration_label === 'string' ? meta.match_duration_label : null,
        profiles: Array.isArray(meta?.profiles) ? meta.profiles : null,
        submittedName: typeof meta?.submitted_name === 'string' ? meta.submitted_name : null,
        submittedComment: typeof meta?.submitted_comment === 'string' ? meta.submitted_comment : null,
        status: typeof meta?.status === 'string' ? meta.status : 'pending',
      };
    })
    .filter(Boolean) as any[];

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
      meta = {
        replay_name: typeof parsed?.replayname === 'string' ? parsed.replayname : null,
        map_name: typeof parsed?.mapname === 'string' ? parsed.mapname : null,
        profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : null,
        raw_metadata: parsed ?? null,
      };
    } catch (parseError) {
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
        updated_at: new Date().toISOString(),
      });

    if (metaError) {
      console.error('Failed to upsert replay metadata', metaError);
    }
  } catch (error) {
    console.error('Unexpected error while uploading replay', error);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }

  // Fetch the metadata row to return it in the response for immediate UI preview
  const { data: metaRow } = await supabaseAdmin
    .from('replay_metadata')
    .select('path, original_name, replay_name, map_name, match_duration_seconds, match_duration_label, profiles, submitted_name, submitted_comment, status')
    .eq('path', objectKey)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    replay: metaRow ? {
      path: metaRow.path,
      originalName: metaRow.original_name,
      replayName: metaRow.replay_name,
      mapName: metaRow.map_name,
      matchDurationSeconds: metaRow.match_duration_seconds,
      matchDurationLabel: metaRow.match_duration_label,
      profiles: metaRow.profiles ?? null,
      submittedName: metaRow.submitted_name ?? null,
      submittedComment: metaRow.submitted_comment ?? null,
      status: metaRow.status ?? 'pending',
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

  const submittedNameRaw = payload?.submittedName;
  const submittedCommentRaw = payload?.submittedComment;
  const statusRaw = payload?.status;

  const submittedName = typeof submittedNameRaw === 'string' ? submittedNameRaw.slice(0, 200) : null;
  const submittedComment = typeof submittedCommentRaw === 'string' ? submittedCommentRaw.slice(0, 1000) : null;
  const status = typeof statusRaw === 'string' ? statusRaw : 'published';

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (submittedName !== null) update.submitted_name = submittedName;
  if (submittedComment !== null) update.submitted_comment = submittedComment;
  if (status) update.status = status;

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
