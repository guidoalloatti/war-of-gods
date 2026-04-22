import type { RaceId } from './race.js';
import type { FreeUnitGrant, TechType, UnitType } from './era2.js';

export type HexCoord = { q: number; r: number };

export type HexTerrain =
  | 'plain'
  | 'mountain'
  | 'hill'
  | 'forest'
  | 'swamp'
  | 'desert'
  | 'lake'
  | 'river'
  | 'road'
  | 'ruins'
  | 'citadel';

/**
 * Reward kinds a `ruins` hex can yield when the first player enters it.
 * `empty` is a valid outcome so not every ruins pays out.
 */
export type RuinsReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'unit'; unit: UnitType }
  | { kind: 'card' }
  | { kind: 'tech'; tech: 'war' | 'science' | 'resources' | 'economy' }
  | { kind: 'heal'; amount: number }
  | { kind: 'fortify' }
  | { kind: 'empty' };

export type Hex = {
  coord: HexCoord;
  terrain: HexTerrain;
  isSpawnZone: boolean;
  spawnZoneOwnerRace?: RaceId;
  /** True once the spawn zone has been destroyed (all Dhakhan units cleared). */
  spawnZoneDestroyed?: boolean;
  isCapital: boolean;
  capitalOwnerId?: string;
  /** Reference only — the Stack is stored in GameState.era3Stacks keyed by id. */
  stackId: string | null;
  /** Pre-rolled reward for `ruins` terrain. Undefined for other terrains or after looting.
   *  Populated at map-gen time so the outcome is deterministic from `state.seed`. */
  ruinsReward?: RuinsReward;
  /** True once a player has entered this hex and collected its reward (or rolled empty). */
  ruinsLooted?: boolean;
  /** Standalone fort on this hex — doubles defense for any stack occupying it. */
  hasFort?: boolean;
  /** Road overlay on a non-road terrain (mountain/desert) — reduces move cost without changing terrain. */
  hasRoadOverlay?: boolean;
  /** Bridge built on this river hex — makes crossing possible (move cost = road). */
  hasBridge?: boolean;
  /** Original terrain before a road was paved over it (for visual rendering). */
  roadTerrain?: HexTerrain;
};

export type GameMap = {
  radius: number;
  hexes: Record<string, Hex>;
};

export type Unit = {
  id: string;
  type: UnitType;
  ownerId: string;
  currentHp: number;
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  /** Number of combats this unit survived as winner. At VETERAN_WIN_THRESHOLD
   *  it gains the veteran bonus (handled at read-time via unit helpers). */
  wins?: number;
};

export type Stack = {
  id: string;
  ownerId: string;
  units: Unit[];
  position: HexCoord;
  movementLeft: number;
  /** Id of the general currently leading this stack (if any). A stack needs
   *  at least GENERAL_MIN_STACK_SIZE units to host a general. */
  generalId?: string | null;
  /** When true the stack is fortified: defense doubled, cannot move until unforfied. */
  fortified?: boolean;
  /** True if the stack has already taken its one special action (rest/fortify/terraform) this turn. */
  hasActedThisTurn?: boolean;
};

/**
 * A commander the player can assign to a stack of 3+ units for a flat attack
 * and defense boost across the whole army. Players start Era III with one
 * general from their race; additional generals are unlocked by cards.
 */
export type General = {
  id: string;
  name: string;
  ownerId: string;
  /** Per-unit attack bonus granted to the stack this general is leading. */
  attackBonus: number;
  /** Per-unit defense bonus granted to the stack this general is leading. */
  defenseBonus: number;
  /** Stack id the general is currently leading, or null when in reserve. */
  assignedStackId: string | null;
};

export type PlayerEra3State = {
  capitalCoord: HexCoord;
  goldCoins: number;
  /** Accumulated food reserves. Positive = surplus, negative triggers starvation. */
  foodReserves: number;
  techLevels: Record<TechType, number>;
  /** Units that couldn't fit in the initial stack (exceeded MAX_STACK_SIZE). */
  initialDeploymentOverflow?: FreeUnitGrant[];
  /** Set when the player's capital is captured by Wrought. */
  eliminated?: boolean;
  /** Number of units recruited in the current turn (reset on turn start). */
  recruitsThisTurn?: number;
  /** Number of road hexes paved in the current turn (reset on turn start). */
  roadsBuiltThisTurn?: number;
  /** Generals the player has available (some assigned to stacks, others in reserve). */
  generals?: General[];
  /** Set to true when food went negative and the player must choose a unit to disband. */
  era3StarvationPending?: boolean;
  /** Permanent bonus gold added each cycle (from legendary cards). */
  permanentGoldBonus?: number;
  /** Permanent bonus food added each cycle (from legendary cards). */
  permanentFoodBonus?: number;
};

export type CombatEntry = {
  turnNumber: number;
  at: HexCoord;
  /** Primary attacker stack id (the one that initiated the attack). */
  attackerStackId: string;
  defenderStackId: string;
  attackerOwnerId: string;
  defenderOwnerId: string;
  /** Total damage dealt to the defender across all attacking stacks. */
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  attackerUnitsLost: number;
  defenderUnitsLost: number;
  attackerWiped: boolean;
  defenderWiped: boolean;
  /** Additional attacking stack ids that flanked (adjacent, same owner). Empty for single attacker. */
  flankingStackIds?: string[];
  /** Was this combat triggered by movement (classic) or a direct attack action? */
  kind?: 'move_into' | 'attack' | 'ranged';
};

/**
 * Emitted when a stack enters a not-yet-looted ruins hex. Appended to
 * `GameState.era3RuinsLog` so the UI can show a narrative feed.
 */
export type RuinsLootEntry = {
  turnNumber: number;
  at: HexCoord;
  playerId: string;
  reward: RuinsReward;
};
