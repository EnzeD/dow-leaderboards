import assert from "node:assert/strict";
import test from "node:test";

import { getPlayedMatchMembers } from "../relic-match-history.ts";

test("keeps only members with authoritative report results", () => {
  const players = [
    { profile_id: 10013806, outcome: 1, reporttype: 1 },
    { profile_id: 12639457, outcome: 0, reporttype: 3 },
    { profile_id: 12743665, outcome: 0, reporttype: 3 },
    { profile_id: 12425660, outcome: 1, reporttype: 1 },
  ];
  const observer = { profile_id: 11315558, outcome: 3, reporttype: 2 };

  const result = getPlayedMatchMembers({
    matchhistorymember: [...players, observer],
    matchhistoryreportresults: players.map(player => ({
      profile_id: player.profile_id,
    })),
  });

  assert.deepEqual(result, players);
});

test("falls back to explicit observer markers when reports are unavailable", () => {
  const player = { profile_id: "10013806", outcome: 1, reporttype: 1 };
  const observer = { profile_id: "11315558", outcome: 3, reporttype: 2 };

  assert.deepEqual(
    getPlayedMatchMembers({ matchhistorymember: [player, observer] }),
    [player],
  );
});
