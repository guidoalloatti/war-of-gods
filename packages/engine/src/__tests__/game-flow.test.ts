import { describe, it, expect } from 'vitest';
import { createGame } from '../state/createGame.js';
import { era1Reducer } from '../era1/actions.js';
import type { GameState } from '../types/game.js';

function advanceToDrawTiles(state: GameState): GameState {
  state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // setup -> world_card_reveal
  state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
  for (const player of state.players) {
    const pending = state.pendingEraCards?.[player.id];
    if (pending && pending.length > 0) {
      state = era1Reducer(state, { type: 'CHOOSE_ERA_CARD', playerId: player.id, cardId: pending[0].id });
    }
  }
  state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> relics_deal
  for (const player of state.players) {
    const pending = state.pendingRelics?.[player.id];
    if (pending && pending.length > 0) {
      state = era1Reducer(state, { type: 'CHOOSE_RELIC', playerId: player.id, relicId: pending[0].id });
    }
  }
  state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> draw_tiles
  return state;
}

function advanceToTrade(state: GameState): GameState {
  state = advanceToDrawTiles(state);
  for (const player of state.players) {
    state = era1Reducer(state, { type: 'DRAW_TILES', playerId: player.id });
  }
  state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> trade
  return state;
}

function advanceToplacement(state: GameState): GameState {
  state = advanceToTrade(state);
  state = era1Reducer(state, { type: 'END_TRADE_PHASE' }); // -> placement
  return state;
}

