import type { Player } from './player.js';
import type { TerrainType } from './terrain.js';
import type { WorldCard, EraCard, RelicCard } from './cards.js';
import type { Era2Phase, Era3Phase, TransferProposal } from './era2.js';

export type GameMode = 'solo' | 'solo_bots' | 'multiplayer';
export type GamePhase = 'era1' | 'era2' | 'era3';

export type Era1Phase =
  | 'setup'
  | 'world_card_reveal'
  | 'era_cards_deal'
  | 'relics_deal'
  | 'draw_tiles'
  | 'trade'
  | 'placement'
  | 'scoring'
  | 'complete';

export type SoloVariant = 'alliance' | 'last_kingdom';

export type TradeProposal = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  tileOffered: TerrainType;
  tileRequested: TerrainType;
  status: 'pending' | 'accepted' | 'rejected';
};

export type GameState = {
  id: string;
  mode: GameMode;
  soloVariant: SoloVariant | null;
  phase: GamePhase;
  era1Phase: Era1Phase;
  era2Phase?: Era2Phase;
  era3Phase?: Era3Phase;
  players: Player[];
  tilePile: TerrainType[];
  worldCard: WorldCard | null;
  /** Era II world card revealed when Era II starts */
  worldCardEra2?: WorldCard | null;
  activeTrades: TradeProposal[];
  /** Era II transfer proposals during Kings Table */
  activeTransfers?: TransferProposal[];
  /** Players who have marked themselves ready to close the Kings Table */
  kingsTableReady?: string[];
  /** Doom clock (12 = default Saga init, 0 = disabled). Decreased by world/era cards. */
  doomClock?: number;
  /** Seed for the deterministic random number generator */
  seed: number;
  /** Room code for multiplayer */
  roomCode: string | null;
  createdAt: number;
  /** Flag set by skip_trade_phase — if true, the trade phase is skipped */
  skipTradePhase?: boolean;
  /** Modified road requirement from card effects */
  roadRequirement?: number;
  /** Pending era card choices per player (3 cards to choose from) */
  pendingEraCards?: Record<string, EraCard[]>;
  /** Pending Era II card choices per player (3 cards to choose from) */
  pendingEra2Cards?: Record<string, EraCard[]>;
  /** Pending relic choices per player (3 relics to choose from) */
  pendingRelics?: Record<string, RelicCard[]>;
};

export type GameConfig = {
  mode: GameMode;
  soloVariant?: SoloVariant;
  playerConfigs: PlayerConfig[];
  seed?: number;
};

export type PlayerConfig = {
  name: string;
  raceId: string;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
};
