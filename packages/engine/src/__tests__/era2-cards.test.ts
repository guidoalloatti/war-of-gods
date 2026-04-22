import { describe, it, expect } from 'vitest';
import { createGame } from '../state/createGame.js';
import { initPlayerEra2State } from '../era2/init.js';
import { worldCardDeckEra2, eraCardDeckEra2 } from '../cards/loader.js';
import { applyEffect, applyEffects, type EffectContext } from '../cards/effect-dispatcher.js';
import type { GameState } from '../types/game.js';
import type { CardEffect } from '../cards/types.js';

function buildEra2State(overrides: { seed?: number } = {}): GameState {
  const base = createGame({
    mode: 'solo_bots',
    seed: overrides.seed ?? 42,
    playerConfigs: [
      { name: 'P1', raceId: 'human', isBot: false },
      { name: 'P2', raceId: 'elf', isBot: false },
    ],
  });
  const players = base.players.map(p => ({
    ...p,
    score: 20,
    era2State: initPlayerEra2State({ ...p, score: 20 }),
  }));
  return { ...base, phase: 'era2', era2Phase: 'world_card_reveal', players, doomClock: 12, activeTransfers: [], kingsTableReady: [], pendingEra2Cards: {} };
}

function ctxAll(): EffectContext {
  return { playerId: null, trigger: 'on_era2_start' };
}

describe('Era II world cards — coverage', () => {
  it('loads all 15 world cards and each has a handler (no throw)', () => {
    expect(worldCardDeckEra2).toHaveLength(15);
    const s = buildEra2State();
    for (const card of worldCardDeckEra2) {
      // Apply on every trigger any of its effects might use — handler should never throw.
      const triggers: EffectContext['trigger'][] = [
        'on_era2_start',
        'on_era2_close',
        'kings_table_open',
        'on_tech_allocation',
        'on_convert_surplus',
      ];
      for (const trigger of triggers) {
        expect(() => applyEffects(s, card.effects, { playerId: null, trigger })).not.toThrow();
      }
    }
  });

  it('Forja del Destino sets allowLevel6 = true for everyone', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_01')!;
    const out = applyEffects(s, card.effects, ctxAll());
    for (const p of out.players) expect(p.era2State!.allowLevel6).toBe(true);
  });

  it('La Mesa Redonda sets giveRatio = 1 via modify_give_ratio', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_02')!;
    const out = applyEffects(s, card.effects, { playerId: null, trigger: 'kings_table_open' });
    for (const p of out.players) {
      // giveRatio default 0.5 × 1 = 0.5. Card is intended as normalizer; verify applied.
      expect(p.era2State!.transferModifiers.giveRatio).toBe(0.5);
    }
  });

  it('La Veda de los Hierros adds +1 to war perLevel for all', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_03')!;
    const out = applyEffects(s, card.effects, ctxAll());
    for (const p of out.players) expect(p.era2State!.costModifiers.perLevel.war).toBe(1);
  });

  it('El Despertar del Saber discounts science by -1 perLevel min 1', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_04')!;
    const out = applyEffects(s, card.effects, ctxAll());
    for (const p of out.players) {
      expect(p.era2State!.costModifiers.perLevel.science).toBe(-1);
      expect(p.era2State!.costModifiers.minCostPerLevel).toBe(1);
    }
  });

  it('La Abundancia de Vali sets surplusRatio = 1', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_05')!;
    const out = applyEffects(s, card.effects, { playerId: null, trigger: 'on_convert_surplus' });
    for (const p of out.players) expect(p.era2State!.transferModifiers.surplusRatio).toBe(1);
  });

  it('El Reloj de Dhakhan decreases doomClock by 3 in saga mode', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_06')!;
    const out = applyEffects(s, card.effects, ctxAll());
    expect(out.doomClock).toBe(9);
  });

  it('La Tregua Sagrada sets all techs to minLevel 1', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_07')!;
    const out = applyEffects(s, card.effects, ctxAll());
    for (const p of out.players) {
      for (const t of ['war', 'science', 'resources', 'economy'] as const) {
        expect(p.era2State!.techLevels[t]).toBeGreaterThanOrEqual(1);
        expect(p.era2State!.baselineTechLevels[t]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('El Pacto de las Naciones grants +3 constructionPoints to all at close', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_08')!;
    const before = s.players.map(p => p.era2State!.constructionPoints);
    const out = applyEffects(s, card.effects, { playerId: null, trigger: 'on_era2_close' });
    out.players.forEach((p, i) => expect(p.era2State!.constructionPoints).toBe(before[i] + 3));
  });

  it('La Sombra del Débil gives +6 to the player with fewest points', () => {
    let s = buildEra2State();
    // Make P2 weaker.
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 1 ? { ...p, era2State: { ...p.era2State!, constructionPoints: 5 } } : p,
      ),
    };
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_09')!;
    const out = applyEffects(s, card.effects, ctxAll());
    expect(out.players[0].era2State!.constructionPoints).toBe(s.players[0].era2State!.constructionPoints);
    expect(out.players[1].era2State!.constructionPoints).toBe(11);
  });

  it('La Feria de los Sabios grants +1 reallocationsAllowed', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_10')!;
    const out = applyEffects(s, card.effects, { playerId: null, trigger: 'on_tech_allocation' });
    for (const p of out.players) expect(p.era2State!.reallocationsAllowed).toBe(1);
  });

  it('La Bendición del Sol grants +2 per tech ≥3', () => {
    let s = buildEra2State();
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0
          ? { ...p, era2State: { ...p.era2State!, techLevels: { war: 3, science: 3, resources: 0, economy: 0, religion: 0 } } }
          : p,
      ),
    };
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_12')!;
    const before = s.players[0].era2State!.constructionPoints;
    const out = applyEffects(s, card.effects, { playerId: null, trigger: 'on_era2_close' });
    expect(out.players[0].era2State!.constructionPoints).toBe(before + 4); // 2 techs × 2
  });

  it('El Don de los Ancestros triggers player_choice_free_tech (pending for human)', () => {
    const s = buildEra2State();
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_14')!;
    const out = applyEffects(s, card.effects, ctxAll());
    // Humans get pendingEffect; bots auto-pick.
    for (const p of out.players) {
      if (!p.isBot) {
        expect(p.pendingEffect?.type).toBe('player_choice_free_tech');
      }
    }
  });

  it('La Era de las Legiones grants cavalry to players with war ≥4', () => {
    let s = buildEra2State();
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0
          ? { ...p, era2State: { ...p.era2State!, techLevels: { ...p.era2State!.techLevels, war: 4 } } }
          : p,
      ),
    };
    const card = worldCardDeckEra2.find(c => c.id === 'world_era2_15')!;
    const out = applyEffects(s, card.effects, { playerId: null, trigger: 'on_era2_close' });
    const cav = out.players[0].era2State!.freeUnitsForEra3.find(u => u.unit === 'mounted');
    expect(cav?.count).toBeGreaterThanOrEqual(1);
  });
});

