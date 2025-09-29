"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { EnrichedReplayProfile } from '@/lib/replay-player-matching';
import { PlayerTeam, PlayerList } from '@/components/ClickablePlayer';
import { getMapName, getMapImage } from '@/lib/mapMetadata';

type Player = { alias: string; team: number; faction: string };

type ReplayListEntry = {
  path: string;
  originalName: string;
  size: number | null;
  uploadedAt: string | null;
  downloads: number;
  // Parsed metadata
  replayName: string | null;
  mapName: string | null;
  matchDurationSeconds: number | null;
  matchDurationLabel: string | null;
  profiles: EnrichedReplayProfile[] | Player[] | null;
  // User submitted
  submittedName: string | null;
  submittedComment: string | null;
  status: 'pending' | 'published' | string;
};

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));

const resolveErrorMessage = (code: string) => {
  switch (code) {
    case 'invalid_extension':
      return 'Only .rec replay files can be uploaded.';
    case 'file_too_large':
      return `Replay files must be ${MAX_FILE_SIZE_MB}MB or smaller.`;
    case 'missing_replay':
      return 'Select a replay file before uploading.';
    case 'invalid_form_data':
      return 'Could not read the upload request. Please try again.';
    case 'invalid_dowde_replay':
      return 'This replay file is not from Dawn of War: Definitive Edition. Please upload a valid DoW:DE replay file.';
    case 'list_failed':
      return 'Could not load community replays. Please refresh in a moment.';
    case 'signed_url_failed':
      return 'Download link could not be created. Try refreshing the list.';
    case 'supabase_not_configured':
      return 'Supabase is not configured. Add your project keys to the environment.';
    case 'upload_failed':
      return 'We could not save the replay. Please try again shortly.';
    case 'download_failed':
      return 'We could not generate a download link. Please try again.';
    case 'update_failed':
      return 'We could not save your replay details. Please try again.';
    case 'missing_signed_url':
      return 'Download link was empty. Refresh the list and try again.';
    case 'increment_failed':
      return 'Download link is ready, but we could not record the download count.';
    case 'missing_path':
      return 'This replay could not be identified. Refresh and try again.';
    case 'clipboard_unavailable':
      return 'Clipboard access is blocked by your browser. Try downloading instead.';
    case 'rate_limit_exceeded':
      return 'You have uploaded too many replays recently. Please wait an hour and try again.';
    default:
      return 'Something went wrong. Please try again shortly.';
  }
};


const formatDate = (value: string | null) => {
  if (!value) {
    return 'Unknown upload date';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown upload date';
  }
  return parsed.toLocaleString();
};

const sortReplays = (entries: ReplayListEntry[]) => {
  return [...entries].sort((a, b) => {
    const downloadDelta = (b.downloads ?? 0) - (a.downloads ?? 0);
    if (downloadDelta !== 0) {
      return downloadDelta;
    }
    const timeA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const timeB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return timeB - timeA;
  });
};


const formatDownloadsCount = (value: number | null | undefined) => {
  const count = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return count;
};


interface ReplaysTabProps {
  onPlayerClick?: (playerName: string, profileId?: string) => void;
}

