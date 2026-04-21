import { describe, it, expect } from 'vitest';
import { createGame } from '../state/createGame.js';
import { era1Reducer } from '../era1/actions.js';
import { era2Reducer } from '../era2/reducer.js';
import type { GameState } from '../types/game.js';

function newGame(): GameState {
  return createGame({
    mode: 'solo_bots',
    seed: 42,
    playerConfigs: [
      { name: 'P1', raceId: 'human', isBot: false },
      { name: 'Bot', raceId: 'elf', isBot: true, botDifficulty: 'easy' },
    ],
  });
}

/** Drive a game from setup to era1 complete (triggers Era II transition). */
function driveToEra2(initial: GameState): GameState {
  let s = initial;
  // setup → world_card_reveal
  s = era1Reducer(s, { type: 'ADVANCE_PHASE' });
  // world_card_reveal → era_cards_deal (auto-deals, bots auto-pick)
  s = era1Reducer(s, { type: 'ADVANCE_PHASE' });
  // Human picks first pending card
  const humanId = s.players.find(p => !p.isBot)!.id;
  const pending = s.pendingEraCards?.[humanId];
  if (pending?.length) {
    s = era1Reducer(s, { type: 'CHOOSE_ERA_CARD', playerId: humanId, cardId: pending[0].id });
  }
  // era_cards_deal → relics_deal (bots auto-pick)
  s = era1Reducer(s, { type: 'ADVANCE_PHASE' });
  const humanRelics = s.pendingRelics?.[humanId];
  if (humanRelics?.length) {
    s = era1Reducer(s, { type: 'CHOOSE_RELIC', playerId: humanId, relicId: humanRelics[0].id });
  }
  // relics_deal → draw_tiles
  s = era1Reducer(s, { type: 'ADVANCE_PHASE' });
  // Each player draws
  for (const p of s.players) {
    s = era1Reducer(s, { type: 'DRAW_TILES', playerId: p.id });
  }
  // draw_tiles → trade
  s = era1Reducer(s, { type: 'ADVANCE_PHASE' });
  // trade → placement
  s = era1Reducer(s, { type: 'ADVANCE_PHASE' });
  // placement: each player places
  for (const p of s.players) {
    s = era1Reducer(s, { type: 'PLACE_TILES', playerId: p.id });
  }
  // placement → scoring
  s = era1Reducer(s, { type: 'ADVANCE_PHASE' });
  // scoring: CALCULATE_SCORES triggers transition to Era II
  s = era1Reducer(s, { type: 'CALCULATE_SCORES' });
  return s;
}

describe('Era I → Era II transition', () => {
  it('CALCULATE_SCORES moves phase to era2 and seeds era2State', () => {
    const s = driveToEra2(newGame());
    expect(s.phase).toBe('era2');
    expect(s.era2Phase).toBe('world_card_reveal');
    for (const p of s.players) {
      expect(p.era2State).toBeDefined();
      expect(p.era2State!.constructionPoints).toBeGreaterThanOrEqual(10);
    }
  });

  it('initializes doomClock and empty transfers/ready arrays', () => {
    const s = driveToEra2(newGame());
    expect(s.doomClock).toBe(12);
    expect(s.activeTransfers).toEqual([]);
    expect(s.kingsTableReady).toEqual([]);
  });

  it('applies racial free tech (human → science 1)', () => {
    const s = driveToEra2(newGame());
    const human = s.players.find(p => p.raceId === 'human')!;
    expect(human.era2State!.techLevels.science).toBeGreaterThanOrEqual(1);
  });
});

