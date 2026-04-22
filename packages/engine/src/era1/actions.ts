import type { GameState, TradeProposal } from '../types/game.js';
import type { GameAction } from '../types/actions.js';
import type { TerrainType } from '../types/terrain.js';
import { TILES_PER_PLAYER } from '../types/terrain.js';
import { drawFromPile, tilesToCounts } from '../state/tiles.js';
import { createRng, shuffle } from '../state/random.js';
import { worldCardDeck, eraCardDeck, relicCardDeck } from '../cards/index.js';
import { applyEffects } from '../cards/effect-dispatcher.js';
import { calculateScore } from './scoring.js';
import { getRaceById } from '../races/index.js';
import { transitionEraIToEra2 } from '../era2/transition.js';

function nextTradeId(state: GameState): string {
  // Deterministic per-state counter so room-scoped IDs don't collide
  // across concurrent multiplayer rooms and engine replay stays reproducible.
  return `trade_${state.seed}_${state.activeTrades.length}`;
}

/**
 * Main Era I reducer.
 * Receives state + action, validates inputs, and returns new state (immutable).
 */
export function era1Reducer(state: GameState, action: GameAction): GameState {
  if (!state) throw new Error('State is required');
  if (!action || typeof action.type !== 'string') throw new Error('Action must have a type');

  switch (action.type) {
    case 'ADVANCE_PHASE':
      return advanceEra1Phase(state);
    case 'DRAW_TILES':
      if (!action.playerId) throw new Error('DRAW_TILES requires playerId');
      return drawTiles(state, action.playerId);
    case 'PROPOSE_TRADE':
      if (!action.fromPlayerId || !action.toPlayerId) throw new Error('PROPOSE_TRADE requires fromPlayerId and toPlayerId');
      if (action.fromPlayerId === action.toPlayerId) throw new Error('Cannot trade with yourself');
      if (!action.tileOffered || !action.tileRequested) throw new Error('PROPOSE_TRADE requires tileOffered and tileRequested');
      return proposeTrade(state, action.fromPlayerId, action.toPlayerId, action.tileOffered, action.tileRequested);
    case 'ACCEPT_TRADE':
      if (!action.tradeId) throw new Error('ACCEPT_TRADE requires tradeId');
      return acceptTrade(state, action.tradeId, action.playerId);
    case 'REJECT_TRADE':
      if (!action.tradeId) throw new Error('REJECT_TRADE requires tradeId');
      return rejectTrade(state, action.tradeId, action.playerId);
    case 'END_TRADE_PHASE':
      return endTradePhase(state);
    case 'SOLO_TRADE':
      if (!action.playerId) throw new Error('SOLO_TRADE requires playerId');
      if (!Array.isArray(action.discardTiles) || action.discardTiles.length !== 2) throw new Error('SOLO_TRADE requires exactly 2 discardTiles');
      return soloTrade(state, action.playerId, action.discardTiles);
    case 'PLACE_TILES':
      if (!action.playerId) throw new Error('PLACE_TILES requires playerId');
      return placeTiles(state, action.playerId, action.boardCells);
    case 'CALCULATE_SCORES':
      return calculateScores(state);
    case 'CHOOSE_ERA_CARD':
      if (!action.playerId || !action.cardId) throw new Error('CHOOSE_ERA_CARD requires playerId and cardId');
      return chooseEraCard(state, action.playerId, action.cardId);
    case 'CHOOSE_RELIC':
      if (!action.playerId || !action.relicId) throw new Error('CHOOSE_RELIC requires playerId and relicId');
      return chooseRelic(state, action.playerId, action.relicId);
    case 'RESOLVE_EFFECT':
      if (!action.playerId) throw new Error('RESOLVE_EFFECT requires playerId');
      return resolveEffect(state, action.playerId, action.resolution);
    default:
      return state;
  }
}

