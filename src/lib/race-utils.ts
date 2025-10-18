export const raceIdToFaction = (raceId?: number | null): string => {
  if (raceId === null || raceId === undefined) return "Unknown";
  const mapping: Record<number, string> = {
    0: "Chaos",
    1: "Dark Eldar",
    2: "Eldar",
    3: "Imperial Guard",
    4: "Necrons",
    5: "Orks",
    6: "Sisters of Battle",
    7: "Space Marines",
    8: "Tau",
  };
  return mapping[raceId] ?? `Race ${raceId}`;
};

