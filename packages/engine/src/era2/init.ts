import type { GameMode } from '../types/game.js';
import type { SoloVariant } from '../types/game.js';
import type { PlayerEra2State, TechType } from '../types/era2.js';
import type { Player } from '../types/player.js';
import {
  DEFAULT_DOOM_CLOCK,
  DEFAULT_SURPLUS_RATIO,
  DEFAULT_TRANSFER_GIVE_RATIO,
  DEFAULT_TRANSFER_RECEIVE_RATIO,
  MIN_CONSTRUCTION_POINTS,
  RACIAL_BONUSES,
} from './constants.js';

/**
 * Initialize the doom clock based on game mode. Currently Saga init = 12 for all modes.
 * Returns 0 when disabled (reserved for future Chronicle mode).
 */
export function initDoomClock(_mode: GameMode, _variant: SoloVariant | null): number {
  return DEFAULT_DOOM_CLOCK;
}

function zeroByTech<T>(value: T): Record<TechType, T> {
  return { war: value, science: value, resources: value, economy: value };
}

/**
 * Build a fresh PlayerEra2State for a player entering Era II.
 *
 * - `constructionPoints = max(MIN_CONSTRUCTION_POINTS, player.score)`, applied AFTER deferred penalties.
 * - Racial bonus: the player's race grants 1 free tech level, accumulated into techLevels directly.
 * - `freeTechLevels` from Era I cards with `on_era2_start` are folded into techLevels.
 * - Racial unit grant is queued in `freeUnitsForEra3`.
 */
export function initPlayerEra2State(player: Player): PlayerEra2State {
  const baseScore = player.score ?? 0;
  const constructionPoints = Math.max(MIN_CONSTRUCTION_POINTS, baseScore);

  const techLevels = zeroByTech(0);

  // Apply racial bonus tech
  const racial = RACIAL_BONUSES[player.raceId];
  if (racial) {
    techLevels[racial.freeTech.tech] = Math.max(
      techLevels[racial.freeTech.tech],
      racial.freeTech.level,
    );
  }

  // Fold in any free_tech_level grants accumulated during Era I (triggered on_era2_start).
  // These are stackable: multiple grants to the same tech sum to higher starting levels,
  // capped at 5 (level 6 is gated by the "Forja del Destino" world card, handled later).
  if (player.freeTechLevels) {
    for (const grant of player.freeTechLevels) {
      techLevels[grant.tech] = Math.min(5, techLevels[grant.tech] + grant.level);
    }
  }

  const freeUnitsForEra3 = racial ? [{ unit: racial.freeUnit.unit, count: racial.freeUnit.count }] : [];
  if (player.freeUnits) {
    for (const grant of player.freeUnits) {
      const existing = freeUnitsForEra3.find(g => g.unit === grant.unit);
      if (existing) existing.count += grant.count;
      else freeUnitsForEra3.push({ unit: grant.unit, count: grant.count });
    }
  }

  return {
    constructionPoints,
    pointsSpent: 0,
    pointsGiven: 0,
    pointsReceived: 0,
    techLevels,
    baselineTechLevels: { ...techLevels },
    freeLevelsRemaining: zeroByTech(0),
    goldCoins: 0,
    freeUnitsForEra3,
    reallocationsUsed: 0,
    reallocationsAllowed: 0,
    allowLevel6: false,
    costModifiers: {
      flat: zeroByTech(0),
      perLevel: zeroByTech(0),
      minCostPerLevel: 1,
    },
    transferModifiers: {
      giveRatio: DEFAULT_TRANSFER_GIVE_RATIO,
      receiveRatio: DEFAULT_TRANSFER_RECEIVE_RATIO,
      surplusRatio: DEFAULT_SURPLUS_RATIO,
    },
    hasConfirmed: false,
    hasConvertedSurplus: false,
  };
}