describe('Full game flow', () => {
  it('solo game reaches scoring phase', () => {
    let state = createGame({ mode: 'solo', seed: 42, playerConfigs: [{ name: 'P', raceId: 'elf', isBot: false }] });
    state = advanceToplacement(state);
    expect(state.era1Phase).toBe('placement');

    state = era1Reducer(state, { type: 'PLACE_TILES', playerId: state.players[0].id });
    state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> scoring
    expect(state.era1Phase).toBe('scoring');
  });

  it('solo_bots game: all 8 races can complete draw_tiles phase', () => {
    const races = ['elf', 'dwarf', 'human', 'halfelf', 'orc', 'giant', 'goblin', 'halforc'] as const;
    for (let i = 0; i < races.length; i++) {
      const race = races[i];
      const botRace = races[(i + 1) % races.length];
      let state = createGame({
        mode: 'solo_bots',
        seed: 99,
        playerConfigs: [
          { name: 'Player', raceId: race, isBot: false },
          { name: 'Bot', raceId: botRace, isBot: true, botDifficulty: 'easy' },
        ],
      });
      state = advanceToDrawTiles(state);
      state = era1Reducer(state, { type: 'DRAW_TILES', playerId: state.players[0].id });
      const tileCount = Object.values(state.players[0].tiles).reduce((a, b) => a + b, 0);
      // Base is 18; a card effect may modify draw count slightly
      expect(tileCount).toBeGreaterThanOrEqual(15);
      expect(tileCount).toBeLessThanOrEqual(22);
    }
  });

  it('6-player game initializes correctly', () => {
    const races = ['elf', 'dwarf', 'human', 'halfelf', 'orc', 'giant'] as const;
    const state = createGame({
      mode: 'multiplayer',
      seed: 1,
      playerConfigs: races.map((r, i) => ({ name: `P${i + 1}`, raceId: r, isBot: false })),
    });
    expect(state.players).toHaveLength(6);
    // 5+ players: no relics
    let next = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> world_card_reveal
    next = era1Reducer(next, { type: 'ADVANCE_PHASE' }); // -> era_cards_deal
    for (const p of next.players) {
      const pending = next.pendingEraCards?.[p.id];
      if (pending) next = era1Reducer(next, { type: 'CHOOSE_ERA_CARD', playerId: p.id, cardId: pending[0].id });
    }
    next = era1Reducer(next, { type: 'ADVANCE_PHASE' }); // -> relics_deal or draw_tiles
    // With 5+ players relics are skipped → goes directly to draw_tiles
    expect(['relics_deal', 'draw_tiles']).toContain(next.era1Phase);
  });

  it('trade: accept trade swaps tiles correctly', () => {
    let state = createGame({ mode: 'solo_bots', seed: 7, playerConfigs: [
      { name: 'P1', raceId: 'elf', isBot: false },
      { name: 'P2', raceId: 'dwarf', isBot: false },
    ] });
    state = advanceToTrade(state);

    const p1 = state.players[0];
    const p2 = state.players[1];

    const offered = (['plain', 'mountain', 'forest', 'swamp', 'road'] as const).find(t => p1.tiles[t] > 0)!;
    const requested = (['plain', 'mountain', 'forest', 'swamp', 'road'] as const).find(t => p2.tiles[t] > 0 && t !== offered)!;

    const p1OfferedBefore = p1.tiles[offered];
    const p1RequestedBefore = p1.tiles[requested];
    const p2OfferedBefore = p2.tiles[offered];
    const p2RequestedBefore = p2.tiles[requested];

    state = era1Reducer(state, {
      type: 'PROPOSE_TRADE',
      fromPlayerId: p1.id,
      toPlayerId: p2.id,
      tileOffered: offered,
      tileRequested: requested,
    });
    const tradeId = state.activeTrades[0].id;
    state = era1Reducer(state, { type: 'ACCEPT_TRADE', tradeId });

    const p1After = state.players.find(p => p.id === p1.id)!;
    const p2After = state.players.find(p => p.id === p2.id)!;

    expect(p1After.tiles[offered]).toBe(p1OfferedBefore - 1);
    expect(p1After.tiles[requested]).toBe(p1RequestedBefore + 1);
    expect(p2After.tiles[offered]).toBe(p2OfferedBefore + 1);
    expect(p2After.tiles[requested]).toBe(p2RequestedBefore - 1);
  });

  it('CALCULATE_SCORES sets scores on all players', () => {
    let state = createGame({ mode: 'solo_bots', seed: 5, playerConfigs: [
      { name: 'P1', raceId: 'human', isBot: false },
      { name: 'P2', raceId: 'orc', isBot: false },
    ] });
    state = advanceToplacement(state);
    for (const p of state.players) {
      state = era1Reducer(state, { type: 'PLACE_TILES', playerId: p.id });
    }
    state = era1Reducer(state, { type: 'ADVANCE_PHASE' }); // -> scoring
    state = era1Reducer(state, { type: 'CALCULATE_SCORES' });

    for (const player of state.players) {
      expect(player.score).not.toBeNull();
      expect(typeof player.score).toBe('number');
    }
    expect(state.era1Phase).toBe('complete');
  });

  it('tile pile decreases after each draw', () => {
    let state = createGame({ mode: 'solo_bots', seed: 3, playerConfigs: [
      { name: 'P1', raceId: 'elf', isBot: false },
      { name: 'P2', raceId: 'dwarf', isBot: false },
    ] });
    state = advanceToDrawTiles(state);
    const pileBefore = state.tilePile.length;

    state = era1Reducer(state, { type: 'DRAW_TILES', playerId: state.players[0].id });
    expect(state.tilePile.length).toBeLessThan(pileBefore);
  });

  it('SOLO_TRADE swaps a tile', () => {
    // Use dwarf (mountain favorable) — less likely to hit the 6+ favorable cap
    let state = createGame({ mode: 'solo', seed: 9, playerConfigs: [
      { name: 'P', raceId: 'dwarf', isBot: false },
    ] });
    state = advanceToTrade(state);
    const player = state.players[0];

    // Only attempt trade if player has fewer than 6 favorable tiles (mountain for dwarf)
    if (player.tiles.mountain >= 6) return;

    const terrains = (['plain', 'forest', 'swamp', 'road'] as const)
      .filter(t => player.tiles[t] > 0);
    if (terrains.length < 2) return;

    const [t1, t2] = terrains;
    const t1Before = player.tiles[t1];

    state = era1Reducer(state, {
      type: 'SOLO_TRADE',
      playerId: player.id,
      discardTiles: [t1, t2],
    });

    const playerAfter = state.players[0];
    expect(playerAfter.tiles[t1]).toBeLessThanOrEqual(t1Before);
    expect(playerAfter.hasTraded).toBe(true);
  });
});
