import { describe, it, expect } from 'vitest';
import {
  computeTurnOrder,
  computeStackMovement,
  resetStacksForTurn,
  nextTurn,
} from '../era3/index.js';
import type { Stack } from '../types/era3.js';
import type { Player } from '../types/player.js';
import { initPlayerEra2State } from '../era2/init.js';

function mkPlayer(id: string, war: number): Player {
  const base: Player = {
    id, name: id, raceId: 'elf', isBot: false, botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [], relic: null, score: 0, hasTraded: false, hasPlaced: false, connected: true,
  };
  const era2 = initPlayerEra2State(base);
  era2.techLevels.war = war;
  return { ...base, era2State: era2 };
}

function mkStack(id: string, ownerId: string, unitTypes: Array<'infantry' | 'ranged' | 'mounted' | 'siege' | 'flying'>): Stack {
  return {
    id, ownerId,
    units: unitTypes.map((t, i) => ({
      id: `${id}_u${i}`, type: t, ownerId, currentHp: 10,
      hasMovedThisTurn: true, hasAttackedThisTurn: true,
    })),
    position: { q: 0, r: 0 }, movementLeft: 0,
  };
}

describe('computeTurnOrder', () => {
  it('sorts by tech.war desc, ties by id asc', () => {
    const players = [
      mkPlayer('bob', 3),
      mkPlayer('alice', 5),
      mkPlayer('carol', 5),
    ];
    expect(computeTurnOrder(players)).toEqual(['alice', 'carol', 'bob']);
  });

  it('falls back to 0 when tech not set', () => {
    const p: Player = {
      id: 'p1', name: 'p1', raceId: 'elf', isBot: false, botDifficulty: null,
      tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
      eraCards: [], relic: null, score: 0, hasTraded: false, hasPlaced: false, connected: true,
    };
    expect(computeTurnOrder([p])).toEqual(['p1']);
  });
});

describe('computeStackMovement', () => {
  it('returns min movement stat × MOVEMENT_SCALE (3)', () => {
    // min(infantry=1, mounted=2, flying=3) = 1 × 3 = 3
    expect(computeStackMovement(mkStack('s', 'p', ['infantry', 'mounted', 'flying']))).toBe(3);
    // mounted=2 × 3 = 6
    expect(computeStackMovement(mkStack('s', 'p', ['mounted', 'mounted']))).toBe(6);
    // flying=3 × 3 = 9
    expect(computeStackMovement(mkStack('s', 'p', ['flying']))).toBe(9);
  });

  it('empty stack → 0', () => {
    expect(computeStackMovement(mkStack('s', 'p', []))).toBe(0);
  });
});

describe('resetStacksForTurn', () => {
  it('only resets stacks owned by the given player', () => {
    const stacks = {
      a: mkStack('a', 'p1', ['infantry']),
      b: mkStack('b', 'p2', ['mounted']),
    };
    const out = resetStacksForTurn(stacks, 'p1');
    expect(out.a.movementLeft).toBe(3); // infantry=1 × MOVEMENT_SCALE=3
    expect(out.a.units[0].hasMovedThisTurn).toBe(false);
    expect(out.a.units[0].hasAttackedThisTurn).toBe(false);
    // b unchanged
    expect(out.b).toBe(stacks.b);
  });
});

describe('nextTurn', () => {
  it('advances within order without incrementing turn number', () => {
    expect(nextTurn(['a', 'b', 'c'], 'a', 1)).toEqual({ nextPlayerId: 'b', nextTurnNumber: 1 });
  });

  it('wraps and increments turn number', () => {
    expect(nextTurn(['a', 'b', 'c'], 'c', 1)).toEqual({ nextPlayerId: 'a', nextTurnNumber: 2 });
  });

  it('starts at first player when currentId is null', () => {
    expect(nextTurn(['a', 'b'], null, 1)).toEqual({ nextPlayerId: 'a', nextTurnNumber: 1 });
  });

  it('throws on empty order', () => {
    expect(() => nextTurn([], 'a', 1)).toThrow();
  });
});
