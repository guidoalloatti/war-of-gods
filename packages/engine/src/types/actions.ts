import type { TerrainType } from './terrain.js';

/** All possible actions in Era I */
export type GameAction =
  | { type: 'ADVANCE_PHASE' }
  | { type: 'DRAW_TILES'; playerId: string }
  | { type: 'PROPOSE_TRADE'; fromPlayerId: string; toPlayerId: string; tileOffered: TerrainType; tileRequested: TerrainType }
  | { type: 'ACCEPT_TRADE'; tradeId: string }
  | { type: 'REJECT_TRADE'; tradeId: string }
  | { type: 'END_TRADE_PHASE' }
  | { type: 'SOLO_TRADE'; playerId: string; discardTiles: [TerrainType, TerrainType] }
  | { type: 'PLACE_TILES'; playerId: string }
  | { type: 'CALCULATE_SCORES' }
  | { type: 'CHOOSE_ERA_CARD'; playerId: string; cardId: string }
  | { type: 'CHOOSE_RELIC'; playerId: string; relicId: string }
  | { type: 'RESOLVE_EFFECT'; playerId: string; resolution: Record<string, unknown> };
