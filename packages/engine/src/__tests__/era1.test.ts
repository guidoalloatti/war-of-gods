import { describe, it, expect } from 'vitest';
import { createGame } from '../state/createGame.js';
import { era1Reducer } from '../era1/actions.js';
import type { GameConfig, GameState } from '../types/game.js';

function createTestGame(overrides: Partial<GameConfig> = {}): GameState {
  return createGame({
    mode: 'solo_bots',
    seed: 12345,
    playerConfigs: [
      { name: 'Player 1', raceId: 'elf', isBot: false },
      { name: 'Bot 1', raceId: 'dwarf', isBot: true, botDifficulty: 'easy' },
    ],
    ...overrides,
  });
}

describe('Era I reducer', () => {
  describe('createGame', () => {
    it('creates a game with correct initial state', () => {
      const state = createTestGame();
      expect(state.phase).toBe('era1');
      expect(state.era1Phase).toBe('setup');
      expect(state.players).toHaveLength(2);
      expect(state.tilePile.length).toBeGreaterThan(0);
      expect(state.worldCard).toBeNull();
      expect(state.activeTrades).toEqual([]);
    });

    it('validates player count (1-6)', () => {
      expect(() => createGame({
        mode: 'solo', seed: 1,
        playerConfigs: [],
      })).toThrow('Between 1 and 6 players');
    });

    it('prevents duplicate races', () => {
      expect(() => createGame({
        mode: 'solo_bots', seed: 1,
        playerConfigs: [
          { name: 'P1', raceId: 'elf', isBot: false },
          { name: 'P2', raceId: 'elf', isBot: true },
        ],
      })).toThrow('Duplicate race');
    });

    it('initializes all players with 0 tiles', () => {
      const state = createTestGame();
      for (const player of state.players) {
        const totalTiles = Object.values(player.tiles).reduce((a, b) => a + b, 0);
        expect(totalTiles).toBe(0);
      }
    });
  });

  describe('phase advancement', () => {
    it('advances from setup to world_card_reveal', () => {
      const state = createTestGame();
      const next = era1Reducer(state, { type: 'ADVANCE_PHASE' });
      expect(next.era1Phase).toBe('world_card_reveal');
      expect(next.worldCard).not.toBeNull();
    });

    it('advances from world_card_reveal to era_cards_deal with pending choices', () => {
      let state = createTestGame();
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> world_card_reveal
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
      expect(state.era1Phase).toBe('era_cards_deal');
      // Bot auto-picks, but human player has pending choices
      const humanPending = state.pendingEraCards?.['player_1'];
      expect(humanPending).toBeDefined();
      expect(humanPending!.length).toBe(3);
      // Bot already picked
      expect(state.players[1].eraCards).toHaveLength(1);
    });

    it('human player chooses era card and advances to relics_deal', () => {
      let state = createTestGame();
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> world_card_reveal
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
      // Human picks first available card
      const choices = state.pendingEraCards!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_ERA_CARD', playerId: 'player_1', cardId: choices[0].id });
      expect(state.players[0].eraCards).toHaveLength(1);
      // Now all players have chosen, advance to relics_deal
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' });
      expect(state.era1Phase).toBe('relics_deal');
    });

    it('deals relics for 1-4 players', () => {
      let state = createTestGame(); // 2 players
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> world_card_reveal
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
      const choices = state.pendingEraCards!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_ERA_CARD', playerId: 'player_1', cardId: choices[0].id });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> relics_deal
      expect(state.era1Phase).toBe('relics_deal');
      // Bot auto-picks relic, human has pending choices
      const relicChoices = state.pendingRelics?.['player_1'];
      expect(relicChoices).toBeDefined();
      expect(relicChoices!.length).toBe(3);
      state = era1Reducer(state, { type: 'CHOOSE_RELIC', playerId: 'player_1', relicId: relicChoices![0].id });
      // Now all players have relics
      for (const player of state.players) {
        expect(player.relic).not.toBeNull();
      }
    });
  });

  describe('draw tiles', () => {
    function getDrawPhaseState(): GameState {
      let state = createTestGame();
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // setup -> world_card_reveal
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
      // Human picks era card
      const eraChoices = state.pendingEraCards!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_ERA_CARD', playerId: 'player_1', cardId: eraChoices[0].id });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> relics_deal
      // Human picks relic
      const relicChoices = state.pendingRelics!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_RELIC', playerId: 'player_1', relicId: relicChoices[0].id });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> draw_tiles
      return state;
    }

    it('allows each player to draw tiles', () => {
      let state = getDrawPhaseState();
      expect(state.era1Phase).toBe('draw_tiles');

      state = era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_1' });
      const p1Tiles = Object.values(state.players[0].tiles).reduce((a, b) => a + b, 0);
      expect(p1Tiles).toBe(18); // TILES_PER_PLAYER
    });

    it('prevents double-draw', () => {
      let state = getDrawPhaseState();
      state = era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_1' });
      expect(() => {
        era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_1' });
      }).toThrow('already drawn');
    });

    it('throws if not in draw_tiles phase', () => {
      const state = createTestGame();
      expect(() => {
        era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_1' });
      }).toThrow('draw_tiles phase');
    });

    it('guarantees at least 2 favorable terrain tiles', () => {
      for (let seed = 1; seed <= 20; seed++) {
        let state = createGame({
          mode: 'solo',
          seed,
          playerConfigs: [{ name: 'P', raceId: 'elf', isBot: false }],
        });
        state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> world_card_reveal
        state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
        // Solo player picks era card
        const eraChoices = state.pendingEraCards?.['player_1'];
        if (eraChoices && eraChoices.length > 0) {
          state = era1Reducer(state, { type: 'CHOOSE_ERA_CARD', playerId: 'player_1', cardId: eraChoices[0].id });
        }
        state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> relics_deal
        // Solo player picks relic (if pending)
        const relicChoices = state.pendingRelics?.['player_1'];
        if (relicChoices && relicChoices.length > 0) {
          state = era1Reducer(state, { type: 'CHOOSE_RELIC', playerId: 'player_1', relicId: relicChoices[0].id });
        }
        state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> draw_tiles
        state = era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_1' });
        expect(state.players[0].tiles.forest).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('trade', () => {
    function getTradePhaseState(): GameState {
      let state = createTestGame();
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> world_card_reveal
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
      const eraChoices = state.pendingEraCards!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_ERA_CARD', playerId: 'player_1', cardId: eraChoices[0].id });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> relics_deal
      const relicChoices = state.pendingRelics!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_RELIC', playerId: 'player_1', relicId: relicChoices[0].id });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> draw_tiles
      state = era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_1' });
      state = era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_2' });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> trade
      return state;
    }

    it('advances to trade phase after all players draw', () => {
      const state = getTradePhaseState();
      expect(state.era1Phase).toBe('trade');
    });

    it('allows proposing a trade', () => {
      let state = getTradePhaseState();
      const p1 = state.players[0];
      const offeredTerrain = (['plain', 'mountain', 'forest', 'swamp', 'road'] as const)
        .find(t => p1.tiles[t] > 0)!;
      const requestedTerrain = (['plain', 'mountain', 'forest', 'swamp', 'road'] as const)
        .find(t => t !== offeredTerrain)!;

      state = era1Reducer(state, {
        type: 'PROPOSE_TRADE',
        fromPlayerId: 'player_1',
        toPlayerId: 'player_2',
        tileOffered: offeredTerrain,
        tileRequested: requestedTerrain,
      });
      expect(state.activeTrades).toHaveLength(1);
      expect(state.activeTrades[0].status).toBe('pending');
    });

    it('throws on trade during wrong phase', () => {
      const state = createTestGame();
      expect(() => era1Reducer(state, {
        type: 'PROPOSE_TRADE',
        fromPlayerId: 'player_1',
        toPlayerId: 'player_2',
        tileOffered: 'plain',
        tileRequested: 'mountain',
      })).toThrow('trade phase');
    });

    it('ends trade phase', () => {
      const state = getTradePhaseState();
      const next = era1Reducer(state, { type: 'END_TRADE_PHASE' });
      expect(next.era1Phase).toBe('placement');
    });
  });

  describe('placement and scoring', () => {
    it('marks player as placed', () => {
      let state = createTestGame();
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> world_card_reveal
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
      const eraChoices = state.pendingEraCards!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_ERA_CARD', playerId: 'player_1', cardId: eraChoices[0].id });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> relics_deal
      const relicChoices = state.pendingRelics!['player_1'];
      state = era1Reducer(state, { type: 'CHOOSE_RELIC', playerId: 'player_1', relicId: relicChoices[0].id });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> draw_tiles
      state = era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_1' });
      state = era1Reducer(state, { type: 'DRAW_TILES', playerId: 'player_2' });
      state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> trade
      state = era1Reducer(state, { type: 'END_TRADE_PHASE' }); // -> placement

      state = era1Reducer(state, { type: 'PLACE_TILES', playerId: 'player_1' });
      expect(state.players[0].hasPlaced).toBe(true);
      expect(state.players[1].hasPlaced).toBe(false);
    });
  });
});
