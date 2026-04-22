import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore.js';
import { useI18n } from '../i18n/index.js';
import {
  getRaceById, foodProduction, totalFoodConsumed, ERA3_BASE_INCOME,
} from '@war-of-gods/engine';
import type { TerrainType, UnitType } from '@war-of-gods/engine';

const TERRAIN_ICON: Record<TerrainType, string> = {
  plain: '🌾', mountain: '⛰️', forest: '🌲', swamp: '🌿', road: '🛤️',
};

const UNIT_ICON: Record<UnitType, string> = {
  infantry: '🛡️', ranged: '🏹', mounted: '🐎', siege: '🏰', flying: '🦅',
};

function unitFoodCostStatic(type: UnitType): number {
  if (type === 'mounted') return 2;
  if (type === 'siege' || type === 'flying') return 3;
  return 1;
}

// ── Phase wizard data ──────────────────────────────────────────────

const ERA1_PHASES = [
  'world_card_reveal', 'era_cards_deal', 'relics_deal',
  'draw_tiles', 'trade', 'placement', 'scoring', 'complete',
] as const;

const ERA2_PHASES = [
  'world_card_reveal', 'era_cards_deal', 'apply_penalties', 'apply_era1_effects',
  'kings_table', 'tech_allocation', 'review', 'convert_surplus', 'complete',
] as const;

const ERA1_ICONS: Record<string, string> = {
  world_card_reveal: '🌍', era_cards_deal: '📜', relics_deal: '💎',
  draw_tiles: '🎴', trade: '🤝', placement: '🏗️', scoring: '⭐', complete: '🏆',
};

const ERA2_ICONS: Record<string, string> = {
  world_card_reveal: '🌍', era_cards_deal: '📜', apply_penalties: '⚠️',
  apply_era1_effects: '✨', kings_table: '🤝', tech_allocation: '🏗️',
  review: '🔍', convert_surplus: '💰', complete: '🏆',
};

// ── Trade rate ─────────────────────────────────────────────────────
const GOLD_TO_FOOD_RATE = 2; // spend 2 gold → get 1 food
const FOOD_TO_GOLD_RATE = 2; // spend 2 food → get 1 gold

type Props = {
  onToggleSidebar?: () => void;
  showSidebarToggle?: boolean;
};

