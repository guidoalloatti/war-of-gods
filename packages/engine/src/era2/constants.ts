import type { TechType, UnitType } from '../types/era2.js';
import type { RaceId } from '../types/race.js';

/**
 * Cumulative cost to reach each tech level.
 * Index 0 = cost to reach level 1, index 4 = cost to reach level 5.
 * Index 5 (level 6) is unlocked only by the "Forja del Destino" world card.
 * Level 6 cost = level 5 cost + 2 × (level 5 − level 4).
 */
export const TECH_COSTS: Record<TechType, readonly number[]> = {
  war:       [1, 3, 7, 13, 22, 22 + 2 * (22 - 13)],       // 1, 3, 7, 13, 22, 40
  science:   [1, 3, 6, 11, 19, 19 + 2 * (19 - 11)],       // 1, 3, 6, 11, 19, 35
  resources: [1, 3, 6, 10, 17, 17 + 2 * (17 - 10)],       // 1, 3, 6, 10, 17, 31
  economy:   [2, 5, 9, 14, 20, 20 + 2 * (20 - 14)],       // 2, 5, 9, 14, 20, 32
};

/**
 * Per-level incremental cost (cost[i] - cost[i-1]).
 * Useful for UI display and cost modifiers that apply per-level.
 */
export function getIncrementalCost(tech: TechType, level: number): number {
  if (level < 1 || level > 6) throw new Error(`Invalid level: ${level}`);
  const cumulative = TECH_COSTS[tech];
  return level === 1 ? cumulative[0] : cumulative[level - 1] - cumulative[level - 2];
}

/**
 * Benefits per tech level. Index 0 = level 0 (baseline, free), index 5 = level 5.
 */
export const TECH_BENEFITS: Record<TechType, { label: string; values: readonly number[] }> = {
  war:       { label: 'Reclutas por turno',  values: [1, 2, 4, 5, 6, 7] },
  science:   { label: 'Tipos de unidad',     values: [1, 1, 2, 3, 4, 5] },
  resources: { label: 'Alimento máximo',     values: [2, 4, 8, 11, 14, 16] },
  economy:   { label: 'Monedas por turno',   values: [1, 3, 4, 5, 6, 7] },
};

/**
 * Order in which unit types unlock as Science level rises.
 * Index 0 unlocks at level 1 (infantry always available), index 4 at level 5.
 */
export const SCIENCE_UNLOCK_ORDER: readonly UnitType[] = [
  'infantry',  // always available at Science 1+ (baseline level 0 already gives infantry)
  'ranged',    // Science 2+
  'mounted',   // Science 3+
  'siege',     // Science 4+
  'flying',    // Science 5
];

/**
 * Racial bonuses applied at the start of Era II:
 *  - freeTech: one tech level granted for free (stackable with card bonuses)
 *  - freeUnit: one unit accumulated for Era III
 */
export const RACIAL_BONUSES: Record<RaceId, {
  freeTech: { tech: TechType; level: number };
  freeUnit: { unit: UnitType; count: number };
}> = {
  elf:     { freeTech: { tech: 'resources', level: 1 }, freeUnit: { unit: 'ranged',   count: 1 } },
  dwarf:   { freeTech: { tech: 'economy',   level: 1 }, freeUnit: { unit: 'infantry', count: 1 } },
  human:   { freeTech: { tech: 'science',   level: 1 }, freeUnit: { unit: 'mounted',  count: 1 } },
  halfelf: { freeTech: { tech: 'war',       level: 1 }, freeUnit: { unit: 'infantry', count: 1 } },
  orc:     { freeTech: { tech: 'resources', level: 1 }, freeUnit: { unit: 'mounted',  count: 1 } },
  giant:   { freeTech: { tech: 'war',       level: 1 }, freeUnit: { unit: 'siege',    count: 1 } },
  goblin:  { freeTech: { tech: 'science',   level: 1 }, freeUnit: { unit: 'flying',   count: 1 } },
  halforc: { freeTech: { tech: 'economy',   level: 1 }, freeUnit: { unit: 'infantry', count: 1 } },
};

/**
 * Unit definitions — static data consumed by Era III.
 * Stored here because Era II card effects (free_unit, free_unit_per_high_tech)
 * reference unit types and the allocation UI shows previews.
 */
export type UnitStats = {
  id: UnitType;
  name: string;
  name_en: string;
  cost: number;
  sellValue: number;
  scienceReq: number;
  attack: number;
  defense: number;
  food: number;
  movement: number;
  special: string;
  special_en: string;
};

export const UNIT_DEFINITIONS: readonly UnitStats[] = [
  { id: 'infantry', name: 'Infantería',  name_en: 'Infantry', cost: 1, sellValue: 1, scienceReq: 1,
    attack: 2, defense: 1, food: 1, movement: 1,
    special: '2× daño contra ciudades', special_en: '2× damage vs cities' },
  { id: 'ranged',   name: 'Distancia',   name_en: 'Ranged',   cost: 2, sellValue: 1, scienceReq: 2,
    attack: 2, defense: 2, food: 1, movement: 1,
    special: '½ daño contra ciudades', special_en: '½ damage vs cities' },
  { id: 'mounted',  name: 'Montada',     name_en: 'Mounted',  cost: 3, sellValue: 2, scienceReq: 3,
    attack: 4, defense: 2, food: 2, movement: 2,
    special: '2× daño contra asedio', special_en: '2× damage vs siege' },
  { id: 'siege',    name: 'Asedio',      name_en: 'Siege',    cost: 6, sellValue: 3, scienceReq: 4,
    attack: 9, defense: 2, food: 3, movement: 1,
    special: '⅓ daño a tropas', special_en: '⅓ damage to troops' },
  { id: 'flying',   name: 'Voladora',    name_en: 'Flying',   cost: 7, sellValue: 4, scienceReq: 5,
    attack: 6, defense: 3, food: 3, movement: 3,
    special: 'Solo atacable por distancia', special_en: 'Only attackable by ranged' },
];

/** Default ratios for Kings Table transfers and surplus conversion. */
export const DEFAULT_TRANSFER_GIVE_RATIO = 0.5;    // 2 points given = 1 received
export const DEFAULT_TRANSFER_RECEIVE_RATIO = 1;
export const DEFAULT_SURPLUS_RATIO = 0.5;           // 2 surplus = 1 gold

/** Minimum guaranteed construction points even after an awful Era I. */
export const MIN_CONSTRUCTION_POINTS = 10;

/** Default doom clock value for Saga mode. 0 = disabled. */
export const DEFAULT_DOOM_CLOCK = 12;
