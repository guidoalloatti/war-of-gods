import type { GameState } from '../types/game.js';
import type { Race } from '../types/race.js';
import { getRoadBonus } from '../types/terrain.js';
import { getRaceById } from '../races/index.js';

export type ScoreBreakdown = {
  base: number;
  terrainBonus: number;
  roadBonus: number;
  diversityBonus: number;
  concentrationPenalty: number;
  balanceBonus: number;
  adjacencyBonus: number;
  cardEffects: number;
  raceAbilityBonus: number;
  total: number;
};

const TERRAIN_TYPES = ['plain', 'mountain', 'forest', 'swamp'] as const;

/**
 * Diversity bonus table.
 * Rewards having tiles of multiple terrain types (excluding roads).
 * 4 types present = +5, 3 types = +2, fewer = 0
 *
 * Race abilities can modify which terrains count:
 * - terrain_ignores_diversity: a terrain doesn't count toward diversity
 * - double_diversity_bonus: doubles the result
 */
function getDiversityBonus(tiles: Record<string, number>, race: Race): number {
  const ignoredTerrain = race.era1Disadvantage.effectType === 'terrain_ignores_diversity'
    ? race.era1Disadvantage.params.terrain as string
    : null;

  const typesPresent = TERRAIN_TYPES.filter(t => t !== ignoredTerrain && tiles[t] > 0).length;

  let bonus = 0;
  if (typesPresent >= 4) bonus = 5;
  else if (typesPresent >= 3) bonus = 2;

  if (race.era1Advantage.effectType === 'double_diversity_bonus') {
    bonus *= 2;
  }

  return bonus;
}

/**
 * Concentration penalty: diminishing returns when too many tiles
 * of a single non-road terrain type. Each tile beyond threshold of any
 * single type gives -1.
 *
 * Race abilities can modify:
 * - concentration_threshold_reduction: lower threshold (e.g. 6 instead of 8)
 * - no_concentration_penalty: exempt a terrain from penalty
 */
function getConcentrationPenalty(tiles: Record<string, number>, race: Race): number {
  const defaultThreshold = 8;

  // Half-elf / Goblin: reduced threshold
  const threshold = race.era1Disadvantage.effectType === 'concentration_threshold_reduction'
    ? (race.era1Disadvantage.params.threshold as number)
    : defaultThreshold;

  // Orc: exempt terrain
  const exemptTerrain = race.era1Advantage.effectType === 'no_concentration_penalty'
    ? race.era1Advantage.params.terrain as string
    : null;

  let penalty = 0;
  for (const t of TERRAIN_TYPES) {
    if (t === exemptTerrain) continue;
    if (tiles[t] > threshold) {
      penalty -= (tiles[t] - threshold);
    }
  }
  return penalty;
}

/**
 * Balance bonus: rewards having at least 2 of each productive terrain.
 *
 * Race abilities:
 * - no_balance_bonus: always 0
 * - enhanced_balance_bonus: uses custom bonus value
 */
function getBalanceBonus(tiles: Record<string, number>, race: Race): number {
  if (race.era1Disadvantage.effectType === 'no_balance_bonus') return 0;

  const allBalanced = TERRAIN_TYPES.every(t => tiles[t] >= 2);
  if (!allBalanced) return 0;

  if (race.era1Advantage.effectType === 'enhanced_balance_bonus') {
    return race.era1Advantage.params.bonus as number;
  }

  return 3;
}

