// XP to Level mapping for Dawn of War: Definitive Edition
// Fixes the API bug where all players show as level 1

interface LevelData {
  level: number;
  xpRequired: number;
  cumulativeXp: number;
  xpMin: number;
  xpMax: number;
}

// Compressed level data for levels 1-250
const XP_LEVELS: LevelData[] = [
  { level: 1, xpRequired: 1000, cumulativeXp: 1000, xpMin: 1, xpMax: 1000 },
  { level: 2, xpRequired: 1000, cumulativeXp: 2000, xpMin: 1001, xpMax: 2000 },
  { level: 3, xpRequired: 1000, cumulativeXp: 3000, xpMin: 2001, xpMax: 3000 },
  { level: 4, xpRequired: 1000, cumulativeXp: 4000, xpMin: 3001, xpMax: 4000 },
  { level: 5, xpRequired: 1000, cumulativeXp: 5000, xpMin: 4001, xpMax: 5000 },
  { level: 6, xpRequired: 1000, cumulativeXp: 6000, xpMin: 5001, xpMax: 6000 },
  { level: 7, xpRequired: 1000, cumulativeXp: 7000, xpMin: 6001, xpMax: 7000 },
  { level: 8, xpRequired: 1000, cumulativeXp: 8000, xpMin: 7001, xpMax: 8000 },
  { level: 9, xpRequired: 1000, cumulativeXp: 9000, xpMin: 8001, xpMax: 9000 },
  { level: 10, xpRequired: 1102, cumulativeXp: 10102, xpMin: 9001, xpMax: 10102 },
  { level: 20, xpRequired: 4259, cumulativeXp: 36832, xpMin: 32574, xpMax: 36832 },
  { level: 30, xpRequired: 9390, cumulativeXp: 106030, xpMin: 96641, xpMax: 106030 },
  { level: 40, xpRequired: 16454, cumulativeXp: 237199, xpMin: 220746, xpMax: 237199 },
  { level: 50, xpRequired: 25424, cumulativeXp: 449515, xpMin: 424092, xpMax: 449515 },
  { level: 60, xpRequired: 36253, cumulativeXp: 761801, xpMin: 725549, xpMax: 761801 },
  { level: 70, xpRequired: 48908, cumulativeXp: 1192427, xpMin: 1143520, xpMax: 1192427 },
  { level: 80, xpRequired: 63378, cumulativeXp: 1759600, xpMin: 1696223, xpMax: 1759600 },
  { level: 90, xpRequired: 79651, cumulativeXp: 2481401, xpMin: 2401751, xpMax: 2481401 },
  { level: 100, xpRequired: 97716, cumulativeXp: 3375793, xpMin: 3278078, xpMax: 3375793 },
  { level: 110, xpRequired: 117567, cumulativeXp: 4460659, xpMin: 4343093, xpMax: 4460659 },
  { level: 120, xpRequired: 139199, cumulativeXp: 5753838, xpMin: 5614640, xpMax: 5753838 },
  { level: 130, xpRequired: 162611, cumulativeXp: 7273131, xpMin: 7110521, xpMax: 7273131 },
  { level: 140, xpRequired: 187803, cumulativeXp: 9036333, xpMin: 8848531, xpMax: 9036333 },
  { level: 150, xpRequired: 214774, cumulativeXp: 11061237, xpMin: 10846464, xpMax: 11061237 },
  { level: 160, xpRequired: 243527, cumulativeXp: 13365648, xpMin: 13122122, xpMax: 13365648 },
  { level: 170, xpRequired: 274063, cumulativeXp: 15967391, xpMin: 15693329, xpMax: 15967391 },
  { level: 180, xpRequired: 306384, cumulativeXp: 18884311, xpMin: 18577928, xpMax: 18884311 },
  { level: 190, xpRequired: 340495, cumulativeXp: 22134287, xpMin: 21793793, xpMax: 22134287 },
  { level: 200, xpRequired: 376397, cumulativeXp: 25735218, xpMin: 25358822, xpMax: 25735218 },
  { level: 210, xpRequired: 414091, cumulativeXp: 29705024, xpMin: 29290934, xpMax: 29705024 },
  { level: 220, xpRequired: 453577, cumulativeXp: 34061629, xpMin: 33608053, xpMax: 34061629 },
  { level: 230, xpRequired: 494855, cumulativeXp: 38822949, xpMin: 38328095, xpMax: 38822949 },
  { level: 240, xpRequired: 537929, cumulativeXp: 44006926, xpMin: 43468998, xpMax: 44006926 },
  { level: 250, xpRequired: 582803, cumulativeXp: 49631536, xpMin: 49048734, xpMax: 50000000 },
];

// Build a lookup structure for binary search
const LEVEL_THRESHOLDS = XP_LEVELS.map(l => ({ level: l.level, min: l.xpMin, max: l.xpMax }));

/**
 * Get the correct level for a given XP value using binary search
 * This fixes the API bug where all players show as level 1
 */
export function getLevelFromXP(xp: number | null | undefined): number {
  if (!xp || xp <= 0) return 1;
  if (xp > 50000000) return 250;

  // Binary search for efficiency
  let left = 0;
  let right = LEVEL_THRESHOLDS.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const threshold = LEVEL_THRESHOLDS[mid];

    if (xp >= threshold.min && xp <= threshold.max) {
      return threshold.level;
    }

    if (xp < threshold.min) {
      // Check if we're between levels
      if (mid > 0) {
        const prevThreshold = LEVEL_THRESHOLDS[mid - 1];
        if (xp > prevThreshold.max) {
          // XP is between two milestone levels, interpolate
          return interpolateLevel(xp, prevThreshold, threshold);
        }
      }
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  // Fallback to interpolation for XP values between our sample points
  for (let i = 0; i < LEVEL_THRESHOLDS.length - 1; i++) {
    if (xp > LEVEL_THRESHOLDS[i].max && xp < LEVEL_THRESHOLDS[i + 1].min) {
      return interpolateLevel(xp, LEVEL_THRESHOLDS[i], LEVEL_THRESHOLDS[i + 1]);
    }
  }

  return 1; // Default fallback
}

/**
 * Interpolate level for XP values between our sample points
 */
function interpolateLevel(
  xp: number,
  lower: { level: number; min: number; max: number },
  upper: { level: number; min: number; max: number }
): number {
  // Calculate approximate level based on XP progression curve
  const xpRange = upper.min - lower.max;
  const xpProgress = xp - lower.max;
  const levelRange = upper.level - lower.level;
  const estimatedLevel = lower.level + Math.floor((xpProgress / xpRange) * levelRange);

  return Math.max(lower.level, Math.min(estimatedLevel, upper.level - 1));
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
      xpForNext: 1000,
      progressPercent: 0,
    };
  }

  // Find the exact or closest level data
  const levelData = LEVEL_THRESHOLDS.find(l => l.level === level);

  if (levelData) {
    const xpInLevel = xp - levelData.min + 1;
    const xpRange = levelData.max - levelData.min + 1;
    const xpForNext = levelData.max - xp;
    const progressPercent = Math.round((xpInLevel / xpRange) * 100 * 100) / 100;

    return {
      level,
      xpInLevel,
      xpForNext: Math.max(0, xpForNext),
      progressPercent: Math.min(100, progressPercent),
    };
  }

  // Estimate for interpolated levels
  return {
    level,
    xpInLevel: 0,
    xpForNext: 0,
    progressPercent: 0,
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