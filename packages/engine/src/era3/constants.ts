import type { HexTerrain } from '../types/era3.js';

/** Disk radius for the Era III map (331 hexes total). */
export const MAP_RADIUS = 10;

/** Distance from citadel (0,0) where capitals sit, equispaced by angle. */
export const CAPITAL_RING_RADIUS = 8;

/** Distance from citadel where Wrought spawn zones sit (midway to capitals). */
export const SPAWN_RING_RADIUS = 4;

/** Maximum units in a single stack. */
export const MAX_STACK_SIZE = 6;

/** Minimum stack size required to assign a general. */
export const GENERAL_MIN_STACK_SIZE = 3;

/** Per-unit attack bonus granted by a leading general. */
export const GENERAL_ATTACK_BONUS = 1;

/** Per-unit defense bonus granted by a leading general (reduces incoming damage). */
export const GENERAL_DEFENSE_BONUS = 1;

/** Deterministic RNG offsets (added to state.seed for sub-generators). */
export const OFFSET_ERA3_TERRAIN = 314_159;
export const OFFSET_ERA3_CAPITAL_ROTATION = 271_828;
export const OFFSET_ERA3_ROADS = 161_803;

/** Weighted terrain distribution for non-special hexes. Sums to 1.0. */
export const TERRAIN_DISTRIBUTION: ReadonlyArray<{ terrain: HexTerrain; weight: number }> = [
  { terrain: 'plain',    weight: 0.35 },
  { terrain: 'forest',   weight: 0.20 },
  { terrain: 'mountain', weight: 0.20 },
  { terrain: 'swamp',    weight: 0.15 },
  { terrain: 'ruins',    weight: 0.10 },
];

/** Sentinel ownerId for all Dhakhan-owned stacks and units. */
export const DHAKHAN_OWNER_ID = 'dhakhan';

/** One Wrought unit spawned per active spawn zone each cycle. */
export const WROUGHT_PER_SPAWN_PER_CYCLE = 1;

/** RNG offsets for Session 3 subsystems. */
export const OFFSET_ERA3_COMBAT = 141_421;
export const OFFSET_ERA3_DHAKHAN = 173_205;
export const OFFSET_ERA3_RUINS = 223_606;
export const OFFSET_ERA3_RIVERS = 265_358;

/**
 * Reward distribution for unlooted `ruins` hexes. Rolled at map-gen time so
 * the outcome is deterministic from the seed. Spawn-zone ruins do NOT get
 * rewards (they belong to Dhakhan). Weights sum to 1.
 */
export const RUINS_REWARD_WEIGHTS = {
  gold: 0.45,
  unit: 0.2,
  card: 0.2,
  empty: 0.15,
} as const;

/** Gold reward range when a ruins rolls "gold". */
export const RUINS_GOLD_MIN = 3;
export const RUINS_GOLD_MAX = 7;

/** Unit-reward pool — a weighted subset of unit types. Cheap units are more
 *  likely; siege/flying are rare surprises. */
export const RUINS_UNIT_POOL: ReadonlyArray<{ unit: 'infantry' | 'ranged' | 'mounted' | 'siege' | 'flying'; weight: number }> = [
  { unit: 'infantry', weight: 0.40 },
  { unit: 'ranged',   weight: 0.25 },
  { unit: 'mounted',  weight: 0.20 },
  { unit: 'siege',    weight: 0.10 },
  { unit: 'flying',   weight: 0.05 },
];

/**
 * Session 4a economy. Income at end of each cycle:
 *   income = ERA3_BASE_INCOME + techLevels.economy
 */
export const ERA3_BASE_INCOME = 2;

/**
 * Gold cost to recruit one unit of each type on the player's capital.
 * Cheaper than Era II build costs to keep Era III economy running — recruit
 * happens turn-by-turn, not once per era.
 */
export const ERA3_RECRUIT_COSTS: Record<
  'infantry' | 'ranged' | 'mounted' | 'siege' | 'flying',
  number
> = {
  infantry: 2,
  ranged: 3,
  mounted: 4,
  siege: 5,
  flying: 6,
};

/**
 * Recruits per turn by War tech level (index = level 0–5).
 * War 0 → 1 recruit/turn; War 5 → 5 recruits/turn.
 */
