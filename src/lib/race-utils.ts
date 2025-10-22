import { getFactionName } from "@/lib/factions";

export const raceIdToFaction = (raceId?: number | null): string => {
  return getFactionName(raceId);
};
