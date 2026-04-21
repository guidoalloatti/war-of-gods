import type { RaceId } from './race.js';
import type { TerrainType } from './terrain.js';
import type { EraCard, RelicCard } from './cards.js';
import type { FreeUnitGrant, PlayerEra2State, TechType } from './era2.js';
import type { PlayerEra3State } from './era3.js';

export type Player = {
  id: string;
  name: string;
  raceId: RaceId;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  /** Tiles in the player's hand, counted by type */
  tiles: Record<TerrainType, number>;
  /** Assigned era cards */
  eraCards: EraCard[];
  /** Assigned relic (max 1) */
  relic: RelicCard | null;
  /** Score calculated at the end of the era */
  score: number | null;
  /** Whether the player has completed their trade in the trade phase */
  hasTraded: boolean;
  /** Whether the player has placed their tiles in the placement phase */
  hasPlaced: boolean;
  connected: boolean;

  // ── Fields injected by the effect-dispatcher ──
  /** Pending interactive effect that needs player resolution */
  pendingEffect?: {
    type: string;
    params: Record<string, unknown>;
    /** Which era the effect belongs to, so the UI knows which modal to show */
    resolutionKind?: 'era1' | 'era2';
  };
  /** Modifier to the number of tiles to draw (e.g. +2 or -2) */
  drawCountModifier?: number;
  /** Max tiles tradeable per trade (default 1) */
  tradeLimit?: number;
  /** Extra points accumulated from card effects */
  cardBonusPoints?: number;
  /** Free tech levels granted by cards (stackable — multiple entries accumulate) */
  freeTechLevels?: Array<{ tech: TechType; level: number }>;
  /** Free units granted by cards (accumulates for Era III, merged into era2State on transition) */
  freeUnits?: FreeUnitGrant[];
  /** Extra relics the player is entitled to pick (from `extra_relic`). Default 1 via normal flow. */
  extraRelicsAllowed?: number;
  /** Era II state (populated at transition from Era I) */
  era2State?: PlayerEra2State;
  /** Era III state (populated at transition from Era II) */
  era3State?: PlayerEra3State;
};

export type BotDifficulty = 'easy' | 'medium' | 'hard';
