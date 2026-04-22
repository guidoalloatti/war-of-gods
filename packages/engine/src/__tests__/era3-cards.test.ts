import { describe, it, expect } from 'vitest';
import { gameReducer } from '../reducer.js';
import { transitionEra2ToEra3 } from '../era3/transition.js';
import { initPlayerEra2State } from '../era2/init.js';
import {
  playEra3Card, dealCardOffers, clearTurnEffectsFor, ERA3_HAND_MAX_SIZE,
} from '../era3/cards.js';
import { totalAttackBonus } from '../era3/economy.js';
import { worldCardDeckEra3, eraCardDeckEra3 } from '../cards/loader.js';
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

function era3Game(seed = 9999): GameState {
  const players = RACES.map((r, i) => mkPlayer(`p${i}`, r));
  const base: GameState = {
    id: 'g', mode: 'solo_bots', soloVariant: null,
    phase: 'era2', era1Phase: 'complete', era2Phase: 'complete',
    players, tilePile: [], worldCard: null, activeTrades: [],
    seed, roomCode: null, createdAt: 0,
  };
  return transitionEra2ToEra3(base);
}

describe('Era III data decks', () => {
  it('loads 3 world cards and ≥8 era cards', () => {
    expect(worldCardDeckEra3.length).toBe(3);
    expect(eraCardDeckEra3.length).toBeGreaterThanOrEqual(8);
  });

  it('every era card has on_era3_play effects', () => {
    for (const c of eraCardDeckEra3) {
      expect(c.effects.length).toBeGreaterThan(0);
      for (const e of c.effects) expect(e.trigger).toBe('on_era3_play');
    }
  });
});

describe('transition deals cards + reveals world card', () => {
  it('reveals a world card and deals 3 cards per player', () => {
    const s = era3Game();
    expect(s.worldCardEra3).toBeTruthy();
    for (const p of s.players) {
      expect(s.era3Hands?.[p.id]?.length).toBe(3);
    }
    // deck has totalCards − 3*players remaining (after dealing initial hands)
    const totalCards = eraCardDeckEra3.length;
    expect(s.era3Deck!.length).toBe(totalCards - 3 * s.players.length);
  });

  it('is deterministic: same seed → same world card + hands', () => {
    const a = era3Game(424242);
    const b = era3Game(424242);
    expect(a.worldCardEra3?.id).toBe(b.worldCardEra3?.id);
    for (const p of a.players) {
      const ah = a.era3Hands![p.id].map(c => c.id);
      const bh = b.era3Hands![p.id].map(c => c.id);
      expect(ah).toEqual(bh);
    }
  });
});

describe('PLAY_ERA3_CARD', () => {
  it('rejects if not player\'s turn', () => {
    const s = era3Game();
    const other = s.players.find(p => p.id !== s.era3CurrentPlayerId)!;
    const card = s.era3Hands![other.id][0];
    expect(() =>
      gameReducer(s, { type: 'PLAY_ERA3_CARD', playerId: other.id, cardId: card.id }),
    ).toThrow(/turn/);
  });

  it('rejects if card not in hand', () => {
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    expect(() =>
      gameReducer(s, { type: 'PLAY_ERA3_CARD', playerId: pid, cardId: 'nonexistent' }),
    ).toThrow(/hand/);
  });

  it('allows a second play in the same turn but rejects a third', () => {
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    const [c1, c2, c3] = s.era3Hands![pid];
    const after1 = gameReducer(s, { type: 'PLAY_ERA3_CARD', playerId: pid, cardId: c1.id });
    const after2 = gameReducer(after1, { type: 'PLAY_ERA3_CARD', playerId: pid, cardId: c2.id });
    expect(after2.era3CardPlayedThisTurn?.[pid]).toBe(2);
    expect(() =>
      gameReducer(after2, { type: 'PLAY_ERA3_CARD', playerId: pid, cardId: c3.id }),
    ).toThrow(/Already played/);
  });

  it('removes the card from hand after playing', () => {
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    const card = s.era3Hands![pid][0];
    const next = gameReducer(s, { type: 'PLAY_ERA3_CARD', playerId: pid, cardId: card.id });
    expect(next.era3Hands![pid].find(c => c.id === card.id)).toBeUndefined();
    expect(next.era3Hands![pid].length).toBe(s.era3Hands![pid].length - 1);
  });
});

describe('era3_attack_boost effect', () => {
  it('applying attack boost increases totalAttackBonus for that player\'s stacks', () => {
    // Seed the turn effects manually to avoid depending on which card is dealt.
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    const stack = Object.values(s.era3Stacks!).find(st => st.ownerId === pid)!;
    const before = totalAttackBonus(stack, s);
    const s2: GameState = {
      ...s,
      era3TurnEffects: { attackBoost: { [pid]: 2 }, movementBonus: {} },
    };
    const after = totalAttackBonus(stack, s2);
    expect(after).toBe(before + 2);
  });
});

describe('clearTurnEffectsFor', () => {
  it('removes per-player attack & movement effects', () => {
    const s: GameState = {
      ...era3Game(),
      era3TurnEffects: { attackBoost: { pA: 2, pB: 1 }, movementBonus: { pA: 1 } },
      era3CardPlayedThisTurn: { pA: 2 },
    };
    const out = clearTurnEffectsFor(s, 'pA');
    expect(out.era3TurnEffects!.attackBoost.pA).toBeUndefined();
    expect(out.era3TurnEffects!.movementBonus.pA).toBeUndefined();
    expect(out.era3TurnEffects!.attackBoost.pB).toBe(1);
    expect(out.era3CardPlayedThisTurn!.pA).toBeUndefined();
  });
});

describe('dealCardOffers', () => {
  it('puts 2 cards into era3CardOffers for the player', () => {
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    const deckBefore = s.era3Deck!.length;
    const next = dealCardOffers(s, pid);
    expect(next.era3CardOffers?.[pid]?.length).toBe(2);
    expect(next.era3Deck!.length).toBe(deckBefore - 2);
    // Hand should not change yet
    expect(next.era3Hands![pid].length).toBe(s.era3Hands![pid].length);
  });

  it('offers only remaining cards when deck has 1 card', () => {
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    const oneCard: GameState = { ...s, era3Deck: s.era3Deck!.slice(0, 1) };
    const next = dealCardOffers(oneCard, pid);
    expect(next.era3CardOffers?.[pid]?.length).toBe(1);
  });
});

describe('END_TURN offers 2 cards + clears effects for next player', () => {
  it('offering puts 2 cards into era3CardOffers (not directly into hand)', () => {
    const s = era3Game();
    const pid = s.era3CurrentPlayerId!;
    const handBefore = s.era3Hands![pid].length;
    const next = gameReducer(s, { type: 'END_TURN', playerId: pid });
    // Hand unchanged — player must pick from offer
    expect(next.era3Hands![pid].length).toBe(handBefore);
    expect(next.era3CardOffers?.[pid]?.length).toBe(2);
  });

  it('clears the acting player\'s card-played count when their next turn starts', () => {
    let s = era3Game();
    const order = s.era3TurnOrder!;
    const first = order[0];
    const card = s.era3Hands![first][0];
    s = gameReducer(s, { type: 'PLAY_ERA3_CARD', playerId: first, cardId: card.id });
    expect(s.era3CardPlayedThisTurn?.[first]).toBe(1);

    for (const p of order) {
      s = gameReducer(s, { type: 'END_TURN', playerId: p });
    }
    // Full cycle back to `first`: their card-played count should be cleared.
    expect(s.era3CardPlayedThisTurn?.[first]).toBeFalsy();
  });
});
