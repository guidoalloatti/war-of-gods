import { useState } from 'react';
import type { TerrainType, Player, TechType, EraCard } from '@war-of-gods/engine';
import { TECH_TYPES } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

const TECH_ICONS: Record<TechType, string> = {
  war: '⚔️',
  science: '🔬',
  resources: '🌾',
  economy: '💰',
};

const TERRAIN_ICONS: Record<string, string> = {
  plain: '🌾',
  mountain: '⛰️',
  forest: '🌲',
  swamp: '🌿',
  road: '🛤️',
};

type Props = {
  player: Player;
  onResolve: (resolution: Record<string, unknown>) => void;
};

export function EffectModal({ player, onResolve }: Props) {
  const pending = player.pendingEffect;
  if (!pending) return null;

  switch (pending.type) {
    case 'discard_and_redraw':
      return (
        <DiscardAndRedrawView
          player={player}
          maxDiscard={pending.params.maxDiscard as number}
          onResolve={onResolve}
        />
      );
    case 'manual_pick':
      return (
        <ManualPickView
          revealedTiles={pending.params.revealedTiles as TerrainType[]}
          pickCount={pending.params.pickCount as number}
          onResolve={onResolve}
        />
      );
    case 'view_opponents_tiles':
      return (
        <ViewOpponentsView
          opponents={pending.params.opponents as Array<{ id: string; name: string; raceId: string; tiles: Record<TerrainType, number> }>}
          onResolve={onResolve}
        />
      );
    case 'player_choice_free_tech':
      return (
        <ChooseFreeTechView
          levels={(pending.params.levels as number) ?? 1}
          onResolve={onResolve}
        />
      );
    case 'player_choice_tech_discount':
      return (
        <ChooseTechDiscountView
          delta={(pending.params.delta as number) ?? 0}
          onResolve={onResolve}
        />
      );
    case 'trade_tech_with_player':
      return <TradeTechView onResolve={onResolve} />;
    case 'view_opponents_cards':
      return (
        <ViewOpponentCardsView
          opponents={pending.params.opponents as Array<{ id: string; name: string; raceId: string; card: EraCard | null }>}
          onResolve={onResolve}
        />
      );
    default:
      return null;
  }
}

