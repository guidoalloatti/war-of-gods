import type { GameState, GameConfig } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';
import { createRng } from './random.js';
import { createTilePile } from './tiles.js';
import { getRaceById } from '../races/index.js';

/** Creates a new game state from the given configuration */
export function createGame(config: GameConfig): GameState {
  const seed = config.seed ?? Math.floor(Math.random() * 2147483647);
  const rng = createRng(seed);

  // Validate configuration
  if (config.playerConfigs.length < 1 || config.playerConfigs.length > 6) {
    throw new Error('Between 1 and 6 players are required');
  }

  // Validate that races exist and are not duplicated
  const raceIds = new Set<string>();
  for (const pc of config.playerConfigs) {
    getRaceById(pc.raceId as RaceId); // Throws if not found
    if (raceIds.has(pc.raceId)) {
      throw new Error(`Duplicate race: ${pc.raceId}`);
    }
    raceIds.add(pc.raceId);
  }

  const players: Player[] = config.playerConfigs.map((pc, i) => ({
    id: `player_${i + 1}`,
    name: pc.name,
    raceId: pc.raceId as RaceId,
    isBot: pc.isBot,
    botDifficulty: pc.botDifficulty ?? null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [],
    relic: null,
    score: null,
    hasTraded: false,
    hasPlaced: false,
    connected: !pc.isBot,
  }));

  const tilePile = createTilePile(rng);

  return {
    id: `game_${Date.now()}`,
    mode: config.mode,
    soloVariant: config.soloVariant ?? null,
    phase: 'era1',
    era1Phase: 'setup',
    players,
    tilePile,
    worldCard: null,
    activeTrades: [],
    seed,
    roomCode: null,
    createdAt: Date.now(),
    era3MaxTurns: config.gameLengthTurns ?? 20,
  };
}