describe('era2Reducer — SET_TECH_LEVEL', () => {
  it('sets a tech level and charges points', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = { ...s, era2Phase: 'tech_allocation' };
    s = era2Reducer(s, { type: 'SET_TECH_LEVEL', playerId: humanId, tech: 'war', targetLevel: 3 });
    const e2 = s.players.find(p => p.id === humanId)!.era2State!;
    expect(e2.techLevels.war).toBe(3);
    // war 0 → 3 costs 7
    expect(e2.pointsSpent).toBe(7);
  });

  it('rejects allocation outside tech_allocation phase', () => {
    const s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    expect(() =>
      era2Reducer(s, { type: 'SET_TECH_LEVEL', playerId: humanId, tech: 'war', targetLevel: 3 }),
    ).toThrow(/tech_allocation/);
  });

  it('rejects overspending', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    // Force small budget to guarantee overspend.
    s = {
      ...s,
      era2Phase: 'tech_allocation',
      players: s.players.map(p =>
        p.id === humanId ? { ...p, era2State: { ...p.era2State!, constructionPoints: 5 } } : p,
      ),
    };
    expect(() =>
      era2Reducer(s, { type: 'SET_TECH_LEVEL', playerId: humanId, tech: 'war', targetLevel: 5 }),
    ).toThrow(/Not enough points/);
  });

  it('rejects level 6 without allowLevel6', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    // Ensure budget is plentiful so the level-6 gate is the failure, not overspend.
    s = {
      ...s,
      era2Phase: 'tech_allocation',
      players: s.players.map(p =>
        p.id === humanId
          ? { ...p, era2State: { ...p.era2State!, constructionPoints: 200, allowLevel6: false } }
          : p,
      ),
    };
    expect(() =>
      era2Reducer(s, { type: 'SET_TECH_LEVEL', playerId: humanId, tech: 'war', targetLevel: 6 }),
    ).toThrow(/Forja del Destino/);
  });

  it('respects lockedOutTech', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = {
      ...s,
      era2Phase: 'tech_allocation',
      players: s.players.map(p =>
        p.id === humanId ? { ...p, era2State: { ...p.era2State!, lockedOutTech: 'war' } } : p,
      ),
    };
    expect(() =>
      era2Reducer(s, { type: 'SET_TECH_LEVEL', playerId: humanId, tech: 'war', targetLevel: 1 }),
    ).toThrow(/locked/);
  });
});

describe('era2Reducer — CONFIRM_ALLOCATION / RESET_ALLOCATION', () => {
  it('CONFIRM_ALLOCATION sets hasConfirmed', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = { ...s, era2Phase: 'tech_allocation' };
    s = era2Reducer(s, { type: 'CONFIRM_ALLOCATION', playerId: humanId });
    expect(s.players.find(p => p.id === humanId)!.era2State!.hasConfirmed).toBe(true);
  });

  it('CONFIRM_ALLOCATION is idempotent', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = { ...s, era2Phase: 'tech_allocation' };
    s = era2Reducer(s, { type: 'CONFIRM_ALLOCATION', playerId: humanId });
    const after = era2Reducer(s, { type: 'CONFIRM_ALLOCATION', playerId: humanId });
    expect(after.players.find(p => p.id === humanId)!.era2State!.hasConfirmed).toBe(true);
  });

  it('RESET_ALLOCATION restores baseline techLevels and increments counter', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = { ...s, era2Phase: 'tech_allocation' };
    s = era2Reducer(s, { type: 'SET_TECH_LEVEL', playerId: humanId, tech: 'war', targetLevel: 2 });
    s = era2Reducer(s, { type: 'RESET_ALLOCATION', playerId: humanId });
    const e2 = s.players.find(p => p.id === humanId)!.era2State!;
    // Human race gives free science +1; reset should preserve baseline.
    expect(e2.techLevels).toEqual(e2.baselineTechLevels);
    expect(e2.techLevels.war).toBe(0);
    expect(e2.techLevels.science).toBeGreaterThanOrEqual(1);
    expect(e2.pointsSpent).toBe(0);
    expect(e2.reallocationsUsed).toBe(1);
  });

  it('RESET_ALLOCATION respects reallocationsAllowed cap', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = {
      ...s,
      era2Phase: 'tech_allocation',
      players: s.players.map(p =>
        p.id === humanId
          ? { ...p, era2State: { ...p.era2State!, reallocationsAllowed: 1, reallocationsUsed: 1 } }
          : p,
      ),
    };
    expect(() =>
      era2Reducer(s, { type: 'RESET_ALLOCATION', playerId: humanId }),
    ).toThrow(/No more reallocations/);
  });
});