function DiscardAndRedrawView({
  player,
  maxDiscard,
  onResolve,
}: {
  player: Player;
  maxDiscard: number;
  onResolve: (resolution: Record<string, unknown>) => void;
}) {
  const t = useI18n(s => s.t);
  const [selected, setSelected] = useState<TerrainType[]>([]);

  const terrains = ['plain', 'mountain', 'forest', 'swamp', 'road'] as const;

  function toggleTile(terrain: TerrainType) {
    const currentCount = selected.filter(t => t === terrain).length;
    if (currentCount < player.tiles[terrain]) {
      if (selected.length < maxDiscard) {
        setSelected([...selected, terrain]);
      }
    }
  }

  function removeTile(terrain: TerrainType) {
    const idx = selected.lastIndexOf(terrain);
    if (idx !== -1) {
      setSelected(selected.filter((_, i) => i !== idx));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-game-surface rounded-2xl border border-game-gold/20 p-6 max-w-md w-full mx-4 shadow-gold-lg">
        <h3 className="text-game-gold font-bold text-lg mb-1">{t.effects.discardAndRedraw}</h3>
        <p className="text-text-muted text-sm mb-4">
          {t.effects.discardAndRedrawDesc.replace('{count}', String(maxDiscard))}
        </p>

        <div className="space-y-2 mb-4">
          {terrains.map(terrain => {
            const count = player.tiles[terrain];
            const selectedCount = selected.filter(t => t === terrain).length;
            if (count <= 0) return null;
            return (
              <div key={terrain} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{TERRAIN_ICONS[terrain]}</span>
                  <span className="text-text-primary text-sm font-medium">{t.terrain[terrain]}</span>
                  <span className="text-text-muted text-xs">({count})</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => removeTile(terrain)}
                    disabled={selectedCount === 0}
                    className="w-7 h-7 rounded-lg bg-game-bg border border-border-subtle text-text-secondary hover:text-red-400 hover:border-red-400/30 disabled:opacity-30 transition-colors flex items-center justify-center text-sm font-bold"
                  >
                    -
                  </button>
                  <span className="text-game-gold font-bold text-sm w-4 text-center tabular-nums">{selectedCount}</span>
                  <button
                    type="button"
                    onClick={() => toggleTile(terrain)}
                    disabled={selectedCount >= count || selected.length >= maxDiscard}
                    className="w-7 h-7 rounded-lg bg-game-bg border border-border-subtle text-text-secondary hover:text-emerald-400 hover:border-emerald-400/30 disabled:opacity-30 transition-colors flex items-center justify-center text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-text-muted text-xs mb-3">
          {t.effects.selectedCount.replace('{selected}', String(selected.length)).replace('{max}', String(maxDiscard))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onResolve({ selectedTiles: [] })}
            className="flex-1 py-2 px-4 rounded-xl border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-medium transition-colors text-sm"
          >
            {t.effects.skip}
          </button>
          <button
            type="button"
            onClick={() => onResolve({ selectedTiles: selected })}
            disabled={selected.length === 0}
            className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-game-accent to-game-ember text-white font-bold disabled:opacity-40 transition-all text-sm"
          >
            {t.effects.confirm} ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualPickView({
  revealedTiles,
  pickCount,
  onResolve,
}: {
  revealedTiles: TerrainType[];
  pickCount: number;
  onResolve: (resolution: Record<string, unknown>) => void;
}) {
  const t = useI18n(s => s.t);
  const [selected, setSelected] = useState<number[]>([]);

  function toggleTile(index: number) {
    if (selected.includes(index)) {
      setSelected(selected.filter(i => i !== index));
    } else if (selected.length < pickCount) {
      setSelected([...selected, index]);
    }
  }

  function handleConfirm() {
    const pickedTiles = selected.map(i => revealedTiles[i]);
    onResolve({ pickedTiles });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-game-surface rounded-2xl border border-game-gold/20 p-6 max-w-lg w-full mx-4 shadow-gold-lg">
        <h3 className="text-game-gold font-bold text-lg mb-1">{t.effects.manualPick}</h3>
        <p className="text-text-muted text-sm mb-4">
          {t.effects.manualPickDesc.replace('{count}', String(pickCount))}
        </p>

        <div className="grid grid-cols-5 gap-2 mb-4">
          {revealedTiles.map((tile, i) => {
            const isSelected = selected.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleTile(i)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-game-gold bg-game-gold/10 shadow-gold-sm'
                    : 'border-border-subtle hover:border-border-medium bg-game-bg'
                }`}
              >
                <span className="text-2xl">{TERRAIN_ICONS[tile]}</span>
                <span className="text-[10px] text-text-muted mt-1">{t.terrain[tile]}</span>
              </button>
            );
          })}
        </div>

        <div className="text-text-muted text-xs mb-3">
          {t.effects.selectedCount.replace('{selected}', String(selected.length)).replace('{max}', String(pickCount))}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={selected.length !== pickCount}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-game-accent to-game-ember text-white font-bold disabled:opacity-40 transition-all text-sm"
        >
          {t.effects.confirm} ({selected.length}/{pickCount})
        </button>
      </div>
    </div>
  );
}

function ViewOpponentsView({
  opponents,
  onResolve,
}: {
  opponents: Array<{ id: string; name: string; raceId: string; tiles: Record<TerrainType, number> }>;
  onResolve: (resolution: Record<string, unknown>) => void;
}) {
  const t = useI18n(s => s.t);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-game-surface rounded-2xl border border-game-gold/20 p-6 max-w-lg w-full mx-4 shadow-gold-lg max-h-[80vh] overflow-y-auto">
        <h3 className="text-game-gold font-bold text-lg mb-1">{t.effects.viewOpponents}</h3>
        <p className="text-text-muted text-sm mb-4">{t.effects.viewOpponentsDesc}</p>

        <div className="space-y-3 mb-4">
          {opponents.map(opp => (
            <div key={opp.id} className="rounded-xl border border-border-subtle p-3 bg-game-bg/50">
              <div className="text-text-primary font-bold text-sm mb-2">{opp.name}</div>
              <div className="flex flex-wrap gap-2">
                {(['plain', 'mountain', 'forest', 'swamp', 'road'] as const).map(terrain => (
                  <div key={terrain} className="flex items-center gap-1 bg-game-surface rounded-lg px-2 py-1">
                    <span className="text-sm">{TERRAIN_ICONS[terrain]}</span>
                    <span className="text-text-primary text-xs font-bold tabular-nums">{opp.tiles[terrain]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onResolve({})}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-game-accent to-game-ember text-white font-bold transition-all text-sm"
        >
          {t.effects.dismiss}
        </button>
      </div>
    </div>
  );
}

function ChooseFreeTechView({
  levels,
  onResolve,
}: {
  levels: number;
  onResolve: (resolution: Record<string, unknown>) => void;
}) {
  const t = useI18n(s => s.t);
  const [selected, setSelected] = useState<TechType | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-game-surface rounded-2xl border border-game-gold/20 p-6 max-w-md w-full mx-4 shadow-gold-lg">
        <h3 className="text-game-gold font-bold text-lg mb-1">{t.effects.chooseFreeTech}</h3>
        <p className="text-text-muted text-sm mb-4">
          {t.effects.chooseFreeTechDesc.replace('{levels}', String(levels))}
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {TECH_TYPES.map(tech => (
            <button
              key={tech}
              type="button"
              onClick={() => setSelected(tech)}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                selected === tech
                  ? 'border-game-gold bg-game-gold/10 shadow-gold-sm'
                  : 'border-border-subtle hover:border-border-medium bg-game-bg'
              }`}
            >
              <span className="text-xl">{TECH_ICONS[tech]}</span>
              <span className="text-text-primary font-medium text-sm">{t.tech[tech]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onResolve({ tech: selected })}
          disabled={!selected}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-game-accent to-game-ember text-white font-bold disabled:opacity-40 transition-all text-sm"
        >
          {t.effects.confirm}
        </button>
      </div>
    </div>
  );
}

function ChooseTechDiscountView({
  delta,
  onResolve,
}: {
  delta: number;
  onResolve: (resolution: Record<string, unknown>) => void;
}) {
  const t = useI18n(s => s.t);
  const [selected, setSelected] = useState<TechType | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-game-surface rounded-2xl border border-game-gold/20 p-6 max-w-md w-full mx-4 shadow-gold-lg">
        <h3 className="text-game-gold font-bold text-lg mb-1">{t.effects.chooseTechDiscount}</h3>
        <p className="text-text-muted text-sm mb-4">
          {t.effects.chooseTechDiscountDesc.replace('{delta}', String(delta))}
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {TECH_TYPES.map(tech => (
            <button
              key={tech}
              type="button"
              onClick={() => setSelected(tech)}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                selected === tech
                  ? 'border-game-gold bg-game-gold/10 shadow-gold-sm'
                  : 'border-border-subtle hover:border-border-medium bg-game-bg'
              }`}
            >
              <span className="text-xl">{TECH_ICONS[tech]}</span>
              <span className="text-text-primary font-medium text-sm">{t.tech[tech]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onResolve({ tech: selected })}
          disabled={!selected}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-game-accent to-game-ember text-white font-bold disabled:opacity-40 transition-all text-sm"
        >
          {t.effects.confirm}
        </button>
      </div>
    </div>
  );
}

function TradeTechView({
  onResolve,
}: {
  onResolve: (resolution: Record<string, unknown>) => void;
}) {
  const t = useI18n(s => s.t);

  // Minimal UX: engine currently has no target-player picker surfaced in params.
  // Offer a skip so the game isn't blocked; full implementation comes when
  // the dispatcher exposes target candidates.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-game-surface rounded-2xl border border-game-gold/20 p-6 max-w-md w-full mx-4 shadow-gold-lg">
        <h3 className="text-game-gold font-bold text-lg mb-1">{t.effects.tradeTechTitle}</h3>
        <p className="text-text-muted text-sm mb-4">{t.effects.tradeTechDesc}</p>
        <button
          type="button"
          onClick={() => onResolve({})}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-game-accent to-game-ember text-white font-bold transition-all text-sm"
        >
          {t.effects.dismiss}
        </button>
      </div>
    </div>
  );
}

function ViewOpponentCardsView({
  opponents,
  onResolve,
}: {
  opponents: Array<{ id: string; name: string; raceId: string; card: EraCard | null }>;
  onResolve: (resolution: Record<string, unknown>) => void;
}) {
  const t = useI18n(s => s.t);
  const locale = useI18n(s => s.locale);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-game-surface rounded-2xl border border-game-gold/20 p-6 max-w-lg w-full mx-4 shadow-gold-lg max-h-[80vh] overflow-y-auto">
        <h3 className="text-game-gold font-bold text-lg mb-1">{t.effects.viewOpponentCards}</h3>
        <p className="text-text-muted text-sm mb-4">{t.effects.viewOpponentCardsDesc}</p>
        <div className="space-y-3 mb-4">
          {opponents.map(opp => {
            const name = opp.card ? (locale === 'en' ? opp.card.name_en || opp.card.name : opp.card.name) : '—';
            const text = opp.card
              ? locale === 'en'
                ? opp.card.mechanicalText_en || opp.card.mechanicalText
                : opp.card.mechanicalText
              : '';
            return (
              <div key={opp.id} className="rounded-xl border border-border-subtle p-3 bg-game-bg/50">
                <div className="text-text-primary font-bold text-sm mb-1">{opp.name}</div>
                <div className="text-game-gold text-xs font-semibold mb-1">{name}</div>
                {text && <div className="text-text-secondary text-xs">{text}</div>}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onResolve({})}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-game-accent to-game-ember text-white font-bold transition-all text-sm"
        >
          {t.effects.dismiss}
        </button>
      </div>
    </div>
  );
}
