import { NextRequest, NextResponse } from 'next/server';
import { generateSignedReplayUrl, sanitizeReplayFilename, supabaseAdmin } from '../shared';

const deriveFilenameFromPath = (path: string): string => {
  const [, base] = path.split('__');
  if (!base) {
    return 'replay.rec';
  }

  const cleaned = base.replace(/[^a-zA-Z0-9\s\-_\.]/g, '').trim();
  return cleaned || 'replay.rec';
};

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'missing_path' }, { status: 400 });
  }

  try {
    const { url, downloadCount } = await generateSignedReplayUrl(req, path);

    const fileResponse = await fetch(url);
    if (!fileResponse.ok || !fileResponse.body) {
      return NextResponse.json({ error: 'download_failed' }, { status: 502 });
    }

    let filename: string | null = null;

    const { data: metaRow, error: metaError } = await supabaseAdmin
      .from('replay_metadata')
      .select('submitted_name, replay_name, original_name')
      .eq('path', path)
      .maybeSingle();

    if (metaError) {
      console.error('Failed to load replay metadata for download filename', metaError);
    }

    if (metaRow) {
      filename = sanitizeReplayFilename(metaRow.submitted_name || metaRow.replay_name || metaRow.original_name);
    }

    if (!filename) {
      filename = sanitizeReplayFilename(deriveFilenameFromPath(path));
    }

    const headers = new Headers(fileResponse.headers);
    headers.set('Content-Type', fileResponse.headers.get('Content-Type') ?? 'application/octet-stream');
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('X-Replay-Filename', filename);

    if (typeof downloadCount === 'number' && Number.isFinite(downloadCount)) {
      headers.set('X-Download-Count', String(downloadCount));
    }

    return new NextResponse(fileResponse.body, {
      status: 200,
      headers
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'download_failed';
    console.error('Failed to serve replay download', error);
    const status = code === 'supabase_not_configured' ? 500 : 500;
    return NextResponse.json({ error: code || 'download_failed' }, { status });
  }
}
