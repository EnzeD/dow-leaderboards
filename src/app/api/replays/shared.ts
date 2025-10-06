import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const REPLAYS_BUCKET = process.env.SUPABASE_REPLAYS_BUCKET ?? 'replays';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour access window

export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

export const getClientIpHash = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');

  const ip = cfConnectingIp || forwarded?.split(',')[0]?.trim() || realIp || 'unknown';

  return createHash('sha256').update(ip).digest('hex');
};

export interface SignedReplayUrlResult {
  url: string;
  downloadCount: number | null;
  alreadyDownloaded: boolean;
}

export async function generateSignedReplayUrl(req: NextRequest, path: string): Promise<SignedReplayUrlResult> {
  if (!supabaseAdmin) {
    throw new Error('supabase_not_configured');
  }

  const { data, error } = await supabaseAdmin
    .storage
    .from(REPLAYS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('Failed to create signed URL for replay', error);
    throw new Error('signed_url_failed');
  }

  let downloadCount: number | null = null;
  let wasIncremented = false;

  const ipHash = getClientIpHash(req);

  const { data: incremented, error: incrementError } = await supabaseAdmin
    .rpc('increment_replay_download', {
      path_input: path,
      ip_hash_input: ipHash
    });

  if (incrementError) {
    console.error('Failed to increment replay download count', incrementError);
  } else if (incremented && typeof incremented === 'object') {
    downloadCount = Number(incremented.download_count ?? null);
    wasIncremented = Boolean(incremented.incremented);
  }

  return {
    url: data.signedUrl,
    downloadCount,
    alreadyDownloaded: !wasIncremented
  };
}

export const sanitizeReplayFilename = (name: string | null | undefined): string => {
  const cleaned = (name ?? '')
    .replace(/\.rec$/i, '')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const base = cleaned || 'replay';
  return `${base}.rec`;
};

