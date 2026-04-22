import type { CardEffect } from '../cards/types.js';

export type { CardEffect } from '../cards/types.js';

export type WorldCard = {
  id: string;
  name: string;
  name_en: string;
  type: 'world_era1' | 'world_era2' | 'world_era3';
  flavorText: string;
  flavorText_en: string;
  mechanicalText: string;
  mechanicalText_en: string;
  effects: CardEffect[];
};

export type EraCard = {
  id: string;
  name: string;
  name_en: string;
  type: 'era1' | 'era2' | 'era3';
  /** Card tier for Era III cards. Era I/II cards don't use this. */
  rarity?: 'common' | 'rare' | 'legendary';
  flavorText: string;
  flavorText_en: string;
  mechanicalText: string;
  mechanicalText_en: string;
  effects: CardEffect[];
  /** Player ID who holds this card (null if in the deck) */
  assignedTo: string | null;
};

export type RelicCard = {
  id: string;
  name: string;
  name_en: string;
  flavorText: string;
  flavorText_en: string;
  mechanicalText: string;
  mechanicalText_en: string;
  effects: CardEffect[];
  assignedTo: string | null;
};
