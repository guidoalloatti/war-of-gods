import { describe, it, expect } from 'vitest';
import { createGame } from '../state/createGame.js';
import { era2Reducer } from '../era2/reducer.js';
import { initPlayerEra2State } from '../era2/init.js';
import type { GameState } from '../types/game.js';

function buildKingsTableState(overrides: { p1Points?: number; p2Points?: number } = {}): GameState {
  const base = createGame({
    mode: 'solo_bots',
    seed: 99,
    playerConfigs: [
      { name: 'P1', raceId: 'human', isBot: false },
      { name: 'P2', raceId: 'elf', isBot: false },
    ],
  });
  const players = base.players.map((p, i) => {
    const e2 = initPlayerEra2State({ ...p, score: i === 0 ? (overrides.p1Points ?? 40) : (overrides.p2Points ?? 20) });
    return { ...p, era2State: e2 };
  });
  return {
    ...base,
    phase: 'era2',
    era2Phase: 'kings_table',
    players,
    activeTransfers: [],
    kingsTableReady: [],
  };
}

describe('Kings Table — proposeTransfer', () => {
  it('creates a pending proposal and reserves points via pointsGiven', () => {
    let s = buildKingsTableState({ p1Points: 40 });
    s = era2Reducer(s, {
      type: 'PROPOSE_TRANSFER',
      fromPlayerId: s.players[0].id,
      toPlayerId: s.players[1].id,
      pointsOffered: 10,
    });
    expect(s.activeTransfers).toHaveLength(1);
    const t = s.activeTransfers![0];
    expect(t.status).toBe('pending');
    expect(t.pointsOffered).toBe(10);
    expect(t.pointsReceived).toBe(5); // default 2:1 (0.5 give × 1 receive = 5)
    expect(s.players[0].era2State!.pointsGiven).toBe(10);
    expect(s.players[1].era2State!.pointsReceived).toBe(0); // only on accept
  });

  it('rejects zero / negative / non-integer offered', () => {
    const s = buildKingsTableState();
    const make = (offered: number) =>
      era2Reducer(s, {
        type: 'PROPOSE_TRANSFER',
        fromPlayerId: s.players[0].id,
        toPlayerId: s.players[1].id,
        pointsOffered: offered,
      });
    expect(() => make(0)).toThrow(/positive integer/);
    expect(() => make(-5)).toThrow(/positive integer/);
    expect(() => make(1.5)).toThrow(/positive integer/);
  });

  it('rejects self-transfer', () => {
    const s = buildKingsTableState();
    expect(() =>
      era2Reducer(s, {
        type: 'PROPOSE_TRANSFER',
        fromPlayerId: s.players[0].id,
        toPlayerId: s.players[0].id,
        pointsOffered: 5,
      }),
    ).toThrow(/yourself/);
  });

  it('rejects insufficient budget', () => {
    const s = buildKingsTableState({ p1Points: 10 });
    expect(() =>
      era2Reducer(s, {
        type: 'PROPOSE_TRANSFER',
        fromPlayerId: s.players[0].id,
        toPlayerId: s.players[1].id,
        pointsOffered: 20,
      }),
    ).toThrow(/Insufficient points/);
  });

  it('rejects outside kings_table phase', () => {
    const s = { ...buildKingsTableState(), era2Phase: 'tech_allocation' } as GameState;
    expect(() =>
      era2Reducer(s, {
        type: 'PROPOSE_TRANSFER',
        fromPlayerId: s.players[0].id,
        toPlayerId: s.players[1].id,
        pointsOffered: 5,
      }),
    ).toThrow(/kings_table/);
  });

  it('stacked proposals reserve cumulatively (prevents overdraw)', () => {
    let s = buildKingsTableState({ p1Points: 10 });
    s = era2Reducer(s, {
      type: 'PROPOSE_TRANSFER',
      fromPlayerId: s.players[0].id,
      toPlayerId: s.players[1].id,
      pointsOffered: 6,
    });
    // Second proposal of 6 would exceed the 10-point budget (6 + 6 = 12).
    expect(() =>
      era2Reducer(s, {
        type: 'PROPOSE_TRANSFER',
        fromPlayerId: s.players[0].id,
        toPlayerId: s.players[1].id,
        pointsOffered: 6,
      }),
    ).toThrow(/Insufficient points/);
  });
});