function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-text-muted text-xs font-mono tabular-nums">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export function GameHeader({ onToggleSidebar, showSidebarToggle }: Props) {
  const screen = useGameStore(s => s.screen);
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const dispatch = useGameStore(s => s.dispatch);
  const t = useI18n(s => s.t);

  const [showFoodPopover, setShowFoodPopover] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeAmount, setTradeAmount] = useState(2);
  const [tradeDir, setTradeDir] = useState<'gold_for_food' | 'food_for_gold'>('gold_for_food');
  const foodRef = useRef<HTMLButtonElement>(null);

  if (!gameState || !localPlayerId) return null;
  if (!['era1', 'scoring', 'era2', 'era2_scoring', 'era3'].includes(screen)) return null;

  const player = gameState.players.find(p => p.id === localPlayerId);
  if (!player) return null;

  const race = getRaceById(player.raceId);
  const isEra3 = screen === 'era3';
  const isEra1 = screen === 'era1' || screen === 'scoring';
  const isEra2 = screen === 'era2' || screen === 'era2_scoring';

  const eraLabel = isEra1 ? 'I' : isEra2 ? 'II' : 'III';

  const era3 = player.era3State;
  const gold = era3?.goldCoins ?? player.era2State?.goldCoins ?? null;
  const income = era3 ? ERA3_BASE_INCOME + (era3.techLevels?.economy ?? 0) : null;

  // Food stats (Era III only)
  const foodProd = era3 ? foodProduction(player) : null;
  const foodConsumed = era3 && gameState.era3Stacks ? totalFoodConsumed(gameState.era3Stacks, localPlayerId) : null;
  const foodNet = foodProd !== null && foodConsumed !== null ? foodProd - foodConsumed : null;
  const foodReserves = era3?.foodReserves ?? null;
  const turnsToStarve = (foodNet !== null && foodNet < 0 && foodReserves !== null && foodReserves > 0)
    ? Math.floor(foodReserves / Math.abs(foodNet))
    : null;

  const activePlayerId = gameState.era3CurrentPlayerId ?? null;
  const activePlayer = activePlayerId ? gameState.players.find(p => p.id === activePlayerId) : null;
  const isMyTurn = activePlayerId === localPlayerId;

  const turnNumber = gameState.era3TurnNumber ?? null;
  const maxTurns = gameState.era3MaxTurns ?? null;
  const remaining = maxTurns && turnNumber ? Math.max(0, maxTurns - turnNumber) : null;
  const isEternal = isEra3 && !maxTurns;
  const turnUrgent = remaining !== null && remaining <= 3;

  const inGameLoop = isEra3 && (gameState.era3Phase === 'game_loop' || gameState.era3Phase === 'final_heroic_turn');
  const inHeroic = gameState.era3Phase === 'final_heroic_turn';

  // ── Phase wizard data ──
  const era1Phase = gameState.era1Phase as string;
  const era2Phase = gameState.era2Phase as string | undefined;
  const era1Idx = ERA1_PHASES.indexOf(era1Phase as typeof ERA1_PHASES[number]);
  const era2Idx = ERA2_PHASES.indexOf((era2Phase ?? '') as typeof ERA2_PHASES[number]);

  const showWizard = isEra1 || isEra2;
  const wizardPhases = isEra1 ? ERA1_PHASES : ERA2_PHASES;
  const wizardIcons = isEra1 ? ERA1_ICONS : ERA2_ICONS;
  const wizardIdx = isEra1 ? era1Idx : era2Idx;
  const wizardLabels = isEra1
    ? (k: string) => (t.phases as Record<string, string>)[k] ?? k
    : (k: string) => (t.era2.phases as Record<string, string>)[k] ?? k;

  const myTurnHighlight = inGameLoop && isMyTurn;

  // Food detail: collect all player units with food cost
  const playerUnitSummary: { type: UnitType; count: number; cost: number }[] = (() => {
    if (!gameState.era3Stacks || !isEra3) return [];
    const counts: Partial<Record<UnitType, number>> = {};
    for (const stack of Object.values(gameState.era3Stacks)) {
      if (stack.ownerId !== localPlayerId) continue;
      for (const unit of stack.units) {
        counts[unit.type] = (counts[unit.type] ?? 0) + 1;
      }
    }
    return Object.entries(counts).map(([type, count]) => ({
      type: type as UnitType,
      count: count ?? 0,
      cost: unitFoodCostStatic(type as UnitType),
    }));
  })();

  // Trade computation
  const tradeGoldCost = tradeDir === 'gold_for_food' ? tradeAmount : 0;
  const tradeFoodCost = tradeDir === 'food_for_gold' ? tradeAmount : 0;
  const tradeGoldGain = tradeDir === 'food_for_gold' ? Math.floor(tradeAmount / FOOD_TO_GOLD_RATE) : 0;
  const tradeFoodGain = tradeDir === 'gold_for_food' ? Math.floor(tradeAmount / GOLD_TO_FOOD_RATE) : 0;
  const canTrade = isMyTurn && !player.era3State?.eliminated && (
    tradeDir === 'gold_for_food'
      ? (gold ?? 0) >= tradeGoldCost && tradeFoodGain > 0
      : (foodReserves ?? 0) >= tradeFoodCost && tradeGoldGain > 0
  );

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[70] flex items-center gap-0 bg-game-bg/97 backdrop-blur-md border-b transition-colors ${myTurnHighlight ? 'border-game-gold/50' : 'border-border-subtle'}`}
      style={{ height: '48px' }}
    >
      {/* Sidebar toggle */}
      {showSidebarToggle && onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="w-12 h-full flex items-center justify-center text-text-muted hover:text-text-primary transition-colors shrink-0 border-r border-border-subtle"
          aria-label="Toggle sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Race + Era identity */}
      <div className="flex items-center gap-2 px-3 h-full border-r border-border-subtle shrink-0">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: race.color }} />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-text-primary text-sm font-bold truncate max-w-[80px] sm:max-w-[120px]">{player.name}</span>
          <span className="text-[9px] text-text-muted uppercase tracking-wider hidden sm:block">{t.races[player.raceId as keyof typeof t.races]}</span>
        </div>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-game-gold/15 border border-game-gold/30 text-game-gold shrink-0 leading-none">
          {eraLabel}
        </span>
      </div>

      {/* Era I terrain indicators */}
      {isEra1 && (
        <div className="flex items-center gap-1 px-2 h-full border-r border-border-subtle shrink-0">
          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] font-bold bg-emerald-900/40 border border-emerald-500/30 text-emerald-300" title={`Favorable: ${race.favorableTerrain}`}>
            <span>{TERRAIN_ICON[race.favorableTerrain as TerrainType]}</span><span className="hidden lg:inline ml-0.5 text-[10px]">{race.favorableTerrain}</span><span>✓</span>
          </span>
          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] font-bold bg-red-900/40 border border-red-500/30 text-red-300" title={`Unfavorable: ${race.unfavorableTerrain}`}>
            <span>{TERRAIN_ICON[race.unfavorableTerrain as TerrainType]}</span><span className="hidden lg:inline ml-0.5 text-[10px]">{race.unfavorableTerrain}</span><span>✗</span>
          </span>
        </div>
      )}

      {/* Gold block (Era II / III) */}
      {gold !== null && (
        <div className="flex items-center gap-1.5 px-3 h-full border-r border-border-subtle shrink-0">
          <span className="text-base leading-none">💰</span>
          <div className="flex flex-col leading-tight">
            <span className="text-game-gold font-black text-base tabular-nums leading-none">{gold}</span>
            {income !== null && !player.era3State?.eliminated && (
              <span className="text-emerald-400 text-[9px] font-semibold">+{income}/t</span>
            )}
          </div>
        </div>
      )}

      {/* Food block (Era III only) — clickable */}
      {isEra3 && foodProd !== null && foodConsumed !== null && (
        <div className="relative shrink-0">
          <button
            ref={foodRef}
            type="button"
            onClick={() => { setShowFoodPopover(v => !v); setShowTradeModal(false); }}
            className={`flex items-center gap-1.5 px-2 h-12 border-r border-border-subtle transition-colors hover:bg-white/5 ${foodNet !== null && foodNet < 0 ? 'bg-red-900/10' : ''}`}
            title="Detalle de comida"
          >
            <span className="text-base leading-none">🌾</span>
            <div className="flex flex-col leading-tight">
              <div className="flex items-baseline gap-0.5">
                <span className={`font-black text-sm tabular-nums leading-none ${
                  foodReserves !== null && foodReserves < 0 ? 'text-red-400' :
                  foodReserves !== null && foodReserves <= 3 ? 'text-orange-400' : 'text-emerald-300'
                }`}>{foodReserves ?? 0}</span>
                <span className={`text-[9px] font-semibold ${foodNet !== null && foodNet >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {foodNet !== null && foodNet >= 0 ? `+${foodNet}` : foodNet}
                </span>
              </div>
              {turnsToStarve !== null
                ? <span className="text-red-400 text-[9px] font-bold animate-pulse">⚠{turnsToStarve}t</span>
                : <span className="text-text-muted text-[9px]">{foodConsumed}/{foodProd}</span>
              }
            </div>
          </button>

          {/* Food detail popover */}
          {showFoodPopover && (
            <div className="absolute top-full left-0 mt-1 z-[80] bg-game-surface border border-border-subtle rounded-xl shadow-2xl p-3 min-w-[200px]"
              style={{ backdropFilter: 'blur(12px)' }}>
              <div className="eyebrow mb-2">🌾 Comida</div>
              <div className="space-y-1 text-xs mb-3">
                <div className="flex justify-between text-text-secondary">
                  <span>Producción (Eco {era3?.techLevels?.economy ?? 0})</span>
                  <span className="text-emerald-400 font-bold">+{foodProd}</span>
                </div>
                <div className="border-t border-border-subtle pt-1 space-y-0.5">
                  {playerUnitSummary.length === 0
                    ? <div className="text-text-muted">Sin tropas</div>
                    : playerUnitSummary.map(({ type, count, cost }) => (
                      <div key={type} className="flex justify-between text-text-secondary">
                        <span>{UNIT_ICON[type]} {(t.units as Record<string, string>)[type] ?? type} ×{count}</span>
                        <span className="text-red-400">-{cost * count}</span>
                      </div>
                    ))
                  }
                </div>
                <div className="border-t border-border-subtle pt-1 flex justify-between font-bold">
                  <span className="text-text-primary">Balance</span>
                  <span className={foodNet !== null && foodNet >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {foodNet !== null && foodNet >= 0 ? `+${foodNet}` : foodNet}/t
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Reservas</span>
                  <span className={`font-bold ${(foodReserves ?? 0) < 0 ? 'text-red-400' : (foodReserves ?? 0) <= 3 ? 'text-orange-400' : 'text-emerald-300'}`}>
                    {foodReserves ?? 0}
                  </span>
                </div>
              </div>
              {inGameLoop && isMyTurn && (
                <button
                  type="button"
                  onClick={() => { setShowTradeModal(true); setShowFoodPopover(false); }}
                  className="w-full btn btn-sm btn-ghost text-xs border border-game-gold/30 text-game-gold hover:bg-game-gold/10"
                >
                  ⇄ Cambiar oro ↔ comida
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trade modal */}
      {showTradeModal && isEra3 && gold !== null && foodReserves !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => e.target === e.currentTarget && setShowTradeModal(false)}>
          <div className="bg-game-surface border border-border-subtle rounded-2xl p-5 shadow-2xl max-w-xs w-full">
            <div className="text-center mb-4">
              <div className="text-2xl mb-1">⇄</div>
              <h3 className="text-game-gold font-black text-lg">Mercado</h3>
              <p className="text-text-muted text-xs mt-0.5">2 oro = 1 comida · 2 comida = 1 oro</p>
            </div>

            {/* Direction toggle */}
            <div className="flex rounded-xl overflow-hidden border border-border-subtle mb-4">
              <button
                type="button"
                onClick={() => setTradeDir('gold_for_food')}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${tradeDir === 'gold_for_food' ? 'bg-game-gold/20 text-game-gold' : 'text-text-muted hover:text-text-primary'}`}
              >
                💰→🌾 Oro por comida
              </button>
              <button
                type="button"
                onClick={() => setTradeDir('food_for_gold')}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${tradeDir === 'food_for_gold' ? 'bg-emerald-900/30 text-emerald-400' : 'text-text-muted hover:text-text-primary'}`}
              >
                🌾→💰 Comida por oro
              </button>
            </div>

            {/* Amount stepper */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <button type="button" onClick={() => setTradeAmount(a => Math.max(2, a - 2))}
                className="w-8 h-8 rounded-full border border-border-subtle text-lg font-bold text-text-primary hover:bg-white/10">−</button>
              <div className="text-center">
                <div className="text-2xl font-black tabular-nums text-text-primary">{tradeAmount}</div>
                <div className="text-[10px] text-text-muted">{tradeDir === 'gold_for_food' ? '💰 oro' : '🌾 comida'}</div>
              </div>
              <button type="button" onClick={() => setTradeAmount(a => a + 2)}
                className="w-8 h-8 rounded-full border border-border-subtle text-lg font-bold text-text-primary hover:bg-white/10">+</button>
            </div>

            {/* Preview */}
            <div className="bg-game-bg/60 rounded-xl p-3 mb-4 text-center text-sm">
              <span className="text-text-secondary">Pagas: </span>
              <span className="font-bold text-text-primary">
                {tradeDir === 'gold_for_food' ? `${tradeGoldCost} 💰` : `${tradeFoodCost} 🌾`}
              </span>
              <span className="text-text-muted mx-2">→</span>
              <span className="text-text-secondary">Recibes: </span>
              <span className="font-bold text-emerald-400">
                {tradeDir === 'gold_for_food' ? `${tradeFoodGain} 🌾` : `${tradeGoldGain} 💰`}
              </span>
            </div>

            {/* Balances */}
            <div className="flex justify-between text-xs text-text-muted mb-4">
              <span>💰 {gold} oro disponible</span>
              <span>🌾 {foodReserves} comida disponible</span>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowTradeModal(false)}
                className="flex-1 btn btn-sm btn-ghost">Cancelar</button>
              <button
                type="button"
                disabled={!canTrade}
                onClick={() => {
                  if (!localPlayerId) return;
                  if (tradeDir === 'gold_for_food') {
                    dispatch({ type: 'TRADE_GOLD_FOR_FOOD', playerId: localPlayerId, amount: tradeGoldCost });
                  } else {
                    dispatch({ type: 'TRADE_FOOD_FOR_GOLD', playerId: localPlayerId, amount: tradeFoodCost });
                  }
                  setShowTradeModal(false);
                }}
                className="flex-1 btn btn-sm btn-primary disabled:opacity-30"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Era III turn counter */}
      {inGameLoop && turnNumber !== null && (
        <div className={`flex items-center gap-2 px-2 h-full border-r border-border-subtle shrink-0 ${turnUrgent ? 'bg-game-accent/10' : ''}`}>
          <div className="flex flex-col leading-tight text-center">
            <span className="text-[8px] uppercase tracking-wider text-text-muted">T</span>
            <span className={`text-lg font-black tabular-nums leading-none ${turnUrgent ? 'text-game-accent animate-pulse' : 'text-text-primary'}`}>{turnNumber}</span>
          </div>
          {!isEternal && maxTurns !== null && (
            <div className="flex flex-col leading-tight text-center">
              <span className="text-[8px] uppercase tracking-wider text-text-muted">Max</span>
              <span className="text-sm font-bold tabular-nums text-text-muted leading-none">{maxTurns}</span>
            </div>
          )}
          {isEternal && <span className="text-xl font-black text-game-gold leading-none">∞</span>}
          {inHeroic && <span className="text-[9px] font-bold text-game-ember uppercase tracking-wider">⚡</span>}
        </div>
      )}

      {/* ── Phase Wizard (center, flex-1) ── */}
      <div className="flex-1 flex items-center justify-center min-w-0 overflow-hidden px-2">
        {showWizard && (
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {(wizardPhases as readonly string[]).map((phase, i) => {
              const isActive = i === wizardIdx;
              const isDone = i < wizardIdx;
              const label = wizardLabels(phase);
              return (
                <div key={phase} className="flex items-center shrink-0">
                  <div
                    title={label}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-game-gold/20 border border-game-gold/40 shadow-sm'
                        : isDone
                        ? 'opacity-50'
                        : 'opacity-20'
                    }`}
                  >
                    <span className={`text-sm leading-none ${isActive ? '' : isDone ? 'grayscale-0' : 'grayscale'}`}>
                      {wizardIcons[phase] ?? '•'}
                    </span>
                    <span className={`text-[10px] font-semibold hidden lg:inline whitespace-nowrap ${
                      isActive ? 'text-game-gold' : isDone ? 'text-text-muted' : 'text-text-faint'
                    }`}>
                      {label}
                    </span>
                  </div>
                  {i < wizardPhases.length - 1 && (
                    <div className={`w-3 h-px mx-0.5 shrink-0 ${isDone ? 'bg-game-gold/40' : 'bg-border-subtle'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Era III: turn ownership indicator */}
        {inGameLoop && activePlayer && (
          <span className={`px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap ${
            isMyTurn
              ? 'bg-game-gold/20 text-game-gold border-game-gold/40'
              : 'bg-game-surface/40 text-text-muted border-border-subtle'
          }`}>
            {isMyTurn ? `⚡ ${t.era3.yourTurn.replace('!', '')}` : `${t.era3.turnOf} ${activePlayer.name}`}
          </span>
        )}
      </div>

      {/* Clock — leave 32px gap on the right for the fixed settings gear button */}
      <div className="pr-10 pl-3 hidden md:flex items-center shrink-0 border-l border-border-subtle h-full">
        <Clock />
      </div>

      {/* Dismiss popover on outside click */}
      {showFoodPopover && (
        <div className="fixed inset-0 z-[75]" onClick={() => setShowFoodPopover(false)} />
      )}
    </div>
  );
}