/** Automatically advances to the next Era I phase */
function advanceEra1Phase(state: GameState): GameState {
  const rng = createRng(state.seed + phaseOffset(state.era1Phase));

  switch (state.era1Phase) {
    case 'setup': {
      // Reveal world card: pick 1 from shuffled deck
      const shuffledWorld = shuffle([...worldCardDeck], rng);
      const worldCard = shuffledWorld[0];
      let newState: GameState = {
        ...state,
        era1Phase: 'world_card_reveal',
        worldCard,
      };
      // Execute on_reveal effects from the world card (applies to all players)
      newState = applyEffects(newState, worldCard.effects, {
        playerId: null,
        trigger: 'on_reveal',
      });
      return newState;
    }
    case 'world_card_reveal': {
      // Deal 3 era cards per player as choices (pick 1)
      const shuffledEra = shuffle([...eraCardDeck], rng);
      const CHOICES_PER_PLAYER = 3;
      const pendingEraCards: Record<string, typeof shuffledEra> = {};
      state.players.forEach((player, i) => {
        const start = i * CHOICES_PER_PLAYER;
        pendingEraCards[player.id] = shuffledEra
          .slice(start, start + CHOICES_PER_PLAYER)
          .map(c => ({ ...c }));
      });
      let eraState: GameState = { ...state, era1Phase: 'era_cards_deal', pendingEraCards };
      // Bots auto-pick immediately
      eraState = autoBotEraCardPicks(eraState);
      return eraState;
    }
    case 'era_cards_deal': {
      // Wait until all players have chosen their era card
      const allChosen = state.players.every(p => p.eraCards.length > 0);
      if (!allChosen) return state;

      // Deal relics: 3 choices per player (1-4 players only)
      if (state.players.length <= 4) {
        const assignedRelicIds = new Set(
          state.players.map(p => p.relic?.id).filter(Boolean),
        );
        const shuffledRelics = shuffle(
          relicCardDeck.filter(r => !assignedRelicIds.has(r.id)),
          rng,
        );
        const CHOICES_PER_PLAYER = 3;
        const pendingRelics: Record<string, typeof shuffledRelics> = {};
        let relicIdx = 0;
        for (const player of state.players) {
          if (player.relic) continue; // Already has relic from grant_relic_to_all
          pendingRelics[player.id] = shuffledRelics
            .slice(relicIdx, relicIdx + CHOICES_PER_PLAYER)
            .map(r => ({ ...r }));
          relicIdx += CHOICES_PER_PLAYER;
        }
        let relicState: GameState = { ...state, era1Phase: 'relics_deal', pendingRelics, pendingEraCards: undefined };
        // Bots auto-pick immediately
        relicState = autoBotRelicPicks(relicState);
        return relicState;
      }
      // If more than 4 players, skip relics
      return { ...state, era1Phase: 'draw_tiles', pendingEraCards: undefined };
    }
    case 'relics_deal': {
      // Wait until all players have chosen their relic (or have one from grant_relic_to_all)
      const allRelicsChosen = state.players.every(p => p.relic !== null);
      if (!allRelicsChosen) return state;
      return { ...state, era1Phase: 'draw_tiles', pendingRelics: undefined };
    }
    case 'draw_tiles': {
      // Check that all players have drawn their expected amount
      const allDrawn = state.players.every(p => {
        const pRace = getRaceById(p.raceId);
        const raceDrawMod = pRace.era1Disadvantage.effectType === 'reduced_draw'
          ? (pRace.era1Disadvantage.params.modifier as number)
          : 0;
        const expected = TILES_PER_PLAYER + (p.drawCountModifier ?? 0) + raceDrawMod;
        return Object.values(p.tiles).reduce((a, b) => a + b, 0) >= expected;
      });
      if (!allDrawn) return state;
      // Respect skip_trade_phase card effect
      if (state.skipTradePhase) {
        return { ...state, era1Phase: 'placement' };
      }
      // Apply race trade limit bonuses (Human: extra_trade)
      const tradePlayers = state.players.map(p => {
        const pRace = getRaceById(p.raceId);
        if (pRace.era1Advantage.effectType === 'extra_trade') {
          const raceTradeLimit = pRace.era1Advantage.params.tradeLimit as number;
          const existing = p.tradeLimit ?? 1;
          return { ...p, tradeLimit: Math.max(existing, raceTradeLimit) };
        }
        return p;
      });
      return { ...state, era1Phase: 'trade', players: tradePlayers };
    }
    case 'trade':
      return { ...state, era1Phase: 'placement' };
    case 'placement': {
      const allPlaced = state.players.every(p => p.hasPlaced);
      if (!allPlaced) return state;
      return { ...state, era1Phase: 'scoring' };
    }
    case 'scoring':
      return { ...state, era1Phase: 'complete' };
    case 'complete':
      return state;
  }
}

