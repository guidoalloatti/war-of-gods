import { describe, it, expect } from 'vitest';
import {
  DIRECTIONS, hexKey, parseHexKey, hexEquals, hexAdd,
  distance, neighbors, ring, disk, hexLine, hexRound,
} from '../era3/hex.js';

describe('hex primitives', () => {
  it('DIRECTIONS has exactly 6 entries summing to (0,0)', () => {
    expect(DIRECTIONS.length).toBe(6);
    const sum = DIRECTIONS.reduce((acc, d) => ({ q: acc.q + d.q, r: acc.r + d.r }), { q: 0, r: 0 });
    expect(sum).toEqual({ q: 0, r: 0 });
  });

  it('hexKey roundtrips through parseHexKey', () => {
    const coords = [{ q: 0, r: 0 }, { q: 3, r: -2 }, { q: -5, r: 7 }];
    for (const c of coords) {
      expect(parseHexKey(hexKey(c))).toEqual(c);
    }
  });

  it('parseHexKey throws on invalid input', () => {
    expect(() => parseHexKey('foo')).toThrow();
    expect(() => parseHexKey('1')).toThrow();
  });

  it('hexEquals and hexAdd behave as expected', () => {
    expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    expect(hexEquals({ q: 1, r: 2 }, { q: 2, r: 1 })).toBe(false);
    expect(hexAdd({ q: 1, r: 2 }, { q: 3, r: -1 })).toEqual({ q: 4, r: 1 });
  });

  it('distance is symmetric and zero on identity', () => {
    const a = { q: 3, r: -2 };
    const b = { q: -1, r: 5 };
    expect(distance(a, b)).toBe(distance(b, a));
    expect(distance(a, a)).toBe(0);
  });

  it('distance of a unit direction step is 1', () => {
    for (const d of DIRECTIONS) {
      expect(distance({ q: 0, r: 0 }, d)).toBe(1);
    }
  });

  it('neighbors always returns 6 distinct hexes all at distance 1', () => {
    const origin = { q: 0, r: 0 };
    const ns = neighbors(origin);
    expect(ns.length).toBe(6);
    const keys = new Set(ns.map(hexKey));
    expect(keys.size).toBe(6);
    for (const n of ns) {
      expect(distance(origin, n)).toBe(1);
    }
  });

  it('ring(0) returns origin only', () => {
    expect(ring(0)).toEqual([{ q: 0, r: 0 }]);
  });

  it('ring(r).length === 6r for r > 0', () => {
    for (let r = 1; r <= 5; r++) {
      expect(ring(r).length).toBe(6 * r);
    }
  });

  it('ring(r) entries are all at exact distance r from origin', () => {
    for (let r = 1; r <= 4; r++) {
      for (const h of ring(r)) {
        expect(distance({ q: 0, r: 0 }, h)).toBe(r);
      }
    }
  });

  it('disk(r) contains 1 + 3r(r+1) hexes', () => {
    for (let r = 0; r <= 4; r++) {
      expect(disk(r).length).toBe(1 + 3 * r * (r + 1));
    }
  });

  it('disk(10) contains 331 hexes', () => {
    expect(disk(10).length).toBe(331);
  });

  it('hexLine produces a connected path', () => {
    const a = { q: 0, r: 0 };
    const b = { q: 3, r: -2 };
    const line = hexLine(a, b);
    expect(line[0]).toEqual(a);
    expect(line[line.length - 1]).toEqual(b);
    for (let i = 0; i < line.length - 1; i++) {
      expect(distance(line[i], line[i + 1])).toBe(1);
    }
  });

  it('hexRound snaps fractional coords to the nearest hex', () => {
    expect(hexRound({ q: 0.1, r: 0.1 })).toEqual({ q: 0, r: 0 });
    expect(hexRound({ q: 1.7, r: -0.6 })).toEqual({ q: 2, r: -1 });
  });

  it('ring radii do not overlap and tile the disk', () => {
    const all: string[] = [];
    for (let r = 0; r <= 4; r++) {
      for (const h of ring(r)) all.push(hexKey(h));
    }
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(disk(4).length);
  });
});
