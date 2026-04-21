import { describe, it, expect } from 'vitest';
import {
  worldCardDeck,
  eraCardDeck,
  worldCardDeckEra2,
  eraCardDeckEra2,
  relicCardDeck,
} from '../cards/loader.js';

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
      ...worldCardDeckEra2.map(c => c.id),
      ...eraCardDeckEra2.map(c => c.id),
      ...relicCardDeck.map(c => c.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('every effect has a type and trigger', () => {
    const allEffects = [
      ...worldCardDeck.flatMap(c => c.effects),
      ...eraCardDeck.flatMap(c => c.effects),
      ...worldCardDeckEra2.flatMap(c => c.effects),
      ...eraCardDeckEra2.flatMap(c => c.effects),
      ...relicCardDeck.flatMap(c => c.effects),
    ];
    for (const effect of allEffects) {
      expect(typeof effect.type).toBe('string');
      expect(typeof effect.trigger).toBe('string');
    }
  });

  it('loads 15 Era II world cards', () => {
    expect(worldCardDeckEra2).toHaveLength(15);
  });

  it('loads 30 Era II era cards', () => {
    expect(eraCardDeckEra2).toHaveLength(30);
  });

  it('every Era II world card has required fields', () => {
    for (const card of worldCardDeckEra2) {
      expect(card.id).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.name_en).toBeTruthy();
      expect(card.flavorText).toBeTruthy();
      expect(card.mechanicalText).toBeTruthy();
      expect(card.effects.length).toBeGreaterThan(0);
      expect(card.type).toBe('world_era2');
    }
  });

  it('every Era II era card has required fields', () => {
    for (const card of eraCardDeckEra2) {
      expect(card.id).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.name_en).toBeTruthy();
      expect(card.flavorText).toBeTruthy();
      expect(card.mechanicalText).toBeTruthy();
      expect(card.effects.length).toBeGreaterThan(0);
      expect(card.type).toBe('era2');
    }
  });
});
