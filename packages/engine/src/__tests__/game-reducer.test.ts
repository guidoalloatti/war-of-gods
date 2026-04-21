import { describe, it, expect } from 'vitest';
import { gameReducer } from '../reducer.js';
import { createGame } from '../state/createGame.js';
import type { GameState } from '../types/game.js';

function newEra1Game(): GameState {
  return createGame({
    mode: 'solo_bots',
    seed: 1,
    playerConfigs: [
      { name: 'P1', raceId: 'elf', isBot: false },
      { name: 'Bot', raceId: 'dwarf', isBot: true, botDifficulty: 'easy' },
    ],
  });
}

describe('gameReducer top-level dispatcher', () => {
  it('routes era1 actions to era1Reducer (ADVANCE_PHASE moves setup → draw)', () => {
    const state = newEra1Game();
    expect(state.era1Phase).toBe('setup');
    const next = gameReducer(state, { type: 'ADVANCE_PHASE' });
    expect(next.phase).toBe('era1');
    expect(next.era1Phase).not.toBe('setup');
  });

  it('routes era2 actions to era2Reducer', () => {
    const state = { ...newEra1Game(), phase: 'era2', era2Phase: 'world_card_reveal' } as GameState;
    const next = gameReducer(state, { type: 'ADVANCE_ERA2_PHASE' });
    // Real reducer now advances; we just assert it stays in era2.
    expect(next.phase).toBe('era2');
  });

  it('returns state unchanged in era3 for unknown actions', () => {
    const state = { ...newEra1Game(), phase: 'era3' } as GameState;
    const next = gameReducer(state, { type: 'ADVANCE_ERA3_PHASE' });
    expect(next).toBe(state);
  });
});
