import type { TerrainType } from './terrain.js';
import type { TechType } from './era2.js';

/** All possible actions across all eras */
export type GameAction =
  // ── Era I ──
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
  | { type: 'RESOLVE_EFFECT'; playerId: string; resolution: Record<string, unknown> }

  // ── Era II ──
  | { type: 'ADVANCE_ERA2_PHASE' }
  | { type: 'CHOOSE_ERA2_CARD'; playerId: string; cardId: string }
  | { type: 'PROPOSE_TRANSFER'; fromPlayerId: string; toPlayerId: string; pointsOffered: number }
  | { type: 'ACCEPT_TRANSFER'; playerId: string; transferId: string }
  | { type: 'REJECT_TRANSFER'; playerId: string; transferId: string }
  | { type: 'MARK_KINGS_TABLE_READY'; playerId: string }
  | { type: 'SET_TECH_LEVEL'; playerId: string; tech: TechType; targetLevel: number }
  | { type: 'RESET_ALLOCATION'; playerId: string }
  | { type: 'CONFIRM_ALLOCATION'; playerId: string }
  | { type: 'CONVERT_SURPLUS'; playerId: string }

  // ── Era III (stub) ──
  | { type: 'ADVANCE_ERA3_PHASE' };
