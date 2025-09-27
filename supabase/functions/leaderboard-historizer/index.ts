import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LEADERBOARD_BASE_URL"
] as const;

type RequiredEnv = typeof requiredEnv[number];

type SnapshotEntry = {
  captureKey: string;
  payload: any;
  playerCount: number | null;
};

function getEnv(name: RequiredEnv) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function normalizeBaseUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const LEADERBOARD_BASE_URL = normalizeBaseUrl(getEnv("LEADERBOARD_BASE_URL"));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

const combinedKey = "combined-1v1";
const combinedMultiKey = "combined-1v1-multi";
const combinedLeaderboardId = 0;
const combinedMultiLeaderboardId = -1;

const makeLeaderboardKey = (id: number) => `leaderboard:${id}`;

async function fetchJson(path: string, label: string, { allow404 = false }: { allow404?: boolean } = {}) {
  const url = new URL(path, LEADERBOARD_BASE_URL);
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "supabase-edge-historizer"
    }
  });
  if (!res.ok) {
    if (allow404 && res.status === 404) {
      console.warn(`${label} returned 404, skipping`);
      return null;
    }
    throw new Error(`Fetch ${label} failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function fetchLeaderboards() {
  const data = await fetchJson("/api/leaderboards", "leaderboard list");
  return data.items ?? [];
}

async function fetchLeaderboardSnapshot(id: number) {
  return fetchJson(`/api/cache/leaderboard/${id}`, `leaderboard:${id}`);
}

async function fetchCombinedSnapshot() {
  return fetchJson("/api/cache/combined-1v1/1000", combinedKey);
}

async function fetchCombinedMultiSnapshot() {
  return fetchJson("/api/cache/combined-1v1-multi/1000", combinedMultiKey, { allow404: true });
}

function getRowCount(payload: any) {
  if (Array.isArray(payload?.rows)) return payload.rows.length;
  if (Array.isArray(payload?.players)) return payload.players.length;
  if (typeof payload?.playerCount === "number") return payload.playerCount;
  return null;
}

function toSnapshotEntry(captureKey: string, payload: any): SnapshotEntry {
  return {
    captureKey,
    payload,
    playerCount: getRowCount(payload)
  };
}

Deno.serve(async () => {
  try {
    const [list, combinedResults] = await Promise.all([
      fetchLeaderboards(),
      Promise.allSettled([
        fetchCombinedSnapshot(),
        fetchCombinedMultiSnapshot()
      ])
    ]);

    const [combinedBestResult, combinedMultiResult] = combinedResults;
    const combinedSnapshots: SnapshotEntry[] = [];
    let combinedFailures = 0;

    if (combinedBestResult.status === "fulfilled") {
      combinedSnapshots.push(toSnapshotEntry(combinedKey, combinedBestResult.value));
    } else {
      combinedFailures += 1;
      console.error("Combined 1v1 (best) fetch failed", combinedBestResult.reason);
    }

    if (combinedMultiResult.status === "fulfilled") {
      if (combinedMultiResult.value) {
        combinedSnapshots.push(toSnapshotEntry(combinedMultiKey, combinedMultiResult.value));
      } else {
        console.warn("Combined 1v1 multi snapshot unavailable (route missing or empty)");
      }
    } else {
      combinedFailures += 1;
      console.error("Combined 1v1 multi fetch failed", combinedMultiResult.reason);
    }

    const leaderboardIds = list
      .map((item: any) => Number(item.id))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    const snapshots = await Promise.allSettled(
      leaderboardIds.map(async (id) => {
        const payload = await fetchLeaderboardSnapshot(id);
        return {
          captureKey: makeLeaderboardKey(id),
          payload,
          playerCount: getRowCount(payload)
        } satisfies SnapshotEntry;
      })
    );

    const successful = snapshots.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );

    const leaderboardFailures = snapshots
      .map((result, index) =>
        result.status === "rejected"
          ? { id: leaderboardIds[index], error: result.reason }
          : null
      )
      .filter(Boolean);

    if (leaderboardFailures.length) {
      console.error("Some leaderboards failed", leaderboardFailures);
    }

    successful.push(...combinedSnapshots);

    if (successful.length === 0) {
      throw new Error("No snapshots captured");
    }

    const now = new Date().toISOString();

    const { data: inserted, error } = await supabase
      .from("leaderboard_history")
      .insert(
        successful.map((item) => ({
          mode: item.captureKey,
          payload: item.payload,
          player_count: item.playerCount,
          captured_at: now
        }))
      )
      .select("id, mode");

    if (error) throw error;

    const specialLeaderboardIds = new Map<string, number>([
      [combinedKey, combinedLeaderboardId],
      [combinedMultiKey, combinedMultiLeaderboardId]
    ]);

    const rankRows = inserted.flatMap(({ id, mode }, index) => {
      const source = successful[index];
      const leaderboardId = mode.startsWith("leaderboard:")
        ? Number(mode.split(":")[1])
        : specialLeaderboardIds.get(mode) ?? null;

      if (leaderboardId === null) return [];

      const rows = Array.isArray(source?.payload?.rows) ? source.payload.rows : [];
      return rows
        .filter((row: any) => row?.profileId && typeof row.rank === "number")
        .map((row: any) => ({
          snapshot_id: id,
          leaderboard_id: leaderboardId,
          profile_id: String(row.profileId),
          rank: row.rank,
          rating: typeof row.rating === "number" ? row.rating : null,
          captured_at: now
        }));
    });

    if (rankRows.length) {
      const { error: rankError } = await supabase
        .from("leaderboard_rank_history")
        .insert(rankRows, { count: "exact" });
      if (rankError) throw rankError;
    }

    return new Response(
      JSON.stringify(
        {
          status: "ok",
          inserted: successful.length,
          leaderboardErrors: leaderboardFailures.length,
          combinedErrors: combinedFailures
        },
        null,
        2
      ),
      {
        headers: {
          "content-type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("Historize failed", err);
    return new Response(
      JSON.stringify(
        {
          status: "error",
          message: err instanceof Error ? err.message : String(err)
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }
});
