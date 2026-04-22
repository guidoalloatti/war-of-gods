import type { Player } from '../types/player.js';
import type { TechType } from '../types/era2.js';
import { TECH_TYPES } from '../types/era2.js';

export type Era2ScoreBreakdown = {
  techPoints: Record<TechType, number>;
  totalTech: number;
  goldCoins: number;
  freeUnitCount: number;
  total: number;
};

/**
 * Era II scoring for the end-of-era summary screen.
 * This is a flat weighting — 1 point per tech level — used for UI ranking only.
 * Actual Era III power comes from techLevels + goldCoins + freeUnits directly.
 */
export function calculateEra2ScoreBreakdown(player: Player): Era2ScoreBreakdown {
  const s = player.era2State;
  if (!s) {
    return {
      techPoints: { war: 0, science: 0, resources: 0, economy: 0, religion: 0 },
      totalTech: 0,
      goldCoins: 0,
      freeUnitCount: 0,
      total: 0,
    };
  }

  const techPoints = { war: 0, science: 0, resources: 0, economy: 0, religion: 0 } as Record<TechType, number>;
  let totalTech = 0;
  for (const tech of TECH_TYPES) {
    techPoints[tech] = s.techLevels[tech];
    totalTech += s.techLevels[tech];
  }

  const freeUnitCount = s.freeUnitsForEra3.reduce((sum, g) => sum + g.count, 0);

  return {
    techPoints,
    totalTech,
    goldCoins: s.goldCoins,
    freeUnitCount,
    total: totalTech + s.goldCoins + freeUnitCount,
  };
}

export function calculateEra2Score(player: Player): number {
  return calculateEra2ScoreBreakdown(player).total;
}
