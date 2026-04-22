import { describe, it, expect } from 'vitest';
import { gameReducer } from '../reducer.js';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import {
  hexKey, neighbors, validateBuildRoad,
  ERA3_BUILD_ROAD_COST, DHAKHAN_OWNER_ID,
} from '../era3/index.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';
import type { Stack } from '../types/era3.js';

const RACES: RaceId[] = ['elf', 'dwarf'];

function mkPlayer(id: string, raceId: RaceId): Player {
  const base: Player = {
    id, name: id, raceId, isBot: false, botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [], relic: null, score: 25, hasTraded: false, hasPlaced: false, connected: true,
  };
  return { ...base, era2State: initPlayerEra2State(base) };
}

function mkState(seed = 777): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return transitionEra2ToEra3(base);
}

function giveGold(state: GameState, playerId: string, gold: number): GameState {
  return {
    ...state,
    players: state.players.map(p =>
      p.id === playerId && p.era3State
        ? { ...p, era3State: { ...p.era3State, goldCoins: gold } }
        : p,
    ),
  };
}

describe('BUILD_ROAD', () => {
  it('paves a paveable adjacent hex and deducts gold', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 10);
    const myStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    // Find an adjacent hex with paveable terrain, no enemy on it.
    const target = neighbors(myStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      if (!h) return false;
      if (h.isCapital || h.isSpawnZone) return false;
      if (!['plain', 'forest', 'swamp', 'ruins'].includes(h.terrain)) return false;
      if (h.stackId) {
        const occ = s.era3Stacks![h.stackId];
        if (occ && occ.ownerId === DHAKHAN_OWNER_ID) return false;
      }
      return true;
    });
    expect(target).toBeTruthy();

    const goldBefore = s.players.find(p => p.id === current)!.era3State!.goldCoins;
    const next = gameReducer(s, { type: 'BUILD_ROAD', playerId: current, coord: target! });

    expect(next.map!.hexes[hexKey(target!)].terrain).toBe('road');
    const goldAfter = next.players.find(p => p.id === current)!.era3State!.goldCoins;
    expect(goldAfter).toBe(goldBefore - ERA3_BUILD_ROAD_COST);
    expect(next.players.find(p => p.id === current)!.era3State!.roadsBuiltThisTurn).toBe(1);
  });

  it('rejects building without an adjacent friendly stack', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 10);
    // Find any plain hex that is NOT adjacent to any of the current player's stacks.
    const mine = Object.values(s.era3Stacks!).filter(st => st.ownerId === current);
    const mineCoords = new Set(mine.flatMap(st => neighbors(st.position).map(hexKey)));
    const lonely = Object.values(s.map!.hexes).find(h =>
      !h.isCapital && !h.isSpawnZone && h.terrain === 'plain' && !mineCoords.has(hexKey(h.coord)),
    );
    expect(lonely).toBeTruthy();
    expect(() =>
      gameReducer(s, { type: 'BUILD_ROAD', playerId: current, coord: lonely!.coord }),
    ).toThrow(/no_friendly_adjacent/);
  });

  it('rejects building on a mountain', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 10);
    const myStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    // Force an adjacent hex to be a mountain.
    const target = neighbors(myStack.position).find(n => s.map!.hexes[hexKey(n)]);
    expect(target).toBeTruthy();
    const k = hexKey(target!);
    s = {
      ...s,
      map: {
        ...s.map!,
        hexes: { ...s.map!.hexes, [k]: { ...s.map!.hexes[k], terrain: 'mountain', isCapital: false, isSpawnZone: false, stackId: null } },
      },
    };
    expect(() =>
      gameReducer(s, { type: 'BUILD_ROAD', playerId: current, coord: target! }),
    ).toThrow(/terrain_not_paveable/);
  });

  it('rejects building without enough gold', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 0);
    const myStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    const target = neighbors(myStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && !h.isCapital && !h.isSpawnZone && h.terrain === 'plain' && !h.stackId;
    });
    if (!target) return;
    expect(() =>
      gameReducer(s, { type: 'BUILD_ROAD', playerId: current, coord: target! }),
    ).toThrow(/not_enough_gold/);
  });

  it('rejects a fourth road on the same turn (limit is 3)', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 30);
    const myStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    const candidates = neighbors(myStack.position).filter(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && !h.isCapital && !h.isSpawnZone && ['plain', 'forest', 'swamp', 'ruins'].includes(h.terrain) && !h.stackId;
    });
    if (candidates.length < 4) return; // skip if not enough eligible neighbors

    let cur = s;
    cur = gameReducer(cur, { type: 'BUILD_ROAD', playerId: current, coord: candidates[0] });
    cur = gameReducer(cur, { type: 'BUILD_ROAD', playerId: current, coord: candidates[1] });
    cur = gameReducer(cur, { type: 'BUILD_ROAD', playerId: current, coord: candidates[2] });
    expect(() =>
      gameReducer(cur, { type: 'BUILD_ROAD', playerId: current, coord: candidates[3] }),
    ).toThrow(/already_built_this_turn/);
  });

  it('roadsBuiltThisTurn resets when turn ends', () => {
    let s = mkState();
    const p0 = s.era3CurrentPlayerId!;
    s = giveGold(s, p0, 10);
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === p0)!;
    const target = neighbors(stack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && !h.isCapital && !h.isSpawnZone && ['plain', 'forest', 'swamp', 'ruins'].includes(h.terrain) && !h.stackId;
    });
    if (!target) return;

    s = gameReducer(s, { type: 'BUILD_ROAD', playerId: p0, coord: target });
    expect(s.players.find(p => p.id === p0)!.era3State!.roadsBuiltThisTurn).toBe(1);
    // End p0's turn — p1 starts. Wrap back to p0.
    s = gameReducer(s, { type: 'END_TURN', playerId: p0 });
    s = gameReducer(s, { type: 'END_TURN', playerId: s.era3CurrentPlayerId! });
    expect(s.players.find(p => p.id === p0)!.era3State!.roadsBuiltThisTurn).toBe(0);
  });
});

