import { describe, it, expect } from 'vitest';
import { calculateScoreBreakdown } from '../era1/scoring.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player_1',
    name: 'Test',
    raceId: 'elf',
    isBot: false,
    botDifficulty: null,
    tiles: { plain: 4, mountain: 3, forest: 5, swamp: 3, road: 3 },
    eraCards: [],
    relic: null,
    score: null,
    hasTraded: false,
    hasPlaced: false,
    connected: true,
    ...overrides,
  };
}

function makeState(players: Player[], overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'test_game',
    mode: 'solo',
    soloVariant: null,
    phase: 'era1',
    era1Phase: 'scoring',
    players,
    tilePile: [],
    worldCard: null,
    activeTrades: [],
    seed: 42,
    roomCode: null,
    createdAt: 0,
    ...overrides,
  };
}

describe('Scoring', () => {
  // Elf: forest=3, mountain=0. favorable=forest, unfavorable=mountain
  it('calculates base score from terrain values', () => {
    const player = makePlayer({
      tiles: { plain: 0, mountain: 0, forest: 5, swamp: 0, road: 3 },
    });
    const state = makeState([player]);
    const breakdown = calculateScoreBreakdown(state, 'player_1');
    // base = 0*1 + 0*0 + 5*3 + 0*1 = 15
    expect(breakdown.base).toBe(15);
  });

  it('calculates terrain bonus (favorable - unfavorable)', () => {
    const player = makePlayer({
      tiles: { plain: 0, mountain: 2, forest: 6, swamp: 0, road: 3 },
    });
    const state = makeState([player]);
    const breakdown = calculateScoreBreakdown(state, 'player_1');
    // Elf: favorable=forest(6) - unfavorable=mountain(2) = 4
    expect(breakdown.terrainBonus).toBe(4);
  });

  it('calculates road bonus from lookup table', () => {
    // 0 roads = -9
    const p0 = makePlayer({ tiles: { plain: 5, mountain: 5, forest: 5, swamp: 3, road: 0 } });
    expect(calculateScoreBreakdown(makeState([p0]), 'player_1').roadBonus).toBe(-9);

    // 3 roads = 0
    const p3 = makePlayer({ tiles: { plain: 5, mountain: 5, forest: 3, swamp: 2, road: 3 } });
    expect(calculateScoreBreakdown(makeState([p3]), 'player_1').roadBonus).toBe(0);

    // 7+ roads = 6
    const p7 = makePlayer({ tiles: { plain: 3, mountain: 3, forest: 2, swamp: 3, road: 7 } });
    expect(calculateScoreBreakdown(makeState([p7]), 'player_1').roadBonus).toBe(6);
  });

  it('gives diversity bonus for 4 terrain types', () => {
    // Use human (no terrain_ignores_diversity disadvantage)
    const player = makePlayer({
      raceId: 'human',
      tiles: { plain: 3, mountain: 3, forest: 3, swamp: 3, road: 3 },
    });
    const state = makeState([player]);
    expect(calculateScoreBreakdown(state, 'player_1').diversityBonus).toBe(5);
  });

  it('gives diversity bonus of 2 for 3 terrain types', () => {
    const player = makePlayer({
      tiles: { plain: 5, mountain: 0, forest: 5, swamp: 5, road: 3 },
    });
    const state = makeState([player]);
    expect(calculateScoreBreakdown(state, 'player_1').diversityBonus).toBe(2);
  });

  it('gives 0 diversity bonus for 2 or fewer terrain types', () => {
    const player = makePlayer({
      tiles: { plain: 0, mountain: 0, forest: 10, swamp: 0, road: 3 },
    });
    const state = makeState([player]);
    expect(calculateScoreBreakdown(state, 'player_1').diversityBonus).toBe(0);
  });

  it('applies concentration penalty for 9+ tiles of one type', () => {
    const player = makePlayer({
      tiles: { plain: 10, mountain: 2, forest: 2, swamp: 2, road: 2 },
    });
    const state = makeState([player]);
    // 10 plain - 8 threshold = -2
    expect(calculateScoreBreakdown(state, 'player_1').concentrationPenalty).toBe(-2);
  });

  it('gives balance bonus when all 4 terrains >= 2', () => {
    const player = makePlayer({
      tiles: { plain: 3, mountain: 3, forest: 3, swamp: 3, road: 3 },
    });
    const state = makeState([player]);
    expect(calculateScoreBreakdown(state, 'player_1').balanceBonus).toBe(3);
  });

  it('gives no balance bonus when any terrain < 2', () => {
    const player = makePlayer({
      tiles: { plain: 5, mountain: 1, forest: 5, swamp: 5, road: 2 },
    });
    const state = makeState([player]);
    expect(calculateScoreBreakdown(state, 'player_1').balanceBonus).toBe(0);
  });

  it('includes cardBonusPoints in total', () => {
    const player = makePlayer({
      tiles: { plain: 4, mountain: 3, forest: 5, swamp: 3, road: 3 },
      cardBonusPoints: 10,
    });
    const state = makeState([player]);
    const breakdown = calculateScoreBreakdown(state, 'player_1');
    expect(breakdown.cardEffects).toBe(10);
    expect(breakdown.total).toBe(
      breakdown.base + breakdown.terrainBonus + breakdown.roadBonus +
      breakdown.diversityBonus + breakdown.concentrationPenalty +
      breakdown.balanceBonus + breakdown.adjacencyBonus + breakdown.cardEffects +
      breakdown.raceAbilityBonus
    );
  });

  it('waived road requirement gives max road bonus', () => {
    const player = makePlayer({
      tiles: { plain: 5, mountain: 5, forest: 5, swamp: 3, road: 0 },
    });
    const state = makeState([player], { roadRequirement: 0 });
    expect(calculateScoreBreakdown(state, 'player_1').roadBonus).toBe(6);
  });

  it('total equals sum of all components', () => {
    const player = makePlayer({
      tiles: { plain: 4, mountain: 2, forest: 6, swamp: 3, road: 3 },
      cardBonusPoints: 5,
    });
    const state = makeState([player]);
    const b = calculateScoreBreakdown(state, 'player_1');
    expect(b.total).toBe(
      b.base + b.terrainBonus + b.roadBonus + b.diversityBonus +
      b.concentrationPenalty + b.balanceBonus + b.adjacencyBonus + b.cardEffects
    );
  });

  it('throws for unknown player', () => {
    const state = makeState([makePlayer()]);
    expect(() => calculateScoreBreakdown(state, 'nonexistent')).toThrow('Player not found');
  });
});
