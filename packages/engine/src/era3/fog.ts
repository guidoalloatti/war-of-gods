import type { GameState } from '../types/game.js';
import type { Stack } from '../types/era3.js';
import { hexKey, distance } from './hex.js';
import { DHAKHAN_OWNER_ID } from './constants.js';

const CAPITAL_VISION = 3;

/** Vision range (in hex distance) for each unit type. */
const UNIT_VISION: Record<string, number> = {
  infantry: 2,
  ranged:   2,
  mounted:  2,
  siege:    3,
  flying:   3,
};

function stackVisionRange(stack: Stack): number {
  if (stack.units.length === 0) return 2;
  let max = 0;
  for (const u of stack.units) {
    const v = UNIT_VISION[u.type] ?? 2;
    if (v > max) max = v;
  }
  return max;
}

/**
 * Return the set of hex keys currently visible to `playerId` based on their
 * capital (range 3) and all stacks' positions and vision ranges.
 */
export function computeVisibleHexes(state: GameState, playerId: string): Set<string> {
  if (!state.map || !state.era3Stacks) return new Set();
  const visible = new Set<string>();
  const hexEntries = Object.entries(state.map.hexes);

  // Capital always provides vision around itself.
  const player = state.players.find(p => p.id === playerId);
  if (player?.era3State?.capitalCoord) {
    const cap = player.era3State.capitalCoord;
    for (const [key, hex] of hexEntries) {
      if (distance(cap, hex.coord) <= CAPITAL_VISION) {
        visible.add(key);
      }
    }
  }

  // Each player-owned stack contributes vision from its position.
  for (const stack of Object.values(state.era3Stacks)) {
    if (stack.ownerId !== playerId) continue;
    const range = stackVisionRange(stack);
    for (const [key, hex] of hexEntries) {
      if (distance(stack.position, hex.coord) <= range) {
        visible.add(key);
      }
    }
  }
  return visible;
}

/**
 * Update `era3ExploredHexes` for `playerId` by adding all currently visible hexes.
 * Pure — returns a new state.
 */
export function updateExploredHexes(state: GameState, playerId: string): GameState {
  if (!state.map) return state;
  const visible = computeVisibleHexes(state, playerId);
  if (visible.size === 0) return state;

  const prev = state.era3ExploredHexes ?? {};
  const playerPrev = prev[playerId] ?? {};
  let changed = false;
  const playerNext: Record<string, true> = { ...playerPrev };
  for (const key of visible) {
    if (!playerPrev[key]) {
      playerNext[key] = true;
      changed = true;
    }
  }
  if (!changed) return state;
  return {
    ...state,
    era3ExploredHexes: { ...prev, [playerId]: playerNext },
  };
}

/**
 * Update explored hexes for ALL players (used at turn start to initialize
 * visibility for their starting positions).
 */
export function updateAllExploredHexes(state: GameState): GameState {
  if (!state.map || !state.era3Stacks) return state;
  const playerIds = [...new Set(
    Object.values(state.era3Stacks)
      .filter(s => s.ownerId !== DHAKHAN_OWNER_ID)
      .map(s => s.ownerId),
  )];
  let next = state;
  for (const pid of playerIds) {
    next = updateExploredHexes(next, pid);
  }
  return next;
}
