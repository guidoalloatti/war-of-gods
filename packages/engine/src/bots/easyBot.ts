import type { GameState } from '../types/game.js';
import type { GameAction } from '../types/actions.js';
import type { TerrainType } from '../types/terrain.js';
import type { Bot } from './types.js';

const TRADEABLE_TERRAINS: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

/**
 * Easy-level bot: makes random valid decisions.
 * No optimization — just picks legal actions at random.
 */
export class EasyBot implements Bot {
  private rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  decideAction(state: GameState, playerId: string): GameAction | null {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return null;

    switch (state.era1Phase) {
      case 'draw_tiles': {
        const tileCount = Object.values(player.tiles).reduce((a, b) => a + b, 0);
        if (tileCount === 0) {
          return { type: 'DRAW_TILES', playerId };
        }
        return null;
      }

      case 'trade': {
        if (player.hasTraded) return null;

        // Pick a random player to trade with
        const otherPlayers = state.players.filter(p => p.id !== playerId);
        if (otherPlayers.length === 0) return null;

        const target = otherPlayers[Math.floor(this.rng() * otherPlayers.length)];

        // Pick a tile we own to offer
        const ownedTiles = TRADEABLE_TERRAINS.filter(t => player.tiles[t] > 0);
        if (ownedTiles.length === 0) return null;

        const tileOffered = ownedTiles[Math.floor(this.rng() * ownedTiles.length)];

        // Pick a tile the other player has to request
        const targetTiles = TRADEABLE_TERRAINS.filter(t => target.tiles[t] > 0);
        if (targetTiles.length === 0) return null;

        const tileRequested = targetTiles[Math.floor(this.rng() * targetTiles.length)];

        return {
          type: 'PROPOSE_TRADE',
          fromPlayerId: playerId,
          toPlayerId: target.id,
          tileOffered,
          tileRequested,
        };
      }

      case 'placement': {
        if (!player.hasPlaced) {
          return { type: 'PLACE_TILES', playerId };
        }
        return null;
      }

      default:
        return null;
    }
  }
}