/**
 * Each player draws 18 tiles from the central pile.
 * Guarantees at least 2 tiles of the player's favorable terrain.
 * If the random draw doesn't include enough, swap random non-road
 * tiles from the draw for favorable terrain tiles from the remaining pile.
 */
function drawTiles(state: GameState, playerId: string): GameState {
  if (state.era1Phase !== 'draw_tiles') {
    throw new Error('Can only draw tiles during the draw_tiles phase');
  }

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) throw new Error(`Player not found: ${playerId}`);

  const player = state.players[playerIndex];
  const race = getRaceById(player.raceId);
  const raceDrawMod = race.era1Disadvantage.effectType === 'reduced_draw'
    ? (race.era1Disadvantage.params.modifier as number)
    : 0;
  const expectedDraw = TILES_PER_PLAYER + (player.drawCountModifier ?? 0) + raceDrawMod;
  const currentTileCount = Object.values(player.tiles).reduce((a, b) => a + b, 0);
  if (currentTileCount >= expectedDraw) {
    throw new Error(`Player ${playerId} has already drawn their tiles`);
  }

  // Elf advantage: guaranteed 3 favorable tiles instead of 2
  const GUARANTEED_FAVORABLE = race.era1Advantage.effectType === 'extra_favorable_guarantee'
    ? (race.era1Advantage.params.guaranteedFavorable as number)
    : 2;

  // Dwarf disadvantage: reduced draw count
  const raceDrawModifier = race.era1Disadvantage.effectType === 'reduced_draw'
    ? (race.era1Disadvantage.params.modifier as number)
    : 0;

  const drawCount = TILES_PER_PLAYER + (player.drawCountModifier ?? 0) + raceDrawModifier;
  let [drawn, remaining] = drawFromPile(state.tilePile, drawCount);
  const favorableTerrain = race.favorableTerrain as TerrainType;

  // Count how many favorable tiles were drawn
  const favorableDrawn = drawn.filter(t => t === favorableTerrain).length;
  const deficit = GUARANTEED_FAVORABLE - favorableDrawn;

  if (deficit > 0) {
    // Find favorable tiles in the remaining pile
    const favorableIndices: number[] = [];
    for (let i = 0; i < remaining.length && favorableIndices.length < deficit; i++) {
      if (remaining[i] === favorableTerrain) favorableIndices.push(i);
    }

    // Find non-favorable, non-road tiles in the drawn set to swap out
    const swappableIndices: number[] = [];
    for (let i = 0; i < drawn.length && swappableIndices.length < favorableIndices.length; i++) {
      if (drawn[i] !== favorableTerrain && drawn[i] !== 'road') {
        swappableIndices.push(i);
      }
    }

    // Perform swaps
    const drawnCopy = [...drawn];
    const remainingCopy = [...remaining];
    for (let s = 0; s < swappableIndices.length; s++) {
      const drawIdx = swappableIndices[s];
      const pileIdx = favorableIndices[s];
      // Put the drawn tile back into the pile
      remainingCopy[pileIdx] = drawnCopy[drawIdx];
      // Take the favorable tile from the pile
      drawnCopy[drawIdx] = favorableTerrain;
    }
    drawn = drawnCopy;
    remaining = remainingCopy;
  }

  const drawnCounts = tilesToCounts(drawn);

  const updatedPlayer = {
    ...player,
    tiles: {
      plain: player.tiles.plain + drawnCounts.plain,
      mountain: player.tiles.mountain + drawnCounts.mountain,
      forest: player.tiles.forest + drawnCounts.forest,
      swamp: player.tiles.swamp + drawnCounts.swamp,
      road: player.tiles.road + drawnCounts.road,
    },
  };

  const players = [...state.players];
  players[playerIndex] = updatedPlayer;

  return { ...state, players, tilePile: remaining };
}

