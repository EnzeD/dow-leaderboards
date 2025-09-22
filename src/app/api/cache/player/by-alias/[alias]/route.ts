// Cached player payload by exact alias, built on first request.
import { NextRequest } from "next/server";

type RecentMatch = {
  matchId: number;
  mapName?: string;
  matchTypeId?: number;
  startTime?: number;
  endTime?: number;
  durationSec?: number;
  outcome?: 'Win' | 'Loss' | 'Unknown';
  oldRating?: number;
  newRating?: number;
  ratingDiff?: number;
  teamId?: number;
  raceId?: number;
  players?: Array<{ profileId: string; alias?: string; teamId?: number; raceId?: number; oldRating?: number; newRating?: number }>;
};

type PlayerPayload = {
  alias: string;
  playerName?: string;
  profileId?: string;
  steamId?: string;
  personalStats?: {
    profile?: {
      alias?: string;
      country?: string;
      level?: number;
      xp?: number;
      statgroupId?: number;
    };
    leaderboardStats?: Array<{
      leaderboardId: number;
      wins: number; losses: number; streak: number;
      rating: number; rank: number;
      lastmatchdate?: number;
      highestrank?: number; highestrating?: number;
      ranktotal?: number; regionrank?: number; regionranktotal?: number;
    }>;
  };
  recentMatches?: RecentMatch[];
  lastUpdated?: string;
};

function parseSteamIdFromProfileName(name?: string): string | undefined {
  if (!name) return undefined;
  const m = name.match(/\/steam\/(\d{17})/);
  return m?.[1];
}

async function findExactAlias(alias: string): Promise<{ profileId?: string; steamId?: string } | null> {
  const aliasesParam = encodeURIComponent(JSON.stringify([alias]));
  const url = `https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data: any = await res.json();

  // Gather objects that carry both profile_id and alias
  const candidates: Array<{ profile_id?: number | string; alias?: string; name?: string }> = [];
  for (const v of Object.values<any>(data || {})) {
    if (Array.isArray(v)) {
      for (const el of v) {
        if (el && typeof el === 'object' && ('profile_id' in el) && ('alias' in el)) {
          candidates.push({ profile_id: (el as any).profile_id, alias: (el as any).alias, name: (el as any).name });
        }
      }
    }
  }
  const exact = candidates.filter(c => (c.alias ?? '').trim() === alias.trim());
  if (exact.length) {
    const pid = String(exact[0].profile_id ?? '');
    return { profileId: pid, steamId: parseSteamIdFromProfileName(exact[0].name) };
  }

  // Fallback: profile_id+name mapping and alias-only mapping
  const idToName = new Map<string, string | undefined>();
  const aliasOnly: Array<{ profile_id?: number | string; alias?: string }> = [];
  for (const v of Object.values<any>(data || {})) {
    if (Array.isArray(v)) {
      for (const el of v) {
        if (el && typeof el === 'object' && ('profile_id' in el) && ('name' in el)) {
          idToName.set(String((el as any).profile_id), (el as any).name);
        }
        if (el && typeof el === 'object' && ('alias' in el)) {
          aliasOnly.push({ profile_id: (el as any).profile_id, alias: (el as any).alias });
        }
      }
    }
  }
  for (const a of aliasOnly) {
    if ((a.alias ?? '').trim() === alias.trim()) {
      const pid = String(a.profile_id ?? '');
      if (pid) return { profileId: pid, steamId: parseSteamIdFromProfileName(idToName.get(pid)) };
    }
  }
  return null;
}

async function fetchPersonalStats(steamId: string) {
  const profileName = encodeURIComponent(JSON.stringify([`/steam/${steamId}`]));
  const url = `https://dow-api.reliclink.com/community/leaderboard/getPersonalStat?&title=dow1-de&profile_names=${profileName}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return {};
  const data: any = await res.json();
  const group = Array.isArray(data?.statGroups) ? data.statGroups[0] : undefined;
  const member = Array.isArray(group?.members) ? group.members[0] : undefined;
  const profile = member ? {
    alias: member.alias,
    country: member.country,
    level: Number(member.level ?? 0) || undefined,
    xp: Number(member.xp ?? 0) || undefined,
    statgroupId: Number(group?.id ?? member?.personal_statgroup_id ?? 0) || undefined
  } : undefined;
  const lbStatsRaw: any[] = Array.isArray(data?.leaderboardStats) ? data.leaderboardStats : [];
  const leaderboardStats = lbStatsRaw.map(s => ({
    leaderboardId: Number(s.leaderboard_id ?? 0) || 0,
    wins: Number(s.wins ?? 0),
    losses: Number(s.losses ?? 0),
    streak: Number(s.streak ?? 0),
    rating: Number(s.rating ?? 0),
    rank: Number(s.rank ?? -1),
    lastmatchdate: typeof s.lastmatchdate === 'number' ? s.lastmatchdate : undefined,
    highestrank: Number(s.highestrank ?? 0) || undefined,
    highestrating: Number(s.highestrating ?? 0) || undefined,
    ranktotal: Number(s.ranktotal ?? 0) || undefined,
    regionrank: Number(s.regionrank ?? 0) || undefined,
    regionranktotal: Number(s.regionranktotal ?? 0) || undefined,
  }));
  return { profile, leaderboardStats };
}