const ReplaysTab = ({ onPlayerClick }: ReplaysTabProps) => {
  const [replays, setReplays] = useState<ReplayListEntry[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [listErrorCode, setListErrorCode] = useState<string | null>(null);
  const [uploadErrorCode, setUploadErrorCode] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [actionErrorCode, setActionErrorCode] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [copyingPath, setCopyingPath] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Preview of the last uploaded replay (not yet published)
  const [preview, setPreview] = useState<ReplayListEntry | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formComment, setFormComment] = useState<string>('');
  const [savingDetails, setSavingDetails] = useState<boolean>(false);

  const loadReplays = useCallback(async () => {
    setLoadingList(true);
    setListErrorCode(null);

    try {
      const response = await fetch('/api/replays', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const code = payload?.error ?? 'list_failed';
        throw new Error(code);
      }

      const entries = Array.isArray(payload?.replays) ? payload.replays : [];
      const normalized = entries
        .map((entry: any) => {
          const path = typeof entry?.path === 'string' ? entry.path : '';
          const sizeRaw = typeof entry?.size === 'number'
            ? entry.size
            : entry?.size === null || entry?.size === undefined
              ? null
              : Number(entry?.size);
          const downloadsRaw = typeof entry?.downloads === 'number'
            ? entry.downloads
            : entry?.downloads === null || entry?.downloads === undefined
              ? 0
              : Number(entry?.downloads);

          return {
            path,
            originalName: typeof entry?.originalName === 'string' ? entry.originalName : path || 'Unknown replay',
            size: typeof sizeRaw === 'number' && Number.isFinite(sizeRaw) ? sizeRaw : null,
            uploadedAt: typeof entry?.uploadedAt === 'string' ? entry.uploadedAt : null,
            downloads: Number.isFinite(downloadsRaw) ? downloadsRaw : 0,
            replayName: typeof entry?.replayName === 'string' ? entry.replayName : null,
            mapName: typeof entry?.mapName === 'string' ? entry.mapName : null,
            matchDurationSeconds: typeof entry?.matchDurationSeconds === 'number' ? entry.matchDurationSeconds : null,
            matchDurationLabel: typeof entry?.matchDurationLabel === 'string' ? entry.matchDurationLabel : null,
            profiles: Array.isArray(entry?.profiles) ? entry.profiles : null,
            submittedName: typeof entry?.submittedName === 'string' ? entry.submittedName : null,
            submittedComment: typeof entry?.submittedComment === 'string' ? entry.submittedComment : null,
            status: typeof entry?.status === 'string' ? entry.status : 'pending',
          } satisfies ReplayListEntry;
        })
        .filter((entry: ReplayListEntry) => Boolean(entry.path));

      setReplays(sortReplays(normalized));
      setActionErrorCode(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'list_failed';
      setListErrorCode(code || 'list_failed');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadReplays();
  }, [loadReplays]);

  const handleUpload = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadErrorCode(null);
    setUploadSuccessMessage(null);

    const file = fileInputRef.current?.files?.[0] ?? null;

    if (!file) {
      setUploadErrorCode('missing_replay');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.rec')) {
      setUploadErrorCode('invalid_extension');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadErrorCode('file_too_large');
      return;
    }

    const body = new FormData();
    body.append('replay', file);

    setUploading(true);

    try {
      const response = await fetch('/api/replays', {
        method: 'POST',
        body,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const code = payload?.error ?? 'upload_failed';
        throw new Error(code);
      }

      const replay = payload?.replay ?? null;
      // Prepare preview UI using returned parsed data
      if (replay) {
        const normalized: ReplayListEntry = {
          path: String(replay.path || ''),
          originalName: String(replay.originalName || 'Unknown replay'),
          size: null,
          uploadedAt: null,
          downloads: 0,
          replayName: typeof replay.replayName === 'string' ? replay.replayName : null,
          mapName: typeof replay.mapName === 'string' ? replay.mapName : null,
          matchDurationSeconds: typeof replay.matchDurationSeconds === 'number' ? replay.matchDurationSeconds : null,
          matchDurationLabel: typeof replay.matchDurationLabel === 'string' ? replay.matchDurationLabel : null,
          profiles: Array.isArray(replay.profiles) ? replay.profiles : null,
          submittedName: null,
          submittedComment: null,
          status: 'pending',
        };
        setPreview(normalized);
        setFormName(normalized.replayName || normalized.originalName || '');
        setFormComment('');
        setUploadSuccessMessage('Replay uploaded! Review details below, edit the title, add a comment and save.');
      } else {
        setUploadSuccessMessage('Replay uploaded successfully.');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Do not refresh list here; unpublished previews should not appear in the list
    } catch (error) {
      const code = error instanceof Error ? error.message : 'upload_failed';
      setUploadErrorCode(code || 'upload_failed');
    } finally {
      setUploading(false);
    }
  }, []);

  const requestSignedUrl = useCallback(async (path: string) => {
    const response = await fetch(`/api/replays?path=${encodeURIComponent(path)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const code = payload?.error ?? 'download_failed';
      throw new Error(code);
    }

    const url = typeof payload?.url === 'string' ? payload.url : null;
    if (!url) {
      throw new Error('missing_signed_url');
    }

    const downloadCount = typeof payload?.downloadCount === 'number'
      ? Number(payload.downloadCount)
      : null;

    return { url, downloadCount } as const;
  }, []);

  const handleRefresh = useCallback(() => {
    setActionErrorCode(null);
    void loadReplays();
  }, [loadReplays]);

  const handleDownload = useCallback(async (path: string) => {
    if (!path) return;

    setActionErrorCode(null);
    setDownloadingPath(path);

    try {
      const { url, downloadCount } = await requestSignedUrl(path);

      if (typeof downloadCount === 'number') {
        setReplays(prev =>
          sortReplays(
            prev.map(entry =>
              entry.path === path ? { ...entry, downloads: downloadCount } : entry
            )
          )
        );
      } else {
        void loadReplays();
      }

      // Find the replay to get its name
      const replay = replays.find(r => r.path === path);
      const replayName = replay?.submittedName || replay?.replayName || replay?.originalName || 'replay';

      // Sanitize the replay name for use in filename
      const sanitizedName = replayName
        .replace(/\.rec$/i, '') // Remove .rec if already present
        .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      // Create the filename
      const filename = `${sanitizedName}.rec`;

      // Download the file with custom filename
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'download_failed';
      setActionErrorCode(code || 'download_failed');
    } finally {
      setDownloadingPath(null);
    }
  }, [loadReplays, requestSignedUrl, replays]);

  const handleCopyLink = useCallback(async (path: string) => {
    if (!path) return;
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
      setActionErrorCode('clipboard_unavailable');
      return;
    }

    setActionErrorCode(null);
    setCopyingPath(path);

    try {
      const { url, downloadCount } = await requestSignedUrl(path);

      try {
        await navigator.clipboard.writeText(url);
      } catch (copyError) {
        console.error('Failed to copy replay download URL', copyError);
        throw new Error('clipboard_unavailable');
      }

      if (typeof downloadCount === 'number') {
        setReplays(prev =>
          sortReplays(
            prev.map(entry =>
              entry.path === path ? { ...entry, downloads: downloadCount } : entry
            )
          )
        );
      } else {
        void loadReplays();
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'download_failed';
      setActionErrorCode(code || 'download_failed');
    } finally {
      setCopyingPath(null);
    }
  }, [loadReplays, requestSignedUrl]);

  const handleSaveDetails = useCallback(async () => {
    if (!preview?.path) return;
    setSavingDetails(true);
    setActionErrorCode(null);
    try {
      const res = await fetch('/api/replays', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: preview.path, submittedName: formName, submittedComment: formComment, status: 'published' }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const code = payload?.error || 'update_failed';
        throw new Error(code);
      }
      // Clear preview and refresh list so it appears
      setPreview(null);
      setFormName('');
      setFormComment('');
      setUploadSuccessMessage(null); // Clear the success message
      await loadReplays();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'update_failed';
      setActionErrorCode(code);
    } finally {
      setSavingDetails(false);
    }
  }, [preview, formName, formComment, loadReplays]);

  const uploadErrorMessage = uploadErrorCode ? resolveErrorMessage(uploadErrorCode) : null;
  const listErrorMessage = listErrorCode ? resolveErrorMessage(listErrorCode) : null;
  const actionErrorMessage = actionErrorCode ? resolveErrorMessage(actionErrorCode) : null;

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-600/40 rounded-lg p-6 sm:p-8 shadow-2xl space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Share Your Replays</h2>
          <p className="text-neutral-300">
            Upload Dawn of War `.rec` files and let other commanders download your favourite matches.
          </p>
        </div>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 space-y-3 sm:space-y-0">
            <input
              ref={fileInputRef}
              type="file"
              name="replay"
              accept=".rec"
              className="block w-full text-sm text-neutral-200 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-800/80 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-100 hover:file:bg-neutral-700/80"
              onChange={() => {
                setUploadErrorCode(null);
                setUploadSuccessMessage(null);
                setPreview(null);
                setFormName('');
                setFormComment('');
              }}
            />
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center justify-center rounded-md border border-neutral-600/60 bg-neutral-800/80 px-5 py-2 text-sm font-medium text-white transition-colors duration-300 hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? 'Uploading...' : 'Upload Replay'}
            </button>
          </div>
          <p className="text-sm text-neutral-500">
            Only `.rec` files up to {MAX_FILE_SIZE_MB}MB are accepted.
          </p>
        </form>
        {uploadErrorMessage && (
          <div className="rounded-md border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {uploadErrorMessage}
          </div>
        )}
        {uploadSuccessMessage && (
          <div className="rounded-md border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200">
            {uploadSuccessMessage}
          </div>
        )}

        {preview && (
          <div className="mt-4 space-y-3 rounded-lg border border-neutral-700/60 bg-neutral-900/80 p-4">
            <h4 className="text-lg font-semibold text-white">Review replay details</h4>
            <div className="text-sm text-neutral-300 space-y-1">
              <p>
                Name: <span className="text-neutral-200">{preview.replayName || preview.originalName}</span>
              </p>
              <p>
                Map: <span className="text-neutral-200">{preview.mapName || 'Unknown'}</span>
                {' '}· Duration: <span className="text-neutral-200">{preview.matchDurationLabel || (preview.matchDurationSeconds ? `${Math.floor((preview.matchDurationSeconds||0)/60)}:${String((preview.matchDurationSeconds||0)%60).padStart(2,'0')}` : 'Unknown')}</span>
              </p>
              {Array.isArray(preview.profiles) && preview.profiles.length > 0 && (
                <p>
                  Players: <PlayerList
                    profiles={preview.profiles as EnrichedReplayProfile[]}
                    onPlayerClick={onPlayerClick}
                    showTeams={true}
                    showDetails={true}
                    compact={false}
                  />
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Replay name"
                className="w-full sm:w-1/2 rounded-md border border-neutral-700/60 bg-neutral-800/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
              />
              <input
                type="text"
                value={formComment}
                onChange={(e) => setFormComment(e.target.value)}
                placeholder="Add a public comment (optional)"
                className="w-full sm:w-1/2 rounded-md border border-neutral-700/60 bg-neutral-800/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSaveDetails()}
                disabled={savingDetails || !formName.trim()}
                className="inline-flex items-center justify-center rounded-md border border-emerald-700/60 bg-emerald-800/80 px-3 py-1.5 text-sm font-medium text-emerald-100 hover:bg-emerald-700/80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingDetails ? 'Saving...' : 'Save & publish'}
              </button>
              <button
                type="button"
                onClick={() => { setPreview(null); setFormName(''); setFormComment(''); setUploadSuccessMessage(null); }}
                className="inline-flex items-center justify-center rounded-md border border-neutral-600/60 bg-neutral-800/80 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-700/80"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-neutral-800 border border-neutral-600/30 rounded-lg p-6 sm:p-8 shadow-lg space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-white">Community Replays</h3>
            <p className="text-sm text-neutral-400">Top most downloaded replays recently.</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loadingList}
            className="inline-flex items-center justify-center rounded-md border border-neutral-600/60 bg-neutral-800/80 px-4 py-2 text-sm font-medium text-neutral-100 transition-colors duration-300 hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingList ? 'Refreshing...' : 'Refresh list'}
          </button>
        </div>

        {listErrorMessage && (
          <div className="rounded-md border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {listErrorMessage}
          </div>
        )}
        {actionErrorMessage && (
          <div className="rounded-md border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-100">
            {actionErrorMessage}
          </div>
        )}

        {loadingList ? (
          <div className="space-y-3">
            <div className="h-32 rounded-lg bg-neutral-900 border border-neutral-600/25 animate-pulse" />
            <div className="h-32 rounded-lg bg-neutral-900 border border-neutral-600/25 animate-pulse" />
            <div className="h-32 rounded-lg bg-neutral-900 border border-neutral-600/25 animate-pulse" />
          </div>
        ) : replays.length === 0 ? (
          <div className="rounded-md border border-neutral-700/50 bg-neutral-900/70 px-4 py-6 text-center text-neutral-400">
            No replays have been uploaded yet. Be the first to share a battle!
          </div>
        ) : (
          <div className="space-y-3">
            {replays.map((replay) => {
              const mapDisplayName = getMapName(replay.mapName);
              const mapImagePath = getMapImage(replay.mapName);
              const duration = replay.matchDurationLabel || (replay.matchDurationSeconds ? `${Math.floor((replay.matchDurationSeconds||0)/60)}:${String((replay.matchDurationSeconds||0)%60).padStart(2,'0')}` : null);

              // Debug: Check if profiles have faction_rating
              if (replay.profiles && replay.profiles.length > 0) {
                console.log('Replay profiles for', replay.replayName || replay.originalName, ':', replay.profiles);
              }

              return (
                <div key={replay.path} className="bg-neutral-900 border border-neutral-600/25 rounded-lg shadow-md overflow-hidden p-4">
                  {/* Header with title and actions - title left, buttons right */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate" title={replay.originalName}>
                        {replay.submittedName || replay.replayName || replay.originalName}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                        <span className="text-neutral-200 font-medium">
                          {formatDownloadsCount(replay.downloads)} {formatDownloadsCount(replay.downloads) === 1 ? 'download' : 'downloads'}
                        </span>
                        <span>•</span>
                        <span>{formatDate(replay.uploadedAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDownload(replay.path)}
                        disabled={downloadingPath === replay.path}
                        className="inline-flex items-center justify-center rounded-md border border-neutral-600/60 bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadingPath === replay.path ? 'Downloading...' : 'Download'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(replay.path)}
                        disabled={copyingPath === replay.path}
                        className="inline-flex items-center justify-center rounded-md border border-neutral-600/60 bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {copyingPath === replay.path ? 'Copying...' : 'Copy Link'}
                      </button>
                    </div>
                  </div>

                  {/* Teams display with map in the middle */}
                  <div className="flex flex-col sm:flex-row gap-3 items-start">
                    {/* Team 1 */}
                    <div className="flex-1">
                      <div className="text-xs text-neutral-400 mb-1 font-semibold uppercase tracking-wide">Team 1</div>
                      <div className="bg-neutral-800/30 rounded-md p-2 border border-neutral-600/25">
                        {Array.isArray(replay.profiles) && replay.profiles.filter(p => p.team === 1).map((profile, idx) => {
                          const enrichedProfile = profile as EnrichedReplayProfile;
                          return (
                            <div key={`t1-${idx}`} className="flex items-center justify-between gap-2 py-1">
                              <PlayerTeam
                                profiles={[enrichedProfile]}
                                team={1}
                                onPlayerClick={onPlayerClick}
                                showDetails={true}
                                compact={false}
                                className="text-neutral-200 text-xs flex-1"
                              />
                              {enrichedProfile.faction_rating && (
                                <span className="text-xs font-semibold text-yellow-400">
                                  {enrichedProfile.faction_rating} ELO
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {(!replay.profiles || !replay.profiles.filter(p => p.team === 1).length) && (
                          <span className="text-xs text-neutral-500">No players</span>
                        )}
                      </div>
                    </div>

                    {/* Map in the middle */}
                    <div className="shrink-0 flex flex-col items-center justify-center px-3">
                      {mapImagePath ? (
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-neutral-600/25 bg-neutral-900">
                          <img
                            src={mapImagePath}
                            alt={`${mapDisplayName} mini-map`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg border border-neutral-600/25 bg-neutral-800/50 flex items-center justify-center">
                          <span className="text-2xl text-neutral-600">?</span>
                        </div>
                      )}
                      <div className="mt-2 text-center">
                        <div className="text-xs text-neutral-200 font-medium" title={mapDisplayName}>
                          {mapDisplayName}
                        </div>
                        {duration && (
                          <div className="text-xs text-neutral-400 mt-1">
                            {duration}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Team 2 */}
                    <div className="flex-1">
                      <div className="text-xs text-neutral-400 mb-1 font-semibold uppercase tracking-wide">Team 2</div>
                      <div className="bg-neutral-800/30 rounded-md p-2 border border-neutral-600/25">
                        {Array.isArray(replay.profiles) && replay.profiles.filter(p => p.team === 2).map((profile, idx) => {
                          const enrichedProfile = profile as EnrichedReplayProfile;
                          return (
                            <div key={`t2-${idx}`} className="flex items-center justify-between gap-2 py-1">
                              <PlayerTeam
                                profiles={[enrichedProfile]}
                                team={2}
                                onPlayerClick={onPlayerClick}
                                showDetails={true}
                                compact={false}
                                className="text-neutral-200 text-xs flex-1"
                              />
                              {enrichedProfile.faction_rating && (
                                <span className="text-xs font-semibold text-yellow-400">
                                  {enrichedProfile.faction_rating} ELO
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {(!replay.profiles || !replay.profiles.filter(p => p.team === 2).length) && (
                          <span className="text-xs text-neutral-500">No players</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Comment if available */}
                  {replay.submittedComment && (
                    <div className="mt-4 pt-3 border-t border-neutral-600/25">
                      <div className="text-xs text-neutral-400 font-semibold mb-1">Comment</div>
                      <p className="text-xs text-neutral-300">{replay.submittedComment}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReplaysTab;
export type { ReplaysTabProps };
