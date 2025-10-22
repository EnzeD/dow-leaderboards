import type { StaticImageData } from "next/image";
import chaosIcon from "../../assets/factions/chaos.png";
import darkEldarIcon from "../../assets/factions/darkeldar.png";
import eldarIcon from "../../assets/factions/eldar.png";
import imperialGuardIcon from "../../assets/factions/imperialguard.png";
import necronIcon from "../../assets/factions/necron.png";
import orkIcon from "../../assets/factions/ork.png";
import sistersIcon from "../../assets/factions/sister.png";
import spaceMarineIcon from "../../assets/factions/spacemarine.png";
import tauIcon from "../../assets/factions/tau.png";

export type FactionSlug =
  | "chaos"
  | "dark-eldar"
  | "eldar"
  | "imperial-guard"
  | "necrons"
  | "orks"
  | "sisters-of-battle"
  | "space-marines"
  | "tau"
  | "unknown";

export type FactionInfo = {
  raceId: number;
  name: string;
  shortName: string;
  slug: FactionSlug;
  icon: StaticImageData;
};

const FACTIONS: FactionInfo[] = [
  {
    raceId: 0,
    name: "Chaos",
    shortName: "Chaos",
    slug: "chaos",
    icon: chaosIcon,
  },
  {
    raceId: 1,
    name: "Dark Eldar",
    shortName: "Dark Eldar",
    slug: "dark-eldar",
    icon: darkEldarIcon,
  },
  {
    raceId: 2,
    name: "Eldar",
    shortName: "Eldar",
    slug: "eldar",
    icon: eldarIcon,
  },
  {
    raceId: 3,
    name: "Imperial Guard",
    shortName: "Imp Guard",
    slug: "imperial-guard",
    icon: imperialGuardIcon,
  },
  {
    raceId: 4,
    name: "Necrons",
    shortName: "Necrons",
    slug: "necrons",
    icon: necronIcon,
  },
  {
    raceId: 5,
    name: "Orks",
    shortName: "Orks",
    slug: "orks",
    icon: orkIcon,
  },
  {
    raceId: 6,
    name: "Sisters of Battle",
    shortName: "Sisters",
    slug: "sisters-of-battle",
    icon: sistersIcon,
  },
  {
    raceId: 7,
    name: "Space Marines",
    shortName: "SM",
    slug: "space-marines",
    icon: spaceMarineIcon,
  },
  {
    raceId: 8,
    name: "Tau",
    shortName: "Tau",
    slug: "tau",
    icon: tauIcon,
  },
];

const FACTIONS_BY_RACE = new Map<number, FactionInfo>();
const FACTIONS_BY_SLUG = new Map<FactionSlug, FactionInfo>();

for (const faction of FACTIONS) {
  FACTIONS_BY_RACE.set(faction.raceId, faction);
  FACTIONS_BY_SLUG.set(faction.slug, faction);
}

const FACTION_COLORS: Record<
  Exclude<FactionSlug, "unknown">,
  { text: string; softBg: string; border: string }
> = {
  chaos: {
    text: "text-red-400",
    softBg: "bg-red-500/15",
    border: "border-red-500/30",
  },
  "dark-eldar": {
    text: "text-purple-300",
    softBg: "bg-purple-500/15",
    border: "border-purple-500/30",
  },
  eldar: {
    text: "text-sky-300",
    softBg: "bg-sky-500/15",
    border: "border-sky-500/30",
  },
  "imperial-guard": {
    text: "text-emerald-300",
    softBg: "bg-emerald-500/15",
    border: "border-emerald-500/25",
  },
  necrons: {
    text: "text-lime-300",
    softBg: "bg-lime-500/15",
    border: "border-lime-500/25",
  },
  orks: {
    text: "text-green-300",
    softBg: "bg-green-500/15",
    border: "border-green-500/25",
  },
  "sisters-of-battle": {
    text: "text-rose-300",
    softBg: "bg-rose-500/15",
    border: "border-rose-500/25",
  },
  "space-marines": {
    text: "text-blue-300",
    softBg: "bg-blue-500/15",
    border: "border-blue-500/30",
  },
  tau: {
    text: "text-amber-300",
    softBg: "bg-amber-500/15",
    border: "border-amber-500/30",
  },
};

const FACTION_HEX: Record<Exclude<FactionSlug, "unknown">, string> = {
  chaos: "#f87171",
  "dark-eldar": "#a855f7",
  eldar: "#38bdf8",
  "imperial-guard": "#34d399",
  necrons: "#84cc16",
  orks: "#22c55e",
  "sisters-of-battle": "#f472b6",
  "space-marines": "#60a5fa",
  tau: "#f59e0b",
};

export const allFactions = (): FactionInfo[] => [...FACTIONS];

export const getFactionByRaceId = (raceId?: number | null): FactionInfo | null => {
  if (typeof raceId !== "number" || Number.isNaN(raceId)) return null;
  return FACTIONS_BY_RACE.get(raceId) ?? null;
};

export const getFactionBySlug = (slug?: FactionSlug | null): FactionInfo | null => {
  if (!slug) return null;
  return FACTIONS_BY_SLUG.get(slug) ?? null;
};

export const getFactionName = (raceId?: number | null): string => {
  return getFactionByRaceId(raceId)?.name ?? (typeof raceId === "number" ? `Race ${raceId}` : "Unknown");
};

export const getFactionShortName = (raceId?: number | null): string => {
  return getFactionByRaceId(raceId)?.shortName ?? getFactionName(raceId);
};

export const getFactionSlug = (raceId?: number | null): FactionSlug => {
  return getFactionByRaceId(raceId)?.slug ?? "unknown";
};

export const getFactionIcon = (
  raceId?: number | null,
): StaticImageData | undefined => {
  return getFactionByRaceId(raceId)?.icon;
};

export const getFactionColor = (
  raceId?: number | null,
  variant: "text" | "softBg" | "border" = "text",
): string => {
  const info = getFactionByRaceId(raceId);
  if (!info) {
    if (variant === "text") return "text-neutral-300";
    if (variant === "border") return "border-neutral-700/70";
    return "bg-neutral-800/60";
  }
  if (info.slug === "unknown") {
    if (variant === "text") return "text-neutral-300";
    if (variant === "border") return "border-neutral-700/70";
    return "bg-neutral-800/60";
  }

  const palette = FACTION_COLORS[info.slug];
  if (!palette) {
    if (variant === "text") return "text-neutral-300";
    if (variant === "border") return "border-neutral-700/70";
    return "bg-neutral-800/60";
  }
  return palette[variant];
};

export const getFactionHexColor = (
  raceId?: number | null,
  fallback: string = "#94a3b8",
): string => {
  const info = getFactionByRaceId(raceId);
  if (!info) return fallback;
  if (info.slug === "unknown") return fallback;
  const value = FACTION_HEX[info.slug];
  return value ?? fallback;
};
