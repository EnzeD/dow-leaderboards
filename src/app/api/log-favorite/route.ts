import { NextRequest } from "next/server";

type FavoriteLogPayload = {
  action: 'add' | 'remove';
  profileId?: string | null;
  alias?: string | null;
  playerName?: string | null;
  occurredAt?: string;
};

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as FavoriteLogPayload;
    const action = data?.action === 'remove' ? 'REMOVE' : 'ADD';
    const timestamp = data?.occurredAt || new Date().toISOString();
    const alias = (data?.alias || data?.playerName || '').trim() || 'unknown';
    const profileId = data?.profileId ? String(data.profileId) : 'unknown';
    const ip = req.headers.get('x-forwarded-for') || req.ip || 'unknown';

    console.info(`[favorites] ${action} alias=${alias} profile=${profileId} ip=${ip} at=${timestamp}`);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[favorites] log failed', error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
