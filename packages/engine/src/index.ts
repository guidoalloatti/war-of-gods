// Tipos
export type {
  TerrainType, RaceId, Race, RaceAbility,
  WorldCard, EraCard, RelicCard, CardEffect,
  Player, BotDifficulty,
  GameState, GameConfig, PlayerConfig, GameMode, GamePhase, Era1Phase, SoloVariant, TradeProposal,
  GameAction,
} from './types/index.js';
export { TERRAIN_TYPES, INITIAL_TILE_COUNTS, TILES_PER_PLAYER, getRoadBonus } from './types/index.js';

// Razas
export { getAllRaces, getRaceById } from './races/index.js';

// Estado y creación de juego
export { createGame } from './state/index.js';
export { createRng, shuffle } from './state/index.js';

// Motor de Era I
export { era1Reducer, calculateScore, calculateScoreBreakdown } from './era1/index.js';
export type { ScoreBreakdown } from './era1/index.js';

// Cartas
export { worldCardDeck, eraCardDeck, relicCardDeck } from './cards/index.js';

// Names
export { generateName, generateFullName } from './names/index.js';

// Bots
export { EasyBot } from './bots/index.js';
export type { Bot } from './bots/index.js';
