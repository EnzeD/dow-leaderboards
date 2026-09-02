type RelicMatchMember = {
  profile_id?: unknown;
  outcome?: unknown;
  reporttype?: unknown;
};

type RelicMatchReport = {
  profile_id?: unknown;
};

type RelicMatchWithRoster<TMember extends RelicMatchMember> = {
  matchhistorymember?: TMember[];
  matchhistoryreportresults?: RelicMatchReport[];
};

const normalizeProfileId = (value: unknown) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

/**
 * Relic includes observers in matchhistorymember for some custom games, but
 * only actual players receive a matchhistoryreportresults row. Prefer that
 * authoritative roster and retain a defensive fallback for older payloads.
 */
export function getPlayedMatchMembers<TMember extends RelicMatchMember>(
  match: RelicMatchWithRoster<TMember>,
): TMember[] {
  const members = Array.isArray(match?.matchhistorymember)
    ? match.matchhistorymember
    : [];
  const reports = Array.isArray(match?.matchhistoryreportresults)
    ? match.matchhistoryreportresults
    : [];
  const reportedProfileIds = new Set(
    reports
      .map(report => normalizeProfileId(report?.profile_id))
      .filter(Boolean),
  );

  if (reportedProfileIds.size > 0) {
    return members.filter(member =>
      reportedProfileIds.has(normalizeProfileId(member?.profile_id)),
    );
  }

  return members.filter(member => member?.outcome !== 3 && member?.reporttype !== 2);
}