/** Propose a trade: give 1 tile, request 1 tile */
function proposeTrade(
  state: GameState,
  fromPlayerId: string,
  toPlayerId: string,
  tileOffered: TerrainType,
  tileRequested: TerrainType,
): GameState {
  if (state.era1Phase !== 'trade') {
    throw new Error('Can only trade during the trade phase');
  }

  const from = state.players.find(p => p.id === fromPlayerId);
  const to = state.players.find(p => p.id === toPlayerId);
  if (!from) throw new Error(`Player not found: ${fromPlayerId}`);
  if (!to) throw new Error(`Player not found: ${toPlayerId}`);

  const maxTrades = from.tradeLimit ?? 1;
  const tradesMade = state.activeTrades.filter(
    t => t.fromPlayerId === fromPlayerId && t.status === 'accepted'
  ).length;
  if (from.hasTraded || tradesMade >= maxTrades) {
    throw new Error(`Player ${fromPlayerId} has already traded`);
  }
  if (from.tiles[tileOffered] <= 0) {
    throw new Error(`Player ${fromPlayerId} has no tiles of type ${tileOffered}`);
  }

  const trade: TradeProposal = {
    id: nextTradeId(state),
    fromPlayerId,
    toPlayerId,
    tileOffered,
    tileRequested,
    status: 'pending',
  };

  return { ...state, activeTrades: [...state.activeTrades, trade] };
}

/** Accept a pending trade */
function acceptTrade(state: GameState, tradeId: string, actingPlayerId?: string): GameState {
  const tradeIndex = state.activeTrades.findIndex(t => t.id === tradeId);
  if (tradeIndex === -1) throw new Error(`Trade not found: ${tradeId}`);

  const trade = state.activeTrades[tradeIndex];
  if (trade.status !== 'pending') throw new Error('Trade has already been processed');
  if (actingPlayerId != null && actingPlayerId !== trade.toPlayerId) {
    throw new Error('Only the recipient can accept this trade');
  }

  const fromIndex = state.players.findIndex(p => p.id === trade.fromPlayerId);
  const toIndex = state.players.findIndex(p => p.id === trade.toPlayerId);
  const from = state.players[fromIndex];
  const to = state.players[toIndex];

  // Validate both players have the tiles
  if (from.tiles[trade.tileOffered] <= 0) {
    throw new Error(`${trade.fromPlayerId} no longer has tiles of type ${trade.tileOffered}`);
  }
  if (to.tiles[trade.tileRequested] <= 0) {
    throw new Error(`${trade.toPlayerId} has no tiles of type ${trade.tileRequested}`);
  }

  // Count accepted trades to determine if limit is reached
  const fromMaxTrades = from.tradeLimit ?? 1;
  const fromAccepted = state.activeTrades.filter(
    t => t.fromPlayerId === trade.fromPlayerId && t.status === 'accepted'
  ).length;
  const toMaxTrades = to.tradeLimit ?? 1;
  const toAccepted = state.activeTrades.filter(
    t => t.fromPlayerId === trade.toPlayerId && t.status === 'accepted'
  ).length;

  const updatedFrom = {
    ...from,
    hasTraded: (fromAccepted + 1) >= fromMaxTrades,
    tiles: {
      ...from.tiles,
      [trade.tileOffered]: from.tiles[trade.tileOffered] - 1,
      [trade.tileRequested]: from.tiles[trade.tileRequested] + 1,
    },
  };

  const updatedTo = {
    ...to,
    hasTraded: (toAccepted + 1) >= toMaxTrades,
    tiles: {
      ...to.tiles,
      [trade.tileRequested]: to.tiles[trade.tileRequested] - 1,
      [trade.tileOffered]: to.tiles[trade.tileOffered] + 1,
    },
  };

  const players = [...state.players];
  players[fromIndex] = updatedFrom;
  players[toIndex] = updatedTo;

  const activeTrades = [...state.activeTrades];
  activeTrades[tradeIndex] = { ...trade, status: 'accepted' };

  return { ...state, players, activeTrades };
}

function rejectTrade(state: GameState, tradeId: string, actingPlayerId?: string): GameState {
  const tradeIndex = state.activeTrades.findIndex(t => t.id === tradeId);
  if (tradeIndex === -1) throw new Error(`Trade not found: ${tradeId}`);

  const trade = state.activeTrades[tradeIndex];
  if (trade.status !== 'pending') throw new Error('Trade has already been processed');
  if (actingPlayerId != null && actingPlayerId !== trade.toPlayerId) {
    throw new Error('Only the recipient can reject this trade');
  }

  const activeTrades = [...state.activeTrades];
  activeTrades[tradeIndex] = { ...trade, status: 'rejected' };

  return { ...state, activeTrades };
}

/**
 * Solo trade: the player discards 2 tiles and receives 2 favorable terrain tiles.
 * Only allowed if the player has fewer than 6 favorable terrain tiles.
 */
