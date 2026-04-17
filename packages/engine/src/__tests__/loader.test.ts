import { describe, it, expect } from 'vitest';
import { worldCardDeck, eraCardDeck, relicCardDeck } from '../cards/loader.js';

describe('Card loader', () => {
  it('loads 20 world cards', () => {
    expect(worldCardDeck).toHaveLength(20);
  });

  it('loads 40 era cards', () => {
    expect(eraCardDeck).toHaveLength(40);
  });

  it('loads 20 relics', () => {
    expect(relicCardDeck).toHaveLength(20);
  });

  it('every world card has required fields', () => {
    for (const card of worldCardDeck) {
      expect(card.id).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.flavorText).toBeTruthy();
      expect(card.mechanicalText).toBeTruthy();
      expect(card.effects.length).toBeGreaterThan(0);
      expect(card.type).toBe('world_era1');
    }
  });

  it('every era card has required fields', () => {
    for (const card of eraCardDeck) {
      expect(card.id).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.flavorText).toBeTruthy();
      expect(card.mechanicalText).toBeTruthy();
      expect(card.effects.length).toBeGreaterThan(0);
      expect(card.type).toBe('era1');
    }
  });

  it('every relic has required fields', () => {
    for (const relic of relicCardDeck) {
      expect(relic.id).toBeTruthy();
      expect(relic.name).toBeTruthy();
      expect(relic.flavorText).toBeTruthy();
      expect(relic.mechanicalText).toBeTruthy();
      expect(relic.effects).toBeDefined();
    }
  });

  it('all card IDs are unique', () => {
    const allIds = [
      ...worldCardDeck.map(c => c.id),
      ...eraCardDeck.map(c => c.id),
      ...relicCardDeck.map(c => c.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('every effect has a type and trigger', () => {
    const allEffects = [
      ...worldCardDeck.flatMap(c => c.effects),
      ...eraCardDeck.flatMap(c => c.effects),
      ...relicCardDeck.flatMap(c => c.effects),
    ];
    for (const effect of allEffects) {
      expect(typeof effect.type).toBe('string');
      expect(typeof effect.trigger).toBe('string');
    }
  });
});
