const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const formatCount = (value: number | null | undefined): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return "0";
  return numberFormatter.format(value);
};

export const formatPercent = (
  value: number | null | undefined,
  decimals: number = 1,
  placeholder: string = "—",
): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return placeholder;
  return `${(value * 100).toFixed(decimals)}%`;
};

export const formatWinrate = (
  winrate: number | null | undefined,
  decimals: number = 1,
): string => {
  return formatPercent(winrate, decimals);
};

export const formatLastPlayed = (
  input: string | Date | null | undefined,
  now: Date = new Date(),
): string => {
  if (!input) return "Never";
  const date = input instanceof Date ? input : new Date(input);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Never";

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < MINUTE_MS) return "Just now";
  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return `${minutes}m ago`;
  }
  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS);
    return `${hours}h ago`;
  }
  if (diffMs < 7 * DAY_MS) {
    const days = Math.floor(diffMs / DAY_MS);
    return `${days}d ago`;
  }
  return `on ${dateFormatter.format(date)}`;
};

export const computeWinrateDelta = (
  winrate: number | null | undefined,
): number | null => {
  if (typeof winrate !== "number" || Number.isNaN(winrate)) return null;
  return winrate - 0.5;
};

export const winrateToHeatmapColor = (
  winrate: number | null | undefined,
): string => {
  const delta = computeWinrateDelta(winrate);
  if (delta === null) {
    return "rgba(125, 125, 125, 0.08)";
  }

  const clamped = Math.max(-0.3, Math.min(0.3, delta));
  const intensity = Math.abs(clamped) / 0.3;
  const alpha = 0.18 + 0.4 * intensity;

  if (clamped >= 0) {
    const base = [34, 197, 94]; // emerald-500
    return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha.toFixed(3)})`;
  }

  const base = [239, 68, 68]; // red-500
  return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha.toFixed(3)})`;
};

export const winrateToTextColor = (
  winrate: number | null | undefined,
): string => {
  const delta = computeWinrateDelta(winrate);
  if (delta === null) return "text-neutral-300";
  if (delta > 0.02) return "text-emerald-300";
  if (delta < -0.02) return "text-red-300";
  return "text-neutral-300";
};
