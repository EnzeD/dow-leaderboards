import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Buffer } from 'node:buffer';

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

  const downloadMap = new Map<string, number>();
  statsRows?.forEach(row => {
    const key = typeof row.path === 'string' ? row.path : null;
    const count = typeof row.download_count === 'number' ? row.download_count : Number(row.download_count ?? 0);
    if (key) {
      downloadMap.set(key, Number.isFinite(count) ? count : 0);
    }
  });

  const replays = fileItems.map(item => {
    const fallbackName = item.name.includes('__') ? item.name.split('__').pop() ?? item.name : item.name;
    const originalName = typeof item.metadata?.originalName === 'string'
      ? item.metadata.originalName
      : fallbackName;

    return {
      path: item.name,
      originalName,
      size: item.metadata?.size ?? null,
      uploadedAt: item.created_at ?? item.updated_at ?? null,
      downloads: downloadMap.get(item.name) ?? 0,
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
  } catch (error) {
    console.error('Unexpected error while uploading replay', error);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  });
}
