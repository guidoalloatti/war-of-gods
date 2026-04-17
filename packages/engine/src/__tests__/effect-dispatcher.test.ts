import { describe, it, expect } from 'vitest';
import { applyEffect, applyEffects } from '../cards/effect-dispatcher.js';
import type { GameState } from '../types/game.js';
import type { Player } from '../types/player.js';
import type { CardEffect } from '../cards/types.js';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player_1',
    name: 'Test',
    raceId: 'elf',
    isBot: false,
    botDifficulty: null,
    tiles: { plain: 4, mountain: 2, forest: 6, swamp: 3, road: 3 },
    eraCards: [],
    relic: null,
    score: null,
    hasTraded: false,
    hasPlaced: false,
    connected: true,
    ...overrides,
  };
}

function makeState(players?: Player[], overrides?: Partial<GameState>): GameState {
  return {
    id: 'test_game',
    mode: 'solo_bots',
    soloVariant: null,
    phase: 'era1',
    era1Phase: 'scoring',
    players: players ?? [makePlayer()],
    tilePile: [],
    worldCard: null,
    activeTrades: [],
    seed: 42,
    roomCode: null,
    createdAt: 0,
    ...overrides,
  };
}

describe('Effect dispatcher', () => {
  it('ignores effects with non-matching trigger', () => {
    const state = makeState();
    const effect: CardEffect = {
      type: 'flat_bonus',
      trigger: 'on_reveal',
      bonus: 5,
    };
    const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
    expect(result).toBe(state);
  });

  describe('modify_draw_count', () => {
    it('adds drawCountModifier to targeted player', () => {
      const state = makeState();
      const effect: CardEffect = {
        type: 'modify_draw_count',
        trigger: 'on_reveal',
        delta: 2,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_reveal' });
      expect(result.players[0].drawCountModifier).toBe(2);
    });

    it('stacks multiple modifiers', () => {
      let state = makeState();
      const effect: CardEffect = { type: 'modify_draw_count', trigger: 'on_reveal', delta: 1 };
      state = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_reveal' });
      state = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_reveal' });
      expect(state.players[0].drawCountModifier).toBe(2);
    });
  });

  describe('modify_trade_limit', () => {
    it('sets tradeLimit on player', () => {
      const state = makeState();
      const effect: CardEffect = {
        type: 'modify_trade_limit',
        trigger: 'on_reveal',
        newLimit: 3,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_reveal' });
      expect(result.players[0].tradeLimit).toBe(3);
    });
  });

  describe('skip_trade_phase', () => {
    it('sets skipTradePhase on state', () => {
      const state = makeState();
      const effect: CardEffect = { type: 'skip_trade_phase', trigger: 'on_reveal' };
      const result = applyEffect(state, effect, { playerId: null, trigger: 'on_reveal' });
      expect(result.skipTradePhase).toBe(true);
    });
  });

  describe('flat_bonus', () => {
    it('adds bonus points', () => {
      const state = makeState();
      const effect: CardEffect = { type: 'flat_bonus', trigger: 'on_era1_close', bonus: 7 };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(7);
    });
  });

  describe('bonus_per_terrain', () => {
    it('grants points per tile of specified terrain', () => {
      const player = makePlayer({ tiles: { plain: 4, mountain: 2, forest: 6, swamp: 3, road: 3 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'bonus_per_terrain',
        trigger: 'on_era1_close',
        terrain: 'forest',
        bonus: 2,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(12); // 6 forest * 2
    });
  });

  describe('bonus_per_favorable', () => {
    it('grants points per favorable terrain tile', () => {
      // Elf: favorable = forest
      const player = makePlayer({ tiles: { plain: 4, mountain: 2, forest: 6, swamp: 3, road: 3 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'bonus_per_favorable',
        trigger: 'on_era1_close',
        bonus: 1,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(6);
    });
  });

  describe('bonus_per_road', () => {
    it('grants points per road tile', () => {
      const player = makePlayer({ tiles: { plain: 4, mountain: 2, forest: 6, swamp: 3, road: 5 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'bonus_per_road',
        trigger: 'on_era1_close',
        bonus: 2,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(10); // 5 roads * 2
    });
  });

  describe('bonus_for_all_terrains', () => {
    it('grants bonus when all terrains meet minimum', () => {
      const player = makePlayer({ tiles: { plain: 3, mountain: 3, forest: 3, swamp: 3, road: 3 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'bonus_for_all_terrains',
        trigger: 'on_era1_close',
        minPerTerrain: 3,
        bonus: 8,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(8);
    });

    it('does not grant bonus when a terrain is below minimum', () => {
      const player = makePlayer({ tiles: { plain: 3, mountain: 1, forest: 3, swamp: 3, road: 3 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'bonus_for_all_terrains',
        trigger: 'on_era1_close',
        minPerTerrain: 3,
        bonus: 8,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBeUndefined();
    });
  });

  describe('all_players_bonus', () => {
    it('grants bonus to all players', () => {
      const p1 = makePlayer({ id: 'player_1', raceId: 'elf' });
      const p2 = makePlayer({ id: 'player_2', name: 'P2', raceId: 'dwarf' });
      const state = makeState([p1, p2]);
      const effect: CardEffect = {
        type: 'all_players_bonus',
        trigger: 'on_era1_close',
        bonus: 3,
      };
      const result = applyEffect(state, effect, { playerId: null, trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(3);
      expect(result.players[1].cardBonusPoints).toBe(3);
    });

    it('skips when condition not met (any_player_has_relic)', () => {
      const p1 = makePlayer({ relic: null });
      const state = makeState([p1]);
      const effect: CardEffect = {
        type: 'all_players_bonus',
        trigger: 'on_era1_close',
        bonus: 5,
        condition: 'any_player_has_relic',
      };
      const result = applyEffect(state, effect, { playerId: null, trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBeUndefined();
    });
  });

  describe('double_if_positive', () => {
    it('doubles positive terrain bonus', () => {
      // Elf: favorable=forest(6), unfavorable=mountain(2), terrain bonus = 4
      const player = makePlayer({ tiles: { plain: 4, mountain: 2, forest: 6, swamp: 3, road: 3 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'double_if_positive',
        trigger: 'on_era1_close',
        clampNegativeToZero: false,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(4);
    });

    it('does not double when terrain bonus is 0', () => {
      // Elf: forest=2, mountain=2, terrain bonus = 0
      const player = makePlayer({ tiles: { plain: 4, mountain: 2, forest: 2, swamp: 3, road: 7 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'double_if_positive',
        trigger: 'on_era1_close',
        clampNegativeToZero: false,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBeUndefined();
    });

    it('clamps negative terrain bonus to 0 when flag set', () => {
      // Elf: forest=1, mountain=4, terrain bonus = -3
      const player = makePlayer({ tiles: { plain: 4, mountain: 4, forest: 1, swamp: 3, road: 6 } });
      const state = makeState([player]);
      const effect: CardEffect = {
        type: 'double_if_positive',
        trigger: 'on_era1_close',
        clampNegativeToZero: true,
      };
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(3); // abs(-3)
    });
  });

  describe('waive_road_requirement', () => {
    it('sets roadRequirement to 0', () => {
      const state = makeState();
      const effect: CardEffect = { type: 'waive_road_requirement', trigger: 'on_reveal' };
      const result = applyEffect(state, effect, { playerId: null, trigger: 'on_reveal' });
      expect(result.roadRequirement).toBe(0);
    });
  });

  describe('modify_road_requirement', () => {
    it('sets roadRequirement to the specified value', () => {
      const state = makeState();
      const effect: CardEffect = {
        type: 'modify_road_requirement',
        trigger: 'on_reveal',
        newRequirement: 5,
      };
      const result = applyEffect(state, effect, { playerId: null, trigger: 'on_reveal' });
      expect(result.roadRequirement).toBe(5);
    });
  });

  describe('world card (null playerId)', () => {
    it('applies effect to all players when playerId is null', () => {
      const p1 = makePlayer({ id: 'player_1', raceId: 'elf' });
      const p2 = makePlayer({ id: 'player_2', name: 'P2', raceId: 'dwarf' });
      const state = makeState([p1, p2]);
      const effect: CardEffect = { type: 'flat_bonus', trigger: 'on_reveal', bonus: 3 };
      const result = applyEffect(state, effect, { playerId: null, trigger: 'on_reveal' });
      expect(result.players[0].cardBonusPoints).toBe(3);
      expect(result.players[1].cardBonusPoints).toBe(3);
    });
  });

  describe('applyEffects', () => {
    it('applies multiple effects in sequence', () => {
      const state = makeState();
      const effects: CardEffect[] = [
        { type: 'flat_bonus', trigger: 'on_era1_close', bonus: 3 },
        { type: 'flat_bonus', trigger: 'on_era1_close', bonus: 7 },
      ];
      const result = applyEffects(state, effects, { playerId: 'player_1', trigger: 'on_era1_close' });
      expect(result.players[0].cardBonusPoints).toBe(10);
    });
  });

  describe('stub effects (Era II/III)', () => {
    it('silently skips unimplemented effects', () => {
      const state = makeState();
      const stubTypes = [
        'free_unit', 'scry_pile', 'extra_relic', 'preview_next_era_deck',
      ] as const;

      for (const type of stubTypes) {
        const effect = { type, trigger: 'on_reveal' } as CardEffect;
        const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_reveal' });
        expect(result).toBe(state);
      }
    });
  });

  describe('implemented Era I effects', () => {
    it('double_favorable_tiles adds bonus points', () => {
      const state = makeState();
      // Elf: favorable=forest, terrainValues.forest=3, player has 5 forest tiles
      const effect = { type: 'double_favorable_tiles', trigger: 'on_era1_close', count: 2 } as CardEffect;
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_era1_close' });
      // 2 tiles doubled * 3 value = +6 bonus
      expect(result.players[0].cardBonusPoints).toBe(6);
    });

    it('return_tiles_to_pile removes tiles from player', () => {
      const state = makeState();
      const totalBefore = Object.values(state.players[0].tiles).reduce((a, b) => a + b, 0);
      const effect = { type: 'return_tiles_to_pile', trigger: 'on_draw', count: 2, random: true } as CardEffect;
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_draw' });
      const totalAfter = Object.values(result.players[0].tiles).reduce((a, b) => a + b, 0);
      expect(totalAfter).toBe(totalBefore - 2);
      expect(result.tilePile.length).toBe(state.tilePile.length + 2);
    });

    it('view_opponents_tiles sets pendingEffect on human player', () => {
      const state = makeState();
      const effect = { type: 'view_opponents_tiles', trigger: 'on_trade' } as CardEffect;
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_trade' });
      expect(result.players[0].pendingEffect).toBeDefined();
      expect(result.players[0].pendingEffect!.type).toBe('view_opponents_tiles');
    });

    it('discard_and_redraw (forced) auto-resolves', () => {
      const state = makeState();
      const totalBefore = Object.values(state.players[0].tiles).reduce((a, b) => a + b, 0);
      const effect = { type: 'discard_and_redraw', trigger: 'on_draw', maxDiscard: 2, forced: true } as CardEffect;
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_draw' });
      const totalAfter = Object.values(result.players[0].tiles).reduce((a, b) => a + b, 0);
      // Tile count stays the same (discard N, draw N)
      expect(totalAfter).toBe(totalBefore);
      expect(result.players[0].pendingEffect).toBeUndefined();
    });

    it('discard_and_redraw (not forced) sets pendingEffect on human', () => {
      const state = makeState();
      const effect = { type: 'discard_and_redraw', trigger: 'on_draw', maxDiscard: 5, forced: false } as CardEffect;
      const result = applyEffect(state, effect, { playerId: 'player_1', trigger: 'on_draw' });
      expect(result.players[0].pendingEffect).toBeDefined();
      expect(result.players[0].pendingEffect!.type).toBe('discard_and_redraw');
    });
  });
});
