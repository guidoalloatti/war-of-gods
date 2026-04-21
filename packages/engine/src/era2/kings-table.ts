import type { GameState } from '../types/game.js';
import type { TransferProposal } from '../types/era2.js';
import { computeTransferDelta } from './costs.js';

function nextTransferId(state: GameState): string {
  // Deterministic: seed + number of proposals so far. Avoids module-global
  // state that bleeds between rooms in multiplayer and enables engine replay.
  const n = (state.activeTransfers ?? []).length;
  return `xfer_${state.seed}_${n}`;
}

/**
 * Propose a point transfer during the Kings Table phase.
 * Reserves `pointsOffered` from the sender's budget on creation (via pointsGiven),
 * rather than at acceptance. This prevents the sender from queuing multiple
 * overlapping proposals that would all succeed individually but overdraw together.
 *
 * If rejected, the reservation is released.
 * If accepted, the receiver's pointsReceived increases by `min(offered, floor(offered × giveRatio × receiveRatio))`.
 */
export function proposeTransfer(
  state: GameState,
  fromPlayerId: string,
  toPlayerId: string,
  pointsOffered: number,
): GameState {
  if (state.era2Phase !== 'kings_table') {
    throw new Error('Transfers only allowed during kings_table phase');
  }
  if (fromPlayerId === toPlayerId) {
    throw new Error('Cannot transfer points to yourself');
  }
  if (!Number.isFinite(pointsOffered) || pointsOffered <= 0 || !Number.isInteger(pointsOffered)) {
    throw new Error('pointsOffered must be a positive integer');
  }

  const fromIdx = state.players.findIndex(p => p.id === fromPlayerId);
  const toIdx = state.players.findIndex(p => p.id === toPlayerId);
  if (fromIdx === -1) throw new Error(`Player not found: ${fromPlayerId}`);
  if (toIdx === -1) throw new Error(`Player not found: ${toPlayerId}`);

  const from = state.players[fromIdx];
  const to = state.players[toIdx];
  if (!from.era2State || !to.era2State) {
    throw new Error('Both players must have Era II state');
  }

  const fromState = from.era2State;
  const available = fromState.constructionPoints + fromState.pointsReceived - fromState.pointsGiven - fromState.pointsSpent;
  if (pointsOffered > available) {
    throw new Error(`Insufficient points: offered ${pointsOffered}, available ${available}`);
  }

  const received = computeTransferDelta(
    pointsOffered,
    fromState.transferModifiers.giveRatio,
    to.era2State.transferModifiers.receiveRatio,
  );

  const proposal: TransferProposal = {
    id: nextTransferId(state),
    fromPlayerId,
    toPlayerId,
    pointsOffered,
    pointsReceived: received,
    status: 'pending',
    createdAt: (state.activeTransfers ?? []).length,
  };

  // Reserve the offered points on the sender's side immediately.
  const players = [...state.players];
  players[fromIdx] = {
    ...from,
    era2State: { ...fromState, pointsGiven: fromState.pointsGiven + pointsOffered },
  };

  return {
    ...state,
    players,
    activeTransfers: [...(state.activeTransfers ?? []), proposal],
  };
}

export function acceptTransfer(state: GameState, transferId: string, actingPlayerId?: string): GameState {
  if (state.era2Phase !== 'kings_table') {
    throw new Error('Transfers only allowed during kings_table phase');
  }
  const transfers = state.activeTransfers ?? [];
  const idx = transfers.findIndex(t => t.id === transferId);
  if (idx === -1) throw new Error(`Transfer not found: ${transferId}`);

  const proposal = transfers[idx];
  if (proposal.status !== 'pending') {
    throw new Error('Transfer has already been resolved');
  }
  if (actingPlayerId != null && actingPlayerId !== proposal.toPlayerId) {
    throw new Error('Only the recipient can accept this transfer');
  }

  const toIdx = state.players.findIndex(p => p.id === proposal.toPlayerId);
  if (toIdx === -1) throw new Error(`Player not found: ${proposal.toPlayerId}`);

  const to = state.players[toIdx];
  if (!to.era2State) throw new Error('Receiver has no Era II state');

  const players = [...state.players];
  players[toIdx] = {
    ...to,
    era2State: {
      ...to.era2State,
      pointsReceived: to.era2State.pointsReceived + proposal.pointsReceived,
    },
  };

  const newTransfers = [...transfers];
  newTransfers[idx] = { ...proposal, status: 'accepted' };

  return { ...state, players, activeTransfers: newTransfers };
}

export function rejectTransfer(state: GameState, transferId: string, actingPlayerId?: string): GameState {
  if (state.era2Phase !== 'kings_table') {
    throw new Error('Transfers only allowed during kings_table phase');
  }
  const transfers = state.activeTransfers ?? [];
  const idx = transfers.findIndex(t => t.id === transferId);
  if (idx === -1) throw new Error(`Transfer not found: ${transferId}`);

  const proposal = transfers[idx];
  if (proposal.status !== 'pending') {
    throw new Error('Transfer has already been resolved');
  }
  if (actingPlayerId != null && actingPlayerId !== proposal.toPlayerId) {
    throw new Error('Only the recipient can reject this transfer');
  }

  // Release the sender's reservation.
  const fromIdx = state.players.findIndex(p => p.id === proposal.fromPlayerId);
  if (fromIdx === -1) throw new Error(`Player not found: ${proposal.fromPlayerId}`);
  const from = state.players[fromIdx];
  if (!from.era2State) throw new Error('Sender has no Era II state');

  const players = [...state.players];
  players[fromIdx] = {
    ...from,
    era2State: {
      ...from.era2State,
      pointsGiven: Math.max(0, from.era2State.pointsGiven - proposal.pointsOffered),
    },
  };

  const newTransfers = [...transfers];
  newTransfers[idx] = { ...proposal, status: 'rejected' };

  return { ...state, players, activeTransfers: newTransfers };
}

/** Mark a player as ready to close the Kings Table. Idempotent. */
export function markKingsTableReady(state: GameState, playerId: string): GameState {
  if (state.era2Phase !== 'kings_table') {
    throw new Error('MARK_KINGS_TABLE_READY only allowed during kings_table phase');
  }
  const idx = state.players.findIndex(p => p.id === playerId);
  if (idx === -1) throw new Error(`Player not found: ${playerId}`);

  const ready = state.kingsTableReady ?? [];
  if (ready.includes(playerId)) return state;

  return { ...state, kingsTableReady: [...ready, playerId] };
}