function soloTrade(state: GameState, playerId: string, discardTiles: [TerrainType, TerrainType]): GameState {
  if (state.era1Phase !== 'trade') {
    throw new Error('Can only trade during the trade phase');
  }

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) throw new Error(`Player not found: ${playerId}`);

  const player = state.players[playerIndex];
  if (player.hasTraded) throw new Error(`Player ${playerId} has already traded`);

  const race = getRaceById(player.raceId);
  const favorableTerrain = race.favorableTerrain;

  // Check the player has fewer than 6 favorable tiles
  if (player.tiles[favorableTerrain] >= 6) {
    throw new Error(`Player ${playerId} already has 6+ favorable tiles and cannot trade`);
  }

  // Validate the player has the tiles to discard
  const discardCounts: Partial<Record<TerrainType, number>> = {};
  for (const tile of discardTiles) {
    discardCounts[tile] = (discardCounts[tile] ?? 0) + 1;
    if ((discardCounts[tile] ?? 0) > player.tiles[tile]) {
      throw new Error(`Player ${playerId} does not have enough tiles of type ${tile}`);
    }
  }

  if (state.tilePile.length < 2) {
    throw new Error('Not enough tiles left in the pile');
  }

  // Find 2 favorable tiles in the pile
  let pile = [...state.tilePile];
  const drawn: TerrainType[] = [];
  for (let i = 0; i < pile.length && drawn.length < 2; i++) {
    if (pile[i] === favorableTerrain) {
      drawn.push(pile[i]);
      pile.splice(i, 1);
      i--; // re-check current index after splice
    }
  }

  // If not enough favorable tiles in pile, draw from the top as fallback
  while (drawn.length < 2 && pile.length > 0) {
    drawn.push(pile.shift()!);
  }

  if (drawn.length < 2) {
    throw new Error('Not enough tiles left in the pile');
  }

  // Put discarded tiles back at the end
  pile.push(...discardTiles);

  const updatedTiles = { ...player.tiles };
  for (const tile of discardTiles) {
    updatedTiles[tile]--;
  }
  for (const tile of drawn) {
    updatedTiles[tile]++;
  }

  const updatedPlayer = {
    ...player,
    hasTraded: true,
    tiles: updatedTiles,
  };

  const players = [...state.players];
  players[playerIndex] = updatedPlayer;

  return { ...state, players, tilePile: pile };
}

function endTradePhase(state: GameState): GameState {
  if (state.era1Phase !== 'trade') {
    throw new Error('Not in the trade phase');
  }
  return { ...state, era1Phase: 'placement', activeTrades: [] };
}

/** Marks that a player has "placed" their tiles (in Era I this is just a confirmation) */
function placeTiles(
  state: GameState,
  playerId: string,
  boardCells?: Array<{ q: number; r: number; terrain: string | null }>,
): GameState {
  if (state.era1Phase !== 'placement') {
    throw new Error('Can only place tiles during the placement phase');
  }

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) throw new Error(`Player not found: ${playerId}`);

  const players = [...state.players];
  players[playerIndex] = {
    ...players[playerIndex],
    hasPlaced: true,
    ...(boardCells ? { era1BoardCells: boardCells } : {}),
  };

  return { ...state, players };
}

/** Calculates scores for all players, applying card effects first */
function calculateScores(state: GameState): GameState {
  if (state.era1Phase !== 'scoring') {
    throw new Error('Can only calculate scores during the scoring phase');
  }

  // Apply on_era1_close effects from all cards before scoring
  let s = state;

  // World card effects
  if (s.worldCard) {
    s = applyEffects(s, s.worldCard.effects, { playerId: null, trigger: 'on_era1_close' });
  }

  // Per-player era card and relic effects
  for (const player of s.players) {
    for (const eraCard of player.eraCards) {
      s = applyEffects(s, eraCard.effects, { playerId: player.id, trigger: 'on_era1_close' });
    }
    if (player.relic) {
      s = applyEffects(s, player.relic.effects, { playerId: player.id, trigger: 'on_era1_close' });
    }
  }

  // Now calculate final scores with all bonuses accumulated
  const players = s.players.map(player => ({
    ...player,
    score: calculateScore(s, player.id),
  }));

  const scored: GameState = { ...s, players, era1Phase: 'complete' };

  // Hand off to Era II: seed per-player era2State, reveal is deferred to the Era II reducer.
  return transitionEraIToEra2(scored);
}

