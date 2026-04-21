import type { WorldCard, EraCard, RelicCard } from '../types/cards.js';
import type { Card } from './types.js';

import worldCardsJson from './data/world-cards-era1.json';
import worldCardsEra2Json from './data/world-cards-era2.json';
import worldCardsEra3Json from './data/world-cards-era3.json';
import era1CardsJson from './data/era1-cards.json';
import era2CardsJson from './data/era2-cards.json';
import era3CardsJson from './data/era3-cards.json';
import relicsJson from './data/relics.json';

// ── Build-time validation helpers ──────────────────────────────────

function assertCard(raw: unknown, index: number, file: string): asserts raw is Card {
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') throw new Error(`${file}[${index}]: missing id`);
  if (typeof r.name !== 'string') throw new Error(`${file}[${index}]: missing name`);
  if (typeof r.flavorText !== 'string') throw new Error(`${file}[${index}]: missing flavorText`);
  if (typeof r.mechanicalText !== 'string') throw new Error(`${file}[${index}]: missing mechanicalText`);
  if (!Array.isArray(r.effects) || r.effects.length === 0) {
    throw new Error(`${file}[${index}]: effects must be a non-empty array`);
  }
  for (const effect of r.effects as Record<string, unknown>[]) {
    if (typeof effect.type !== 'string') {
      throw new Error(`${file}[${index}]: each effect must have a string "type"`);
    }
    if (typeof effect.trigger !== 'string') {
      throw new Error(`${file}[${index}]: each effect must have a string "trigger"`);
    }
  }
}

function loadWorldCards(): WorldCard[] {
  const raw = worldCardsJson.cards;
  return raw.map((card, i) => {
    assertCard(card, i, 'world-cards-era1.json');
    if (card.type !== 'world_era1') {
      throw new Error(`world-cards-era1.json[${i}]: expected type "world_era1", got "${card.type}"`);
    }
    const c = card as Record<string, unknown>;
    return {
      id: card.id,
      name: card.name,
      name_en: (c.name_en as string) ?? card.name,
      type: card.type,
      flavorText: card.flavorText,
      flavorText_en: (c.flavorText_en as string) ?? card.flavorText,
      mechanicalText: card.mechanicalText,
      mechanicalText_en: (c.mechanicalText_en as string) ?? card.mechanicalText,
      effects: card.effects,
    };
  });
}

function loadEraCards(): EraCard[] {
  const raw = era1CardsJson.cards;
  return raw.map((card, i) => {
    assertCard(card, i, 'era1-cards.json');
    if (card.type !== 'era1') {
      throw new Error(`era1-cards.json[${i}]: expected type "era1", got "${card.type}"`);
    }
    const c = card as Record<string, unknown>;
    return {
      id: card.id,
      name: card.name,
      name_en: (c.name_en as string) ?? card.name,
      type: card.type,
      flavorText: card.flavorText,
      flavorText_en: (c.flavorText_en as string) ?? card.flavorText,
      mechanicalText: card.mechanicalText,
      mechanicalText_en: (c.mechanicalText_en as string) ?? card.mechanicalText,
      effects: card.effects,
      assignedTo: null,
    };
  });
}

function loadWorldCardsEra2(): WorldCard[] {
  const raw = worldCardsEra2Json.cards;
  return raw.map((card, i) => {
    assertCard(card, i, 'world-cards-era2.json');
    if (card.type !== 'world_era2') {
      throw new Error(`world-cards-era2.json[${i}]: expected type "world_era2", got "${card.type}"`);
    }
    const c = card as Record<string, unknown>;
    return {
      id: card.id,
      name: card.name,
      name_en: (c.name_en as string) ?? card.name,
      type: card.type,
      flavorText: card.flavorText,
      flavorText_en: (c.flavorText_en as string) ?? card.flavorText,
      mechanicalText: card.mechanicalText,
      mechanicalText_en: (c.mechanicalText_en as string) ?? card.mechanicalText,
      effects: card.effects as WorldCard['effects'],
    };
  });
}