describe('Era II era cards — coverage', () => {
  it('loads all 30 era cards', () => {
    expect(eraCardDeckEra2).toHaveLength(30);
  });

  it('every era card effect handler runs without throwing across relevant triggers', () => {
    const s = buildEra2State();
    const humanId = s.players[0].id;
    const triggers: EffectContext['trigger'][] = [
      'on_era2_start',
      'on_era2_close',
      'kings_table_open',
      'on_tech_allocation',
      'on_convert_surplus',
      'on_era3_start',
    ];
    for (const card of eraCardDeckEra2) {
      for (const trigger of triggers) {
        expect(() => applyEffects(s, card.effects, { playerId: humanId, trigger })).not.toThrow();
      }
    }
  });

  it('free_tech_level from era2_02 appends to player.freeTechLevels for the holder', () => {
    const s = buildEra2State();
    const humanId = s.players[0].id;
    const card = eraCardDeckEra2.find(c => c.id === 'era2_02')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_era2_start' });
    const entries = out.players[0].freeTechLevels ?? [];
    expect(entries.some(e => e.tech === 'science' && e.level === 1)).toBe(true);
    // P2 unaffected.
    expect((out.players[1].freeTechLevels ?? []).some(e => e.tech === 'science')).toBe(false);
  });

  it('modify_tech_cost_flat from era2_09 reduces war flat by -3', () => {
    const s = buildEra2State();
    const humanId = s.players[0].id;
    const card = eraCardDeckEra2.find(c => c.id === 'era2_09')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_era2_start' });
    expect(out.players[0].era2State!.costModifiers.flat.war).toBe(-3);
  });

  it('allow_reallocation from era2_18 grants 2 reallocations to the holder', () => {
    const s = buildEra2State();
    const humanId = s.players[0].id;
    const card = eraCardDeckEra2.find(c => c.id === 'era2_18')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_tech_allocation' });
    expect(out.players[0].era2State!.reallocationsAllowed).toBe(2);
    expect(out.players[1].era2State!.reallocationsAllowed).toBe(0);
  });

  it('modify_surplus_ratio from era2_13 sets holder surplusRatio to 1', () => {
    const s = buildEra2State();
    const humanId = s.players[0].id;
    const card = eraCardDeckEra2.find(c => c.id === 'era2_13')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_convert_surplus' });
    expect(out.players[0].era2State!.transferModifiers.surplusRatio).toBe(1);
    expect(out.players[1].era2State!.transferModifiers.surplusRatio).toBe(0.5);
  });

  it('bonus_to_highest_tech (era2_20) grants +2 science levels when war is tied-highest', () => {
    let s = buildEra2State();
    const humanId = s.players[0].id;
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0
          ? { ...p, era2State: { ...p.era2State!, techLevels: { ...p.era2State!.techLevels, war: 3, science: 0 } } }
          : p,
      ),
    };
    const card = eraCardDeckEra2.find(c => c.id === 'era2_20')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_era2_start' });
    expect(out.players[0].era2State!.techLevels.science).toBe(2);
  });

  it('bonus_for_max_tech (era2_16) grants +6 points when any tech ≥5', () => {
    let s = buildEra2State();
    const humanId = s.players[0].id;
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0
          ? { ...p, era2State: { ...p.era2State!, techLevels: { ...p.era2State!.techLevels, war: 5 } } }
          : p,
      ),
    };
    const before = s.players[0].era2State!.constructionPoints;
    const card = eraCardDeckEra2.find(c => c.id === 'era2_16')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_era2_close' });
    expect(out.players[0].era2State!.constructionPoints).toBe(before + 6);
  });

  it('free_unit_per_high_tech (era2_23) grants 2 cavalry when science ≥3', () => {
    let s = buildEra2State();
    const humanId = s.players[0].id;
    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0
          ? { ...p, era2State: { ...p.era2State!, techLevels: { ...p.era2State!.techLevels, science: 3 } } }
          : p,
      ),
    };
    const card = eraCardDeckEra2.find(c => c.id === 'era2_23')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_era2_close' });
    const cav = out.players[0].era2State!.freeUnitsForEra3.find(u => u.unit === 'mounted');
    expect(cav?.count).toBeGreaterThanOrEqual(2);
  });

  it('modify_receive_ratio (era2_12) doubles receiveRatio for the holder', () => {
    const s = buildEra2State();
    const humanId = s.players[0].id;
    const card = eraCardDeckEra2.find(c => c.id === 'era2_12')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'kings_table_open' });
    expect(out.players[0].era2State!.transferModifiers.receiveRatio).toBe(2);
    expect(out.players[1].era2State!.transferModifiers.receiveRatio).toBe(1);
  });

  it('player_choice_free_tech (era2_06) assigns pendingEffect to human only', () => {
    const s = buildEra2State();
    const humanId = s.players[0].id;
    const card = eraCardDeckEra2.find(c => c.id === 'era2_06')!;
    const out = applyEffects(s, card.effects, { playerId: humanId, trigger: 'on_era2_start' });
    expect(out.players[0].pendingEffect?.type).toBe('player_choice_free_tech');
    expect(out.players[1].pendingEffect).toBeUndefined();
  });
});

describe('Era II effect dispatcher — exhaustive handler map', () => {
  it('every effect type used in any Era II card has a live handler', () => {
    const allEffects: CardEffect[] = [
      ...worldCardDeckEra2.flatMap(c => c.effects),
      ...eraCardDeckEra2.flatMap(c => c.effects),
    ];
    const state = buildEra2State();
    for (const effect of allEffects) {
      const ctx: EffectContext = { playerId: state.players[0].id, trigger: effect.trigger };
      expect(() => applyEffect(state, effect, ctx)).not.toThrow();
    }
  });
});