export const ERA3_WAR_RECRUITS_PER_LEVEL: readonly number[] = [1, 2, 3, 4, 5, 5];

/** Fallback max recruits if tech levels are unavailable. */
export const ERA3_RECRUITS_PER_TURN = 3;

/**
 * Max stack size by Resources tech level (index = level 0–5).
 * Resources 0 → 2 units max; Resources 4+ → 6 units max (hard cap).
 */
export const ERA3_RESOURCES_STACK_SIZE_PER_LEVEL: readonly number[] = [2, 3, 4, 5, 6, 6];

/**
 * Science tech → unit unlock table.
 * scienceReq per unit type: infantry=0, ranged=1, mounted=2, siege=3, flying=4.
 * Player's science level must be >= scienceReq to recruit that unit type.
 */
export const ERA3_SCIENCE_UNIT_REQS: Readonly<Record<string, number>> = {
  infantry: 0,
  ranged:   1,
  mounted:  2,
  siege:    3,
  flying:   4,
};

/**
 * Gold cost to pave one hex into a road. Player must have an own stack
 * adjacent to the target hex, and the target must be a convertible terrain
 * (plain / forest / swamp / ruins — never mountain, road, citadel, capital,
 * or spawn zone). One road built per turn per player.
 */
export const ERA3_BUILD_ROAD_COST = 3;
export const ERA3_ROADS_PER_TURN = 3;

/**
 * War tech → attack bonus per unit (index = level 0–5).
 * War 0 → no bonus; War 2 → +1 attack; War 4 → +2 attack; War 5 → +3 attack.
 */
export const ERA3_WAR_ATTACK_PER_LEVEL: readonly number[] = [0, 0, 1, 1, 2, 3];

/** Legacy — kept for any existing imports. War bonus is now level-based. */
export const ERA3_WAR_ATTACK_BONUS_THRESHOLD = 2;
export const ERA3_WAR_ATTACK_BONUS = 1;

/** Per-unit attack bonus when a stack fights on its race's favorable terrain. */
export const ERA3_HOME_TERRAIN_BONUS = 1;

/**
 * Session 5/6: Dhakhan boss stack sits on the citadel (0,0). Each boss unit
 * has `hp = defense*2 + 3` (≈2.5× Wrought) and `attack = UNIT_DEFINITIONS` value.
 * Stack is full (MAX_STACK_SIZE).
 */
export const BOSS_UNIT_HP_MULT = 2;
export const BOSS_UNIT_HP_BONUS = 3;
export const BOSS_STACK_ID = 'stack_dhakhan_boss';
export const CITADEL_COORD = { q: 0, r: 0 } as const;

/** Fraction of HP restored when a stack rests for a full turn (no move/attack). */
export const REST_HEAL_FRACTION = 0.5;

/** Fraction of the original recruit cost refunded when disbanding a unit. */
export const DISBAND_REFUND_FRACTION = 2 / 3;

/** Defense multiplier applied to a fortified stack. */
export const FORTIFY_DEFENSE_MULT = 2;

/** Fort hex defense multiplier (same as fortified stack). */
export const FORT_DEFENSE_MULT = 2;

/** Probability that a randomly-placed fort hex exists at map-gen time. */
export const FORT_HEX_PROBABILITY = 0.04;

/** Gold cost to terraform a hex (irrigate desert→plain, erode mountain→hill, drain swamp→plain). */
export const TERRAFORM_COST = 3;

/** Gold cost to build a road overlay on mountain or desert (no terrain change). */
export const BUILD_ROAD_OVERLAY_COST = 5;

/** Gold cost to drain a lake or river hex into a plain (requires own adjacent stack). */
export const DRAIN_WATER_COST = 3;

/** Gold cost to build a bridge on a river hex (makes it passable at road movement cost). */
export const BUILD_BRIDGE_COST = 5;

/**
 * Era III tech upgrade: costs 150% of the Era II incremental cost for the next level.
 * Multiplier applied to `getIncrementalCost(tech, nextLevel)`, rounded up.
 */
export const ERA3_TECH_UPGRADE_MULTIPLIER = 1.5;