function loadEra2Cards(): EraCard[] {
  const raw = era2CardsJson.cards;
  return raw.map((card, i) => {
    assertCard(card, i, 'era2-cards.json');
    if (card.type !== 'era2') {
      throw new Error(`era2-cards.json[${i}]: expected type "era2", got "${card.type}"`);
    }
    const c = card as Record<string, unknown>;
    return {
      id: card.id,
      name: card.name,
      name_en: (c.name_en as string) ?? card.name,
      type: card.type,
      flavorText: card.flavorText,
      flavorText_en: (c.flavorText_en as string) ?? card.flavorText,
      mechanicalText: card.mechanicalText,
      mechanicalText_en: (c.mechanicalText_en as string) ?? card.mechanicalText,
      effects: card.effects as EraCard['effects'],
      assignedTo: null,
    };
  });
}

function loadRelicCards(): RelicCard[] {
  const raw = relicsJson.relics;
  return raw.map((relic, i) => {
    const r = relic as Record<string, unknown>;
    if (typeof r.id !== 'string') throw new Error(`relics.json[${i}]: missing id`);
    if (typeof r.name !== 'string') throw new Error(`relics.json[${i}]: missing name`);
    if (typeof r.flavorText !== 'string') throw new Error(`relics.json[${i}]: missing flavorText`);
    if (typeof r.mechanicalText !== 'string') throw new Error(`relics.json[${i}]: missing mechanicalText`);
    if (!Array.isArray(r.effects)) throw new Error(`relics.json[${i}]: missing effects`);
    return {
      id: relic.id,
      name: relic.name,
      name_en: (r.name_en as string) ?? relic.name,
      flavorText: relic.flavorText,
      flavorText_en: (r.flavorText_en as string) ?? relic.flavorText,
      mechanicalText: relic.mechanicalText,
      mechanicalText_en: (r.mechanicalText_en as string) ?? relic.mechanicalText,
      effects: relic.effects as RelicCard['effects'],
      assignedTo: null,
    };
  });
}

function loadWorldCardsEra3(): WorldCard[] {
  const raw = worldCardsEra3Json.cards;
  return raw.map((card, i) => {
    assertCard(card, i, 'world-cards-era3.json');
    if (card.type !== 'world_era3') {
      throw new Error(`world-cards-era3.json[${i}]: expected type "world_era3", got "${card.type}"`);
    }
    const c = card as Record<string, unknown>;
    return {
      id: card.id,
      name: card.name,
      name_en: (c.name_en as string) ?? card.name,
      type: card.type,
      flavorText: card.flavorText,
      flavorText_en: (c.flavorText_en as string) ?? card.flavorText,
      mechanicalText: card.mechanicalText,
      mechanicalText_en: (c.mechanicalText_en as string) ?? card.mechanicalText,
      effects: card.effects as WorldCard['effects'],
    };
  });
}

function loadEra3Cards(): EraCard[] {
  const raw = era3CardsJson.cards;
  return raw.map((card, i) => {
    assertCard(card, i, 'era3-cards.json');
    if (card.type !== 'era3') {
      throw new Error(`era3-cards.json[${i}]: expected type "era3", got "${card.type}"`);
    }
    const c = card as Record<string, unknown>;
    return {
      id: card.id,
      name: card.name,
      name_en: (c.name_en as string) ?? card.name,
      type: card.type,
      flavorText: card.flavorText,
      flavorText_en: (c.flavorText_en as string) ?? card.flavorText,
      mechanicalText: card.mechanicalText,
      mechanicalText_en: (c.mechanicalText_en as string) ?? card.mechanicalText,
      effects: card.effects as EraCard['effects'],
      assignedTo: null,
    };
  });
}

// ── Validate and export at module load (build time) ────────────────

export const worldCardDeck: WorldCard[] = loadWorldCards();
export const eraCardDeck: EraCard[] = loadEraCards();
export const worldCardDeckEra2: WorldCard[] = loadWorldCardsEra2();
export const eraCardDeckEra2: EraCard[] = loadEra2Cards();
export const worldCardDeckEra3: WorldCard[] = loadWorldCardsEra3();
export const eraCardDeckEra3: EraCard[] = loadEra3Cards();
export const relicCardDeck: RelicCard[] = loadRelicCards();
