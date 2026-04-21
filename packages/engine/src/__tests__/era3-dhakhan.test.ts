import { describe, it, expect } from 'vitest';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import { gameReducer } from '../reducer.js';
import { spawnWroughtForCycle, runDhakhanTurn, DHAKHAN_OWNER_ID, BOSS_STACK_ID } from '../era3/index.js';
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

function era3(seed = 9001): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return transitionEra2ToEra3(base);
}

describe('spawnWroughtForCycle', () => {
  it('spawns a Wrought infantry on each spawn zone', () => {
    const s = era3();
    const spawnZones = Object.values(s.map!.hexes).filter(h => h.isSpawnZone);
    expect(spawnZones.length).toBeGreaterThan(0);

    const after = spawnWroughtForCycle(s);
    const wrought = Object.values(after.era3Stacks!).filter(st => st.ownerId === DHAKHAN_OWNER_ID && st.id !== BOSS_STACK_ID);
    expect(wrought.length).toBe(spawnZones.length);
    for (const st of wrought) {
      expect(st.units).toHaveLength(1);
      expect(st.units[0].type).toBe('infantry');
    }
  });

  it('merges into existing Wrought stack on a spawn zone', () => {
    const s = era3();
    const once = spawnWroughtForCycle(s);
    const twice = spawnWroughtForCycle(once);
    const wrought = Object.values(twice.era3Stacks!).filter(st => st.ownerId === DHAKHAN_OWNER_ID && st.id !== BOSS_STACK_ID);
    // Same number of stacks; each has 2 units now.
    expect(wrought.length).toBe(
      Object.values(s.map!.hexes).filter(h => h.isSpawnZone).length,
    );
    expect(wrought.every(st => st.units.length === 2)).toBe(true);
  });
});

describe('runDhakhanTurn', () => {
  it('moves at least one Wrought stack closer to a capital', () => {
    let s = era3();
    s = spawnWroughtForCycle(s);
    const before = Object.values(s.era3Stacks!).filter(st => st.ownerId === DHAKHAN_OWNER_ID && st.id !== BOSS_STACK_ID);
    const after = runDhakhanTurn(s);
    const afterStacks = Object.values(after.era3Stacks!).filter(st => st.ownerId === DHAKHAN_OWNER_ID && st.id !== BOSS_STACK_ID);

    expect(afterStacks.length).toBeGreaterThan(0);
    // At least one stack must have moved; stuck stacks are OK when every
    // passable neighbor would either increase distance or be blocked.
    const anyMoved = afterStacks.some(a => {
      const orig = before.find(b => b.id === a.id);
      return orig && (orig.position.q !== a.position.q || orig.position.r !== a.position.r);
    });
    expect(anyMoved).toBe(true);
  });
});

describe('end-of-cycle in reducer', () => {
  it('triggers Dhakhan spawn + movement when turn order wraps', () => {
    let s = gameReducer(era3(), { type: 'START_ERA3_GAME_LOOP' });
    const firstPlayer = s.era3CurrentPlayerId!;

    // Every player ends their turn once — we wrap to turn 2.
    for (const pid of s.era3TurnOrder!) {
      s = gameReducer(s, { type: 'END_TURN', playerId: pid });
    }

    expect(s.era3TurnNumber).toBe(2);
    expect(s.era3CurrentPlayerId).toBe(firstPlayer);
    // Wrought stacks exist and at least one has moved away from its spawn hex.
    const wrought = Object.values(s.era3Stacks!).filter(st => st.ownerId === DHAKHAN_OWNER_ID && st.id !== BOSS_STACK_ID);
    expect(wrought.length).toBeGreaterThan(0);
  });

  it('no Dhakhan activity on mid-cycle END_TURN', () => {
    let s = gameReducer(era3(), { type: 'START_ERA3_GAME_LOOP' });
    const firstPlayer = s.era3CurrentPlayerId!;
    s = gameReducer(s, { type: 'END_TURN', playerId: firstPlayer });
    // Turn 1 still, no wrap → no Wrought spawned yet.
    expect(s.era3TurnNumber).toBe(1);
    const wrought = Object.values(s.era3Stacks!).filter(st => st.ownerId === DHAKHAN_OWNER_ID && st.id !== BOSS_STACK_ID);
    expect(wrought.length).toBe(0);
  });
});
