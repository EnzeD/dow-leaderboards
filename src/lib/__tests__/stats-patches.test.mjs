import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Same dependency-free runner as the replay tests, with injected server adapters.
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const testModule = { exports: {} };
  const require = name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new Function('require', 'module', 'exports', outputText)(require, testModule, testModule.exports);
  return testModule.exports;
}

const patches = loadModule('../stats-patches.ts');
const replay = loadModule('../replay-game-version.ts');
const { buildStatsPatchPeriods, aggregateStatsOutcomes, aggregateStatsPickrates } = patches;
const now = Date.parse('2026-08-30T18:00:00Z');
const periods = buildStatsPatchPeriods(replay.KNOWN_GAME_PATCHES, new Date(now).toISOString(), now);

test('patch ranges exclude release days and stop before the next release', () => {
  const balance = periods.find(patch => patch.version === '2.8.0');
  assert.equal(balance.startDay, '2026-04-28');
  assert.equal(balance.endDay, '2026-06-23');
  assert.equal(periods.at(-1).startDay, '2026-08-26');
  assert.equal(periods.at(-1).endDay, '2026-08-30');
  for (let i = 1; i < periods.length; i++) {
    assert.ok(periods[i - 1].endDay <= periods[i].startDay);
  }
});

test('short patches and same-day releases return an empty period, not mixed data', () => {
  const short = periods.find(patch => patch.version === '2.3.0');
  assert.equal(short.startDay, short.endDay);
  const sameDay = buildStatsPatchPeriods([
    { version: '3.0.0', announcedAt: '2026-08-28T10:00:00Z' },
    { version: '3.0.1', announcedAt: '2026-08-28T20:00:00Z' },
  ], new Date(now).toISOString(), now);
  assert.equal(sameDay[0].startDay, sameDay[0].endDay);
  assert.equal(sameDay[1].startDay, '2026-08-29');
});

test('UTC-midnight releases can include the entire day; future announcements are ignored', () => {
  const result = buildStatsPatchPeriods([
    { version: '3.0.0', announcedAt: '2026-08-28T02:00:00+02:00' },
    { version: '3.1.0', announcedAt: '2026-09-10T12:00:00Z' },
  ], new Date(now).toISOString(), now);
  assert.equal(result.length, 1);
  assert.equal(result[0].startDay, '2026-08-28');
  assert.equal(result[0].endDay, '2026-08-30');
});

test('stale catalog never extrapolates the latest patch beyond verified history', () => {
  const stale = buildStatsPatchPeriods(replay.KNOWN_GAME_PATCHES, '2026-08-31T00:00:00Z', Date.parse('2027-01-01T00:00:00Z'));
  assert.equal(stale.at(-1).endDay, '2026-08-31');
});

test('aggregate counts before calculating win rate and keep matchup directions separate', () => {
  const result = aggregateStatsOutcomes([
    { match_day: '2026-08-26', my_race_id: 1, opponent_race_id: 2, matches: 10, wins: 9, losses: 1 },
    { match_day: '2026-08-27', my_race_id: 1, opponent_race_id: 2, matches: 90, wins: 9, losses: 81 },
    { match_day: '2026-08-26', my_race_id: 2, opponent_race_id: 1, matches: 10, wins: 1, losses: 9 },
  ], ['my_race_id', 'opponent_race_id']);
  assert.equal(result.length, 2);
  assert.equal(result[0].matches, 100);
  assert.equal(result[0].wins, 18);
  assert.equal(result[0].winrate, 0.18);
});

test('sum pick counts but count each daily match total once, including partial weeks', () => {
  const result = aggregateStatsPickrates([
    { match_day: '2026-08-26', race_id: 1, pick_count: 12, match_count: 10 },
    { match_day: '2026-08-26', race_id: 2, pick_count: 8, match_count: 10 },
    { match_day: '2026-08-27', race_id: 2, pick_count: 8, match_count: 4 },
    { match_day: '2026-08-31', race_id: 1, pick_count: 2, match_count: 1 },
  ]);
  assert.deepEqual(result, [
    { weekStart: '2026-08-24', totalMatches: 14, factionCounts: { 1: 12, 2: 16 } },
    { weekStart: '2026-08-31', totalMatches: 1, factionCounts: { 1: 2 } },
  ]);
  assert.deepEqual(aggregateStatsPickrates([]), []);
  assert.deepEqual(aggregateStatsOutcomes([], ['race_id']), []);
});

