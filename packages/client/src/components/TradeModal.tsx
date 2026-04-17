import { useState, useEffect, useRef } from 'react';
import type { Player, TerrainType } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

const TERRAINS: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

type Props = {
  currentPlayer: Player;
  otherPlayers: Player[];
  onPropose: (toPlayerId: string, offered: TerrainType, requested: TerrainType) => void;
  onClose: () => void;
};

export function TradeModal({ currentPlayer, otherPlayers, onPropose, onClose }: Props) {
  const t = useI18n(s => s.t);
  const [targetId, setTargetId] = useState(otherPlayers[0]?.id ?? '');
  const [offered, setOffered] = useState<TerrainType>('plain');
  const [requested, setRequested] = useState<TerrainType>('plain');

  const canPropose = currentPlayer.tiles[offered] > 0 && targetId !== '';
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div id="trade-modal" className="fixed inset-0 bg-overlay-bg flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        ref={modalRef}
        className="bg-game-surface rounded-xl p-6 w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-label={t.actions.proposeTrade}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-text-primary mb-4">{t.actions.proposeTrade}</h2>

        <label className="block mb-3">
          <span className="text-text-secondary text-sm">{t.trade.to}</span>
          <select
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
            className="w-full mt-1 bg-game-bg text-text-primary rounded px-3 py-2"
            aria-label={t.trade.to}
          >
            {otherPlayers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="block mb-3">
          <span className="text-text-secondary text-sm">{t.trade.offer}</span>
          <select
            value={offered}
            onChange={e => setOffered(e.target.value as TerrainType)}
            className="w-full mt-1 bg-game-bg text-text-primary rounded px-3 py-2"
            aria-label={t.trade.offer}
          >
            {TERRAINS.filter(terrain => currentPlayer.tiles[terrain] > 0).map(terrain => (
              <option key={terrain} value={terrain}>
                {t.terrain[terrain]} ({currentPlayer.tiles[terrain]})
              </option>
            ))}
          </select>
        </label>

        <label className="block mb-4">
          <span className="text-text-secondary text-sm">{t.trade.request}</span>
          <select
            value={requested}
            onChange={e => setRequested(e.target.value as TerrainType)}
            className="w-full mt-1 bg-game-bg text-text-primary rounded px-3 py-2"
            aria-label={t.trade.request}
          >
            {TERRAINS.map(terrain => (
              <option key={terrain} value={terrain}>{t.terrain[terrain]}</option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPropose(targetId, offered, requested)}
            disabled={!canPropose}
            className="flex-1 bg-game-accent text-white py-2 rounded font-bold disabled:opacity-50"
            aria-label={t.actions.proposeTrade}
          >
            {t.actions.proposeTrade}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-game-surface-light text-text-primary py-2 rounded"
            aria-label={t.actions.back}
          >
            {t.actions.back}
          </button>
        </div>
      </div>
    </div>
  );
}
