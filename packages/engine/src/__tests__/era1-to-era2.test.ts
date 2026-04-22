import { describe, it, expect } from 'vitest';
import { initDoomClock, initPlayerEra2State } from '../era2/init.js';
import { DEFAULT_DOOM_CLOCK, MIN_CONSTRUCTION_POINTS, RACIAL_BONUSES } from '../era2/constants.js';
import type { Player } from '../types/player.js';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Tester',
    raceId: 'human',
    isBot: false,
    botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [],
    relic: null,
    score: 25,
    hasTraded: false,
    hasPlaced: false,
    connected: true,
    ...overrides,
  };
}

describe('initDoomClock', () => {
  it('returns DEFAULT_DOOM_CLOCK regardless of mode', () => {
    expect(initDoomClock('solo', null)).toBe(DEFAULT_DOOM_CLOCK);
    expect(initDoomClock('solo_bots', null)).toBe(DEFAULT_DOOM_CLOCK);
    expect(initDoomClock('multiplayer', null)).toBe(DEFAULT_DOOM_CLOCK);
  });
});

describe('initPlayerEra2State', () => {
  it('uses player.score as constructionPoints when above the floor', () => {
    const s = initPlayerEra2State(makePlayer({ score: 42 }));
    expect(s.constructionPoints).toBe(42);
  });

  it('enforces MIN_CONSTRUCTION_POINTS when score is low', () => {
    expect(initPlayerEra2State(makePlayer({ score: 3 })).constructionPoints).toBe(MIN_CONSTRUCTION_POINTS);
    expect(initPlayerEra2State(makePlayer({ score: 0 })).constructionPoints).toBe(MIN_CONSTRUCTION_POINTS);
    expect(initPlayerEra2State(makePlayer({ score: -5 })).constructionPoints).toBe(MIN_CONSTRUCTION_POINTS);
  });

  it('treats null score as 0 and clamps to floor', () => {
    expect(initPlayerEra2State(makePlayer({ score: null })).constructionPoints).toBe(MIN_CONSTRUCTION_POINTS);
  });

  it('grants the racial free tech level', () => {
    for (const raceId of Object.keys(RACIAL_BONUSES) as (keyof typeof RACIAL_BONUSES)[]) {
      const bonus = RACIAL_BONUSES[raceId];
      const s = initPlayerEra2State(makePlayer({ raceId }));
      expect(s.techLevels[bonus.freeTech.tech]).toBeGreaterThanOrEqual(bonus.freeTech.level);
    }
  });

  it('seeds the free unit grant from race', () => {
    const s = initPlayerEra2State(makePlayer({ raceId: 'elf' }));
    expect(s.freeUnitsForEra3).toEqual([{ unit: 'ranged', count: 1 }]);
  });

  it('initializes all mutable counters to zero', () => {
    const s = initPlayerEra2State(makePlayer());
    expect(s.pointsSpent).toBe(0);
    expect(s.pointsGiven).toBe(0);
    expect(s.pointsReceived).toBe(0);
    expect(s.goldCoins).toBe(0);
    expect(s.reallocationsUsed).toBe(0);
    expect(s.hasConfirmed).toBe(false);
    expect(s.allowLevel6).toBe(false);
  });

  it('uses default cost and transfer modifiers', () => {
    const s = initPlayerEra2State(makePlayer());
    expect(s.costModifiers.minCostPerLevel).toBe(1);
    expect(s.costModifiers.flat).toEqual({ war: 0, science: 0, resources: 0, economy: 0, religion: 0 });
    expect(s.costModifiers.perLevel).toEqual({ war: 0, science: 0, resources: 0, economy: 0, religion: 0 });
    expect(s.transferModifiers.giveRatio).toBe(0.5);
    expect(s.transferModifiers.receiveRatio).toBe(1);
    expect(s.transferModifiers.surplusRatio).toBe(0.5);
  });

  it('folds Era I freeTechLevels into techLevels, stacking on racial', () => {
    // Human: racial is economy +1. Add a free_tech_level grant for economy +1 → total 2.
    const s = initPlayerEra2State(makePlayer({
      raceId: 'human',
      freeTechLevels: [{ tech: 'economy', level: 1 }],
    }));
    expect(s.techLevels.economy).toBe(2);
  });

  it('multiple free tech grants to same tech accumulate', () => {
    const s = initPlayerEra2State(makePlayer({
      raceId: 'elf', // religion +1
      freeTechLevels: [
        { tech: 'religion', level: 1 },
        { tech: 'religion', level: 1 },
      ],
    }));
    expect(s.techLevels.religion).toBe(3);
  });

  it('caps folded free tech levels at 5 (level 6 is gated)', () => {
    const s = initPlayerEra2State(makePlayer({
      raceId: 'elf',
      freeTechLevels: [{ tech: 'resources', level: 10 }],
    }));
    expect(s.techLevels.resources).toBe(5);
  });

  it('distributes free tech grants across different techs', () => {
    const s = initPlayerEra2State(makePlayer({
      raceId: 'dwarf', // resources +1
      freeTechLevels: [
        { tech: 'war', level: 1 },
        { tech: 'science', level: 2 },
      ],
    }));
    expect(s.techLevels).toEqual({ war: 1, science: 2, resources: 1, economy: 0, religion: 0 });
  });

  it('techLevels default to 0 for unassigned tracks', () => {
    // Elf: religion +1. war/science/resources/economy should all be 0.
    const s = initPlayerEra2State(makePlayer({ raceId: 'elf' }));
    expect(s.techLevels.war).toBe(0);
    expect(s.techLevels.science).toBe(0);
    expect(s.techLevels.economy).toBe(0);
    expect(s.techLevels.resources).toBe(0);
    expect(s.techLevels.religion).toBe(1);
  });

  it('freeLevelsRemaining starts at zero for all techs', () => {
    const s = initPlayerEra2State(makePlayer());
    expect(s.freeLevelsRemaining).toEqual({ war: 0, science: 0, resources: 0, economy: 0, religion: 0 });
  });

  it('does not mutate the input player', () => {
    const p = makePlayer({ freeTechLevels: [{ tech: 'war', level: 1 }] });
    const before = JSON.stringify(p);
    initPlayerEra2State(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});