/** Player chooses 1 era card from their 3 pending options */
function chooseEraCard(state: GameState, playerId: string, cardId: string): GameState {
  if (state.era1Phase !== 'era_cards_deal') {
    throw new Error('Can only choose era cards during the era_cards_deal phase');
  }

  const pending = state.pendingEraCards?.[playerId];
  if (!pending || pending.length === 0) {
    throw new Error(`No pending era card choices for player ${playerId}`);
  }

  const chosen = pending.find(c => c.id === cardId);
  if (!chosen) {
    throw new Error(`Card ${cardId} is not among the choices for player ${playerId}`);
  }

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) throw new Error(`Player not found: ${playerId}`);

  const player = state.players[playerIndex];
  if (player.eraCards.length > 0) {
    throw new Error(`Player ${playerId} has already chosen an era card`);
  }

  // Assign the card to the player
  const assignedCard = { ...chosen, assignedTo: playerId };

  // Apply on_reveal effects from the chosen era card
  let newState: GameState = {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex
        ? { ...p, eraCards: [...p.eraCards, assignedCard] }
        : p,
    ),
    pendingEraCards: {
      ...state.pendingEraCards,
      [playerId]: [], // Clear this player's pending choices
    },
  };

  newState = applyEffects(newState, assignedCard.effects, {
    playerId,
    trigger: 'on_reveal',
  });

  // Auto-pick for bots that still have pending choices
  newState = autoBotEraCardPicks(newState);

  return newState;
}

/** Player chooses 1 relic from their 3 pending options */
function chooseRelic(state: GameState, playerId: string, relicId: string): GameState {
  if (state.era1Phase !== 'relics_deal') {
    throw new Error('Can only choose relics during the relics_deal phase');
  }

  const pending = state.pendingRelics?.[playerId];
  if (!pending || pending.length === 0) {
    throw new Error(`No pending relic choices for player ${playerId}`);
  }

  const chosen = pending.find(r => r.id === relicId);
  if (!chosen) {
    throw new Error(`Relic ${relicId} is not among the choices for player ${playerId}`);
  }

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) throw new Error(`Player not found: ${playerId}`);

  const player = state.players[playerIndex];
  if (player.relic !== null) {
    throw new Error(`Player ${playerId} already has a relic`);
  }

  const assignedRelic = { ...chosen, assignedTo: playerId };

  let newState: GameState = {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, relic: assignedRelic } : p,
    ),
    pendingRelics: {
      ...state.pendingRelics,
      [playerId]: [], // Clear this player's pending choices
    },
  };

  // Apply on_reveal effects from the chosen relic
  newState = applyEffects(newState, assignedRelic.effects, {
    playerId,
    trigger: 'on_reveal',
  });

  // Auto-pick for bots that still have pending choices
  newState = autoBotRelicPicks(newState);

  return newState;
}

/** Bots automatically pick from their pending era card choices (first card = deterministic pick) */
function autoBotEraCardPicks(state: GameState): GameState {
  let s = state;
  for (const player of s.players) {
    if (!player.isBot) continue;
    const pending = s.pendingEraCards?.[player.id];
    if (!pending || pending.length === 0) continue;
    if (player.eraCards.length > 0) continue;

    // Bot picks the first card (deterministic since deck was already shuffled)
    const pick = pending[0];
    const pIdx = s.players.findIndex(p => p.id === player.id);
    const assignedCard = { ...pick, assignedTo: player.id };

    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === pIdx ? { ...p, eraCards: [...p.eraCards, assignedCard] } : p,
      ),
      pendingEraCards: { ...s.pendingEraCards, [player.id]: [] },
    };

    s = applyEffects(s, assignedCard.effects, {
      playerId: player.id,
      trigger: 'on_reveal',
    });
  }
  return s;
}

/** Bots automatically pick from their pending relic choices */
function autoBotRelicPicks(state: GameState): GameState {
  let s = state;
  for (const player of s.players) {
    if (!player.isBot) continue;
    const pending = s.pendingRelics?.[player.id];
    if (!pending || pending.length === 0) continue;
    if (player.relic !== null) continue;

    const pick = pending[0];
    const pIdx = s.players.findIndex(p => p.id === player.id);
    const assignedRelic = { ...pick, assignedTo: player.id };

    s = {
      ...s,
      players: s.players.map((p, i) =>
        i === pIdx ? { ...p, relic: assignedRelic } : p,
      ),
      pendingRelics: { ...s.pendingRelics, [player.id]: [] },
    };

    s = applyEffects(s, assignedRelic.effects, {
      playerId: player.id,
      trigger: 'on_reveal',
    });
  }
  return s;
}

