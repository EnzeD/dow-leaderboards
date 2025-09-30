"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { EnrichedReplayProfile, getGameModeFromMapName } from '@/lib/replay-player-matching';
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
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Filter states
  const [selectedFactions, setSelectedFactions] = useState<Set<string>>(new Set());
  const [eloRange, setEloRange] = useState<{ min: number; max: number }>({ min: 0, max: 3000 });
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set());
  const [selectedMaps, setSelectedMaps] = useState<Set<string>>(new Set());
  const [aliasSearch, setAliasSearch] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Preview of the last uploaded replay (not yet published)
  const [preview, setPreview] = useState<ReplayListEntry | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formComment, setFormComment] = useState<string>('');
  const [savingDetails, setSavingDetails] = useState<boolean>(false);

  // Extract unique values for filters
  const availableFactions = useMemo(() => {
    const factions = new Set<string>();
    replays.forEach(replay => {
      if (Array.isArray(replay.profiles)) {
        replay.profiles.forEach(p => {
          if (p.faction) factions.add(p.faction);
        });
      }
    });
    return Array.from(factions).sort();
  }, [replays]);

  const availableMaps = useMemo(() => {
    const maps = new Set<string>();
    replays.forEach(replay => {
      if (replay.mapName) {
        const mapDisplayName = getMapName(replay.mapName);
        maps.add(mapDisplayName);
      }
    });
    return Array.from(maps).sort();
  }, [replays]);

  const eloLimits = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    replays.forEach(replay => {
      if (Array.isArray(replay.profiles)) {
        replay.profiles.forEach(p => {
          const enriched = p as EnrichedReplayProfile;
          if (enriched.faction_rating) {
            min = Math.min(min, enriched.faction_rating);
            max = Math.max(max, enriched.faction_rating);
          }
        });
      }
    });
    return { min: min === Infinity ? 0 : Math.floor(min / 100) * 100, max: max === -Infinity ? 3000 : Math.ceil(max / 100) * 100 };
  }, [replays]);

  // Filter replays based on active filters
  const filteredReplays = useMemo(() => {
    return replays.filter(replay => {
      // Alias search filter
      if (aliasSearch.trim()) {
        const searchLower = aliasSearch.toLowerCase();
        const hasMatchingAlias = (replay.profiles || []).some(p => {
          const enriched = p as EnrichedReplayProfile;
          const alias = enriched.alias || enriched.current_alias || '';
          return alias.toLowerCase().includes(searchLower);
        });
        if (!hasMatchingAlias) return false;
      }

      // Faction filter
      if (selectedFactions.size > 0) {
        const replayFactions = (replay.profiles || []).map(p => p.faction);
        const hasFaction = replayFactions.some(f => selectedFactions.has(f));
        if (!hasFaction) return false;
      }

      // Format filter
      if (selectedFormats.size > 0) {
        const format = getGameModeFromMapName(replay.mapName);
        if (!selectedFormats.has(format)) return false;
      }

      // Map filter
      if (selectedMaps.size > 0) {
        const mapDisplayName = getMapName(replay.mapName);
        if (!selectedMaps.has(mapDisplayName)) return false;
      }

      // ELO filter
      if (Array.isArray(replay.profiles)) {
        const hasEloInRange = replay.profiles.some(p => {
          const enriched = p as EnrichedReplayProfile;
          if (enriched.faction_rating) {
            return enriched.faction_rating >= eloRange.min && enriched.faction_rating <= eloRange.max;
          }
          return eloRange.min === eloLimits.min && eloRange.max === eloLimits.max; // Include players without ELO if range is at default
        });
        if (!hasEloInRange) return false;
      }

      return true;
    });
  }, [replays, selectedFactions, selectedFormats, selectedMaps, eloRange, eloLimits, aliasSearch]);

  // Check if any filters are active
  const hasActiveFilters = selectedFactions.size > 0 || selectedFormats.size > 0 || selectedMaps.size > 0 || eloRange.min !== eloLimits.min || eloRange.max !== eloLimits.max || aliasSearch.trim() !== '';

  const clearAllFilters = () => {
    setSelectedFactions(new Set());
    setSelectedFormats(new Set());
    setSelectedMaps(new Set());
    setEloRange({ min: eloLimits.min, max: eloLimits.max });
    setAliasSearch('');
  };

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

      // Show copied confirmation
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1200);

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
              className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-600/60 bg-neutral-800/80 px-5 py-2 text-sm font-medium text-white transition-colors duration-300 hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
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
            className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-600/60 bg-neutral-800/80 px-4 py-2 text-sm font-medium text-neutral-100 transition-colors duration-300 hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loadingList ? 'Refreshing...' : 'Refresh list'}
          </button>
        </div>

        {/* Filters */}
        {replays.length > 0 && (
          <div className="space-y-3 bg-neutral-900/50 p-4 rounded-lg border border-neutral-700/40">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Player Alias Search */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-400 font-medium">Player:</label>
                <input
                  type="text"
                  value={aliasSearch}
                  onChange={(e) => setAliasSearch(e.target.value)}
                  placeholder="Search alias..."
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 border border-neutral-600/40 text-neutral-200 placeholder-neutral-500 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors w-36"
                />
              </div>

              {/* Format Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-400 font-medium">Format:</label>
                <select
                  value={selectedFormats.size === 0 ? 'any' : Array.from(selectedFormats)[0]}
                  onChange={(e) => {
                    if (e.target.value === 'any') {
                      setSelectedFormats(new Set());
                    } else {
                      setSelectedFormats(new Set([e.target.value]));
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 border border-neutral-600/40 text-neutral-200 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                >
                  <option value="any">Any</option>
                  <option value="1v1">1v1</option>
                  <option value="2v2">2v2</option>
                  <option value="3v3">3v3</option>
                  <option value="4v4">4v4</option>
                </select>
              </div>

              {/* Maps Dropdown */}
              {availableMaps.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-400 font-medium">Map:</label>
                  <select
                    value={selectedMaps.size === 0 ? 'any' : Array.from(selectedMaps)[0]}
                    onChange={(e) => {
                      if (e.target.value === 'any') {
                        setSelectedMaps(new Set());
                      } else {
                        setSelectedMaps(new Set([e.target.value]));
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 border border-neutral-600/40 text-neutral-200 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors max-w-[200px]"
                  >
                    <option value="any">Any</option>
                    {availableMaps.map(map => (
                      <option key={map} value={map}>{map}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600/20 border border-red-500/50 text-red-300 hover:bg-red-600/30 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* ELO Range Slider */}
            {eloLimits.max > eloLimits.min && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400 font-medium">ELO Range:</span>
                  <span className="text-xs text-neutral-300 font-semibold">{eloRange.min} - {eloRange.max}</span>
                </div>
                <div className="relative px-2">
                  <div className="flex items-center gap-4">
                    {/* Min label */}
                    <div className="flex items-center justify-center w-14 h-8 bg-blue-600/20 border border-blue-500/40 rounded text-white text-xs font-bold">
                      {eloRange.min}
                    </div>

                    {/* Dual slider container */}
                    <div className="relative flex-1 h-2">
                      {/* Track background */}
                      <div className="absolute w-full h-2 bg-neutral-700 rounded-full" />

                      {/* Active range highlight */}
                      <div
                        className="absolute h-2 bg-blue-500 rounded-full"
                        style={{
                          left: `${((eloRange.min - eloLimits.min) / (eloLimits.max - eloLimits.min)) * 100}%`,
                          right: `${100 - ((eloRange.max - eloLimits.min) / (eloLimits.max - eloLimits.min)) * 100}%`
                        }}
                      />

                      {/* Min slider */}
                      <input
                        type="range"
                        min={eloLimits.min}
                        max={eloLimits.max}
                        step={50}
                        value={eloRange.min}
                        onChange={(e) => setEloRange({ ...eloRange, min: Math.min(parseInt(e.target.value), eloRange.max) })}
                        className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-500 [&::-moz-range-thumb]:cursor-pointer"
                      />

                      {/* Max slider */}
                      <input
                        type="range"
                        min={eloLimits.min}
                        max={eloLimits.max}
                        step={50}
                        value={eloRange.max}
                        onChange={(e) => setEloRange({ ...eloRange, max: Math.max(parseInt(e.target.value), eloRange.min) })}
                        className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-500 [&::-moz-range-thumb]:cursor-pointer"
                      />
                    </div>

                    {/* Max label */}
                    <div className="flex items-center justify-center w-14 h-8 bg-blue-600/20 border border-blue-500/40 rounded text-white text-xs font-bold">
                      {eloRange.max}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Race/Faction Filter */}
            {availableFactions.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 font-medium">Races:</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableFactions.map(faction => {
                    const isSelected = selectedFactions.has(faction);
                    // Normalize faction display name
                    const displayName = faction
                      .replace(/_/g, ' ')
                      .split(' ')
                      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ');

                    return (
                      <button
                        key={faction}
                        onClick={() => {
                          const newSet = new Set(selectedFactions);
                          if (isSelected) {
                            newSet.delete(faction);
                          } else {
                            newSet.add(faction);
                          }
                          setSelectedFactions(newSet);
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                          isSelected
                            ? 'bg-blue-600/30 border-blue-500/60 text-blue-200'
                            : 'bg-neutral-800/80 border-neutral-600/40 text-neutral-300 hover:bg-neutral-700/80'
                        }`}
                      >
                        {displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Results Count */}
            {hasActiveFilters && (
              <div className="text-xs text-neutral-400 pt-1 border-t border-neutral-700/40">
                Showing <span className="font-semibold text-neutral-200">{filteredReplays.length}</span> of <span className="font-semibold text-neutral-200">{replays.length}</span> replays
              </div>
            )}
          </div>
        )}

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
        ) : filteredReplays.length === 0 ? (
          <div className="rounded-md border border-neutral-700/50 bg-neutral-900/70 px-4 py-6 text-center text-neutral-400">
            No replays match the selected filters. Try adjusting your filters or clear them to see all replays.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReplays.map((replay) => {
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
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-600/60 bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {downloadingPath === replay.path ? 'Downloading...' : 'Download'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(replay.path)}
                        disabled={copyingPath === replay.path}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-600/60 bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span className={copiedPath === replay.path ? 'text-green-400' : ''}>
                          {copiedPath === replay.path ? 'Link copied' : copyingPath === replay.path ? 'Copying...' : 'Copy link'}
                        </span>
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
