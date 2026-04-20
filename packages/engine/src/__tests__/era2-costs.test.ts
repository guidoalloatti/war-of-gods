import { describe, it, expect } from 'vitest';
import {
  calculateTechCost,
  calculateTotalSpent,
  convertSurplusToGold,
  computeTransferDelta,
  NO_COST_MODIFIERS,
  type CostModifiers,
} from '../era2/costs.js';
import { TECH_COSTS, getIncrementalCost } from '../era2/constants.js';

const mods = (partial: Partial<CostModifiers> = {}): CostModifiers => ({
  ...NO_COST_MODIFIERS,
  ...partial,
});

describe('calculateTechCost — base costs', () => {
  it('returns 0 when target <= current', () => {
    expect(calculateTechCost('war', 3, 3, 0)).toEqual({ totalCost: 0, freeLevelsConsumed: 0 });
    expect(calculateTechCost('science', 4, 2, 0)).toEqual({ totalCost: 0, freeLevelsConsumed: 0 });
  });

  it('war 0 → 5 costs 22', () => {
    const r = calculateTechCost('war', 0, 5, 0);
    expect(r.totalCost).toBe(22);
    expect(r.freeLevelsConsumed).toBe(0);
  });

  it('science 0 → 5 costs 19', () => {
    expect(calculateTechCost('science', 0, 5, 0).totalCost).toBe(19);
  });

  it('resources 0 → 5 costs 17', () => {
    expect(calculateTechCost('resources', 0, 5, 0).totalCost).toBe(17);
  });

  it('economy 0 → 5 costs 20', () => {
    expect(calculateTechCost('economy', 0, 5, 0).totalCost).toBe(20);
  });

  it('matches cumulative lookup for every start/target pair', () => {
    for (const tech of ['war', 'science', 'resources', 'economy'] as const) {
      for (let cur = 0; cur <= 5; cur++) {
        for (let tgt = cur; tgt <= 5; tgt++) {
          const expected = tgt === 0 ? 0 : TECH_COSTS[tech][tgt - 1] - (cur === 0 ? 0 : TECH_COSTS[tech][cur - 1]);
          expect(calculateTechCost(tech, cur, tgt, 0).totalCost).toBe(expected);
        }
      }
    }
  });

  it('incremental costs match getIncrementalCost', () => {
    expect(getIncrementalCost('war', 5)).toBe(22 - 13);
    expect(getIncrementalCost('war', 6)).toBe(40 - 22);
    expect(getIncrementalCost('economy', 1)).toBe(2);
  });
});

describe('calculateTechCost — level 6 gating', () => {
  it('throws when targeting level 6 without allowLevel6', () => {
    expect(() => calculateTechCost('war', 5, 6, 0)).toThrow(/Forja del Destino/);
  });

  it('war 5 → 6 costs 18 with allowLevel6', () => {
    expect(calculateTechCost('war', 5, 6, 0, NO_COST_MODIFIERS, true).totalCost).toBe(18);
  });

  it('war 0 → 6 costs 40 with allowLevel6', () => {
    expect(calculateTechCost('war', 0, 6, 0, NO_COST_MODIFIERS, true).totalCost).toBe(40);
  });

  it('rejects level 7+', () => {
    expect(() => calculateTechCost('war', 0, 7, 0, NO_COST_MODIFIERS, true)).toThrow(/Invalid target level/);
  });

  it('rejects negative levels', () => {
    expect(() => calculateTechCost('war', -1, 2, 0)).toThrow(/Invalid current level/);
    expect(() => calculateTechCost('war', 0, -1, 0)).toThrow(/Invalid target level/);
  });
});

describe('calculateTechCost — free levels', () => {
  it('1 free level skips the first purchase', () => {
    // war 0 → 3 normally costs 7. With 1 free: skip lvl 1 (cost 1), pay lvls 2-3 (+2+4 = 6).
    expect(calculateTechCost('war', 0, 3, 1)).toEqual({ totalCost: 6, freeLevelsConsumed: 1 });
  });

  it('2 free levels skip the first two purchases', () => {
    // war 0 → 3: skip lvls 1-2 (1+2=3), pay lvl 3 (4).
    expect(calculateTechCost('war', 0, 3, 2)).toEqual({ totalCost: 4, freeLevelsConsumed: 2 });
  });

  it('free levels in excess of purchases are not consumed', () => {
    // war 0 → 2 with 5 free: only 2 consumed, cost = 0.
    expect(calculateTechCost('war', 0, 2, 5)).toEqual({ totalCost: 0, freeLevelsConsumed: 2 });
  });

  it('free levels with same-level current/target → no consumption', () => {
    expect(calculateTechCost('war', 3, 3, 5)).toEqual({ totalCost: 0, freeLevelsConsumed: 0 });
  });

  it('free levels work from a non-zero current level', () => {
    // war 2 → 5: normally 4+6+9 = 19. With 2 free: skip lvls 3-4 (4+6), pay lvl 5 (9).
    expect(calculateTechCost('war', 2, 5, 2)).toEqual({ totalCost: 9, freeLevelsConsumed: 2 });
  });
});