describe('validateBuildRoad', () => {
  it('returns null for a valid build', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 10);
    const myStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    const target = neighbors(myStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && !h.isCapital && !h.isSpawnZone && ['plain', 'forest', 'swamp', 'ruins'].includes(h.terrain) && !h.stackId;
    });
    if (!target) return;
    expect(validateBuildRoad(s, current, target)).toBeNull();
  });

  it('rejects building on the capital', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 10);
    const capital = Object.values(s.map!.hexes).find(h => h.isCapital && h.capitalOwnerId === current)!;
    expect(validateBuildRoad(s, current, capital.coord)).toBe('cannot_pave_capital');
  });

  it('rejects building on a hex occupied by Dhakhan', () => {
    let s = mkState();
    const current = s.era3CurrentPlayerId!;
    s = giveGold(s, current, 10);
    const myStack = Object.values(s.era3Stacks!).find(st => st.ownerId === current)!;
    const target = neighbors(myStack.position).find(n => {
      const h = s.map!.hexes[hexKey(n)];
      return h && !h.isCapital && !h.isSpawnZone && h.terrain === 'plain' && !h.stackId;
    });
    if (!target) return;
    const dStack: Stack = {
      id: 'wrought_test',
      ownerId: DHAKHAN_OWNER_ID,
      units: [],
      position: target,
      movementLeft: 0,
    };
    const k = hexKey(target);
    const s2: GameState = {
      ...s,
      era3Stacks: { ...s.era3Stacks, wrought_test: dStack },
      map: { ...s.map!, hexes: { ...s.map!.hexes, [k]: { ...s.map!.hexes[k], stackId: 'wrought_test' } } },
    };
    expect(validateBuildRoad(s2, current, target)).toBe('hex_occupied_by_enemy');
  });
});
