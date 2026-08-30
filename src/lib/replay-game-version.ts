// Release-announcement timestamps from the official Steam feed, checked 2026-08-30:
// https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=3556750&count=100&feeds=steam_community_announcements
// These are upload-date inferences, not versions extracted from the replay bytes.
export const KNOWN_GAME_PATCHES = [
  { version: '2.0.0', announcedAt: '2025-08-14T16:57:29Z' }, // Launch baseline
  { version: '2.0.1', announcedAt: '2025-08-19T17:07:08Z' },
  { version: '2.1.0', announcedAt: '2025-08-27T17:08:55Z' },
  { version: '2.1.1', announcedAt: '2025-08-28T19:55:07Z' },
  { version: '2.2.0', announcedAt: '2025-09-10T17:09:51Z' },
  { version: '2.2.1', announcedAt: '2025-09-16T17:06:42Z' },
  { version: '2.3.0', announcedAt: '2025-10-02T20:03:37Z' },
  { version: '2.3.1', announcedAt: '2025-10-03T20:11:04Z' },
  { version: '2.4.0', announcedAt: '2025-10-21T17:09:23Z' },
  { version: '2.5.0', announcedAt: '2025-11-20T18:03:44Z' },
  { version: '2.5.1', announcedAt: '2025-11-25T17:46:28Z' },
  { version: '2.6.0', announcedAt: '2025-12-16T18:04:01Z' },
  { version: '2.6.1', announcedAt: '2025-12-18T18:08:54Z' },
  { version: '2.7.0', announcedAt: '2026-02-17T17:46:37Z' },
  { version: '2.7.1', announcedAt: '2026-03-11T16:36:40Z' },
  { version: '2.8.0', announcedAt: '2026-04-27T17:02:44Z' },
  { version: '2.9.0', announcedAt: '2026-06-23T17:07:57Z' },
  { version: '2.9.1', announcedAt: '2026-06-25T16:53:10Z' },
  { version: '2.9.2', announcedAt: '2026-07-07T18:35:48Z' },
  { version: '2.10.0', announcedAt: '2026-08-11T16:46:04Z' },
  { version: '2.10.1', announcedAt: '2026-08-13T16:42:34Z' },
  { version: '2.10.2', announcedAt: '2026-08-25T16:44:52Z' },
] as const;

export const GAME_PATCH_HISTORY_VERIFIED_THROUGH = '2026-08-31T00:00:00Z';
const HISTORICAL_CUTOFF = Date.parse(GAME_PATCH_HISTORY_VERIFIED_THROUGH);
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const LEGACY_VERSION_RANGE = /^2\.0\.0\s*-\s*2\.[45]\.0$/;
const STEAM_APP_ID = 3556750;
const STEAM_FEED = 'steam_community_announcements';
export const STEAM_NEWS_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP_ID}&feeds=${STEAM_FEED}&count=100&maxlength=1`;
const STEAM_TIMEOUT_MS = 2000;

/** Keep saved upload checks; resolve only the old parser's hard-coded ranges. */
export function resolveReplayGameVersion(storedVersion: unknown, createdAt: unknown): string | null {
  if (typeof storedVersion !== 'string') return null;
  const version = storedVersion.trim();
  if (EXACT_VERSION.test(version)) return version;
  if (!LEGACY_VERSION_RANGE.test(version) || typeof createdAt !== 'string') return null;

  const uploadedAt = Date.parse(createdAt);
  // The bundled history is only verified through this date. Never turn a failed
  // live check (null) into an old version, or extrapolate history to future uploads.
  if (!Number.isFinite(uploadedAt) || uploadedAt >= HISTORICAL_CUTOFF) return null;

  let result: string | null = null;
  for (const patch of KNOWN_GAME_PATCHES) {
    if (Date.parse(patch.announcedAt) <= uploadedAt) result = patch.version;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Match release titles, not previews, beta announcements or versions in prose. */
export function parseSteamGamePatches(payload: unknown): Array<{ version: string; announcedAt: string }> {
  if (!isRecord(payload)) return [];
  const news = payload.appnews;
  if (!isRecord(news) || news.appid !== STEAM_APP_ID || !Array.isArray(news.newsitems)) return [];

  const patches = [];
  for (const item of news.newsitems) {
    if (!isRecord(item) || item.feedname !== STEAM_FEED || typeof item.title !== 'string') continue;
    if (typeof item.date !== 'number' || !Number.isFinite(item.date) || item.date <= 0) continue;
    const announcedAt = item.date * 1000;
    if (!Number.isFinite(new Date(announcedAt).getTime())) continue;

    const match = item.title.trim().match(/^(?:(\d+\.\d+\.\d+)\s+(?:Hot\s*Fix(?:\s+Patch Notes)?|Update(?:\s+Patch Notes)?)|Hot\s*Fix\s+(\d+\.\d+\.\d+))$/i);
    if (!match) continue;
    patches.push({ version: match[1] || match[2], announcedAt: new Date(announcedAt).toISOString() });
  }
  return patches.sort((a, b) => Date.parse(a.announcedAt) - Date.parse(b.announcedAt));
}

export function selectSteamReplayVersion(payload: unknown, createdAt: string): string | null {
  const uploadedAt = Date.parse(createdAt);
  if (!Number.isFinite(uploadedAt)) return null;
  const patches = parseSteamGamePatches(payload).filter(patch => Date.parse(patch.announcedAt) <= uploadedAt);
  return patches[patches.length - 1]?.version ?? null;
}

/** One uncached, time-bounded check per upload; failure must not reject the file. */
export async function checkReplayGameVersion(
  createdAt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(STEAM_NEWS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(STEAM_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`steam_news_http_${response.status}`);
    const version = selectSteamReplayVersion(await response.json(), createdAt);
    if (!version) console.warn('Replay version check: no matching Steam release announcement');
    return version;
  } catch {
    console.warn('Replay version check unavailable; continuing upload without a version');
    return null;
  }
}