describe('calculateTechCost — cost modifiers', () => {
  it('flat modifier subtracts from total', () => {
    // war 0 → 3 = 7; flat -2 → 5.
    expect(calculateTechCost('war', 0, 3, 0, mods({ flat: -2 })).totalCost).toBe(5);
  });

  it('flat modifier adds to total', () => {
    expect(calculateTechCost('war', 0, 3, 0, mods({ flat: 5 })).totalCost).toBe(12);
  });

  it('flat modifier cannot push total below 0', () => {
    expect(calculateTechCost('war', 0, 1, 0, mods({ flat: -100 })).totalCost).toBe(0);
  });

  it('perLevel modifier adds to each purchased level', () => {
    // war 0 → 3: lvls (1+2+4) + 1 per level = (2+3+5) = 10.
    expect(calculateTechCost('war', 0, 3, 0, mods({ perLevel: 1 })).totalCost).toBe(10);
  });

  it('perLevel modifier is clamped to minCostPerLevel (default 1)', () => {
    // war 0 → 3 with perLevel -100: all levels clamp to 1 → 3.
    expect(calculateTechCost('war', 0, 3, 0, mods({ perLevel: -100 })).totalCost).toBe(3);
  });

  it('custom minCostPerLevel raises the floor', () => {
    // war 0 → 3 with perLevel -100, minCostPerLevel 2 → 2+2+2 = 6.
    expect(calculateTechCost('war', 0, 3, 0, mods({ perLevel: -100, minCostPerLevel: 2 })).totalCost).toBe(6);
  });

  it('minCostPerLevel of 0 allows free purchases via perLevel', () => {
    expect(calculateTechCost('war', 0, 3, 0, mods({ perLevel: -100, minCostPerLevel: 0 })).totalCost).toBe(0);
  });

  it('flat + perLevel compose', () => {
    // war 0 → 3: perLevel +2 → (3+4+6)=13, plus flat -5 → 8.
    expect(calculateTechCost('war', 0, 3, 0, mods({ flat: -5, perLevel: 2 })).totalCost).toBe(8);
  });

  it('free levels apply before per-level modifiers', () => {
    // war 0 → 3 with 1 free and perLevel +2: skip lvl1, pay lvls 2,3 → (2+2)+(4+2) = 10.
    expect(calculateTechCost('war', 0, 3, 1, mods({ perLevel: 2 }))).toEqual({ totalCost: 10, freeLevelsConsumed: 1 });
  });
});

describe('calculateTotalSpent', () => {
  it('sums across all four techs', () => {
    const total = calculateTotalSpent({
      allocations: {
        war:       { currentLevel: 0, targetLevel: 3, freeLevelsRemaining: 0, modifiers: NO_COST_MODIFIERS }, // 7
        science:   { currentLevel: 0, targetLevel: 2, freeLevelsRemaining: 0, modifiers: NO_COST_MODIFIERS }, // 3
        resources: { currentLevel: 1, targetLevel: 1, freeLevelsRemaining: 0, modifiers: NO_COST_MODIFIERS }, // 0
        economy:   { currentLevel: 0, targetLevel: 1, freeLevelsRemaining: 0, modifiers: NO_COST_MODIFIERS }, // 2
      },
      allowLevel6: false,
    });
    expect(total).toBe(12);
  });

  it('per-tech modifiers are independent', () => {
    const total = calculateTotalSpent({
      allocations: {
        war:       { currentLevel: 0, targetLevel: 3, freeLevelsRemaining: 0, modifiers: mods({ flat: -2 }) },   // 5
        science:   { currentLevel: 0, targetLevel: 3, freeLevelsRemaining: 0, modifiers: mods({ perLevel: 1 }) }, // (1+2+3)+3 = 9
        resources: { currentLevel: 0, targetLevel: 0, freeLevelsRemaining: 0, modifiers: NO_COST_MODIFIERS },     // 0
        economy:   { currentLevel: 0, targetLevel: 1, freeLevelsRemaining: 1, modifiers: NO_COST_MODIFIERS },     // 0 (free)
      },
      allowLevel6: false,
    });
    expect(total).toBe(14);
  });
});

describe('convertSurplusToGold', () => {
  it('default ratio 0.5 halves floor', () => {
    expect(convertSurplusToGold(10)).toBe(5);
    expect(convertSurplusToGold(11)).toBe(5);
    expect(convertSurplusToGold(1)).toBe(0);
  });

  it('returns 0 for non-positive surplus', () => {
    expect(convertSurplusToGold(0)).toBe(0);
    expect(convertSurplusToGold(-5)).toBe(0);
  });

  it('respects custom ratio', () => {
    expect(convertSurplusToGold(10, 1)).toBe(10);
    expect(convertSurplusToGold(10, 0.25)).toBe(2);
  });
});

describe('computeTransferDelta', () => {
  it('default 2:1 exchange halves floor', () => {
    expect(computeTransferDelta(10, 0.5, 1)).toBe(5);
    expect(computeTransferDelta(11, 0.5, 1)).toBe(5);
  });

  it('receive ratio 2 is capped at offered', () => {
    // 10 × 0.5 × 2 = 10 → equal to offered, not more.
    expect(computeTransferDelta(10, 0.5, 2)).toBe(10);
  });

  it('stacked > 1.0 ratios are capped at offered', () => {
    // Would be 30, cap at 10.
    expect(computeTransferDelta(10, 1.5, 2)).toBe(10);
  });

  it('returns 0 for non-positive offered', () => {
    expect(computeTransferDelta(0, 0.5, 1)).toBe(0);
    expect(computeTransferDelta(-5, 0.5, 1)).toBe(0);
  });

  it('1:1 give, 1:1 receive returns offered', () => {
    expect(computeTransferDelta(7, 1, 1)).toBe(7);
  });
});
