import type { TechType } from '../types/era2.js';
import { TECH_COSTS } from './constants.js';

export type CostModifiers = {
  flat: number;           // added to the total cost once (can be negative)
  perLevel: number;       // added to each level's cost (can be negative)
  minCostPerLevel: number; // floor per-level cost after perLevel is applied
};

export const NO_COST_MODIFIERS: CostModifiers = {
  flat: 0,
  perLevel: 0,
  minCostPerLevel: 1,
};

/**
 * Compute the cost to go from `currentLevel` → `targetLevel` for a tech,
 * consuming up to `freeLevelsRemaining` free upgrades and applying cost modifiers.
 *
 * Free levels are consumed GREEDILY from the lowest remaining level first
 * (they don't discount — they skip the purchase entirely).
 * Per-level modifier applies to each purchased level, clamped to minCostPerLevel.
 * Flat modifier applies once to the total (can push it negative, clamped to 0).
 */
export function calculateTechCost(
  tech: TechType,
  currentLevel: number,
  targetLevel: number,
  freeLevelsRemaining: number,
  modifiers: CostModifiers = NO_COST_MODIFIERS,
  allowLevel6 = false,
): { totalCost: number; freeLevelsConsumed: number } {
  if (targetLevel < 0 || targetLevel > 6) {
    throw new Error(`Invalid target level: ${targetLevel}`);
  }
  if (currentLevel < 0 || currentLevel > 6) {
    throw new Error(`Invalid current level: ${currentLevel}`);
  }
  if (targetLevel > 5 && !allowLevel6) {
    throw new Error('Level 6 requires the "Forja del Destino" world card');
  }
  if (targetLevel <= currentLevel) {
    return { totalCost: 0, freeLevelsConsumed: 0 };
  }

  let paid = 0;
  let freeConsumed = 0;

  for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
    if (freeLevelsRemaining - freeConsumed > 0) {
      freeConsumed++;
      continue;
    }
    const incremental = TECH_COSTS[tech][lvl - 1] - (lvl === 1 ? 0 : TECH_COSTS[tech][lvl - 2]);
    const adjusted = Math.max(modifiers.minCostPerLevel, incremental + modifiers.perLevel);
    paid += adjusted;
  }

  const totalCost = Math.max(0, paid + modifiers.flat);
  return { totalCost, freeLevelsConsumed: freeConsumed };
}

/**
 * Sum the cost of all 4 tech allocations for a player.
 * Each tech uses its own current level, target, free levels remaining, and modifiers.
 */
export function calculateTotalSpent(params: {
  allocations: Record<TechType, { currentLevel: number; targetLevel: number; freeLevelsRemaining: number; modifiers: CostModifiers }>;
  allowLevel6: boolean;
}): number {
  let total = 0;
  for (const tech of Object.keys(params.allocations) as TechType[]) {
    const a = params.allocations[tech];
    const { totalCost } = calculateTechCost(
      tech,
      a.currentLevel,
      a.targetLevel,
      a.freeLevelsRemaining,
      a.modifiers,
      params.allowLevel6,
    );
    total += totalCost;
  }
  return total;
}

/**
 * Convert surplus construction points to gold coins.
 * Default ratio = 0.5 (2 surplus = 1 gold). Floor-rounded.
 */
export function convertSurplusToGold(surplusPoints: number, ratio = 0.5): number {
  if (surplusPoints <= 0) return 0;
  return Math.floor(surplusPoints * ratio);
}

/**
 * Compute the received points in a Kings Table transfer.
 * Formula: `received = min(offered, floor(offered × giveRatio × receiveRatio))`
 * The cap-at-offered ensures future >1.0 ratio cards can't create points out of thin air.
 */
export function computeTransferDelta(
  pointsOffered: number,
  giveRatio: number,
  receiveRatio: number,
): number {
  if (pointsOffered <= 0) return 0;
  const raw = Math.floor(pointsOffered * giveRatio * receiveRatio);
  return Math.max(0, Math.min(pointsOffered, raw));
}
