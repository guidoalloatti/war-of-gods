import type { EraCard } from './cards.js';

export type TechType = 'war' | 'science' | 'resources' | 'economy' | 'religion';

export const TECH_TYPES: readonly TechType[] = ['war', 'science', 'resources', 'economy', 'religion'];

export type UnitType = 'infantry' | 'ranged' | 'mounted' | 'siege' | 'flying';

export const UNIT_TYPES: readonly UnitType[] = ['infantry', 'ranged', 'mounted', 'siege', 'flying'];

export type Era2Phase =
  | 'world_card_reveal'
  | 'era_cards_deal'
  | 'apply_penalties'
  | 'apply_era1_effects'
  | 'kings_table'
  | 'tech_allocation'
  | 'review'
  | 'convert_surplus'
  | 'complete';

export type Era3Phase =
  | 'map_generation'
  | 'initial_deployment'
  | 'awaiting_next_session'
  | 'world_card_reveal'
  | 'era_cards_deal'
  | 'game_loop'
  | 'final_heroic_turn'
  | 'victory'
  | 'defeat';

export type TransferProposal = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  pointsOffered: number;
  pointsReceived: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
};

export type FreeUnitGrant = {
  unit: UnitType;
  count: number;
};

export type PlayerEra2State = {
  constructionPoints: number;
  pointsSpent: number;
  pointsGiven: number;
  pointsReceived: number;
  techLevels: Record<TechType, number>;
  /** Snapshot of techLevels granted for free at transition (racial + Era I free_tech).
   *  Allocation costs count only levels beyond this baseline. */
  baselineTechLevels: Record<TechType, number>;
  freeLevelsRemaining: Record<TechType, number>;
  goldCoins: number;
  freeUnitsForEra3: FreeUnitGrant[];
  reallocationsUsed: number;
  reallocationsAllowed: number;
  allowLevel6: boolean;
  costModifiers: {
    flat: Record<TechType, number>;
    perLevel: Record<TechType, number>;
    minCostPerLevel: number;
  };
  transferModifiers: {
    giveRatio: number;
    receiveRatio: number;
    surplusRatio: number;
  };
  pendingCardChoices?: EraCard[];
  chosenEra2Card?: EraCard;
  lockedOutTech?: TechType;
  hasConfirmed: boolean;
  hasConvertedSurplus: boolean;
};
