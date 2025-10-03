'use client';

import { useState, useCallback, useEffect } from 'react';
import { PlayerTeam } from '@/components/ClickablePlayer';
import { getMapName, getMapImage } from '@/lib/mapMetadata';
import { getGameModeFromMapName, type EnrichedReplayProfile } from '@/lib/replay-player-matching';
import { parseReplayIdFromSlug, generateReplaySlug } from '@/lib/slug';

type ReplayDetailInTabProps = {
  replaySlug: string; // e.g., "epic-match-123"
  onBack: () => void;
  onProfileClick?: (profileId: string) => void;
  prefetchedData?: any; // Optional pre-fetched replay data for instant display
};

export default function ReplayDetailInTab({ replaySlug, onBack, onProfileClick, prefetchedData }: ReplayDetailInTabProps) {
  const [replay, setReplay] = useState<any>(prefetchedData || null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [copyingLink, setCopyingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [revealedWinner, setRevealedWinner] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Extract ID from slug and fetch replay data
  useEffect(() => {
    if (prefetchedData) {
      setReplay(prefetchedData);
      setLoading(false);
      return;
    }

    const replayId = parseReplayIdFromSlug(replaySlug);
    if (!replayId) {
      setError('Invalid replay ID');
      setLoading(false);
      return;
    }

    const fetchReplay = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/replays/by-id/${replayId}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to load replay');
        }

        const data = await response.json();
        setReplay(data);
      } catch (err) {
        console.error('Error fetching replay:', err);
        setError('Failed to load replay. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchReplay();
  }, [replaySlug, prefetchedData]);

  const handleDownload = useCallback(async () => {
    if (!replay) return;

    setActionError(null);
    setDownloadingPath(replay.path);

    try {
      const response = await fetch(`/api/replays?path=${encodeURIComponent(replay.path)}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json();

      if (!response.ok || !payload.url) {
        throw new Error('Failed to generate download link');
      }

      const replayName = replay.submittedName || replay.replayName || replay.originalName || 'replay';
      const sanitizedName = replayName
        .replace(/\.rec$/i, '')
        .replace(/[^a-zA-Z0-9\s\-_]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const filename = `${sanitizedName}.rec`;

      const blob = await fetch(payload.url).then(r => r.blob());
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      // Update download count in local state
      setReplay((prev: any) => prev ? { ...prev, downloads: prev.downloads + 1 } : prev);
    } catch (error) {
      console.error('Download failed:', error);
      setActionError('Download failed. Please try again.');
    } finally {
      setDownloadingPath(null);
    }
  }, [replay]);

  const handleCopyLink = useCallback(async () => {
    if (!replay) return;

    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setActionError('Clipboard not available in your browser');
      return;
    }

    setCopyingLink(true);
    setActionError(null);

    try {
      const slug = generateReplaySlug({
        submitted_name: replay.submittedName,
        replay_name: replay.replayName,
        original_name: replay.originalName,
      });
      const url = `${window.location.origin}/?tab=replays&replay=${slug}-${replay.id}`;

      await navigator.clipboard.writeText(url);

      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      setActionError('Failed to copy link');
    } finally {
      setCopyingLink(false);
    }
  }, [replay]);

  const handlePlayerClick = (playerName: string, profileId?: string) => {
    if (profileId && onProfileClick) {
      onProfileClick(profileId);
    }
  };

  const handleRevealWinner = () => {
    setRevealedWinner(true);
  };

  // Loading state
  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        <p className="mt-4 text-neutral-400">Loading replay...</p>
      </div>
    );
  }

  // Error state
  if (error || !replay) {
    return (
      <div className="py-12 text-center">
        <div className="text-red-400 mb-4">{error || 'Replay not found'}</div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Replays
        </button>
      </div>
    );
  }

  const mapDisplayName = getMapName(replay.mapName);
  const mapImagePath = getMapImage(replay.mapName);
  const gameMode = getGameModeFromMapName(replay.mapName);
  const duration = replay.matchDurationLabel ||
    (replay.matchDurationSeconds
      ? `${Math.floor(replay.matchDurationSeconds / 60)}:${String(replay.matchDurationSeconds % 60).padStart(2, '0')}`
      : null);

  const team1Players = replay.profiles?.filter((p: any) => p.team === 1) || [];
  const team2Players = replay.profiles?.filter((p: any) => p.team === 2) || [];

  return (
    <div className="space-y-8">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-neutral-300 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Replays
      </button>

      {/* Hero section */}
      <div className="bg-neutral-900/80 border border-neutral-600/40 rounded-xl p-8 shadow-2xl">
        <h1 className="text-4xl font-bold mb-4 text-white">
          {replay.submittedName || replay.replayName || replay.originalName || 'Untitled Replay'}
        </h1>

        <div className="flex flex-wrap gap-4 text-sm text-neutral-300 mb-6">
          <span className="inline-flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-md border border-neutral-700/50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {mapDisplayName}
          </span>

          {duration && (
            <span className="inline-flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-md border border-neutral-700/50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {duration}
            </span>
          )}

          <span className="inline-flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-md border border-neutral-700/50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {gameMode}
          </span>

          <span className="inline-flex items-center gap-2 bg-neutral-800/60 px-3 py-1.5 rounded-md border border-neutral-700/50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            {replay.downloads} {replay.downloads === 1 ? 'download' : 'downloads'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDownload}
            disabled={downloadingPath === replay.path}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-600/60 bg-emerald-800/80 px-6 py-3 text-base font-semibold text-emerald-100 transition-colors hover:bg-emerald-700/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloadingPath === replay.path ? 'Downloading...' : 'Download Replay'}
          </button>

          <button
            onClick={handleCopyLink}
            disabled={copyingLink}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-600/60 bg-neutral-800/80 px-6 py-3 text-base font-semibold text-neutral-100 transition-colors hover:bg-neutral-700/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {linkCopied ? '✓ Link Copied!' : copyingLink ? 'Copying...' : 'Copy Link'}
          </button>
        </div>

        {actionError && (
          <div className="mt-4 rounded-md border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {actionError}
          </div>
        )}
      </div>

      {/* Teams display */}
      <div className="bg-neutral-900/80 border border-neutral-600/40 rounded-xl p-8 shadow-2xl">
        {/* Winner reveal button */}
        {replay.winnerTeam && !revealedWinner && (
          <div className="mb-6 text-center">
            <button
              onClick={handleRevealWinner}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-neutral-700/50 border border-neutral-600/40 text-neutral-300 hover:bg-neutral-600/50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Click to reveal winner
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          {/* Team 1 */}
          <div className="flex-1">
            <div className="text-sm text-neutral-400 mb-3 font-semibold uppercase tracking-wide flex items-center gap-2">
              Team 1
              {replay.winnerTeam === 1 && revealedWinner && (
                <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              )}
            </div>
            <div className={`rounded-lg p-4 transition-all ${
              replay.winnerTeam === 1 && revealedWinner
                ? 'bg-emerald-900/20 border-2 border-emerald-600/40 shadow-lg shadow-emerald-600/20'
                : replay.winnerTeam === 2 && revealedWinner
                ? 'bg-neutral-800/20 border border-red-900/30 opacity-75'
                : 'bg-neutral-800/40 border border-neutral-600/30'
            }`}>
              {team1Players.map((profile: EnrichedReplayProfile, idx: number) => (
                <div key={`t1-${idx}`} className="flex items-center justify-between gap-3 py-2 border-b border-neutral-700/30 last:border-0">
                  <PlayerTeam
                    profiles={[profile]}
                    team={1}
                    onPlayerClick={handlePlayerClick}
                    showDetails={true}
                    compact={false}
                    className="flex-1"
                  />
                  {profile.faction_rating && (
                    <span className="text-sm font-bold text-yellow-400 whitespace-nowrap">
                      {profile.faction_rating} ELO
                    </span>
                  )}
                </div>
              ))}
              {team1Players.length === 0 && (
                <div className="text-neutral-500 text-sm">No players</div>
              )}
            </div>
          </div>

          {/* Map image */}
          <div className="flex flex-col items-center justify-start px-4">
            {mapImagePath ? (
              <div className="w-32 h-32 lg:w-40 lg:h-40 rounded-lg overflow-hidden border-2 border-neutral-600/40 shadow-xl bg-neutral-900">
                <img
                  src={mapImagePath}
                  alt={`${mapDisplayName} mini-map`}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-32 h-32 lg:w-40 lg:h-40 rounded-lg border-2 border-neutral-600/40 bg-neutral-800/50 flex items-center justify-center">
                <span className="text-4xl text-neutral-600">?</span>
              </div>
            )}
            <div className="mt-3 text-center font-semibold text-neutral-200">
              {mapDisplayName}
            </div>
          </div>

          {/* Team 2 */}
          <div className="flex-1">
            <div className="text-sm text-neutral-400 mb-3 font-semibold uppercase tracking-wide flex items-center gap-2">
              Team 2
              {replay.winnerTeam === 2 && revealedWinner && (
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              )}
            </div>
            <div className={`rounded-lg p-4 transition-all ${
              replay.winnerTeam === 2 && revealedWinner
                ? 'bg-blue-900/20 border-2 border-blue-600/40 shadow-lg shadow-blue-600/20'
                : replay.winnerTeam === 1 && revealedWinner
                ? 'bg-neutral-800/20 border border-red-900/30 opacity-75'
                : 'bg-neutral-800/40 border border-neutral-600/30'
            }`}>
              {team2Players.map((profile: EnrichedReplayProfile, idx: number) => (
                <div key={`t2-${idx}`} className="flex items-center justify-between gap-3 py-2 border-b border-neutral-700/30 last:border-0">
                  <PlayerTeam
                    profiles={[profile]}
                    team={2}
                    onPlayerClick={handlePlayerClick}
                    showDetails={true}
                    compact={false}
                    className="flex-1"
                  />
                  {profile.faction_rating && (
                    <span className="text-sm font-bold text-yellow-400 whitespace-nowrap">
                      {profile.faction_rating} ELO
                    </span>
                  )}
                </div>
              ))}
              {team2Players.length === 0 && (
                <div className="text-neutral-500 text-sm">No players</div>
              )}
            </div>
          </div>
        </div>

        {/* Comment section */}
        {replay.submittedComment && (
          <div className="mt-8 pt-6 border-t border-neutral-700/40">
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">
              Uploader&apos;s Comment
            </h3>
            <p className="text-neutral-200 leading-relaxed">
              {replay.submittedComment}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
