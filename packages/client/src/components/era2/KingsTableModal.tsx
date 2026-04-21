import { useMemo, useState } from 'react';
import { computeTransferDelta, getRaceById } from '@war-of-gods/engine';
import type { GameState, GameAction } from '@war-of-gods/engine';
import type { Translations } from '../../i18n/es.js';

type Props = {
  gameState: GameState;
  localPlayerId: string;
  onClose: () => void;
  dispatch: (action: GameAction) => void;
  t: Translations;
};

export function KingsTableModal({ gameState, localPlayerId, onClose, dispatch, t }: Props) {
  const me = gameState.players.find(p => p.id === localPlayerId);
  const era2 = me?.era2State;
  const [toPlayerId, setToPlayerId] = useState<string | null>(null);
  const [amount, setAmount] = useState(2);

  const others = useMemo(
    () => gameState.players.filter(p => p.id !== localPlayerId),
    [gameState.players, localPlayerId],
  );

  if (!me || !era2) return null;
  const available = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven - era2.pointsSpent;
  const receiver = others.find(p => p.id === toPlayerId);
  const receiverRatio = receiver?.era2State?.transferModifiers.receiveRatio ?? 1;
  const received = amount > 0 && toPlayerId
    ? computeTransferDelta(amount, era2.transferModifiers.giveRatio, receiverRatio)
    : 0;

  function handlePropose() {
    if (!toPlayerId || amount <= 0 || amount > available) return;
    dispatch({
      type: 'PROPOSE_TRANSFER',
      fromPlayerId: localPlayerId,
      toPlayerId,
      pointsOffered: amount,
    });
    setToPlayerId(null);
    setAmount(2);
  }

  const myOutgoing = (gameState.activeTransfers ?? []).filter(
    tr => tr.fromPlayerId === localPlayerId,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-game-bg border border-border-medium rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-game-gold">{t.kingsTable.title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-game-surface border border-border-medium text-text-secondary hover:text-text-primary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between bg-game-surface/60 border border-border-subtle rounded-xl px-4 py-3">
            <span className="text-text-secondary text-sm">{t.kingsTable.yourBudget}</span>
            <span className="text-2xl font-bold text-game-gold tabular-nums">{available}</span>
          </div>

          {/* Target */}
          <div>
            <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
              {t.kingsTable.toPlayer}
            </div>
            <div className="space-y-1.5">
              {others.map(p => {
                const race = getRaceById(p.raceId);
                const isSelected = toPlayerId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setToPlayerId(p.id)}
                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border transition-all ${
                      isSelected
                        ? 'border-game-gold bg-game-gold/10'
                        : 'border-border-subtle bg-game-surface/40 hover:border-border-medium'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: race.color }} />
                    <span className="flex-1 text-left text-text-primary text-sm">{p.name}</span>
                    {p.isBot && <span className="text-text-muted text-xs">[{t.era1.bot}]</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
              {t.kingsTable.offer}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAmount(a => Math.max(1, a - 1))}
                className="w-10 h-10 rounded-lg bg-game-surface border border-border-subtle text-text-primary font-bold disabled:opacity-30"
                disabled={amount <= 1}
              >
                −
              </button>
              <input
                type="number"
                value={amount}
                min={1}
                max={available}
                onChange={e => setAmount(Math.max(1, Math.min(available, Number(e.target.value) || 1)))}
                className="flex-1 bg-game-surface border border-border-subtle rounded-lg px-3 py-2 text-center text-text-primary font-bold tabular-nums"
              />
              <button
                type="button"
                onClick={() => setAmount(a => Math.min(available, a + 1))}
                className="w-10 h-10 rounded-lg bg-game-surface border border-border-subtle text-text-primary font-bold disabled:opacity-30"
                disabled={amount >= available}
              >
                +
              </button>
            </div>
            <div className="text-text-muted text-xs mt-1.5 text-center">
              {t.kingsTable.offer} {amount} → {t.kingsTable.receive}{' '}
              <span className="text-emerald-400 font-bold">{received}</span>{' '}
              ({t.kingsTable.ratio}: {Math.round(era2.transferModifiers.giveRatio * receiverRatio * 100)}%)
            </div>
          </div>

          <button
            type="button"
            onClick={handlePropose}
            disabled={!toPlayerId || amount <= 0 || amount > available}
            className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base disabled:opacity-30"
          >
            {t.kingsTable.proposeTransfer}
          </button>

          {/* Existing outgoing */}
          {myOutgoing.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-text-secondary text-xs uppercase tracking-wider font-semibold">
                {t.kingsTable.pending}
              </h3>
              {myOutgoing.map(tr => {
                const to = gameState.players.find(p => p.id === tr.toPlayerId);
                return (
                  <div
                    key={tr.id}
                    className="bg-game-surface/60 border border-border-subtle rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="text-sm">
                      <div className="text-text-primary">
                        → {to?.name ?? tr.toPlayerId}
                      </div>
                      <div className="text-text-secondary text-xs">
                        {tr.pointsOffered} → {tr.pointsReceived}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                        tr.status === 'pending'
                          ? 'bg-game-gold/10 text-game-gold'
                          : tr.status === 'accepted'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {t.kingsTable[tr.status]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
