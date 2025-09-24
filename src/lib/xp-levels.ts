// XP to Level mapping for Dawn of War: Definitive Edition
// Fixes the API bug where all players show as level 1

interface LevelData {
  level: number;
  xpRequired: number;
  cumulativeXp: number;
  xpMin: number;
  xpMax: number;
}

const MAX_LEVEL = 250;
const XP_CAP = 6_000_000;

// Build the full level table (levels 1–250) from the new XP curve
const XP_LEVELS: LevelData[] = (() => {
  const levels: LevelData[] = [];
  let xpMin = 1;
  let cumulative = 0;

  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const xpRequired = getXpRequiredForLevel(level);
    cumulative += xpRequired;
    const xpMax = cumulative;

    levels.push({
      level,
      xpRequired,
      cumulativeXp: cumulative,
      xpMin,
      xpMax,
    });

    xpMin = xpMax + 1;
  }

  return levels;
})();

// Build a lookup structure for binary search
const LEVEL_THRESHOLDS = XP_LEVELS.map(l => ({ level: l.level, min: l.xpMin, max: l.xpMax }));

function getXpRequiredForLevel(level: number): number {
  if (level <= 10) return 10_000;
  if (level <= 20) return 15_000;
  return 25_000;
}

/**
 * Get the correct level for a given XP value using binary search
 * This fixes the API bug where all players show as level 1
 */
export function getLevelFromXP(xp: number | null | undefined): number {
  if (!xp || xp <= 0) return 1;
  if (xp >= XP_CAP) return MAX_LEVEL;

  // Binary search for efficiency
  let left = 0;
  let right = LEVEL_THRESHOLDS.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const threshold = LEVEL_THRESHOLDS[mid];

    if (xp < threshold.min) {
      right = mid - 1;
      continue;
    }

    if (xp > threshold.max) {
      left = mid + 1;
      continue;
    }

    return threshold.level;
  }

  return 1;
}

/**
 * Get detailed level information for a given XP value
 */
export function getLevelDetails(xp: number | null | undefined): {
  level: number;
  xpInLevel: number;
  xpForNext: number;
  progressPercent: number;
} {
  const level = getLevelFromXP(xp);

  if (!xp || xp <= 0) {
    return {
      level: 1,
      xpInLevel: 0,
      xpForNext: getXpRequiredForLevel(1),
      progressPercent: 0,
    };
  }

  const levelData = XP_LEVELS[Math.min(level - 1, XP_LEVELS.length - 1)];
  const boundedXp = Math.min(xp, XP_CAP);
  const xpInLevel = boundedXp - levelData.xpMin + 1;
  const xpRange = levelData.xpMax - levelData.xpMin + 1;
  const xpForNext = Math.max(0, levelData.xpMax - boundedXp);
  const progressPercent = Math.min(100, Math.round((xpInLevel / xpRange) * 10000) / 100);

  return {
    level,
    xpInLevel,
    xpForNext,
    progressPercent,
  };
}

/**
 * Format level display with XP progress
 */
export function formatLevelDisplay(xp: number | null | undefined): string {
  const details = getLevelDetails(xp);
  return `Level ${details.level}`;
}

/**
 * Format level with progress bar data
 */
export function getLevelProgress(xp: number | null | undefined): {
  level: number;
  displayText: string;
  progressPercent: number;
  tooltip: string;
} {
  const details = getLevelDetails(xp);

  return {
    level: details.level,
    displayText: `Level ${details.level}`,
    progressPercent: details.progressPercent,
    tooltip: details.xpForNext > 0
      ? `${details.progressPercent}% to Level ${details.level + 1} (${details.xpForNext.toLocaleString()} XP needed)`
      : 'Max Level',
  };
}
