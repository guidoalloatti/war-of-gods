// Types
export type {
  TerrainType, RaceId, Race,
  WorldCard, EraCard, RelicCard, CardEffect,
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

// Era II engine (constants, cost calculators, init helpers, scoring, transition)
export {
  TECH_COSTS, TECH_BENEFITS, SCIENCE_UNLOCK_ORDER, RACIAL_BONUSES, RACE_TECH_MAX, UNIT_DEFINITIONS,
  DEFAULT_DOOM_CLOCK, MIN_CONSTRUCTION_POINTS,
  getIncrementalCost,
  calculateTechCost, calculateTotalSpent, convertSurplusToGold, computeTransferDelta,
  initDoomClock, initPlayerEra2State,
  isEra2PhaseComplete, nextEra2Phase,
  calculateEra2Score, calculateEra2ScoreBreakdown,
  transitionEraIToEra2,
} from './era2/index.js';
export type { Era2ScoreBreakdown } from './era2/scoring.js';
export { era2Reducer } from './era2/reducer.js';

// Era III engine (Sessions 1–2: map, hex math, deployment, turn loop, movement)
export {
  era3Reducer,
  MAP_RADIUS, CAPITAL_RING_RADIUS, SPAWN_RING_RADIUS, MAX_STACK_SIZE,
  TERRAIN_DISTRIBUTION,
  DIRECTIONS, hexKey, parseHexKey, hexEquals, hexAdd, hexSub,
  distance, neighbors, ring, disk, hexLine, hexLerp, hexRound,
  generateMap, computeCapitalPositions,
  initPlayerEra3State, buildInitialStack,
  transitionEra2ToEra3,
  ERA3_PHASE_ORDER, nextEra3Phase,
  getTerrainMoveCost, canEnterHex, reachableHexes, findPath, pathCost,
  computeTurnOrder, computeStackMovement, resetStacksForTurn, nextTurn,
  initGameLoopTurnState,
  resolveCombat, resolveFlankingCombat, stackAttackPower,
  spawnWroughtForCycle, runDhakhanTurn, isWroughtOwner, livingPlayers,
  buildBossStack, isBossAlive,
  DHAKHAN_OWNER_ID, WROUGHT_PER_SPAWN_PER_CYCLE,
  BOSS_STACK_ID, CITADEL_COORD,
  ERA3_BASE_INCOME, ERA3_RECRUIT_COSTS, ERA3_RECRUITS_PER_TURN,
  ERA3_WAR_RECRUITS_PER_LEVEL, ERA3_RESOURCES_STACK_SIZE_PER_LEVEL, ERA3_FOOD_CAPACITY_PER_LEVEL,
  ERA3_FOOD_PRODUCTION_PER_LEVEL, ERA3_FOOD_RESERVES_INITIAL,
  ERA3_SCIENCE_UNIT_REQS, ERA3_WAR_ATTACK_PER_LEVEL,
  ERA3_RELIGION_DEFENSE_REDUCTION, ERA3_RELIGION_MORALE_HEAL, ERA3_RELIGION_ROUT_THRESHOLD,
  ERA3_BUILD_ROAD_COST, ERA3_ROADS_PER_TURN,
  validateBuildRoad, buildRoad,
  VETERAN_WIN_THRESHOLD, VETERAN_ATK_BONUS, VETERAN_DEF_BONUS, VETERAN_HP_BONUS,
  isVeteran, unitMaxHp, unitAttack, unitDefense,
  ERA3_WAR_ATTACK_BONUS, ERA3_WAR_ATTACK_BONUS_THRESHOLD,
  cycleIncome, applyCycleIncome, validateRecruit, recruitUnit, warAttackBonus, totalAttackBonus,
  recruitsPerTurn, maxStackSize, scienceAllowsUnit,
  religionDefenseMultiplier, applyMoraleHeal,
  spiritualityRestHealBonus, spiritualityFortifyDefBonus,
  unitFoodCost, totalFoodConsumed, maxFoodCapacity, foodProduction, applyFoodCycle,
  ERA3_HAND_MAX_SIZE,
  playEra3Card, dealCardOffers, pickCardOffer, discardCardOffer, clearTurnEffectsFor, totalEra3CardsInPlay,
  rollRuinsReward, applyRuinsLoot, isLootableRuins,
  RUINS_GOLD_MIN, RUINS_GOLD_MAX,
  GENERAL_MIN_STACK_SIZE, GENERAL_ATTACK_BONUS, GENERAL_DEFENSE_BONUS,
  createStartingGeneral, assignGeneral, unassignGeneral, grantExtraGeneral, getGeneralForStack,
  REST_HEAL_FRACTION, DISBAND_REFUND_FRACTION, FORTIFY_DEFENSE_MULT, FORT_DEFENSE_MULT,
  TERRAFORM_COST, BUILD_ROAD_OVERLAY_COST, DRAIN_WATER_COST, BUILD_BRIDGE_COST,
  ERA3_TECH_UPGRADE_MULTIPLIER,
  computeVisibleHexes, updateExploredHexes, updateAllExploredHexes,
} from './era3/index.js';
export type { Era3TurnEffects } from './types/game.js';
export type {
  HexCoord, HexTerrain, Hex, GameMap, Unit, Stack, PlayerEra3State,
  CombatEntry, RuinsReward, RuinsLootEntry, General,
} from './types/index.js';

// Bots
export { EasyBot } from './bots/index.js';
export type { Bot } from './bots/index.js';

// Names
export { generateFullName } from './names/index.js';