/** Calculates the detailed score breakdown for a player in Era I */
export function calculateScoreBreakdown(state: GameState, playerId: string): ScoreBreakdown {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error(`Player not found: ${playerId}`);

  const race = getRaceById(player.raceId);

  // Base points: sum of (terrain_tiles × racial_value)
  // Giant advantage: +1 to mountain base value
  let base = 0;
  for (const t of TERRAIN_TYPES) {
    let value = race.terrainValues[t];

    // Giant: terrain_value_bonus (+1 to mountain)
    if (race.era1Advantage.effectType === 'terrain_value_bonus' &&
        race.era1Advantage.params.terrain === t) {
      value += race.era1Advantage.params.bonus as number;
    }

    // Half-orc: terrain_value_override (forest = 0)
    if (race.era1Disadvantage.effectType === 'terrain_value_override' &&
        race.era1Disadvantage.params.terrain === t) {
      value = race.era1Disadvantage.params.value as number;
    }

    base += player.tiles[t] * value;
  }

  // Terrain bonus: favorable - unfavorable
  // Half-elf dual_favorable: both plain and forest count as favorable
  let favorableCount = player.tiles[race.favorableTerrain as keyof typeof player.tiles] ?? 0;
  if (race.era1Advantage.effectType === 'dual_favorable') {
    const secondFav = race.era1Advantage.params.secondFavorable as string;
    if (secondFav !== race.favorableTerrain) {
      favorableCount += player.tiles[secondFav as keyof typeof player.tiles] ?? 0;
    }
  }
  const unfavorableCount = player.tiles[race.unfavorableTerrain as keyof typeof player.tiles] ?? 0;
  const terrainBonus = favorableCount - unfavorableCount;

  // Road bonus — respects roadRequirement from card effects
  // Orc disadvantage: halved road bonus
  let roadBonus: number;
  if (state.roadRequirement === 0) {
    roadBonus = 6;
  } else {
    roadBonus = getRoadBonus(player.tiles.road);
  }
  if (race.era1Disadvantage.effectType === 'halved_road_bonus') {
    roadBonus = Math.floor(roadBonus / 2);
  }

  // Diversity bonus: reward for having multiple terrain types
  const diversityBonus = getDiversityBonus(player.tiles, race);

  // Concentration penalty: diminishing returns on overloaded terrains
  const concentrationPenalty = getConcentrationPenalty(player.tiles, race);

  // Balance bonus: reward for minimum 2 of each terrain
  const balanceBonus = getBalanceBonus(player.tiles, race);

  // Extra points from card effects (accumulated by the effect-dispatcher)
  const cardEffects = player.cardBonusPoints ?? 0;

  // Adjacency bonus: computed client-side from hex board positions, not available in engine scoring
  const adjacencyBonus = 0;

  // Race ability bonus: calculated from abilities that grant flat bonuses
  let raceAbilityBonus = 0;

  // Dwarf: group_bonus — +2 for every group of 3 mountain tiles
  if (race.era1Advantage.effectType === 'group_bonus') {
    const terrain = race.era1Advantage.params.terrain as string;
    const groupSize = race.era1Advantage.params.groupSize as number;
    const bonusPerGroup = race.era1Advantage.params.bonusPerGroup as number;
    const count = player.tiles[terrain as keyof typeof player.tiles] ?? 0;
    raceAbilityBonus += Math.floor(count / groupSize) * bonusPerGroup;
  }

  // Giant disadvantage: terrain_penalty — plains give -1 per tile
  if (race.era1Disadvantage.effectType === 'terrain_penalty') {
    const terrain = race.era1Disadvantage.params.terrain as string;
    const penaltyPerTile = race.era1Disadvantage.params.penaltyPerTile as number;
    const count = player.tiles[terrain as keyof typeof player.tiles] ?? 0;
    raceAbilityBonus += count * penaltyPerTile;
  }

  const total = base + terrainBonus + roadBonus + diversityBonus + concentrationPenalty + balanceBonus + adjacencyBonus + cardEffects + raceAbilityBonus;

  return { base, terrainBonus, roadBonus, diversityBonus, concentrationPenalty, balanceBonus, adjacencyBonus, cardEffects, raceAbilityBonus, total };
}

export function calculateScore(state: GameState, playerId: string): number {
  return calculateScoreBreakdown(state, playerId).total;
}
