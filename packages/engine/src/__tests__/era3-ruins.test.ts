import { describe, it, expect } from 'vitest';
import {
  generateMap, applyRuinsLoot, rollRuinsReward, isLootableRuins,
  hexKey,
} from '../era3/index.js';
import { createRng } from '../state/random.js';
import type { GameState, Player, Stack, Hex, RuinsReward } from '../index.js';

function mkPlayer(id: string, capCoord: { q: number; r: number }): Player {
  return {
    id, name: id, raceId: 'elf', isBot: false,
    tiles: [], score: 0, cards: [],
    era3State: {
      capitalCoord: capCoord,
      goldCoins: 0,
      techLevels: { war: 0, science: 0, resources: 0, economy: 0 },
    },
  } as unknown as Player;
}

function mkState(seed: number, players: Player[]): GameState {
  const map = generateMap(seed, players);
  return {
    id: 's', seed, phase: 'era3',
    era3Phase: 'game_loop',
    era3TurnNumber: 1,
    players,
    map,
    era3Stacks: {},
    era3Deck: [
      { id: 'c1', name: 'X', name_en: 'X', flavorText: '', flavorText_en: '',
        mechanicalText: '', mechanicalText_en: '', effects: [] } as any,
      { id: 'c2', name: 'Y', name_en: 'Y', flavorText: '', flavorText_en: '',
        mechanicalText: '', mechanicalText_en: '', effects: [] } as any,
    ],
    era3Hands: {},
  } as unknown as GameState;
}

describe('ruins rewards — map gen', () => {
  it('assigns rewards to non-spawn ruins hexes and leaves spawn zones unassigned', () => {
    const players = [mkPlayer('p1', { q: 8, r: 0 })];
    const map = generateMap(42, players);
    for (const h of Object.values(map.hexes)) {
      if (h.terrain === 'ruins') {
        if (h.isSpawnZone) {
          expect(h.ruinsReward).toBeUndefined();
        } else {
          expect(h.ruinsReward).toBeDefined();
          expect(h.ruinsLooted).toBe(false);
        }
      }
    }
  });

  it('is deterministic: same seed → same rewards', () => {
    const p = [mkPlayer('p1', { q: 8, r: 0 })];
    const m1 = generateMap(42, p);
    const m2 = generateMap(42, p);
    for (const k of Object.keys(m1.hexes)) {
      expect(m1.hexes[k].ruinsReward).toEqual(m2.hexes[k].ruinsReward);
    }
  });

  it('produces a mix of reward kinds across 30 seeds', () => {
    const counts: Record<string, number> = {};
    for (let s = 1; s <= 30; s++) {
      const rng = createRng(s * 7919);
      const r = rollRuinsReward(rng);
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    }
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(3);
  });
});

describe('applyRuinsLoot — effects', () => {
  it('gold reward increments player gold and marks hex looted', () => {
    const p1 = mkPlayer('p1', { q: 8, r: 0 });
    const state = mkState(42, [p1]);
    // Find a ruins hex with a gold reward.
    const ruinsHex = Object.values(state.map!.hexes)
      .find(h => h.terrain === 'ruins' && !h.isSpawnZone && h.ruinsReward?.kind === 'gold');
    if (!ruinsHex) return; // Not guaranteed with seed 42 — skip.

    // Make a fake stack at that hex.
    const stack: Stack = {
      id: 'stk1', ownerId: 'p1',
      units: [{ id: 'u1', type: 'infantry', ownerId: 'p1', currentHp: 3,
        hasMovedThisTurn: false, hasAttackedThisTurn: false }],
      position: ruinsHex.coord, movementLeft: 0,
    };
    const stated = { ...state, era3Stacks: { stk1: stack } };

    const amount = (ruinsHex.ruinsReward as Extract<RuinsReward, { kind: 'gold' }>).amount;
    const after = applyRuinsLoot(stated, 'p1', 'stk1', ruinsHex.coord);
    const p = after.players.find(pl => pl.id === 'p1')!;
    expect(p.era3State!.goldCoins).toBe(amount);
    const afterHex = after.map!.hexes[hexKey(ruinsHex.coord)];
    expect(afterHex.ruinsLooted).toBe(true);
    expect(after.era3RuinsLog?.[0].reward.kind).toBe('gold');
  });

  it('double-entering a looted ruins is a no-op', () => {
    const p1 = mkPlayer('p1', { q: 8, r: 0 });
    const state = mkState(42, [p1]);
    const ruinsHex = Object.values(state.map!.hexes)
      .find(h => h.terrain === 'ruins' && !h.isSpawnZone && h.ruinsReward);
    if (!ruinsHex) return;

    const stack: Stack = {
      id: 'stk1', ownerId: 'p1',
      units: [{ id: 'u1', type: 'infantry', ownerId: 'p1', currentHp: 3,
        hasMovedThisTurn: false, hasAttackedThisTurn: false }],
      position: ruinsHex.coord, movementLeft: 0,
    };
    const stated = { ...state, era3Stacks: { stk1: stack } };

    const first = applyRuinsLoot(stated, 'p1', 'stk1', ruinsHex.coord);
    const second = applyRuinsLoot(first, 'p1', 'stk1', ruinsHex.coord);
    // Gold should not double; log should not grow.
    const p1a = first.players.find(pl => pl.id === 'p1')!;
    const p1b = second.players.find(pl => pl.id === 'p1')!;
    expect(p1b.era3State!.goldCoins).toBe(p1a.era3State!.goldCoins);
    expect(second.era3RuinsLog?.length).toBe(first.era3RuinsLog?.length);
  });

  it('non-ruins hex is a no-op', () => {
    const p1 = mkPlayer('p1', { q: 8, r: 0 });
    const state = mkState(42, [p1]);
    const plainHex = Object.values(state.map!.hexes).find(h => h.terrain === 'plain')!;
    const out = applyRuinsLoot(state, 'p1', 'stk1', plainHex.coord);
    expect(out).toBe(state);
  });

  it('spawn-zone ruins is a no-op (belongs to Dhakhan)', () => {
    const p1 = mkPlayer('p1', { q: 8, r: 0 });
    const state = mkState(42, [p1]);
    const spawnHex = Object.values(state.map!.hexes)
      .find(h => h.terrain === 'ruins' && h.isSpawnZone);
    if (!spawnHex) return;
    const out = applyRuinsLoot(state, 'p1', 'stk1', spawnHex.coord);
    expect(out).toBe(state);
  });
});

describe('isLootableRuins', () => {
  it('returns true for unlooted ruins with a real reward', () => {
    const hex: Hex = {
      coord: { q: 3, r: 0 }, terrain: 'ruins',
      isSpawnZone: false, isCapital: false, stackId: null,
      ruinsReward: { kind: 'gold', amount: 5 }, ruinsLooted: false,
    };
    expect(isLootableRuins(hex)).toBe(true);
  });

  it('returns false once looted', () => {
    const hex: Hex = {
      coord: { q: 3, r: 0 }, terrain: 'ruins',
      isSpawnZone: false, isCapital: false, stackId: null,
      ruinsReward: { kind: 'gold', amount: 5 }, ruinsLooted: true,
    };
    expect(isLootableRuins(hex)).toBe(false);
  });

  it('returns false for empty-reward ruins', () => {
    const hex: Hex = {
      coord: { q: 3, r: 0 }, terrain: 'ruins',
      isSpawnZone: false, isCapital: false, stackId: null,
      ruinsReward: { kind: 'empty' }, ruinsLooted: false,
    };
    expect(isLootableRuins(hex)).toBe(false);
  });
});
