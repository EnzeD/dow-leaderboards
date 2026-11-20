import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

function installFixtureFetch() {
  const writes = [];
  const repair = process.env.XP_REFRESH_REPAIR_PROFILE_ID === "123";
  const profile = { profile_id: "123", steam_id64: "123", xp: repair ? 120 : 70 };
  let playersTimeout = repair;

  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === "https://dow-api.reliclink.com") {
      if (url.pathname.endsWith("/getPersonalStat")) {
        return Response.json({ statGroups: [{ id: 1, members: [{ xp: 120 }] }] });
      }
      if (url.pathname.endsWith("/getRecentMatchHistoryByProfileId")) {
        return Response.json({ matchHistoryStats: [{
          id: 987,
          matchtype_id: 1,
          matchhistorymember: [{ profile_id: "123", race_id: 1 }],
        }] });
      }
      throw new Error("Unexpected fixture Relic request");
    }
    if (url.origin !== "http://supabase.test") throw new Error("Unexpected fixture HTTP origin");

    const table = url.pathname.replace("/rest/v1/", "");
    if (init?.method === "POST") {
      const rows = JSON.parse(init.body);
      if (table === "players") {
        if (rows[0].xp !== undefined) {
          writes.push("xp");
        } else if (playersTimeout) {
          playersTimeout = false;
          writes.push("players-timeout");
          return Response.json({ code: "57014", message: "canceling statement due to statement timeout" }, { status: 500 });
        } else {
          writes.push("match-players");
        }
      } else {
        writes.push(table);
      }
      if (table === "match_participants" && !repair) {
        return Response.json({ code: "42501", message: "permission denied" }, { status: 403 });
      }
      return new Response(null, { status: 201 });
    }

    if (table === "races") return Response.json([{ id: 1 }]);
    if (table === "matches") return Response.json([]);
    if (table === "players") {
      if (url.searchParams.get("select") === "profile_id") {
        return Response.json([{ profile_id: "123" }], { headers: { "Content-Range": "0-0/1" } });
      }
      return Response.json(url.searchParams.get("offset") === "1" ? [] : [profile]);
    }
    throw new Error("Unexpected fixture database request");
  };

  process.on("exit", () => console.log("Fixture writes " + JSON.stringify(writes)));
}

function runFixture(repair) {
  const script = fileURLToPath(new URL("../crawl-player-xp-refresh.mjs", import.meta.url));
  const hook = "data:text/javascript," + encodeURIComponent(`(${installFixtureFetch.toString()})();`);
  const result = spawnSync(process.execPath, ["--import", hook, script], {
    env: {
      ...process.env,
      SUPABASE_URL: "http://supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "fixture",
      XP_REFRESH_RELIC_DELAY_MS: "1",
      XP_REFRESH_BATCH_SIZE: "1",
      XP_REFRESH_CONCURRENCY: "1",
      XP_REFRESH_REPAIR_PROFILE_ID: repair ? "123" : "",
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const trace = result.stdout.match(/^Fixture writes (.+)$/m);
  assert.ok(trace, result.stdout);
  return { writes: JSON.parse(trace[1]), output: result.stdout };
}

test("repair refreshes unchanged XP, retries a statement timeout, and saves XP last", () => {
  const { writes, output } = runFixture(true);
  assert.deepEqual(writes, ["players-timeout", "match-players", "matches", "match_participants", "xp"]);
  assert.match(output, /Processed 1 players\./);
  assert.match(output, /Failed operations: 0\./);
});

test("normal refresh preserves old XP when writing match history fails", () => {
  const { writes, output } = runFixture(false);
  assert.deepEqual(writes, ["match-players", "matches", "match_participants"]);
  assert.match(output, /Failed operations: 1\./);
});