const jsonAdapter = { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) };

function serverFixture(data = {}, failPage = false) {
  const queries = [];
  const supabase = {
    from(table) {
      const filters = [];
      const order = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        gte(key, value) { filters.push(row => row[key] >= value); return query; },
        lt(key, value) { filters.push(row => row[key] < value); return query; },
        order(key) { order.push(key); return query; },
        async range(start, end) {
          queries.push({ table, start, end, order });
          if (failPage && start > 0) return { data: null, error: new Error('simulated page failure') };
          const rows = (data[table] ?? []).filter(row => filters.every(filter => filter(row)));
          rows.sort((a, b) => {
            for (const key of order) {
              if (a[key] < b[key]) return -1;
              if (a[key] > b[key]) return 1;
            }
            return 0;
          });
          return { data: rows.slice(start, end + 1), error: null };
        },
      };
      return query;
    },
  };
  const helpers = loadModule('../../app/api/stats/helpers.ts', {
    '@/lib/premium/subscription-server': { getSupabaseAdmin: () => supabase },
  });
  const server = loadModule('../../app/api/stats/patch-data.ts', {
    'next/cache': { unstable_cache: () => async () => { throw new Error('Offline fixture'); } },
    'next/server': { NextResponse: jsonAdapter },
    '@/lib/replay-game-version': replay,
    '@/lib/stats-patches': patches,
    './helpers': helpers,
  });
  return { ...server, helpers, queries };
}

const request = query => new Request(`https://example.test/api/stats/maps?${query}`);
const dailyMaps = Array.from({ length: 1101 }, (_, i) => ({
  match_day: '2026-04-29', rating_floor: 1200, map_identifier: `map-${String(i).padStart(4, '0')}`,
  map_name: `Map ${i}`, matches: 1, wins: 1, losses: 0,
}));

test('paginate all daily rows before sorting/limiting, applying patch and ELO filters', async () => {
  const fixture = serverFixture({ stats_daily_map_overview: [
    ...dailyMaps,
    { ...dailyMaps[0], match_day: '2026-04-27', matches: 9999 }, // release day
    { ...dailyMaps[0], match_day: '2026-06-23', matches: 9999 }, // next release
    { ...dailyMaps[0], rating_floor: 0, matches: 9999 },
    { ...dailyMaps[1100], match_day: '2026-04-30', matches: 99 },
  ] });
  const response = await fixture.getPatchStatsResponse(request('patch=2.8.0&minRating=1200&limit=5'), 'maps');
  assert.equal(response.status, 200);
  assert.equal(response.body.rows.length, 5);
  assert.equal(response.body.rows[0].mapIdentifier, 'map-1100');
  assert.equal(response.body.rows[0].matches, 100);
  assert.equal(response.body.ratingFloor, 1200);
  assert.equal(response.body.windowDays, null);
  assert.deepEqual(fixture.queries.map(query => query.start), [0, 500, 1000]);
  assert.deepEqual(fixture.queries[0].order, ['match_day', 'map_identifier']);
});

test('a later-page failure returns an error, never partial patch statistics', async () => {
  const fixture = serverFixture({ stats_daily_map_overview: dailyMaps }, true);
  const response = await fixture.getPatchStatsResponse(request('patch=2.8.0&minRating=1200'), 'maps');
  assert.equal(response.status, 500);
  assert.equal(response.body.reason, 'patch_query_failed');
});

test('all patches bypasses the new query path and unknown versions are rejected', async () => {
  const fixture = serverFixture();
  assert.equal(await fixture.getPatchStatsResponse(request(''), 'maps'), null);
  assert.equal(await fixture.getPatchStatsResponse(request('patch=all'), 'maps'), null);
  assert.equal((await fixture.getPatchStatsResponse(request('patch=garbage'), 'maps')).status, 400);
  assert.equal((await fixture.getPatchStatsResponse(request('patch=99.0.0'), 'maps')).status, 400);
  assert.equal(fixture.queries.length, 0);
});

