"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type ReplayListEntry = {
  path: string;
  originalName: string;
  size: number | null;
  uploadedAt: string | null;
  downloads: number;
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
    case 'missing_signed_url':
      return 'Download link was empty. Refresh the list and try again.';
    case 'increment_failed':
      return 'Download link is ready, but we could not record the download count.';
    case 'clipboard_unavailable':
      return 'Clipboard access is blocked by your browser. Try downloading instead.';
    default:
      return 'Something went wrong. Please try again shortly.';
  }
};

const formatBytes = (bytes: number | null) => {
  if (!bytes || Number.isNaN(bytes)) {
    return 'Unknown size';
  }

  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    const precision = megabytes >= 10 ? 0 : 1;
    return `${megabytes.toFixed(precision)} MB`;
  }

  const kilobytes = bytes / 1024;
  return `${kilobytes.toFixed(1)} KB`;
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

const formatDownloads = (value: number | null | undefined) => {
  const count = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${count} download${count === 1 ? '' : 's'}`;
};

const ReplaysTab = () => {
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

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const code = payload?.error ?? 'upload_failed';
        throw new Error(code);
      }

      setUploadSuccessMessage('Replay uploaded successfully.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await loadReplays();
    } catch (error) {
      const code = error instanceof Error ? error.message : 'upload_failed';
      setUploadErrorCode(code || 'upload_failed');
    } finally {
      setUploading(false);
    }
  }, [loadReplays]);

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

      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'download_failed';
      setActionErrorCode(code || 'download_failed');
    } finally {
      setDownloadingPath(null);
    }
  }, [loadReplays, requestSignedUrl]);

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
      </div>

      <div className="bg-neutral-900 border border-neutral-600/40 rounded-lg p-6 sm:p-8 shadow-2xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-white">Community Replays</h3>
            <p className="text-sm text-neutral-400">New uploads appear here instantly after a successful submit.</p>
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
            <div className="h-16 rounded-md bg-neutral-800/50 animate-pulse" />
            <div className="h-16 rounded-md bg-neutral-800/50 animate-pulse" />
            <div className="h-16 rounded-md bg-neutral-800/50 animate-pulse" />
          </div>
        ) : replays.length === 0 ? (
          <div className="rounded-md border border-neutral-700/50 bg-neutral-900/70 px-4 py-6 text-center text-neutral-400">
            No replays have been uploaded yet. Be the first to share a battle!
          </div>
        ) : (
          <div className="space-y-3">
            {replays.map((replay, index) => (
              <div
                key={replay.path}
                className="flex flex-col gap-3 rounded-md border border-neutral-700/50 bg-neutral-900/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 sm:space-y-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                    <p className="text-base font-medium text-white" title={replay.originalName}>
                      {replay.originalName}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-md border border-neutral-700/60 bg-neutral-800/70 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-200">
                      #{index + 1} · {formatDownloads(replay.downloads)}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400">
                    {formatDate(replay.uploadedAt)} · {formatBytes(replay.size)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleDownload(replay.path)}
                    disabled={downloadingPath === replay.path}
                    className="inline-flex items-center justify-center rounded-md border border-neutral-600/60 bg-neutral-800/80 px-4 py-2 text-sm font-medium text-neutral-100 transition-colors duration-300 hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {downloadingPath === replay.path ? 'Preparing...' : 'Download'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyLink(replay.path)}
                    disabled={copyingPath === replay.path}
                    className="inline-flex items-center justify-center rounded-md border border-neutral-600/60 bg-neutral-800/80 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors duration-300 hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {copyingPath === replay.path ? 'Copying...' : 'Copy link'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReplaysTab;
