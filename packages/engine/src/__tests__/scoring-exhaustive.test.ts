import { describe, it, expect } from 'vitest';
import { calculateScoreBreakdown } from '../era1/scoring.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';

function makePlayer(raceId: RaceId, tiles: Record<string, number>, bonusPoints = 0): Player {
  return {
    id: 'player_1',
    name: 'Test',
    raceId,
    isBot: false,
    botDifficulty: null,
    tiles: {
      plain: tiles.plain ?? 0,
      mountain: tiles.mountain ?? 0,
      forest: tiles.forest ?? 0,
      swamp: tiles.swamp ?? 0,
      road: tiles.road ?? 0,
    },
    eraCards: [],
    relic: null,
    score: null,
    hasTraded: false,
    hasPlaced: false,
    connected: true,
    cardBonusPoints: bonusPoints || undefined,
  };
}

function makeState(player: Player, overrides?: Partial<GameState>): GameState {
  return {
    id: 'test',
    mode: 'solo',
    soloVariant: null,
    phase: 'era1',
    era1Phase: 'scoring',
    players: [player],
    tilePile: [],
    worldCard: null,
    activeTrades: [],
    seed: 42,
    roomCode: null,
    createdAt: 0,
    ...overrides,
  };
}

/**
 * Exhaustive consistency check:
 * total must always equal the sum of all component breakdowns.
 */
describe('Scoring exhaustive consistency', () => {
  const races: RaceId[] = ['elf', 'dwarf', 'human', 'halfelf', 'orc', 'giant', 'goblin', 'halforc'];
  const scenarios = [
    { label: 'balanced', tiles: { plain: 4, mountain: 4, forest: 4, swamp: 3, road: 3 } },
    { label: 'all forest', tiles: { plain: 0, mountain: 0, forest: 15, swamp: 0, road: 3 } },
    { label: 'all road', tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 18 } },
    { label: 'no road', tiles: { plain: 5, mountain: 5, forest: 5, swamp: 3, road: 0 } },
    { label: 'heavy concentration', tiles: { plain: 12, mountain: 2, forest: 2, swamp: 0, road: 2 } },
    { label: 'minimum diversity', tiles: { plain: 0, mountain: 0, forest: 9, swamp: 9, road: 0 } },
    { label: 'max diversity + balance', tiles: { plain: 3, mountain: 3, forest: 3, swamp: 3, road: 6 } },
    { label: 'with card bonus', tiles: { plain: 4, mountain: 4, forest: 4, swamp: 3, road: 3 }, bonus: 15 },
  ];

  for (const race of races) {
    for (const scenario of scenarios) {
      it(`${race} — ${scenario.label}: total === sum of components`, () => {
        const player = makePlayer(race, scenario.tiles, (scenario as { bonus?: number }).bonus ?? 0);
        const state = makeState(player);
        const b = calculateScoreBreakdown(state, 'player_1');

        const computedTotal =
          b.base + b.terrainBonus + b.roadBonus +
          b.diversityBonus + b.concentrationPenalty +
          b.balanceBonus + b.adjacencyBonus + b.cardEffects +
          b.raceAbilityBonus;

        expect(b.total).toBe(computedTotal);
      });
    }
  }

  it('waived road requirement gives max bonus for all races (halved for orc)', () => {
    for (const race of races) {
      const player = makePlayer(race, { plain: 5, mountain: 5, forest: 5, swamp: 3, road: 0 });
      const state = makeState(player, { roadRequirement: 0 });
      const b = calculateScoreBreakdown(state, 'player_1');
      // Orc has halved_road_bonus disadvantage: floor(6/2) = 3
      const expectedRoadBonus = race === 'orc' ? 3 : 6;
      expect(b.roadBonus).toBe(expectedRoadBonus);
      expect(b.total).toBe(
        b.base + b.terrainBonus + b.roadBonus + b.diversityBonus +
        b.concentrationPenalty + b.balanceBonus + b.adjacencyBonus + b.cardEffects +
        b.raceAbilityBonus
      );
    }
  });
});
