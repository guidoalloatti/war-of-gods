import { describe, it, expect } from 'vitest';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import { MAX_STACK_SIZE } from '../era3/constants.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { RaceId } from '../types/race.js';

const RACES: RaceId[] = ['elf', 'dwarf', 'human', 'halfelf'];

function makePlayer(id: string, raceId: RaceId, freeUnitCountMountedExtra = 0): Player {
  const base: Player = {
    id,
    name: id,
    raceId,
    isBot: false,
    botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [],
    relic: null,
    score: 25,
    hasTraded: false,
    hasPlaced: false,
    connected: true,
  };
  const era2 = initPlayerEra2State(base);
  if (freeUnitCountMountedExtra > 0) {
    era2.freeUnitsForEra3 = [
      ...era2.freeUnitsForEra3,
      { unit: 'mounted', count: freeUnitCountMountedExtra },
    ];
  }
  return { ...base, era2State: era2 };
}

function makeState(players: Player[]): GameState {
  return {
    id: 'g1',
    mode: 'solo_bots',
    soloVariant: null,
    phase: 'era2',
    era1Phase: 'complete',
    era2Phase: 'complete',
    players,
    tilePile: [],
    worldCard: null,
    activeTrades: [],
    seed: 424242,
    roomCode: null,
    createdAt: 0,
  };
}

describe('transitionEra2ToEra3', () => {
  it('sets phase=era3 and era3Phase=game_loop (Session 4a auto-starts)', () => {
    const players = RACES.map((r, i) => makePlayer(`p${i}`, r));
    const out = transitionEra2ToEra3(makeState(players));
    expect(out.phase).toBe('era3');
    expect(out.era3Phase).toBe('game_loop');
    expect(out.era3TurnOrder?.length).toBe(players.length);
    expect(out.era3CurrentPlayerId).toBeTruthy();
    expect(out.era3TurnNumber).toBe(1);
  });

  it('attaches a GameMap with 331 hexes', () => {
    const players = RACES.map((r, i) => makePlayer(`p${i}`, r));
    const out = transitionEra2ToEra3(makeState(players));
    expect(out.map).toBeTruthy();
    expect(Object.keys(out.map!.hexes).length).toBe(331);
  });

  it('creates one stack per player on their capital hex', () => {
    const players = RACES.map((r, i) => makePlayer(`p${i}`, r));
    const out = transitionEra2ToEra3(makeState(players));

    const playerStacks = Object.values(out.era3Stacks ?? {})
      .filter(s => s.ownerId !== 'dhakhan');
    expect(playerStacks.length).toBe(players.length);

    for (const p of out.players) {
      expect(p.era3State).toBeTruthy();
      const capitalKey = `${p.era3State!.capitalCoord.q},${p.era3State!.capitalCoord.r}`;
      const capitalHex = out.map!.hexes[capitalKey];
      expect(capitalHex.isCapital).toBe(true);
      expect(capitalHex.capitalOwnerId).toBe(p.id);
      expect(capitalHex.stackId).toBeTruthy();
      const stack = out.era3Stacks![capitalHex.stackId!];
      expect(stack.ownerId).toBe(p.id);
      expect(stack.units.length).toBeGreaterThan(0);
      expect(stack.units.length).toBeLessThanOrEqual(MAX_STACK_SIZE);
    }
  });

  it('carries over goldCoins and techLevels from era2State', () => {
    const players = RACES.slice(0, 2).map((r, i) => {
      const p = makePlayer(`p${i}`, r);
      p.era2State!.goldCoins = 7 + i;
      return p;
    });
    const out = transitionEra2ToEra3(makeState(players));
    for (const [i, p] of out.players.entries()) {
      expect(p.era3State!.goldCoins).toBe(7 + i);
      expect(p.era3State!.techLevels).toEqual(p.era2State!.techLevels);
    }
  });

  it('records overflow when free units exceed MAX_STACK_SIZE', () => {
    // human racial = 1 mounted. Add 6 extra mounted → 7 total > 6 cap.
    const p = makePlayer('p1', 'human', 6);
    const out = transitionEra2ToEra3(makeState([p]));
    const outPlayer = out.players[0];
    const playerStackId = Object.values(out.era3Stacks ?? {})
      .find(s => s.ownerId !== 'dhakhan')!.id;
    expect(out.era3Stacks![playerStackId].units.length).toBe(MAX_STACK_SIZE);
    expect(outPlayer.era3State!.initialDeploymentOverflow).toBeTruthy();
    const overflowTotal = outPlayer.era3State!.initialDeploymentOverflow!
      .reduce((acc, g) => acc + g.count, 0);
    expect(overflowTotal).toBe(1);
  });

  it('is idempotent — calling twice does not regenerate the map', () => {
    const players = RACES.map((r, i) => makePlayer(`p${i}`, r));
    const a = transitionEra2ToEra3(makeState(players));
    const b = transitionEra2ToEra3(a);
    expect(a).toBe(b); // short-circuits when map already exists
  });

  it('is deterministic given the same seed + players', () => {
    const mk = () => RACES.map((r, i) => makePlayer(`p${i}`, r));
    const a = transitionEra2ToEra3(makeState(mk()));
    const b = transitionEra2ToEra3(makeState(mk()));
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
    expect(JSON.stringify(a.era3Stacks)).toBe(JSON.stringify(b.era3Stacks));
  });

  it('produces deterministic stack and unit IDs using the seed', () => {
    const players = RACES.slice(0, 2).map((r, i) => makePlayer(`p${i}`, r));
    const out = transitionEra2ToEra3(makeState(players));
    const playerStacks = Object.values(out.era3Stacks ?? {})
      .filter(s => s.ownerId !== 'dhakhan');
    for (const stack of playerStacks) {
      // Stack id may be `stack_<seed>_<n>` or `stack_<seed>_c_<n>` (free recruit).
      expect(stack.id).toMatch(/^stack_424242(_c)?_\d+$/);
      for (const u of stack.units) {
        expect(u.id).toMatch(/^unit_424242(_c)?_\d+$/);
      }
    }
  });
});
