import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  TECH_TYPES,
  TECH_COSTS,
  TECH_BENEFITS,
  RACIAL_BONUSES,
  calculateTechCost,
  computeTransferDelta,
  getRaceById,
} from '@war-of-gods/engine';
import type {
  Era2Phase,
  TechType,
  Player,
  PlayerEra2State,
  GameState,
  WorldCard,
  EraCard,
} from '@war-of-gods/engine';
import type { Translations } from '../i18n/es.js';
import { useGameStore } from '../stores/gameStore.js';
import { useI18n } from '../i18n/index.js';
import { GameCard } from '../components/GameCard.js';
import { EffectModal } from '../components/EffectModal.js';
import { TechSlider } from '../components/era2/TechSlider.js';
import { PointsCounter } from '../components/era2/PointsCounter.js';
import { KingsTableModal } from '../components/era2/KingsTableModal.js';
import { DoomClockDisplay } from '../components/era2/DoomClockDisplay.js';
import { TechSummaryReview } from '../components/era2/TechSummaryReview.js';
import { Era2CardReveal } from '../components/era2/Era2CardReveal.js';

const ERA2_PHASES: readonly Era2Phase[] = [
  'world_card_reveal',
  'era_cards_deal',
  'apply_penalties',
  'apply_era1_effects',
  'kings_table',
  'tech_allocation',
  'review',
  'convert_surplus',
  'complete',
];

const PHASE_ICONS: Record<Era2Phase, string> = {
  world_card_reveal: '🌍',
  era_cards_deal: '📜',
  apply_penalties: '⚠️',
  apply_era1_effects: '✨',
  kings_table: '🤝',
  tech_allocation: '🏗️',
  review: '🔍',
  convert_surplus: '💰',
  complete: '🏆',
};

const AUTO_ADVANCE_PHASES = new Set<Era2Phase>(['apply_penalties', 'apply_era1_effects']);

