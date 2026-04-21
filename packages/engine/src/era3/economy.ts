import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { Stack, Unit } from '../types/era3.js';
import type { UnitType } from '../types/era2.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';
import {
  ERA3_BASE_INCOME,
  ERA3_RECRUIT_COSTS,
  ERA3_RECRUITS_PER_TURN,
  ERA3_WAR_ATTACK_PER_LEVEL,
  ERA3_WAR_RECRUITS_PER_LEVEL,
  ERA3_RESOURCES_STACK_SIZE_PER_LEVEL,
  ERA3_SCIENCE_UNIT_REQS,
  MAX_STACK_SIZE,
  ERA3_HOME_TERRAIN_BONUS,
} from './constants.js';
import { hexKey } from './hex.js';
import { getRaceById } from '../races/index.js';

/**
 * Per-unit attack bonus applied to every unit in `stack`, based on the
 * owner's Era III War tech level. Dhakhan and any other non-player owner
 * yield 0. Player not found also yields 0 (defensive).
 */
export function warAttackBonus(stack: Stack, players: Player[]): number {
  const owner = players.find(p => p.id === stack.ownerId);
  if (!owner?.era3State) return 0;
  const war = Math.min(owner.era3State.techLevels.war ?? 0, ERA3_WAR_ATTACK_PER_LEVEL.length - 1);
  return ERA3_WAR_ATTACK_PER_LEVEL[war] ?? 0;
}

/**
 * Sum of per-unit attack bonuses that apply to `stack`:
 *   war tech passive + world_era3 global passive (non-Dhakhan) + turn-effect
 *   attack boost for the stack's owner.
 * Dhakhan gets war passive 0 and global passive 0, but turn effects don't
 * apply to Dhakhan either (they're keyed by player id).
 */
export function totalAttackBonus(
  stack: Stack,
  state: { players: Player[]; era3PassiveAttackBonus?: number; era3TurnEffects?: { attackBoost: Record<string, number> }; map?: { hexes: Record<string, { terrain: string }> } },
): number {
  const war = warAttackBonus(stack, state.players);
  const globalPassive = stack.ownerId !== 'dhakhan' ? (state.era3PassiveAttackBonus ?? 0) : 0;
  const turnBoost = state.era3TurnEffects?.attackBoost[stack.ownerId] ?? 0;
  const generalBoost = generalAttackBonus(stack, state.players);
  const homeTerrain = homeTerrainBonus(stack, state.players, state.map);
  return war + globalPassive + turnBoost + generalBoost + homeTerrain;
}

/** +ERA3_HOME_TERRAIN_BONUS per unit when stack is fighting on its race's favorable terrain. */
function homeTerrainBonus(
  stack: Stack,
  players: Player[],
  map?: { hexes: Record<string, { terrain: string }> },
): number {
  if (!map || stack.ownerId === 'dhakhan') return 0;
  const owner = players.find(p => p.id === stack.ownerId);
  if (!owner?.raceId) return 0;
  const race = getRaceById(owner.raceId);
  if (!race) return 0;
  const hex = map.hexes[hexKey(stack.position)];
  if (!hex) return 0;
  // Era 3 terrains: plain/mountain/forest/swamp map directly to Era 1 terrains.
  if (hex.terrain === race.favorableTerrain) return ERA3_HOME_TERRAIN_BONUS;
  return 0;
}

/**
 * Per-unit attack bonus contributed by the general leading this stack (if any).
 * Lookup walks the owning player's `era3State.generals` list.
 */
function generalAttackBonus(stack: Stack, players: Player[]): number {
  if (!stack.generalId) return 0;
  const owner = players.find(p => p.id === stack.ownerId);
  const general = owner?.era3State?.generals?.find(g => g.id === stack.generalId);
  return general?.attackBonus ?? 0;
}

/**
 * Returns how many recruits per turn the player gets based on War tech level.
 */
export function recruitsPerTurn(player: Player): number {
  const war = Math.min(player.era3State?.techLevels.war ?? 0, ERA3_WAR_RECRUITS_PER_LEVEL.length - 1);
  return ERA3_WAR_RECRUITS_PER_LEVEL[war] ?? ERA3_RECRUITS_PER_TURN;
}

/**
 * Returns the max stack size the player can field based on Resources tech level.
 */
export function maxStackSize(player: Player): number {
  const res = Math.min(player.era3State?.techLevels.resources ?? 0, ERA3_RESOURCES_STACK_SIZE_PER_LEVEL.length - 1);
  return Math.min(ERA3_RESOURCES_STACK_SIZE_PER_LEVEL[res] ?? MAX_STACK_SIZE, MAX_STACK_SIZE);
}

/**
 * Returns whether the player's science level allows recruiting the given unit type.
 */
export function scienceAllowsUnit(player: Player, unitType: UnitType): boolean {
  const science = player.era3State?.techLevels.science ?? 0;
  const req = ERA3_SCIENCE_UNIT_REQS[unitType] ?? 0;
  return science >= req;
}

/**
 * Compute end-of-cycle gold income for a player: base + economy tech level.
 * Eliminated players earn nothing.
 */