/**
 * Resolves a pending interactive effect on a player.
 * Called when the player submits their choice for discard_and_redraw, manual_pick, or view_opponents_tiles.
 */
function resolveEffect(state: GameState, playerId: string, resolution: Record<string, unknown>): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) throw new Error(`Player not found: ${playerId}`);

  const player = state.players[playerIndex];
  if (!player.pendingEffect) throw new Error(`Player ${playerId} has no pending effect`);

  const effectType = player.pendingEffect.type;

  switch (effectType) {
    case 'discard_and_redraw': {
      const selectedTiles = resolution.selectedTiles as TerrainType[];
      if (!selectedTiles || selectedTiles.length === 0) {
        // Player chose to skip discarding
        const players = state.players.map(p =>
          p.id === playerId ? { ...p, pendingEffect: undefined } : p,
        );
        return { ...state, players };
      }

      const maxDiscard = player.pendingEffect.params.maxDiscard as number;
      if (selectedTiles.length > maxDiscard) {
        throw new Error(`Cannot discard more than ${maxDiscard} tiles`);
      }

      // Validate player has these tiles
      const tileCounts: Partial<Record<TerrainType, number>> = {};
      for (const t of selectedTiles) {
        tileCounts[t] = (tileCounts[t] ?? 0) + 1;
        if ((tileCounts[t] ?? 0) > player.tiles[t]) {
          throw new Error(`Player doesn't have enough ${t} tiles to discard`);
        }
      }

      // Discard and redraw
      const newTiles = { ...player.tiles };
      for (const t of selectedTiles) {
        newTiles[t]--;
      }

      const rng = createRng(state.seed + 910 + playerIndex);
      let pile = [...state.tilePile, ...selectedTiles];
      const drawn: TerrainType[] = [];
      for (let i = 0; i < selectedTiles.length && pile.length > 0; i++) {
        const idx = Math.floor(rng() * pile.length);
        drawn.push(pile[idx]);
        pile.splice(idx, 1);
      }
      for (const t of drawn) {
        newTiles[t]++;
      }

      const players = state.players.map(p =>
        p.id === playerId ? { ...p, tiles: newTiles, pendingEffect: undefined } : p,
      );
      return { ...state, players, tilePile: pile };
    }

    case 'manual_pick': {
      const pickedTiles = resolution.pickedTiles as TerrainType[];
      const pickCount = player.pendingEffect.params.pickCount as number;
      const revealedTiles = player.pendingEffect.params.revealedTiles as TerrainType[];

      if (!pickedTiles || pickedTiles.length !== pickCount) {
        throw new Error(`Must pick exactly ${pickCount} tiles`);
      }

      // Validate all picked tiles are from the revealed set
      const remaining = [...revealedTiles];
      for (const t of pickedTiles) {
        const idx = remaining.indexOf(t);
        if (idx === -1) throw new Error(`Tile ${t} is not in the revealed set`);
        remaining.splice(idx, 1);
      }

      // Add picked tiles to player, return unpicked to pile
      const newTiles = { ...player.tiles };
      for (const t of pickedTiles) {
        newTiles[t]++;
      }

      // remaining = revealed tiles not picked; put them back + rest of pile
      const revealCount = revealedTiles.length;
      const newPile = [...remaining, ...state.tilePile.slice(revealCount)];
      const players = state.players.map(p =>
        p.id === playerId ? { ...p, tiles: newTiles, pendingEffect: undefined } : p,
      );
      return { ...state, players, tilePile: newPile };
    }

    case 'view_opponents_tiles': {
      // Just dismiss — clear the pending effect
      const players = state.players.map(p =>
        p.id === playerId ? { ...p, pendingEffect: undefined } : p,
      );
      return { ...state, players };
    }

    default:
      throw new Error(`Unknown pending effect type: ${effectType}`);
  }
}

/** Numeric offset per phase to vary the RNG seed */
function phaseOffset(phase: string): number {
  const offsets: Record<string, number> = {
    setup: 0,
    world_card_reveal: 100,
    era_cards_deal: 200,
    relics_deal: 300,
    draw_tiles: 400,
    trade: 500,
    placement: 600,
    scoring: 700,
  };
  return offsets[phase] ?? 0;
}