test('every Stats route uses the same patch range, including both map drill-downs', async () => {
  const row = {
    match_day: '2026-04-29', rating_floor: 1400, map_identifier: 'map-1', map_name: 'Map 1',
    race_id: 1, my_race_id: 1, opponent_race_id: 2, matches: 3, wins: 2, losses: 1,
    pick_count: 6, match_count: 3,
  };
  const entries = [
    ['summary', 'summary/route.ts', 'stats_daily_summary'],
    ['maps', 'maps/route.ts', 'stats_daily_map_overview'],
    ['races', 'races/route.ts', 'stats_daily_race_pickrate'],
    ['matchups', 'matchups/route.ts', 'stats_daily_matchup_matrix'],
    ['mapRaces', 'maps/[id]/route.ts', 'stats_daily_map_race_breakdown'],
    ['mapMatchups', 'maps/[id]/race/[raceId]/route.ts', 'stats_daily_map_race_matchups'],
  ];
  for (const [kind, path, table] of entries) {
    const fixture = serverFixture({ [table]: [
      row,
      { ...row, match_day: '2026-04-27', matches: 999 },
      { ...row, rating_floor: 0, matches: 999 },
      ...(kind.startsWith('map') && kind !== 'maps' ? [{ ...row, map_identifier: 'other-map', matches: 999 }] : []),
      ...(kind === 'mapMatchups' ? [{ ...row, my_race_id: 3, matches: 999 }] : []),
    ] });
    const route = loadModule(`../../app/api/stats/${path}`, {
      'next/server': { NextResponse: jsonAdapter },
      '@/app/api/stats/patch-data': fixture,
      '@/app/api/stats/helpers': fixture.helpers,
    });
    const response = await route.GET(request('patch=2.8.0&minRating=1400&windowDays=30&weeks=6'), {
      params: { id: 'map-1', raceId: '1' },
    });
    assert.equal(response.status, 200, kind);
    assert.equal(response.body.patch.startDay, '2026-04-28', kind);
    assert.equal(response.body.ratingFloor, 1400, kind);
    const count = kind === 'summary' ? response.body.totalMatches
      : kind === 'races' ? response.body.rows[0].totalMatches : response.body.rows[0].matches;
    assert.equal(count, 3, kind);
  }
});

test('a patch without complete UTC days returns no matches without reading rollups', async () => {
  const fixture = serverFixture();
  const response = await fixture.getPatchStatsResponse(request('patch=2.3.0'), 'summary');
  assert.equal(response.body.totalMatches, 0);
  assert.equal(fixture.queries.length, 0);
});

test('Stats discovers new releases through a separate hourly cache without altering replay checks', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const yesterday = Math.floor(Date.now() / 1000) - 86_400;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, replay.STEAM_NEWS_URL);
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ appnews: { appid: 3556750, newsitems: [
      { title: '2.11.0 Update Patch Notes', date: yesterday, feedname: 'steam_community_announcements' },
      { title: '2.12.0 Update Coming Soon', date: yesterday, feedname: 'steam_community_announcements' },
    ] } }));
  };
  try {
    const server = loadModule('../../app/api/stats/patch-data.ts', {
      'next/cache': { unstable_cache: (fn, _keys, options) => {
        assert.equal(options.revalidate, 3600);
        let result;
        return () => result ??= fn();
      } },
      'next/server': { NextResponse: jsonAdapter },
      '@/lib/replay-game-version': replay,
      '@/lib/stats-patches': patches,
      './helpers': {},
    });
    const catalog = await server.getStatsPatchCatalog();
    assert.equal(catalog.stale, false);
    assert.ok(catalog.patches.some(patch => patch.version === '2.11.0'));
    assert.ok(catalog.patches.some(patch => patch.version === '2.0.0'));
    assert.ok(!catalog.patches.some(patch => patch.version === '2.12.0'));
    await server.getStatsPatchCatalog();
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
