import type { GameState } from '../types/game.js';
import type { Stack } from '../types/era3.js';
import type { Player } from '../types/player.js';
import { UNIT_DEFINITIONS } from '../era2/constants.js';

/**
 * Compute turn order for Era III game loop. Sorted by tech.war descending,
 * ties broken by player id ascending (deterministic).
 */
export function computeTurnOrder(players: Player[]): string[] {
  return [...players]
    .sort((a, b) => {
      const aWar = a.era3State?.techLevels.war ?? a.era2State?.techLevels.war ?? 0;
      const bWar = b.era3State?.techLevels.war ?? b.era2State?.techLevels.war ?? 0;
      if (aWar !== bWar) return bWar - aWar;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map(p => p.id);
}

/**
 * Movement-cost scale factor. Terrain costs are scaled so `road = 1` is
 * one-third of `plain = 3` while remaining integers. Stack movement budget
 * is multiplied by this same factor so 1 unit-movement = 1 plain hex.
 */
export const MOVEMENT_SCALE = 3;

/**
 * Movement budget per turn. Stacks have unlimited movement (large sentinel)
 * so any passable adjacent hex is always reachable.
 */
export const UNLIMITED_MOVEMENT = 9999;

/**
 * Base movement for a stack: min movement stat among all units × MOVEMENT_SCALE.
 * Mixed stacks are limited by the slowest unit type. Empty stacks return 0.
 * Movement is displayed as a budget but never enforced (stacks can always move).
 */
export function computeStackMovement(stack: Stack): number {
  if (stack.units.length === 0) return 0;
  let min = Infinity;
  for (const u of stack.units) {
    const m = UNIT_DEFINITIONS.find(d => d.id === u.type)?.movement ?? 1;
    if (m < min) min = m;
  }
  return min === Infinity ? MOVEMENT_SCALE : min * MOVEMENT_SCALE;
}

/**
 * Reset per-turn flags for every stack owned by `playerId`:
 * - `stack.movementLeft = computeStackMovement(stack)`
 * - each unit's `hasMovedThisTurn = false`, `hasAttackedThisTurn = false`
 *
 * Returns a new era3Stacks map (pure).
 */
export function resetStacksForTurn(
  stacks: Record<string, Stack>,
  playerId: string,
): Record<string, Stack> {
  const out: Record<string, Stack> = {};
  for (const [id, stack] of Object.entries(stacks)) {
    if (stack.ownerId !== playerId) {
      out[id] = stack;
      continue;
    }
    out[id] = {
      ...stack,
      movementLeft: computeStackMovement(stack),
      hasActedThisTurn: false,
      units: stack.units.map(u => ({
        ...u,
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
      })),
    };
  }
  return out;
}

/**
 * Advance turn: returns { nextPlayerId, nextTurnNumber }. Wraps order
 * and increments turn number when wrapping.
 */
export function nextTurn(
  order: string[],
  currentId: string | null,
  turnNumber: number,
): { nextPlayerId: string; nextTurnNumber: number } {
  if (order.length === 0) {
    throw new Error('Cannot advance turn with empty turn order');
  }
  if (!currentId) {
    return { nextPlayerId: order[0], nextTurnNumber: turnNumber };
  }
  const idx = order.indexOf(currentId);
  if (idx === -1) {
    return { nextPlayerId: order[0], nextTurnNumber: turnNumber + 1 };
  }
  const nextIdx = (idx + 1) % order.length;
  const wrapped = nextIdx === 0;
  return {
    nextPlayerId: order[nextIdx],
    nextTurnNumber: wrapped ? turnNumber + 1 : turnNumber,
  };
}

/**
 * Produce a state with turn flags initialized for a fresh game_loop:
 * turn order, first player set, turn 1, their stacks reset.
 */
export function initGameLoopTurnState(state: GameState): GameState {
  const order = computeTurnOrder(state.players);
  const first = order[0] ?? null;
  const stacks = state.era3Stacks ?? {};
  const reset = first ? resetStacksForTurn(stacks, first) : stacks;
  return {
    ...state,
    era3TurnOrder: order,
    era3CurrentPlayerId: first,
    era3TurnNumber: 1,
    era3Stacks: reset,
  };
}
