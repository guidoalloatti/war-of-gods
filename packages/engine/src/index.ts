// Types
export type {
  TerrainType, RaceId, Race,
  WorldCard, EraCard, RelicCard,
  Player, GameState, GameConfig, GameMode, GameAction,
} from './types/index.js';
export type {
  TechType, UnitType, Era2Phase, Era3Phase,
  FreeUnitGrant, PlayerEra2State, Era2TransferProposal,
} from './types/index.js';
export { TECH_TYPES, UNIT_TYPES, getRoadBonus } from './types/index.js';

// Races
export { getAllRaces, getRaceById } from './races/index.js';

// State / game creation
export { createGame, createRng } from './state/index.js';

// Top-level reducer (dispatches by state.phase)
export { gameReducer } from './reducer.js';

// Era I engine
export { era1Reducer, calculateScoreBreakdown } from './era1/index.js';
export type { ScoreBreakdown } from './era1/index.js';

// Era II engine (constants, cost calculators, init helpers)
export {
  TECH_COSTS, TECH_BENEFITS, SCIENCE_UNLOCK_ORDER, RACIAL_BONUSES, UNIT_DEFINITIONS,
  DEFAULT_DOOM_CLOCK, MIN_CONSTRUCTION_POINTS,
  getIncrementalCost,
  calculateTechCost, calculateTotalSpent, convertSurplusToGold, computeTransferDelta,
  initDoomClock, initPlayerEra2State,
} from './era2/index.js';
export { era2Reducer } from './era2/reducer.js';

// Era III stub
export { era3Reducer } from './era3/index.js';

// Bots
export { EasyBot } from './bots/index.js';
export type { Bot } from './bots/index.js';

// Names
export { generateFullName } from './names/index.js';