export function Era2Screen() {
  const { gameState, localPlayerId, dispatch, runBots, error, gameMode, setScreen } = useGameStore(
    useShallow(s => ({
      gameState: s.gameState,
      localPlayerId: s.localPlayerId,
      dispatch: s.dispatch,
      runBots: s.runBots,
      error: s.error,
      gameMode: s.gameMode,
      setScreen: s.setScreen,
    })),
  );
  const t = useI18n(s => s.t);

  const [showSidebar, setShowSidebar] = useState(false);
  const [showKingsTable, setShowKingsTable] = useState(false);
  const autoAdvancedRef = useRef<Era2Phase | null>(null);

  const player = useMemo(
    () => gameState?.players.find(p => p.id === localPlayerId),
    [gameState?.players, localPlayerId],
  );
  const phase = gameState?.era2Phase;

  // Auto-advance side-effect-only phases. Hold the advance while any player
  // still has an unresolved pendingEffect (e.g. the free-tech chooser modal),
  // otherwise Era II would skip past tech_allocation while the modal is open.
  const anyPendingEffect = useMemo(
    () => gameState?.players.some(p => p.pendingEffect) ?? false,
    [gameState?.players],
  );
  useEffect(() => {
    if (!phase || !gameState) return;
    if (!AUTO_ADVANCE_PHASES.has(phase)) return;
    if (anyPendingEffect) return;
    if (autoAdvancedRef.current === phase) return;
    autoAdvancedRef.current = phase;
    const timer = setTimeout(() => {
      dispatch({ type: 'ADVANCE_ERA2_PHASE' });
    }, 400);
    return () => clearTimeout(timer);
  }, [phase, gameState, dispatch, anyPendingEffect]);

  // Run bots on phase entry so they take their actions
  useEffect(() => {
    if (!phase) return;
    runBots();
  }, [phase, runBots]);

  const handleResolveEffect = useCallback(
    (resolution: Record<string, unknown>) => {
      if (!localPlayerId) return;
      dispatch({ type: 'RESOLVE_EFFECT', playerId: localPlayerId, resolution });
    },
    [dispatch, localPlayerId],
  );

  if (!gameState || !localPlayerId || !player) return null;

  const race = getRaceById(player.raceId);
  const era2 = player.era2State;

  return (
    <div id="era2-screen" className="min-h-screen bg-game-bg bg-radial-theme relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-game-gold/10 to-transparent" />

      {player.pendingEffect && (
        <EffectModal player={player} onResolve={handleResolveEffect} />
      )}

      <Era2Timeline currentPhase={phase!} t={t} />

      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setShowSidebar(s => !s)}
        className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-game-surface border border-border-medium text-text-primary shadow-lg backdrop-blur-sm"
        aria-label="Toggle info panel"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showSidebar && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div className="flex flex-row min-h-screen relative z-10 pt-14">
        {/* LEFT SIDEBAR */}
        <div
          className={`
            fixed lg:static inset-y-0 left-0 z-40 lg:z-auto
            lg:w-80 xl:w-[22rem] w-72 shrink-0 border-r border-border-subtle p-4 pl-14 space-y-4 overflow-y-auto
            h-screen lg:max-h-[calc(100vh-3.5rem)] lg:h-auto
            bg-game-bg lg:bg-transparent
            transition-transform duration-300 ease-in-out
            ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          {/* Player header */}
          <div className="flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: race.color }} />
              <h2 className="text-base font-bold text-text-primary">{player.name}</h2>
              <span className="text-text-muted text-xs">({t.races[player.raceId as keyof typeof t.races]})</span>
            </div>
          </div>

          {error && (
            <div className="bg-error-bg text-error-text p-2.5 rounded-lg text-sm animate-fade-in" role="alert">
              {error}
            </div>
          )}

          {/* Doom clock */}
          {(gameState.doomClock ?? 0) > 0 && (
            <DoomClockDisplay value={gameState.doomClock!} t={t} />
          )}

          {/* Points summary */}
          {era2 && <PointsCounter era2={era2} t={t} />}

          {/* Cards */}
          <div className="animate-fade-in-up">
            <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
              {t.era2.worldCardTitle}
            </div>
            <div className="flex flex-col gap-2">
              {gameState.worldCardEra2 && (
                <GameCard card={gameState.worldCardEra2} label={t.era2.worldCardTitle} accentColor="#a855f7" dense />
              )}
              {era2?.chosenEra2Card && (
                <GameCard card={era2.chosenEra2Card} label={t.era2.yourCard} accentColor="#3b82f6" dense />
              )}
            </div>
          </div>

          {/* Other players */}
          {gameState.players.filter(p => p.id !== localPlayerId).length > 0 && (
            <div className="animate-fade-in">
              <h3 className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
                {t.era1.otherKingdoms}
              </h3>
              <div className="space-y-1">
                {gameState.players
                  .filter(p => p.id !== localPlayerId)
                  .map(p => (
                    <OtherPlayerRow key={p.id} player={p} gameState={gameState} gameMode={gameMode ?? null} t={t} />
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 p-4 lg:p-6 flex flex-col min-h-0 h-[calc(100vh-3.5rem)] w-full overflow-auto">
          <PhaseMain
            phase={phase!}
            gameState={gameState}
            player={player}
            dispatch={dispatch}
            onOpenKingsTable={() => setShowKingsTable(true)}
            onAdvanceToScoring={() => setScreen('era2_scoring')}
            t={t}
          />
        </div>
      </div>

      {showKingsTable && (
        <KingsTableModal
          gameState={gameState}
          localPlayerId={localPlayerId}
          onClose={() => setShowKingsTable(false)}
          dispatch={dispatch}
          t={t}
        />
      )}
    </div>
  );
}

// ── Era II Timeline ─────────────────────────────────────────────

function Era2Timeline({ currentPhase, t }: { currentPhase: Era2Phase; t: Translations }) {
  const currentIdx = ERA2_PHASES.indexOf(currentPhase);

  return (
    <div className="fixed top-0 left-0 right-0 z-30 bg-game-bg/90 backdrop-blur-sm border-b border-border-subtle">
      <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-game-gold font-bold uppercase tracking-wider">
          <span>{t.menu.era} II</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {ERA2_PHASES.map((phase, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            return (
              <div key={phase} className="flex items-center shrink-0">
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-300 ${
                    isActive
                      ? 'bg-game-gold/15 border border-game-gold/30'
                      : isDone
                        ? 'opacity-60'
                        : 'opacity-30'
                  }`}
                >
                  <span className="text-sm">{PHASE_ICONS[phase]}</span>
                  <span
                    className={`text-xs font-medium hidden md:inline ${
                      isActive ? 'text-game-gold' : isDone ? 'text-text-secondary' : 'text-text-faint'
                    }`}
                  >
                    {t.era2.phases[phase]}
                  </span>
                </div>
                {i < ERA2_PHASES.length - 1 && (
                  <div
                    className={`w-3 h-px mx-0.5 transition-colors ${
                      isDone ? 'bg-game-gold/40' : 'bg-border-subtle'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Phase main content switch ──────────────────────────────────

function PhaseMain({
  phase,
  gameState,
  player,
  dispatch,
  onOpenKingsTable,
  onAdvanceToScoring,
  t,
}: {
  phase: Era2Phase;
  gameState: GameState;
  player: Player;
  dispatch: (a: import('@war-of-gods/engine').GameAction) => void;
  onOpenKingsTable: () => void;
  onAdvanceToScoring: () => void;
  t: Translations;
}) {
  const era2 = player.era2State;

  switch (phase) {
    case 'world_card_reveal':
      return (
        <Era2WorldCardRevealView
          worldCard={gameState.worldCardEra2 ?? null}
          onContinue={() => dispatch({ type: 'ADVANCE_ERA2_PHASE' })}
          t={t}
        />
      );

    case 'era_cards_deal': {
      const choices = era2?.pendingCardChoices ?? [];
      const alreadyChose = era2?.chosenEra2Card != null;
      if (!era2) return <WaitingView t={t} />;
      if (alreadyChose) {
        return (
          <CentredMessage
            title={t.era2.waiting}
            hint={t.era2.phases.era_cards_deal}
            onContinue={() => dispatch({ type: 'ADVANCE_ERA2_PHASE' })}
            continueLabel={t.actions.next}
          />
        );
      }
      if (choices.length === 0) {
        return <WaitingView t={t} />;
      }
      return (
        <Era2CardReveal
          cards={choices}
          onSelect={cardId => {
            dispatch({ type: 'CHOOSE_ERA2_CARD', playerId: player.id, cardId });
            dispatch({ type: 'ADVANCE_ERA2_PHASE' });
          }}
          t={t}
        />
      );
    }

    case 'apply_penalties':
    case 'apply_era1_effects':
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center animate-fade-in">
            <div className="text-game-gold text-lg font-bold mb-2 animate-title-glow">
              {t.era2.phases[phase]}
            </div>
            <div className="w-8 h-8 border-2 border-game-gold/30 border-t-game-gold rounded-full animate-spin mx-auto" />
          </div>
        </div>
      );

    case 'kings_table': {
      if (!era2) return <WaitingView t={t} />;
      const isReady = (gameState.kingsTableReady ?? []).includes(player.id);
      return (
        <KingsTableView
          gameState={gameState}
          localPlayerId={player.id}
          era2={era2}
          isReady={isReady}
          onOpenModal={onOpenKingsTable}
          onMarkReady={() => dispatch({ type: 'MARK_KINGS_TABLE_READY', playerId: player.id })}
          onAdvance={() => dispatch({ type: 'ADVANCE_ERA2_PHASE' })}
          t={t}
        />
      );
    }

    case 'tech_allocation': {
      if (!era2) return <WaitingView t={t} />;
      return (
        <TechAllocationView
          player={player}
          era2={era2}
          dispatch={dispatch}
          t={t}
        />
      );
    }

    case 'review': {
      if (!era2) return <WaitingView t={t} />;
      return (
        <TechSummaryReview
          player={player}
          era2={era2}
          onConfirm={() => {
            dispatch({ type: 'CONFIRM_ALLOCATION', playerId: player.id });
            dispatch({ type: 'ADVANCE_ERA2_PHASE' });
          }}
          t={t}
        />
      );
    }

    case 'convert_surplus': {
      if (!era2) return <WaitingView t={t} />;
      return (
        <ConvertSurplusView
          era2={era2}
          onConvert={() => {
            dispatch({ type: 'CONVERT_SURPLUS', playerId: player.id });
            dispatch({ type: 'ADVANCE_ERA2_PHASE' });
          }}
          t={t}
        />
      );
    }

    case 'complete':
      return (
        <div className="flex-1 flex items-center justify-center animate-fade-in">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-3">🏆</div>
            <h2 className="text-2xl font-bold text-game-gold animate-title-glow mb-2">
              {t.era2.phases.complete}
            </h2>
            <p className="text-text-secondary mb-6">{t.era2.advanceToEra3}</p>
            <button
              type="button"
              onClick={onAdvanceToScoring}
              className="w-full bg-gradient-to-r from-game-gold to-game-gold-dark text-game-bg py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all shadow-gold-md"
            >
              <div className="absolute inset-0 animate-shimmer pointer-events-none" />
              <span className="relative">{t.actions.viewScoring}</span>
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── Sub-views ───────────────────────────────────────────────────

function WaitingView({ t }: { t: Translations }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="text-game-gold text-lg font-bold mb-2 animate-title-glow">{t.era2.waiting}</div>
        <div className="w-8 h-8 border-2 border-game-gold/30 border-t-game-gold rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}

function CentredMessage({
  title,
  hint,
  onContinue,
  continueLabel,
}: {
  title: string;
  hint?: string;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center animate-fade-in max-w-sm">
        <div className="text-game-gold text-lg font-bold mb-2 animate-title-glow">{title}</div>
        {hint && <div className="text-text-secondary text-sm mb-4">{hint}</div>}
        {onContinue && continueLabel && (
          <button
            type="button"
            onClick={onContinue}
            className="bg-game-accent text-white px-6 py-2.5 rounded-xl font-bold text-base"
          >
            {continueLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function Era2WorldCardRevealView({
  worldCard,
  onContinue,
  t,
}: {
  worldCard: WorldCard | null;
  onContinue: () => void;
  t: Translations;
}) {
  const [revealed, setRevealed] = useState(false);
  const color = '#a855f7';

  if (!worldCard) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <button type="button" onClick={onContinue} className="text-text-secondary underline">
          {t.actions.next}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto py-8">
      <div className="text-center mb-6">
        <div
          className="text-lg font-black font-display uppercase tracking-widest mb-2"
          style={{ color, textShadow: `0 0 30px ${color}60` }}
        >
          {t.era2.worldCardTitle}
        </div>
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${color}50)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${color}50)` }} />
        </div>
      </div>

      {!revealed ? (
        <button type="button" onClick={() => setRevealed(true)} className="w-full group">
          <div
            className="rounded-2xl border-2 p-8 flex flex-col items-center justify-center min-h-[240px] relative overflow-hidden transition-all group-hover:border-opacity-60"
            style={{
              borderColor: `${color}30`,
              background: `radial-gradient(ellipse at center, ${color}12 0%, rgba(10,10,26,0.99) 70%)`,
            }}
          >
            <div className="text-6xl mb-4" style={{ filter: `drop-shadow(0 0 30px ${color}50)` }}>🌍</div>
            <div className="text-4xl font-black mb-3" style={{ color: `${color}30`, animation: 'pulse 2s ease-in-out infinite' }}>?</div>
          </div>
        </button>
      ) : (
        <div className="animate-scale-in">
          <GameCard card={worldCard} label={t.era2.worldCardTitle} accentColor={color} />
          <button
            type="button"
            onClick={onContinue}
            className="w-full mt-5 bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all"
          >
            <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            <span className="relative">{t.actions.next}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function KingsTableView({
  gameState,
  localPlayerId,
  era2,
  isReady,
  onOpenModal,
  onMarkReady,
  onAdvance,
  t,
}: {
  gameState: GameState;
  localPlayerId: string;
  era2: PlayerEra2State;
  isReady: boolean;
  onOpenModal: () => void;
  onMarkReady: () => void;
  onAdvance: () => void;
  t: Translations;
}) {
  const available = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven - era2.pointsSpent;
  const transfers = gameState.activeTransfers ?? [];
  const myPending = transfers.filter(
    tr => tr.toPlayerId === localPlayerId && tr.status === 'pending',
  );
  const allReady = gameState.players.every(p => (gameState.kingsTableReady ?? []).includes(p.id));

  return (
    <div className="w-full max-w-2xl mx-auto py-4 space-y-5 animate-fade-in-up">
      <header className="text-center">
        <div className="text-5xl mb-2">🤝</div>
        <h2 className="text-2xl font-bold text-game-gold mb-1">{t.kingsTable.title}</h2>
        <p className="text-text-secondary text-sm">{t.kingsTable.subtitle}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-1">
            {t.kingsTable.yourBudget}
          </div>
          <div className="text-3xl font-bold text-game-gold tabular-nums">{available}</div>
        </div>
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-1">
            {t.era2.pointsReceived}
          </div>
          <div className="text-3xl font-bold text-emerald-400 tabular-nums">+{era2.pointsReceived}</div>
        </div>
      </div>

      {myPending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-text-secondary text-xs uppercase tracking-wider font-semibold">
            {t.kingsTable.pending}
          </h3>
          {myPending.map(tr => {
            const from = gameState.players.find(p => p.id === tr.fromPlayerId);
            return (
              <div
                key={tr.id}
                className="bg-game-surface/80 border border-border-subtle p-3 rounded-xl flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="text-text-primary text-sm font-medium">{from?.name ?? tr.fromPlayerId}</div>
                  <div className="text-text-secondary text-xs">
                    {tr.pointsOffered} → <span className="text-emerald-400 font-bold">+{tr.pointsReceived}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      useGameStore.getState().dispatch({
                        type: 'ACCEPT_TRANSFER',
                        playerId: localPlayerId,
                        transferId: tr.id,
                      })
                    }
                    className="bg-emerald-600 hover:bg-emerald-500 text-text-primary px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {t.kingsTable.accept}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      useGameStore.getState().dispatch({
                        type: 'REJECT_TRANSFER',
                        playerId: localPlayerId,
                        transferId: tr.id,
                      })
                    }
                    className="bg-red-600/80 hover:bg-red-500 text-text-primary px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {t.kingsTable.reject}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onOpenModal}
          disabled={isReady || available <= 0}
          className="w-full bg-game-gold text-game-bg py-3 rounded-xl font-bold text-base disabled:opacity-30 transition-all"
        >
          {t.kingsTable.proposeTransfer}
        </button>
        {!isReady ? (
          <button
            type="button"
            onClick={onMarkReady}
            className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider"
          >
            {t.kingsTable.markReady}
          </button>
        ) : !allReady ? (
          <div className="text-center text-text-secondary text-sm py-2">{t.kingsTable.waitingForPlayers}</div>
        ) : (
          <button
            type="button"
            onClick={onAdvance}
            className="w-full bg-game-accent text-white py-3 rounded-xl font-bold text-base"
          >
            {t.actions.next}
          </button>
        )}
      </div>
    </div>
  );
}

function TechAllocationView({
  player,
  era2,
  dispatch,
  t,
}: {
  player: Player;
  era2: PlayerEra2State;
  dispatch: (a: import('@war-of-gods/engine').GameAction) => void;
  t: Translations;
}) {
  const budget = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven;
  const remaining = budget - era2.pointsSpent;
  const canReset =
    era2.reallocationsAllowed === 0 || era2.reallocationsUsed < era2.reallocationsAllowed;
  const racialTech = RACIAL_BONUSES[player.raceId as keyof typeof RACIAL_BONUSES]?.freeTech.tech;

  return (
    <div className="w-full max-w-3xl mx-auto py-4 space-y-5 animate-fade-in-up">
      <header className="text-center">
        <div className="text-5xl mb-2">🏗️</div>
        <h2 className="text-2xl font-bold text-game-gold mb-1">{t.era2.phases.tech_allocation}</h2>
        <p className="text-text-secondary text-sm">{t.era2.subtitle}</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <StatCell label={t.era2.constructionPoints} value={budget} color="text-game-gold" />
        <StatCell label={t.era2.pointsSpent} value={era2.pointsSpent} color="text-text-primary" />
        <StatCell
          label={t.era2.pointsRemaining}
          value={remaining}
          color={remaining < 0 ? 'text-red-400' : 'text-emerald-400'}
        />
      </div>

      <div className="space-y-3">
        {TECH_TYPES.map(tech => (
          <TechSlider
            key={tech}
            tech={tech}
            era2={era2}
            isRacial={tech === racialTech}
            disabled={era2.hasConfirmed || era2.lockedOutTech === tech}
            onChange={target =>
              dispatch({
                type: 'SET_TECH_LEVEL',
                playerId: player.id,
                tech,
                targetLevel: target,
              })
            }
            t={t}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'RESET_ALLOCATION', playerId: player.id })}
          disabled={!canReset || era2.hasConfirmed}
          className="flex-1 bg-game-surface/80 border border-border-subtle text-text-secondary hover:text-text-primary py-2.5 rounded-xl text-base transition-colors disabled:opacity-30"
        >
          {t.era2.resetAllocation}
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'CONFIRM_ALLOCATION', playerId: player.id });
            dispatch({ type: 'ADVANCE_ERA2_PHASE' });
          }}
          disabled={era2.hasConfirmed || remaining < 0}
          className="flex-1 bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-2.5 rounded-xl font-bold text-base uppercase tracking-wider disabled:opacity-30"
        >
          {t.era2.confirmAllocation}
        </button>
      </div>
    </div>
  );
}

function ConvertSurplusView({
  era2,
  onConvert,
  t,
}: {
  era2: PlayerEra2State;
  onConvert: () => void;
  t: Translations;
}) {
  const surplus = era2.constructionPoints + era2.pointsReceived - era2.pointsGiven - era2.pointsSpent;
  const gold = surplus > 0 ? Math.floor(surplus * era2.transferModifiers.surplusRatio) : 0;

  return (
    <div className="w-full max-w-md mx-auto py-6 space-y-6 animate-fade-in-up text-center">
      <header>
        <div className="text-6xl mb-3">💰</div>
        <h2 className="text-2xl font-bold text-game-gold mb-1">{t.era2.phases.convert_surplus}</h2>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-1">
            {t.era2.surplus}
          </div>
          <div className="text-3xl font-bold text-text-primary tabular-nums">{surplus}</div>
        </div>
        <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider font-semibold mb-1">
            {t.era2.coins}
          </div>
          <div className="text-3xl font-bold text-game-gold tabular-nums">{era2.goldCoins + gold}</div>
        </div>
      </div>

      <div className="text-text-secondary text-xs">
        {t.kingsTable.ratio}: 2 → 1
      </div>

      <button
        type="button"
        onClick={onConvert}
        className="w-full bg-gradient-to-r from-game-gold to-game-gold-dark text-game-bg py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all shadow-gold-md"
      >
        <div className="absolute inset-0 animate-shimmer pointer-events-none" />
        <span className="relative">{t.era2.convertSurplusButton}</span>
      </button>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-3 text-center">
      <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-0.5">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function OtherPlayerRow({
  player,
  gameState,
  gameMode,
  t,
}: {
  player: Player;
  gameState: GameState;
  gameMode: string | null;
  t: Translations;
}) {
  const race = getRaceById(player.raceId);
  const isReady = (gameState.kingsTableReady ?? []).includes(player.id);
  return (
    <div className="flex items-center gap-1.5 bg-game-surface/40 rounded-lg px-2.5 py-1.5 border border-border-subtle">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: race.color }} />
      <span className="flex-1 text-text-primary text-sm truncate">{player.name}</span>
      {player.isBot && <span className="text-text-muted text-xs">[{t.era1.bot}]</span>}
      {gameState.era2Phase === 'kings_table' && isReady && (
        <span className="text-emerald-400/80 text-[10px] shrink-0">✓</span>
      )}
      {gameState.era2Phase === 'tech_allocation' && player.era2State?.hasConfirmed && (
        <span className="text-emerald-400/80 text-[10px] shrink-0">✓</span>
      )}
      {gameMode === 'multiplayer' && !player.connected && (
        <span className="text-red-400/70 text-[10px] shrink-0">{t.multiplayer.disconnected}</span>
      )}
    </div>
  );
}

// Keep unused helper imports from being tree-shaken (referenced elsewhere in this file).
void TECH_COSTS;
void TECH_BENEFITS;
void calculateTechCost;
void computeTransferDelta;