describe('era2Reducer — CONVERT_SURPLUS', () => {
  it('converts surplus to gold using default 0.5 ratio', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = {
      ...s,
      era2Phase: 'convert_surplus',
      players: s.players.map(p =>
        p.id === humanId
          ? { ...p, era2State: { ...p.era2State!, constructionPoints: 20, pointsSpent: 10 } }
          : p,
      ),
    };
    s = era2Reducer(s, { type: 'CONVERT_SURPLUS', playerId: humanId });
    expect(s.players.find(p => p.id === humanId)!.era2State!.goldCoins).toBe(5);
  });

  it('rejects outside convert_surplus phase', () => {
    const s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    expect(() =>
      era2Reducer(s, { type: 'CONVERT_SURPLUS', playerId: humanId }),
    ).toThrow(/convert_surplus/);
  });

  it('yields 0 gold when there is no surplus', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = {
      ...s,
      era2Phase: 'convert_surplus',
      players: s.players.map(p =>
        p.id === humanId
          ? { ...p, era2State: { ...p.era2State!, constructionPoints: 10, pointsSpent: 10 } }
          : p,
      ),
    };
    s = era2Reducer(s, { type: 'CONVERT_SURPLUS', playerId: humanId });
    expect(s.players.find(p => p.id === humanId)!.era2State!.goldCoins).toBe(0);
  });
});

describe('era2Reducer — CHOOSE_ERA2_CARD', () => {
  it('assigns the chosen card and clears pendingCardChoices', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    const fakeCard = { id: 'e2_test', type: 'era2', name: 'Test', flavorText: '', mechanicalText: '', effects: [] } as any;
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === humanId
          ? { ...p, era2State: { ...p.era2State!, pendingCardChoices: [fakeCard] } }
          : p,
      ),
    };
    s = era2Reducer(s, { type: 'CHOOSE_ERA2_CARD', playerId: humanId, cardId: 'e2_test' });
    const e2 = s.players.find(p => p.id === humanId)!.era2State!;
    expect(e2.chosenEra2Card?.id).toBe('e2_test');
    expect(e2.pendingCardChoices).toEqual([]);
  });

  it('throws when card id is not among choices', () => {
    let s = driveToEra2(newGame());
    const humanId = s.players.find(p => !p.isBot)!.id;
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === humanId ? { ...p, era2State: { ...p.era2State!, pendingCardChoices: [] } } : p,
      ),
    };
    expect(() =>
      era2Reducer(s, { type: 'CHOOSE_ERA2_CARD', playerId: humanId, cardId: 'nope' }),
    ).toThrow(/not among choices/);
  });
});

describe('era2Reducer — ADVANCE_ERA2_PHASE', () => {
  it('does not advance when phase is not complete (world_card_reveal without card)', () => {
    // Force worldCardEra2 to null to simulate an incomplete reveal.
    const s = { ...driveToEra2(newGame()), worldCardEra2: null };
    const next = era2Reducer(s, { type: 'ADVANCE_ERA2_PHASE' });
    expect(next.era2Phase).toBe('world_card_reveal');
  });

  it('advances to era_cards_deal once worldCardEra2 is set', () => {
    let s = driveToEra2(newGame());
    s = { ...s, worldCardEra2: { id: 'w2', type: 'world_era2', name: 'X', flavorText: '', mechanicalText: '', effects: [] } as any };
    s = era2Reducer(s, { type: 'ADVANCE_ERA2_PHASE' });
    expect(s.era2Phase).toBe('era_cards_deal');
  });

  it('skips through apply_penalties and apply_era1_effects (side-effect-only)', () => {
    let s = driveToEra2(newGame());
    s = { ...s, era2Phase: 'apply_penalties' };
    s = era2Reducer(s, { type: 'ADVANCE_ERA2_PHASE' });
    expect(s.era2Phase).toBe('apply_era1_effects');
    s = era2Reducer(s, { type: 'ADVANCE_ERA2_PHASE' });
    expect(s.era2Phase).toBe('kings_table');
  });

  it('entering tech_allocation resets hasConfirmed', () => {
    let s = driveToEra2(newGame());
    s = {
      ...s,
      era2Phase: 'kings_table',
      kingsTableReady: s.players.map(p => p.id),
      players: s.players.map(p =>
        p.era2State ? { ...p, era2State: { ...p.era2State, hasConfirmed: true } } : p,
      ),
    };
    s = era2Reducer(s, { type: 'ADVANCE_ERA2_PHASE' });
    expect(s.era2Phase).toBe('tech_allocation');
    for (const p of s.players) {
      if (p.era2State) expect(p.era2State.hasConfirmed).toBe(false);
    }
  });
});
