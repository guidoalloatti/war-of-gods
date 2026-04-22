import type { Player } from './player.js';
import type { TerrainType } from './terrain.js';
import type { WorldCard, EraCard, RelicCard } from './cards.js';
import type { Era2Phase, Era3Phase, TransferProposal } from './era2.js';
import type { GameMap, Stack, CombatEntry, RuinsLootEntry } from './era3.js';

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
  /** Era III hex map (populated at Era II → Era III transition) */
  map?: GameMap;
  /** Era III stacks, keyed by stack id. Hexes reference stacks via `stackId`. */
  era3Stacks?: Record<string, Stack>;
  /** Era III turn order — frozen at game_loop start (player IDs). */
  era3TurnOrder?: string[];
  /** Player ID whose turn it is during `game_loop`. */
  era3CurrentPlayerId?: string | null;
  /** Turn counter (1-indexed), increments when turn order wraps. */
  era3TurnNumber?: number;
  /** Append-only combat log (most recent last). */
  era3CombatLog?: CombatEntry[];
  /** Append-only ruins-loot log (most recent last). */
  era3RuinsLog?: RuinsLootEntry[];
  /** Era III world card revealed at Era III start (persistent global effects). */
  worldCardEra3?: WorldCard | null;
  /** Shuffled Era III deck not yet drawn into a player hand. */
  era3Deck?: EraCard[];
  /** Per-player hand of Era III cards (full card records; ownership tracked via assignedTo). */
  era3Hands?: Record<string, EraCard[]>;
  /** Global per-player passive attack bonus (from world_era3 cards). */
  era3PassiveAttackBonus?: number;
  /** Per-turn effects applied by Era III era cards; cleared on END_TURN for the acting player. */
  era3TurnEffects?: Era3TurnEffects;
  /** Per-player: number of cards played this turn (max 2). */
  era3CardPlayedThisTurn?: Record<string, number>;
  /** Per-player: two card options offered at start of turn (pick one, discard the other). */
  era3CardOffers?: Record<string, EraCard[]>;
  /**
   * Once any player stack reaches a hex adjacent to the citadel while the
   * boss is alive, this flag is set. On the next cycle wrap the phase
   * advances to 'final_heroic_turn'.
   */
  era3HeroicTurnTriggered?: boolean;
  /**
   * During 'final_heroic_turn', each living player takes one last turn.
   * This records which players have already taken theirs (set-like).
   */
  era3HeroicTurnsTaken?: Record<string, boolean>;
  /** Player id who dealt the killing blow to the boss (if any). */
  era3BossKillerId?: string | null;
  /** Monotonically increasing counter for unique unit IDs in Era III. Never decreases. */
  era3UnitSeq?: number;
  /** Maximum number of full rounds in Era III. Defeat when era3TurnNumber exceeds this. */
  era3MaxTurns?: number;
  /**
   * Fog of War: per-player set of hex keys that have ever been visible to that player.
   * Key format: "q,r". Once a hex is added here it stays visible forever.
   * Record<playerId, Record<hexKey, true>>
   */
  era3ExploredHexes?: Record<string, Record<string, true>>;
};

export type Era3TurnEffects = {
  /** Per-player-id per-unit attack bonus during their current turn. */
  attackBoost: Record<string, number>;
  /** Per-player-id per-unit defense bonus during their current turn. */
  defenseBoost?: Record<string, number>;
  /** Per-player-id extra movement to each of their stacks this turn. */
  movementBonus: Record<string, number>;
};

export type GameConfig = {
  mode: GameMode;
  soloVariant?: SoloVariant;
  playerConfigs: PlayerConfig[];
  seed?: number;
  /** Maximum number of full rounds in Era III before defeat. Default 20. */
  gameLengthTurns?: number;
};

export type PlayerConfig = {
  name: string;
  raceId: string;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
};