export function cycleIncome(player: Player): number {
  if (!player.era3State || player.era3State.eliminated) return 0;
  return ERA3_BASE_INCOME + (player.era3State.techLevels.economy ?? 0);
}

/**
 * Apply cycle income to every active player. Pure; returns a new players array.
 */
export function applyCycleIncome(players: Player[]): Player[] {
  return players.map(p => {
    if (!p.era3State || p.era3State.eliminated) return p;
    const income = cycleIncome(p);
    if (income === 0) return p;
    return {
      ...p,
      era3State: { ...p.era3State, goldCoins: p.era3State.goldCoins + income },
    };
  });
}

function unitMaxHp(type: UnitType): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  return def ? def.defense + 2 : 3;
}

export type RecruitValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate a RECRUIT_UNIT action without mutating state. Used by reducer
 * and by UI to gate the recruit button.
 */
export function validateRecruit(
  state: GameState,
  playerId: string,
  unitType: UnitType,
): RecruitValidation {
  if (state.phase !== 'era3' || (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn')) {
    return { ok: false, reason: 'Not in Era III game loop' };
  }
  if (state.era3CurrentPlayerId !== playerId) {
    return { ok: false, reason: 'Not your turn' };
  }
  const player = state.players.find(p => p.id === playerId);
  if (!player?.era3State) return { ok: false, reason: 'No era3State' };
  if (player.era3State.eliminated) return { ok: false, reason: 'Eliminated' };

  const cost = ERA3_RECRUIT_COSTS[unitType];
  if (cost === undefined) return { ok: false, reason: 'Unknown unit type' };

  if (!scienceAllowsUnit(player, unitType)) {
    return { ok: false, reason: 'science_too_low' };
  }

  if (player.era3State.goldCoins < cost) {
    return { ok: false, reason: 'Not enough gold' };
  }
  const maxRecruits = recruitsPerTurn(player);
  if ((player.era3State.recruitsThisTurn ?? 0) >= maxRecruits) {
    return { ok: false, reason: 'Already recruited this turn' };
  }

  if (!state.map || !state.era3Stacks) {
    return { ok: false, reason: 'No map' };
  }
  const capKey = hexKey(player.era3State.capitalCoord);
  const capHex = state.map.hexes[capKey];
  if (!capHex) return { ok: false, reason: 'Capital hex missing' };

  const stackSizeCap = maxStackSize(player);
  const existingStackId = capHex.stackId;
  if (existingStackId) {
    const existing = state.era3Stacks[existingStackId];
    if (!existing) return { ok: false, reason: 'Stack reference is stale' };
    if (existing.ownerId !== playerId) {
      return { ok: false, reason: 'Capital is occupied by another stack' };
    }
    if (existing.units.length >= stackSizeCap) {
      return { ok: false, reason: 'Stack is full' };
    }
  }
  return { ok: true };
}

/**
 * Execute a recruit. Assumes validation has passed (throws otherwise).
 * Pure — returns a new GameState.
 */
export function recruitUnit(
  state: GameState,
  playerId: string,
  unitType: UnitType,
): GameState {
  const v = validateRecruit(state, playerId, unitType);
  if (!v.ok) throw new Error(`RECRUIT_UNIT rejected: ${v.reason}`);

  const player = state.players.find(p => p.id === playerId)!;
  const era3 = player.era3State!;
  const cost = ERA3_RECRUIT_COSTS[unitType];
  const capKey = hexKey(era3.capitalCoord);
  const capHex = state.map!.hexes[capKey];

  const unitSeq = (state.era3UnitSeq ?? 0) + 1;
  const newUnit: Unit = {
    id: `unit_${state.seed}_r_${unitSeq}`,
    type: unitType,
    ownerId: playerId,
    currentHp: unitMaxHp(unitType),
    hasMovedThisTurn: true,     // can't act the turn it's recruited
    hasAttackedThisTurn: true,
  };

  const newStacks = { ...(state.era3Stacks ?? {}) };
  const newHexes = { ...state.map!.hexes };

  let stackId = capHex.stackId;
  if (stackId && newStacks[stackId] && newStacks[stackId].ownerId === playerId) {
    const existing = newStacks[stackId];
    newStacks[stackId] = { ...existing, units: [...existing.units, newUnit] };
  } else {
    const stackCounter = Object.keys(newStacks).length;
    stackId = `stack_${state.seed}_r_${stackCounter}`;
    newStacks[stackId] = {
      id: stackId,
      ownerId: playerId,
      units: [newUnit],
      position: era3.capitalCoord,
      movementLeft: 0,
    };
    newHexes[capKey] = { ...capHex, stackId };
  }

  const updatedPlayers = state.players.map(p =>
    p.id === playerId
      ? {
          ...p,
          era3State: {
            ...era3,
            goldCoins: era3.goldCoins - cost,
            recruitsThisTurn: (era3.recruitsThisTurn ?? 0) + 1,
          },
        }
      : p,
  );

  return {
    ...state,
    players: updatedPlayers,
    map: { ...state.map!, hexes: newHexes },
    era3Stacks: newStacks,
    era3UnitSeq: unitSeq,
  };
}

