import { describe, it, expect } from 'vitest';
import { gameReducer } from '../reducer.js';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import { hexKey, neighbors, getTerrainMoveCost } from '../era3/index.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';

const RACES: RaceId[] = ['elf', 'dwarf'];

function mkPlayer(id: string, raceId: RaceId): Player {
  const base: Player = {
    id, name: id, raceId, isBot: false, botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [], relic: null, score: 25, hasTraded: false, hasPlaced: false, connected: true,
  };
  return { ...base, era2State: initPlayerEra2State(base) };
}

function era3State(seed = 12345): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return transitionEra2ToEra3(base);
}

function startGameLoop(state: GameState): GameState {
  // Session 4a: transition already lands in game_loop, so this is a no-op.
  return state;
}

describe('Era III game loop initialization', () => {
  it('transitions to game_loop and sets turn state', () => {
    const s = era3State();
    expect(s.era3Phase).toBe('game_loop');
    expect(s.era3TurnOrder).toHaveLength(2);
    expect(s.era3CurrentPlayerId).toBe(s.era3TurnOrder![0]);
    expect(s.era3TurnNumber).toBe(1);
  });

  it('resets movement for the first player\'s stacks', () => {
    const s = era3State();
    const first = s.era3CurrentPlayerId!;
    const myStack = Object.values(s.era3Stacks!).find(st => st.ownerId === first)!;
    expect(myStack.movementLeft).toBeGreaterThan(0);
  });

  it('START_ERA3_GAME_LOOP is a no-op once already in game_loop', () => {
    const s = era3State();
    const again = gameReducer(s, { type: 'START_ERA3_GAME_LOOP' });
    expect(again).toBe(s);
  });
});

describe('MOVE_STACK', () => {
  it('moves a stack by one step and deducts movement', () => {
    const s = startGameLoop(era3State());
    const current = s.era3CurrentPlayerId!;
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;

    // Find a passable neighbor of the capital that's not occupied AND is
    // within the stack's movement budget (some biomes like forest/mountain
    // cost more than a slow stack can afford in one turn).
    const target = neighbors(stack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      if (!h || h.stackId) return false;
      const c = getTerrainMoveCost(h.terrain);
      return c < Infinity && c <= stack.movementLeft;
    });
    expect(target).toBeTruthy();

    const stepCost = getTerrainMoveCost(s.map!.hexes[hexKey(target!)].terrain);
    const before = stack.movementLeft;

    const next = gameReducer(s, {
      type: 'MOVE_STACK', playerId: current, stackId: stack.id, path: [target!],
    });

    const moved = next.era3Stacks![stack.id];
    expect(moved.position).toEqual(target);
    expect(moved.movementLeft).toBe(before - stepCost);
    expect(moved.units.every(u => u.hasMovedThisTurn)).toBe(true);

    // Map references updated.
    expect(next.map!.hexes[hexKey(stack.position)].stackId).toBeNull();
    expect(next.map!.hexes[hexKey(target!)].stackId).toBe(stack.id);
  });

  it('rejects move when not your turn', () => {
    const s = startGameLoop(era3State());
    const other = s.era3TurnOrder!.find(id => id !== s.era3CurrentPlayerId)!;
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === other)!;
    expect(() =>
      gameReducer(s, { type: 'MOVE_STACK', playerId: other, stackId: stack.id, path: [stack.position] }),
    ).toThrow(/not your turn/i);
  });

  it('rejects non-adjacent path steps', () => {
    const s = startGameLoop(era3State());
    const current = s.era3CurrentPlayerId!;
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    // Two steps in the same direction is fine if neighbors; a jump is not.
    expect(() =>
      gameReducer(s, {
        type: 'MOVE_STACK', playerId: current, stackId: stack.id,
        path: [{ q: stack.position.q + 3, r: stack.position.r }],
      }),
    ).toThrow(/contiguous/i);
  });

  it('rejects multi-hop paths that exceed the movement budget', () => {
    const s = startGameLoop(era3State());
    const current = s.era3CurrentPlayerId!;
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;

    // Walk straight in +q direction; collect only passable unoccupied steps,
    // then take enough to exceed movementLeft (must be >1 step to trigger the budget check).
    const steps: { q: number; r: number }[] = [];
    let cursor = stack.position;
    let accumulated = 0;
    let overBudgetPath: { q: number; r: number }[] | null = null;
    for (let i = 0; i < 20 && overBudgetPath === null; i++) {
      cursor = { q: cursor.q + 1, r: cursor.r };
      const h = s.map!.hexes[hexKey(cursor)];
      if (!h || getTerrainMoveCost(h.terrain) === Infinity || h.stackId) break;
      steps.push(cursor);
      accumulated += getTerrainMoveCost(h.terrain);
      if (accumulated > stack.movementLeft && steps.length > 1) {
        overBudgetPath = [...steps];
      }
    }
    if (overBudgetPath) {
      expect(() =>
        gameReducer(s, { type: 'MOVE_STACK', playerId: current, stackId: stack.id, path: overBudgetPath! }),
      ).toThrow(/not enough movement/i);
    }
  });

  it('minimum-move guarantee: single-hop into expensive terrain is always allowed (exhausts movement)', () => {
    const s = startGameLoop(era3State());
    const current = s.era3CurrentPlayerId!;
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;

    // Find an adjacent hex whose terrain cost exceeds movementLeft (e.g. swamp=4, forest/mountain=6 vs infantry budget=3).
    const expensiveNeighbor = neighbors(stack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      if (!h || h.stackId) return false;
      const c = getTerrainMoveCost(h.terrain);
      return c > stack.movementLeft && c < Infinity;
    });

    if (!expensiveNeighbor) return; // map seed doesn't have an expensive neighbor — skip gracefully

    const next = gameReducer(s, {
      type: 'MOVE_STACK', playerId: current, stackId: stack.id, path: [expensiveNeighbor],
    });
    const moved = next.era3Stacks![stack.id];
    expect(moved.position).toEqual(expensiveNeighbor);
    // Movement is fully exhausted (capped at 0, never negative)
    expect(moved.movementLeft).toBe(0);
  });
});

describe('END_TURN', () => {
  it('advances to next player and resets their movement', () => {
    const s = startGameLoop(era3State());
    const first = s.era3CurrentPlayerId!;
    const next = gameReducer(s, { type: 'END_TURN', playerId: first });
    expect(next.era3CurrentPlayerId).not.toBe(first);
    expect(next.era3TurnNumber).toBe(1);
    const newStack = Object.values(next.era3Stacks!).find(st => st.ownerId === next.era3CurrentPlayerId)!;
    expect(newStack.movementLeft).toBeGreaterThan(0);
  });

  it('wraps and increments turn number', () => {
    const s = startGameLoop(era3State());
    const first = s.era3CurrentPlayerId!;
    const afterP1 = gameReducer(s, { type: 'END_TURN', playerId: first });
    const afterP2 = gameReducer(afterP1, { type: 'END_TURN', playerId: afterP1.era3CurrentPlayerId! });
    expect(afterP2.era3CurrentPlayerId).toBe(first);
    expect(afterP2.era3TurnNumber).toBe(2);
  });

  it('rejects end turn from wrong player', () => {
    const s = startGameLoop(era3State());
    const other = s.era3TurnOrder!.find(id => id !== s.era3CurrentPlayerId)!;
    expect(() => gameReducer(s, { type: 'END_TURN', playerId: other })).toThrow(/not your turn/i);
  });
});
