import type { Player } from '../types/player.js';
import type { FreeUnitGrant, TechType } from '../types/era2.js';
import { TECH_TYPES } from '../types/era2.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';
import type { HexCoord, PlayerEra3State, Stack, Unit } from '../types/era3.js';
import { MAX_STACK_SIZE } from './constants.js';

/**
 * Session 3 baseline unit HP: defense + 2. Gives:
 *   infantry 3, ranged 4, mounted 4, siege 4, flying 5.
 *
 * Rationale: with HP = defense alone, symmetric single-round combat always
 * wipes both stacks (attack ≥ defense for every unit type). Adding +2 means
 * a 1v1 infantry fight ends with survivors on both sides, so movement has
 * consequences without every skirmish being mutual annihilation.
 */
function unitMaxHp(type: Unit['type']): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  return def ? def.defense + 2 : 3;
}

/**
 * Build the PlayerEra3State from the Era II snapshot. Pure — does not
 * touch stacks (see `buildInitialStack` for that side-effect).
 */
export function initPlayerEra3State(player: Player, capitalCoord: HexCoord): PlayerEra3State {
  if (!player.era2State) {
    throw new Error(`Player ${player.id} has no era2State — cannot transition to Era III`);
  }
  const era2 = player.era2State;

  const techSnapshot: Record<TechType, number> = {
    war: 0, science: 0, resources: 0, economy: 0,
  };
  for (const t of TECH_TYPES) techSnapshot[t] = era2.techLevels[t];

  return {
    capitalCoord,
    goldCoins: era2.goldCoins,
    techLevels: techSnapshot,
  };
}

/**
 * Expand the player's accumulated free units (from Era II) into individual
 * Unit records, capped at MAX_STACK_SIZE. Excess units go to `overflow`.
 *
 * IDs are deterministic: unit_${seed}_${runningCounter}. The counter is
 * threaded in via `unitCounter` so callers can place multiple players'
 * stacks deterministically in order.
 */
export function buildInitialStack(
  player: Player,
  capitalCoord: HexCoord,
  seed: number,
  stackCounter: number,
  unitCounter: number,
): { stack: Stack | null; overflow: FreeUnitGrant[]; unitsConsumed: number } {
  if (!player.era2State) {
    throw new Error(`Player ${player.id} has no era2State`);
  }

  const grants = player.era2State.freeUnitsForEra3;
  const flat: Array<FreeUnitGrant['unit']> = [];
  for (const g of grants) {
    for (let i = 0; i < g.count; i++) flat.push(g.unit);
  }

  if (flat.length === 0) {
    return { stack: null, overflow: [], unitsConsumed: 0 };
  }

  const assigned = flat.slice(0, MAX_STACK_SIZE);
  const leftover = flat.slice(MAX_STACK_SIZE);

  const units: Unit[] = assigned.map((type, i) => ({
    id: `unit_${seed}_${unitCounter + i}`,
    type,
    ownerId: player.id,
    currentHp: unitMaxHp(type),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
  }));

  const stack: Stack = {
    id: `stack_${seed}_${stackCounter}`,
    ownerId: player.id,
    units,
    position: capitalCoord,
    movementLeft: 0,
  };

  // Collapse leftover back into FreeUnitGrant form for clarity.
  const overflow = collapseToGrants(leftover);

  return { stack, overflow, unitsConsumed: assigned.length };
}

function collapseToGrants(flat: FreeUnitGrant['unit'][]): FreeUnitGrant[] {
  const counts = new Map<FreeUnitGrant['unit'], number>();
  for (const u of flat) counts.set(u, (counts.get(u) ?? 0) + 1);
  return Array.from(counts.entries()).map(([unit, count]) => ({ unit, count }));
}