describe('Kings Table — acceptTransfer', () => {
  it('moves proposal to accepted and credits receiver', () => {
    let s = buildKingsTableState();
    s = era2Reducer(s, {
      type: 'PROPOSE_TRANSFER',
      fromPlayerId: s.players[0].id,
      toPlayerId: s.players[1].id,
      pointsOffered: 10,
    });
    const tid = s.activeTransfers![0].id;
    s = era2Reducer(s, { type: 'ACCEPT_TRANSFER', playerId: s.players[1].id, transferId: tid });
    expect(s.activeTransfers![0].status).toBe('accepted');
    expect(s.players[1].era2State!.pointsReceived).toBe(5);
    // Sender reservation stays (points were spent, not refunded).
    expect(s.players[0].era2State!.pointsGiven).toBe(10);
  });

  it('caps received at offered when ratios stack above 1.0', () => {
    let s = buildKingsTableState();
    // Boost receiver's receiveRatio to 3 — raw = 10 × 0.5 × 3 = 15 → cap at 10.
    const players = s.players.map((p, i) =>
      i === 1
        ? { ...p, era2State: { ...p.era2State!, transferModifiers: { ...p.era2State!.transferModifiers, receiveRatio: 3 } } }
        : p,
    );
    s = { ...s, players };
    s = era2Reducer(s, {
      type: 'PROPOSE_TRANSFER',
      fromPlayerId: s.players[0].id,
      toPlayerId: s.players[1].id,
      pointsOffered: 10,
    });
    const tid = s.activeTransfers![0].id;
    s = era2Reducer(s, { type: 'ACCEPT_TRANSFER', playerId: s.players[1].id, transferId: tid });
    expect(s.players[1].era2State!.pointsReceived).toBe(10); // capped
  });

  it('throws when transfer already resolved', () => {
    let s = buildKingsTableState();
    s = era2Reducer(s, {
      type: 'PROPOSE_TRANSFER',
      fromPlayerId: s.players[0].id,
      toPlayerId: s.players[1].id,
      pointsOffered: 4,
    });
    const tid = s.activeTransfers![0].id;
    s = era2Reducer(s, { type: 'ACCEPT_TRANSFER', playerId: s.players[1].id, transferId: tid });
    expect(() =>
      era2Reducer(s, { type: 'ACCEPT_TRANSFER', playerId: s.players[1].id, transferId: tid }),
    ).toThrow(/already been resolved/);
  });
});

describe('Kings Table — rejectTransfer', () => {
  it('releases reservation on the sender', () => {
    let s = buildKingsTableState({ p1Points: 20 });
    s = era2Reducer(s, {
      type: 'PROPOSE_TRANSFER',
      fromPlayerId: s.players[0].id,
      toPlayerId: s.players[1].id,
      pointsOffered: 8,
    });
    expect(s.players[0].era2State!.pointsGiven).toBe(8);
    const tid = s.activeTransfers![0].id;
    s = era2Reducer(s, { type: 'REJECT_TRANSFER', playerId: s.players[1].id, transferId: tid });
    expect(s.players[0].era2State!.pointsGiven).toBe(0);
    expect(s.activeTransfers![0].status).toBe('rejected');
    // Receiver never got credit.
    expect(s.players[1].era2State!.pointsReceived).toBe(0);
  });
});

describe('Kings Table — markKingsTableReady', () => {
  it('adds player id to kingsTableReady', () => {
    let s = buildKingsTableState();
    s = era2Reducer(s, { type: 'MARK_KINGS_TABLE_READY', playerId: s.players[0].id });
    expect(s.kingsTableReady).toContain(s.players[0].id);
  });

  it('is idempotent', () => {
    let s = buildKingsTableState();
    s = era2Reducer(s, { type: 'MARK_KINGS_TABLE_READY', playerId: s.players[0].id });
    const before = s.kingsTableReady;
    s = era2Reducer(s, { type: 'MARK_KINGS_TABLE_READY', playerId: s.players[0].id });
    expect(s.kingsTableReady).toEqual(before);
  });

  it('ADVANCE_ERA2_PHASE closes the table when all players ready', () => {
    let s = buildKingsTableState();
    for (const p of s.players) {
      s = era2Reducer(s, { type: 'MARK_KINGS_TABLE_READY', playerId: p.id });
    }
    s = era2Reducer(s, { type: 'ADVANCE_ERA2_PHASE' });
    expect(s.era2Phase).toBe('tech_allocation');
  });

  it('ADVANCE_ERA2_PHASE does not close the table when someone is missing', () => {
    let s = buildKingsTableState();
    s = era2Reducer(s, { type: 'MARK_KINGS_TABLE_READY', playerId: s.players[0].id });
    s = era2Reducer(s, { type: 'ADVANCE_ERA2_PHASE' });
    expect(s.era2Phase).toBe('kings_table');
  });
});
