import type { GameState } from '../types/game.js';
import type { EraCard } from '../types/cards.js';
import { applyEffects } from '../cards/effect-dispatcher.js';

/**
 * Play an Era III era card from a player's hand. Validates ownership and
 * turn state, then dispatches the card's on_era3_play effects with the
 * player as target (so self-targeted effects apply correctly).
 */
export function playEra3Card(
  state: GameState,
  playerId: string,
  cardId: string,
  targetStackId?: string,
): GameState {
  if (state.phase !== 'era3' || (state.era3Phase !== 'game_loop' && state.era3Phase !== 'final_heroic_turn')) {
    throw new Error('Cannot play Era III card outside the game loop');
  }
  if (state.era3CurrentPlayerId !== playerId) {
    throw new Error('Not your turn');
  }
  const player = state.players.find(p => p.id === playerId);
  if (!player?.era3State) throw new Error('No era3State');
  if (player.era3State.eliminated) throw new Error('Eliminated');

  const playsThisTurn = state.era3CardPlayedThisTurn?.[playerId] ?? 0;
  if (playsThisTurn >= 2) {
    throw new Error('Already played 2 cards this turn');
  }

  const hand = state.era3Hands?.[playerId] ?? [];
  const idx = hand.findIndex(c => c.id === cardId);
  if (idx === -1) throw new Error('Card not in your hand');
  const card = hand[idx];

  // Apply effects first so they see the pre-removal hand (none of these
  // effects read hand contents, but this keeps the sequence explicit).
  const afterEffects = applyEffects(state, card.effects, {
    playerId,
    trigger: 'on_era3_play',
    targetStackId,
  });

  const nextHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
  return {
    ...afterEffects,
    era3Hands: { ...(afterEffects.era3Hands ?? {}), [playerId]: nextHand },
    era3CardPlayedThisTurn: {
      ...(afterEffects.era3CardPlayedThisTurn ?? {}),
      [playerId]: (afterEffects.era3CardPlayedThisTurn?.[playerId] ?? 0) + 1,
    },
  };
}

export const ERA3_HAND_MAX_SIZE = 5;

/**
 * Draw one card from the Era III deck into a player's hand. No-op if the
 * deck is empty or the hand is already at MAX.
 */
export function drawEra3Card(state: GameState, playerId: string): GameState {
  const deck = state.era3Deck ?? [];
  if (deck.length === 0) return state;
  const hand = state.era3Hands?.[playerId] ?? [];
  if (hand.length >= ERA3_HAND_MAX_SIZE) return state;

  const [drawn, ...rest] = deck;
  return {
    ...state,
    era3Deck: rest,
    era3Hands: {
      ...(state.era3Hands ?? {}),
      [playerId]: [...hand, { ...drawn, assignedTo: playerId }],
    },
  };
}

/**
 * Clear per-turn effects for `playerId`. Called when that player's turn begins.
 */
export function clearTurnEffectsFor(state: GameState, playerId: string): GameState {
  const te = state.era3TurnEffects;
  if (!te) return state;
  const attackBoost = { ...te.attackBoost };
  const movementBonus = { ...te.movementBonus };
  const defenseBoost = { ...(te.defenseBoost ?? {}) };
  delete attackBoost[playerId];
  delete movementBonus[playerId];
  delete defenseBoost[playerId];
  const played = { ...(state.era3CardPlayedThisTurn ?? {}) };
  delete played[playerId];
  return {
    ...state,
    era3TurnEffects: { attackBoost, movementBonus, defenseBoost },
    era3CardPlayedThisTurn: played,
  };
}

/**
 * At the start of a player's turn, draw up to 2 cards from the deck and
 * place them in `era3CardOffers[playerId]` for the player to choose from.
 * If fewer than 2 cards remain, offer what's available (may be 1 or 0).
 */
export function dealCardOffers(state: GameState, playerId: string): GameState {
  const deck = state.era3Deck ?? [];
  if (deck.length === 0) return state;
  const offerCount = Math.min(2, deck.length);
  const offered = deck.slice(0, offerCount).map(c => ({ ...c, assignedTo: playerId }));
  const rest = deck.slice(offerCount);
  return {
    ...state,
    era3Deck: rest,
    era3CardOffers: { ...(state.era3CardOffers ?? {}), [playerId]: offered },
  };
}

/**
 * Player picks one of the offered cards to add to their hand (if below max).
 * The unchosen card is discarded. Clears the offer.
 */
export function pickCardOffer(state: GameState, playerId: string, cardId: string): GameState {
  const offers = state.era3CardOffers?.[playerId] ?? [];
  const chosen = offers.find(c => c.id === cardId);
  if (!chosen) throw new Error('Card not in offer');
  const hand = state.era3Hands?.[playerId] ?? [];
  const newHand = hand.length < ERA3_HAND_MAX_SIZE ? [...hand, chosen] : hand;
  const newOffers = { ...(state.era3CardOffers ?? {}) };
  delete newOffers[playerId];
  return {
    ...state,
    era3CardOffers: newOffers,
    era3Hands: { ...(state.era3Hands ?? {}), [playerId]: newHand },
  };
}

/**
 * Player discards the card offer (no card added to hand). Clears the offer.
 */
export function discardCardOffer(state: GameState, playerId: string): GameState {
  const newOffers = { ...(state.era3CardOffers ?? {}) };
  // Put discarded cards back on the bottom of the deck
  const discarded = newOffers[playerId] ?? [];
  delete newOffers[playerId];
  return {
    ...state,
    era3CardOffers: newOffers,
    era3Deck: [...(state.era3Deck ?? []), ...discarded],
  };
}

/** Convenience: count all era cards dealt + held. */
export function totalEra3CardsInPlay(state: GameState): { deck: number; hand: number } {
  const deck = state.era3Deck?.length ?? 0;
  let hand = 0;
  for (const h of Object.values(state.era3Hands ?? {})) hand += h.length;
  return { deck, hand };
}

export type Era3CardRef = EraCard;
