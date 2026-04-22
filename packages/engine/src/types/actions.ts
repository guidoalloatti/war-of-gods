import type { TerrainType } from './terrain.js';
import type { TechType } from './era2.js';

/** All possible actions across all eras */
export type GameAction =
  // ── Era I ──
  | { type: 'ADVANCE_PHASE' }
  | { type: 'DRAW_TILES'; playerId: string }
  | { type: 'PROPOSE_TRADE'; fromPlayerId: string; toPlayerId: string; tileOffered: TerrainType; tileRequested: TerrainType }
  | { type: 'ACCEPT_TRADE'; tradeId: string; playerId?: string }
  | { type: 'REJECT_TRADE'; tradeId: string; playerId?: string }
  | { type: 'END_TRADE_PHASE' }
  | { type: 'SOLO_TRADE'; playerId: string; discardTiles: [TerrainType, TerrainType] }
  | { type: 'PLACE_TILES'; playerId: string; boardCells?: Array<{ q: number; r: number; terrain: string | null }> }
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

  // ── Era III ──
  | { type: 'ADVANCE_ERA3_PHASE' }
  | { type: 'START_ERA3_GAME_LOOP' }
  | { type: 'MOVE_STACK'; playerId: string; stackId: string; path: { q: number; r: number }[] }
  | { type: 'ATTACK_STACK'; playerId: string; attackerStackId: string; targetCoord: { q: number; r: number } }
  | { type: 'END_TURN'; playerId: string }
  | { type: 'RECRUIT_UNIT'; playerId: string; unitType: 'infantry' | 'ranged' | 'mounted' | 'siege' | 'flying' }
  | { type: 'PLAY_ERA3_CARD'; playerId: string; cardId: string; targetStackId?: string }
  | { type: 'BUILD_ROAD'; playerId: string; coord: { q: number; r: number } }
  | { type: 'SPLIT_STACK'; playerId: string; stackId: string; unitIds: string[] }
  | { type: 'RANGED_ATTACK'; playerId: string; attackerStackId: string; targetCoord: { q: number; r: number } }
  | { type: 'ASSIGN_GENERAL'; playerId: string; generalId: string; stackId: string }
  | { type: 'UNASSIGN_GENERAL'; playerId: string; stackId: string }
  | { type: 'REST_STACK'; playerId: string; stackId: string }
  | { type: 'FORTIFY_STACK'; playerId: string; stackId: string }
  | { type: 'UNFORTIFY_STACK'; playerId: string; stackId: string }
  | { type: 'DISBAND_UNIT'; playerId: string; stackId: string; unitId: string }
  | { type: 'TERRAFORM'; playerId: string; stackId: string; coord: { q: number; r: number } }
  | { type: 'BUILD_ROAD_OVERLAY'; playerId: string; stackId: string; coord: { q: number; r: number } }
  | { type: 'DRAIN_WATER'; playerId: string; stackId: string; coord: { q: number; r: number } }
  | { type: 'BUILD_BRIDGE'; playerId: string; stackId: string; coord: { q: number; r: number } }
  | { type: 'DESTROY_SPAWN_ZONE'; playerId: string; stackId: string; coord: { q: number; r: number } }
  | { type: 'ERA3_UPGRADE_TECH'; playerId: string; tech: TechType }
  | { type: 'ERA3_CONTINUE_ETERNAL' }
  | { type: 'PICK_CARD_OFFER'; playerId: string; cardId: string }
  | { type: 'DISCARD_CARD_OFFER'; playerId: string }
  | { type: 'MERGE_STACKS'; playerId: string; sourceStackId: string; targetStackId: string }
  | { type: 'TRADE_GOLD_FOR_FOOD'; playerId: string; amount: number }
  | { type: 'TRADE_FOOD_FOR_GOLD'; playerId: string; amount: number }
  | { type: 'DISBAND_UNIT_STARVATION'; playerId: string; stackId: string; unitId: string };