async function fetchRecentMatches(alias: string, profileId: string, count: number = 10): Promise<RecentMatch[]> {
  const aliasesParam = encodeURIComponent(JSON.stringify([alias]));
  const url = `https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}&count=${count}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const data: any = await res.json();

  // alias map
  const aliasMap = new Map<string, string | undefined>();
  for (const v of Object.values<any>(data || {})) {
    if (Array.isArray(v)) {
      for (const el of v) {
        if (el && typeof el === 'object' && 'profile_id' in el && 'alias' in el) {
          aliasMap.set(String((el as any).profile_id), (el as any).alias);
        }
      }
    }
  }

  const stats: any[] = Array.isArray(data?.matchHistoryStats) ? data.matchHistoryStats : [];
  const matches: RecentMatch[] = [];
  for (const m of stats) {
    const members: any[] = Array.isArray(m?.matchhistorymember) ? m.matchhistorymember : [];
    const me = members.find((mm: any) => String(mm?.profile_id ?? '') === profileId);
    const oldRating = typeof me?.oldrating === 'number' ? me.oldrating : undefined;
    const newRating = typeof me?.newrating === 'number' ? me.newrating : undefined;
    const ratingDiff = (typeof oldRating === 'number' && typeof newRating === 'number') ? (newRating - oldRating) : undefined;
    const outcome: 'Win' | 'Loss' | 'Unknown' = me?.outcome === 1 ? 'Win' : (me?.outcome === 0 ? 'Loss' : 'Unknown');
    const players = members.map((p: any) => {
      const raceIdNum = Number(p?.race_id);
      const teamId = typeof p?.teamid === 'number' ? p.teamid : undefined;
      const oldRatingVal = typeof p?.oldrating === 'number' ? p.oldrating : undefined;
      const newRatingVal = typeof p?.newrating === 'number' ? p.newrating : undefined;
      const profileIdRaw = String(p?.profile_id ?? '');
      const alias = aliasMap.get(profileIdRaw) ?? (typeof p?.alias === 'string' ? p.alias : undefined);
      return {
        profileId: profileIdRaw,
        alias,
        teamId,
        raceId: Number.isFinite(raceIdNum) && raceIdNum >= 0 && typeof teamId === 'number' && teamId >= 0 ? raceIdNum : undefined,
        oldRating: oldRatingVal,
        newRating: newRatingVal,
      };
    }).filter(p => typeof p.teamId === 'number' && p.teamId >= 0);
    const meRaceIdNum = Number(me?.race_id);
    matches.push({
      matchId: Number(m?.id ?? 0) || 0,
      mapName: m?.mapname,
      matchTypeId: typeof m?.matchtype_id === 'number' ? m.matchtype_id : undefined,
      startTime: typeof m?.startgametime === 'number' ? m.startgametime : undefined,
      endTime: typeof m?.completiontime === 'number' ? m.completiontime : undefined,
      durationSec: (typeof m?.completiontime === 'number' && typeof m?.startgametime === 'number') ? (m.completiontime - m.startgametime) : undefined,
      outcome,
      oldRating,
      newRating,
      ratingDiff,
      teamId: typeof me?.teamid === 'number' ? me.teamid : undefined,
      raceId: Number.isFinite(meRaceIdNum) && meRaceIdNum >= 0 ? meRaceIdNum : undefined,
      players,
    });
  }
  return matches;
}

export async function GET(_req: NextRequest, ctx: { params: { alias: string } }) {
  const alias = decodeURIComponent(ctx.params?.alias ?? '').trim();
  if (!alias) return Response.json({ error: 'alias_required' }, { status: 400 });

  try {
    const ident = await findExactAlias(alias);
    if (!ident?.profileId) {
      const timestamp = new Date().toISOString();
      return Response.json({ results: [], lastUpdated: timestamp }, { headers: { 'Cache-Control': 'public, s-maxage=30' } });
    }

    // personal stats via steam id (if available)
    const personalStats = ident.steamId ? await fetchPersonalStats(ident.steamId) : undefined;
    const recentMatches = await fetchRecentMatches(alias, ident.profileId, 10);

    const timestamp = new Date().toISOString();
    const payload: PlayerPayload = {
      alias,
      playerName: personalStats?.profile?.alias || alias,
      profileId: ident.profileId,
      steamId: ident.steamId,
      personalStats,
      recentMatches,
      lastUpdated: timestamp,
    };

    return Response.json({ results: [payload], lastUpdated: timestamp }, { headers: { 'Cache-Control': 'public, s-maxage=30' } });
  } catch (e) {
    console.error('cache/player/by-alias failed:', e);
    const timestamp = new Date().toISOString();
    return Response.json({ results: [], lastUpdated: timestamp }, { status: 502, headers: { 'Cache-Control': 'public, s-maxage=30' } });
  }
}
