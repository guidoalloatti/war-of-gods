import type { GameState } from '../types/game.js';
import type { HexCoord, HexTerrain } from '../types/era3.js';
import { hexKey, neighbors } from './hex.js';
import { ERA3_BUILD_ROAD_COST, ERA3_ROADS_PER_TURN, DHAKHAN_OWNER_ID } from './constants.js';

/** Terrains that can be paved into a road. */
const ROAD_PAVEABLE: ReadonlySet<HexTerrain> = new Set<HexTerrain>([
  'plain', 'forest', 'swamp', 'ruins',
]);

/**
 * Result of checking whether a player may build a road on a given hex.
 * Returns `null` if allowed, otherwise a human-readable reason (also used
 * as the error message in the reducer).
 */
export function validateBuildRoad(
  state: GameState,
  playerId: string,
  coord: HexCoord,
): string | null {
  if (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn') {
    return 'not_in_game_loop';
  }
  if (state.era3CurrentPlayerId !== playerId) return 'not_your_turn';
  if (!state.map || !state.era3Stacks) return 'no_map';

  const player = state.players.find(p => p.id === playerId);
  if (!player || !player.era3State) return 'no_player_state';
  if (player.era3State.eliminated) return 'eliminated';

  const hex = state.map.hexes[hexKey(coord)];
  if (!hex) return 'off_map';
  if (hex.isCapital) return 'cannot_pave_capital';
  if (hex.isSpawnZone) return 'cannot_pave_spawn';
  if (!ROAD_PAVEABLE.has(hex.terrain)) return 'terrain_not_paveable';
  if (hex.stackId) {
    const occ = state.era3Stacks[hex.stackId];
    if (occ && occ.ownerId === DHAKHAN_OWNER_ID) return 'hex_occupied_by_enemy';
  }

  // Must be adjacent to a friendly stack.
  const adjacentFriendly = neighbors(coord).some(n => {
    const h = state.map!.hexes[hexKey(n)];
    if (!h || !h.stackId) return false;
    const s = state.era3Stacks![h.stackId];
    return s && s.ownerId === playerId;
  });
  if (!adjacentFriendly) return 'no_friendly_adjacent';

  if ((player.era3State.roadsBuiltThisTurn ?? 0) >= ERA3_ROADS_PER_TURN) {
    return 'already_built_this_turn';
  }
  if (player.era3State.goldCoins < ERA3_BUILD_ROAD_COST) {
    return 'not_enough_gold';
  }

  return null;
}

/**
 * Pave a hex into a road. Deducts gold, increments the per-turn counter,
 * and updates the hex terrain. Throws if validation fails.
 */
export function buildRoad(
  state: GameState,
  playerId: string,
  coord: HexCoord,
): GameState {
  const err = validateBuildRoad(state, playerId, coord);
  if (err) throw new Error(err);

  const key = hexKey(coord);
  const hex = state.map!.hexes[key];
  const newHexes = { ...state.map!.hexes, [key]: { ...hex, terrain: 'road' as const } };
  const newPlayers = state.players.map(p => {
    if (p.id !== playerId || !p.era3State) return p;
    return {
      ...p,
      era3State: {
        ...p.era3State,
        goldCoins: p.era3State.goldCoins - ERA3_BUILD_ROAD_COST,
        roadsBuiltThisTurn: (p.era3State.roadsBuiltThisTurn ?? 0) + 1,
      },
    };
  });

  return {
    ...state,
    map: { ...state.map!, hexes: newHexes },
    players: newPlayers,
  };
}
