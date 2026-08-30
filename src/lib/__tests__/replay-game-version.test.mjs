import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Use the existing TypeScript dependency; no additional test runner or TS loader.
const source = readFileSync(new URL('../replay-game-version.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { KNOWN_GAME_PATCHES, resolveReplayGameVersion, selectSteamReplayVersion, checkReplayGameVersion } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const uploadedAt = '2026-08-30T16:45:27Z';
const announcement = (title, date, extra = {}) => ({
  title, date: Date.parse(date) / 1000, feedname: 'steam_community_announcements', ...extra,
});
const payload = (newsitems) => ({ appnews: { appid: 3556750, newsitems } });
const currentNews = payload([announcement('2.10.2 Hot Fix', '2026-08-25T16:44:52Z')]);

test('historical versions switch at every official UTC timestamp, not midnight', () => {
  assert.equal(KNOWN_GAME_PATCHES.length, 22);
  for (const [i, patch] of KNOWN_GAME_PATCHES.entries()) {
    const justBefore = new Date(Date.parse(patch.announcedAt) - 1).toISOString();
    for (const range of ['2.0.0 - 2.4.0', '2.0.0 - 2.5.0']) {
      assert.equal(resolveReplayGameVersion(range, patch.announcedAt), patch.version);
      assert.equal(resolveReplayGameVersion(range, justBefore), KNOWN_GAME_PATCHES[i - 1]?.version ?? null);
    }
  }
});

test('existing replays use upload time, including timezone offsets', () => {
  assert.equal(resolveReplayGameVersion('2.0.0 - 2.4.0', '2025-09-29T15:52:18Z'), '2.2.1');
  assert.equal(resolveReplayGameVersion('2.0.0 - 2.5.0', '2026-08-24T16:48:00Z'), '2.10.1');
  assert.equal(resolveReplayGameVersion('2.0.0 - 2.5.0', '2026-08-25T18:44:52+02:00'), '2.10.2');
});

test('preserve saved live versions and leave failed live checks unknown', () => {
  assert.equal(resolveReplayGameVersion(' 2.11.0 ', '2026-09-15T00:00:00Z'), '2.11.0');
  for (const value of [null, undefined, 10, '', 'No data available', '2.10.2 beta']) {
    assert.equal(resolveReplayGameVersion(value, uploadedAt), null);
  }
});

test('do not extrapolate the historical catalogue or use missing dates', () => {
  for (const date of [null, undefined, '', 'invalid', '2025-08-01T00:00:00Z', '2026-08-31T00:00:00Z']) {
    assert.equal(resolveReplayGameVersion('2.0.0 - 2.5.0', date), null);
  }
});

test('recognize both historical hotfix title forms and patch notes', () => {
  for (const [title, expected] of [
    ['Hot Fix 2.0.1', '2.0.1'],
    ['2.10.2 Hot Fix', '2.10.2'],
    ['2.10.2 Hotfix Patch Notes', '2.10.2'],
    ['2.10.0 Update Patch Notes', '2.10.0'],
  ]) {
    assert.equal(selectSteamReplayVersion(payload([announcement(title, uploadedAt)]), uploadedAt), expected);
  }
});

test('choose the latest publication before the upload, independently of feed order', () => {
  const news = payload([
    announcement('2.10.1 Hot Fix', '2026-08-13T16:42:34Z'),
    announcement('2.11.0 Update Patch Notes', '2026-09-01T17:00:00Z'),
    announcement('2.10.2 Hot Fix', '2026-08-25T16:44:52Z'),
    announcement('2.9.2 Hot Fix', '2026-07-07T18:35:48Z'),
  ]);
  assert.equal(selectSteamReplayVersion(news, uploadedAt), '2.10.2');
  assert.equal(selectSteamReplayVersion(news, '2026-08-25T16:44:51Z'), '2.10.1');
  assert.equal(selectSteamReplayVersion(news, '2026-09-01T17:00:00Z'), '2.11.0');
});

test('ignore previews, beta titles, unofficial feeds and version mentions in prose', () => {
  const news = payload([
    ...currentNews.appnews.newsitems,
    ...['2.11.0 Preview', '2.11.0 Update Coming Soon', '2.11.0 Update Patch Notes (Beta)', 'Anniversary'].map(title =>
      announcement(title, uploadedAt, { contents: 'The next patch will be 2.11.0' })),
    announcement('2.11.0 Update Patch Notes', uploadedAt, { feedname: 'external_news' }),
  ]);
  assert.equal(selectSteamReplayVersion(news, uploadedAt), '2.10.2');
});

test('reject malformed Steam payloads, dates and wrong app IDs', () => {
  for (const news of [null, {}, { appnews: [] }, { appnews: { appid: 1, newsitems: currentNews.appnews.newsitems } },
    payload([]), payload([null, {}, announcement('2.10.2 Hot Fix', uploadedAt, { date: '1787685892' })]),
    payload([announcement('2.10.2 Hot Fix', uploadedAt, { date: Infinity })]),
  ]) {
    assert.equal(selectSteamReplayVersion(news, uploadedAt), null);
  }
  assert.equal(selectSteamReplayVersion(currentNews, 'invalid'), null);
});

test('perform exactly one uncached Steam request per upload', async () => {
  let requests = 0;
  const fetchMock = async (url, options) => {
    requests++;
    const parsedUrl = new URL(url);
    assert.equal(parsedUrl.origin, 'https://api.steampowered.com');
    assert.equal(parsedUrl.searchParams.get('appid'), '3556750');
    assert.equal(parsedUrl.searchParams.get('feeds'), 'steam_community_announcements');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify(currentNews));
  };
  assert.equal(await checkReplayGameVersion(uploadedAt, fetchMock), '2.10.2');
  assert.equal(await checkReplayGameVersion(uploadedAt, fetchMock), '2.10.2');
  assert.equal(requests, 2);
});

test('HTTP, JSON, network and unrecognized-feed failures return null, not an upload error', async () => {
  for (const fetchMock of [
    async () => new Response('unavailable', { status: 503 }),
    async () => new Response('invalid json'),
    async () => { throw new Error('network unavailable'); },
    async () => new Response(JSON.stringify(payload([]))),
  ]) {
    assert.equal(await checkReplayGameVersion(uploadedAt, fetchMock), null);
  }
});

test('the two-second abort also bounds response-body reading', async () => {
  let aborted = false;
  const fetchMock = async (_url, { signal }) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      // Simulate a network socket keeping the event loop alive until cancellation.
      const socket = setTimeout(() => reject(new Error('deadline not applied')), 5000);
      signal.addEventListener('abort', () => {
        aborted = true;
        clearTimeout(socket);
        reject(signal.reason);
      }, { once: true });
    }),
  });
  assert.equal(await checkReplayGameVersion(uploadedAt, fetchMock), null);
  assert.equal(aborted, true);
});
