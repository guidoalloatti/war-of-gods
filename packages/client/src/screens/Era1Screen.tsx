import { useState, useEffect, useRef } from 'react';
import { getRaceById, calculateScoreBreakdown } from '@war-of-gods/engine';
import type { TerrainType, GameAction, GameState, WorldCard, EraCard, RelicCard } from '@war-of-gods/engine';
import type { Translations } from '../i18n/es.js';
import { useGameStore } from '../stores/gameStore.js';
import { GameCard } from '../components/GameCard.js';
import { TradeModal } from '../components/TradeModal.js';
import { HexBoard, TileHand, useHexBoard } from '../components/HexBoard.js';
import { LiveScoreDisplay } from '../components/LiveScoreDisplay.js';
import { ScoreBreakdown } from '../components/ScoreBreakdown.js';
import { EffectModal } from '../components/EffectModal.js';
import { useI18n } from '../i18n/index.js';

/** Phases that should be auto-advanced without user interaction */
const PREP_PHASES = new Set(['setup']);

/** All era phases in order for the timeline wizard */
const ERA_PHASES = [
  'world_card_reveal',
  'era_cards_deal',
  'relics_deal',
  'draw_tiles',
  'trade',
  'placement',
  'scoring',
  'complete',
] as const;

const PHASE_ICONS: Record<string, string> = {
  world_card_reveal: '🌍',
  era_cards_deal: '📜',
  relics_deal: '💎',
  draw_tiles: '🎴',
  trade: '🤝',
  placement: '🏗️',
  scoring: '⭐',
  complete: '🏆',
};

export function Era1Screen() {
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const dispatch = useGameStore(s => s.dispatch);
  const runBots = useGameStore(s => s.runBots);
  const setScreen = useGameStore(s => s.setScreen);
  const error = useGameStore(s => s.error);
  const t = useI18n(s => s.t);

  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [selectedTerrain, setSelectedTerrain] = useState<TerrainType | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnTiles, setDrawnTiles] = useState<TerrainType[]>([]);
  const [drawComplete, setDrawComplete] = useState(false);
  const autoAdvancedRef = useRef(false);
  const gameIdRef = useRef(gameState?.id);
  const drawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset autoAdvancedRef when a new game starts
  if (gameState && gameState.id !== gameIdRef.current) {
    gameIdRef.current = gameState.id;
    autoAdvancedRef.current = false;
  }

  const tileInventory = gameState?.players.find(p => p.id === localPlayerId)?.tiles;

  const { board, placeTile, removeTile, resetBoard, autoAssign, placedCounts, totalPlaced } = useHexBoard(tileInventory);

  // Derive these values before hooks so they can be used in useEffect dependencies
  const player = gameState?.players.find(p => p.id === localPlayerId);
  const phase = gameState?.era1Phase;
  const pendingEra = gameState?.pendingEraCards?.[localPlayerId ?? ''] ?? null;
  const pendingRelic = gameState?.pendingRelics?.[localPlayerId ?? ''] ?? null;
  const hasPendingEraChoices = pendingEra !== null && pendingEra.length > 0;
  const hasPendingRelicChoices = pendingRelic !== null && pendingRelic.length > 0;

  useEffect(() => {
    if (selectedTerrain && tileInventory) {
      const available = tileInventory[selectedTerrain] - (placedCounts[selectedTerrain] ?? 0);
      if (available <= 0) setSelectedTerrain(null);
    }
  }, [selectedTerrain, placedCounts, tileInventory]);

  useEffect(() => {
    if (!gameState || autoAdvancedRef.current) return;
    if (!PREP_PHASES.has(gameState.era1Phase)) return;

    const advance = () => {
      const current = useGameStore.getState().gameState;
      if (!current || !PREP_PHASES.has(current.era1Phase)) {
        autoAdvancedRef.current = true;
        return;
      }
      dispatch({ type: 'ADVANCE_PHASE' });
      requestAnimationFrame(advance);
    };

    advance();
  }, [gameState?.era1Phase, dispatch]);

  // Cleanup draw interval on unmount
  useEffect(() => {
    return () => {
      if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
    };
  }, []);

  // Auto-advance if we're at era_cards_deal/relics_deal with no pending choices for local player
  // (e.g., >4 players skip relics, or bots picked for solo player)
  useEffect(() => {
    if (phase === 'era_cards_deal' && !hasPendingEraChoices) {
      dispatch({ type: 'ADVANCE_PHASE' });
    } else if (phase === 'relics_deal' && !hasPendingRelicChoices) {
      dispatch({ type: 'ADVANCE_PHASE' });
    }
  }, [phase, hasPendingEraChoices, hasPendingRelicChoices, dispatch]);

  if (!gameState || !localPlayerId || !player) return null;

  const race = getRaceById(player.raceId);

  if (PREP_PHASES.has(phase!)) {
    return (
      <div className="min-h-screen bg-game-bg bg-radial-theme flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-game-gold text-lg font-bold mb-2 animate-title-glow">{t.era1.preparation}</div>
          <div className="w-8 h-8 border-2 border-game-gold/30 border-t-game-gold rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // Card deal phases are now handled inline within the main layout
  const isCardPhase = phase === 'world_card_reveal' || phase === 'era_cards_deal' || phase === 'relics_deal';

  // Animated draw tiles: dispatch + animate one by one
  function handleDrawTiles() {
    // Dispatch immediately so the engine draws
    dispatch({ type: 'DRAW_TILES', playerId: localPlayerId! });
    runBots();

    // Get the player's tiles after draw
    const updatedState = useGameStore.getState().gameState;
    if (!updatedState) return;
    const updatedPlayer = updatedState.players.find(p => p.id === localPlayerId);
    if (!updatedPlayer) return;

    // Build a flat array of all tiles for the animation
    const allTiles: TerrainType[] = [];
    for (const [terrain, count] of Object.entries(updatedPlayer.tiles)) {
      for (let i = 0; i < count; i++) allTiles.push(terrain as TerrainType);
    }

    setIsDrawing(true);
    setDrawnTiles([]);
    setDrawComplete(false);

    let i = 0;
    drawIntervalRef.current = setInterval(() => {
      if (i < allTiles.length) {
        const tile = allTiles[i];
        i++;
        setDrawnTiles(prev => [...prev, tile]);
      } else {
        if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
        setDrawComplete(true);
      }
    }, 150);
  }

  function handleSkipDraw() {
    if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
    drawIntervalRef.current = null;

    const updatedState = useGameStore.getState().gameState;
    if (!updatedState) return;
    const updatedPlayer = updatedState.players.find(p => p.id === localPlayerId);
    if (!updatedPlayer) return;

    const allTiles: TerrainType[] = [];
    for (const [terrain, count] of Object.entries(updatedPlayer.tiles)) {
      for (let i = 0; i < count; i++) allTiles.push(terrain as TerrainType);
    }
    setDrawnTiles(allTiles);
    setDrawComplete(true);
  }

  function handleFinishDraw() {
    setIsDrawing(false);
    setDrawnTiles([]);
    setDrawComplete(false);
  }

  function handleProposeTrade(toPlayerId: string, offered: TerrainType, requested: TerrainType) {
    dispatch({
      type: 'PROPOSE_TRADE',
      fromPlayerId: localPlayerId!,
      toPlayerId,
      tileOffered: offered,
      tileRequested: requested,
    });
    setShowTradeModal(false);
  }

  function handlePlaceTiles() {
    dispatch({ type: 'PLACE_TILES', playerId: localPlayerId! });
    runBots();
  }

  function handleEndTrade() {
    dispatch({ type: 'END_TRADE_PHASE' });
  }

  function handleAdvanceToTrade() {
    dispatch({ type: 'ADVANCE_PHASE' });
  }

  function handleAdvanceToScoring() {
    dispatch({ type: 'ADVANCE_PHASE' });
  }

  function handleScoring() {
    dispatch({ type: 'CALCULATE_SCORES' });
    setShowScoringModal(true);
  }

  const playerTileCount = Object.values(player.tiles).reduce((a, b) => a + b, 0);
  const isSoloNoOpponents = gameState.mode === 'solo' && gameState.players.length === 1;
  const showHexBoard = phase === 'placement' || phase === 'scoring';

  // Handle pending interactive effects (discard_and_redraw, manual_pick, view_opponents_tiles)
  function handleResolveEffect(resolution: Record<string, unknown>) {
    dispatch({ type: 'RESOLVE_EFFECT', playerId: localPlayerId!, resolution });
  }

  return (
    <div id="era1-screen" className="min-h-screen bg-game-bg bg-radial-theme relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-game-gold/10 to-transparent" />

      {/* Effect resolution modal overlay */}
      {player.pendingEffect && (
        <EffectModal player={player} onResolve={handleResolveEffect} />
      )}

      {/* Era Timeline Wizard */}
      <EraTimeline currentPhase={phase!} t={t} />

      <div className="flex flex-col lg:flex-row min-h-screen relative z-10 pt-14">
        {/* LEFT SIDEBAR — Cards & Info (pl-14 avoids gear icon overlap) */}
        <div className="lg:w-80 xl:w-[22rem] shrink-0 border-r border-border-subtle p-4 pl-14 space-y-4 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
          {/* Header */}
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

          {/* Cards section */}
          <div className="animate-fade-in-up">
            <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">{t.era1.yourCards}</div>
            <div className="space-y-2">
              {gameState.worldCard && (
                <GameCard card={gameState.worldCard} label={t.era1.worldCardTitle} accentColor="#8b5cf6" compact />
              )}
              {player.eraCards[0] && (
                <GameCard card={player.eraCards[0]} label={t.era1.eraCardTitle} accentColor="#3b82f6" compact />
              )}
              {player.relic && (
                <GameCard card={player.relic} label={t.era1.relicTitle} accentColor="#f59e0b" compact />
              )}
            </div>
          </div>

          {/* Other players */}
          {gameState.players.filter(p => p.id !== localPlayerId).length > 0 && (
            <div className="animate-fade-in">
              <h3 className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">{t.era1.otherKingdoms}</h3>
              <div className="space-y-1">
                {gameState.players.filter(p => p.id !== localPlayerId).map(p => {
                  const pRace = getRaceById(p.raceId);
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 bg-game-surface/40 rounded-lg px-2.5 py-1.5 border border-border-subtle">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pRace.color }} />
                      <span className="text-text-primary text-sm">{p.name}</span>
                      {p.isBot && <span className="text-text-muted text-xs">[{t.era1.bot}]</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live Score (visible during placement) */}
          {showHexBoard && (
            <div className="animate-fade-in-up">
              <LiveScoreDisplay
                raceId={player.raceId}
                placedCounts={placedCounts}
                cardBonusPoints={player.cardBonusPoints ?? 0}
                board={board}
              />
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 p-4 lg:p-6 flex flex-col overflow-y-auto max-h-[calc(100vh-3.5rem)]">
          {showHexBoard ? (
            <div className="flex-1 flex flex-col animate-fade-in-up">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-game-gold text-sm font-bold uppercase tracking-wider">
                  {t.hexBoard.yourKingdom}
                </span>
                <span className="text-text-secondary text-xs">
                  {t.hexBoard.placedTiles}: {totalPlaced}/37
                </span>
                <div className="flex-1" />
                {phase === 'placement' && !player.hasPlaced && (
                  <button
                    type="button"
                    onClick={() => autoAssign(player.raceId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-game-gold/10 border border-game-gold/20 text-game-gold hover:bg-game-gold/20 hover:border-game-gold/40 transition-all text-xs font-medium"
                    title={t.hexBoard.autoAssignHint}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {t.hexBoard.autoAssign}
                  </button>
                )}
              </div>

              <div className="flex-1 flex items-center justify-center">
                <div className="w-full max-w-3xl">
                  <HexBoard
                    board={board}
                    onPlaceTile={placeTile}
                    onRemoveTile={removeTile}
                    dragTerrain={selectedTerrain}
                    raceId={player.raceId}
                    onResetBoard={resetBoard}
                  />
                </div>
              </div>

              <div className="mt-4">
                <TileHand
                  tiles={player.tiles}
                  placedCounts={placedCounts}
                  selectedTerrain={selectedTerrain}
                  onSelectTerrain={setSelectedTerrain}
                />
              </div>

              <div className="mt-4">
                {phase === 'placement' && (
                  !player.hasPlaced ? (
                    <button
                      type="button"
                      onClick={handlePlaceTiles}
                      className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all shadow-accent"
                    >
                      <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                      <span className="relative">{t.actions.placeTiles}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAdvanceToScoring}
                      className="w-full bg-game-accent text-white py-3 rounded-xl font-bold text-base"
                    >
                      {t.actions.next}
                    </button>
                  )
                )}
                {phase === 'scoring' && (
                  <button
                    type="button"
                    onClick={handleScoring}
                    className="w-full bg-gradient-to-r from-game-gold to-game-gold-dark text-game-bg py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all shadow-gold-md"
                  >
                    <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                    <span className="relative">{t.actions.viewScoring}</span>
                  </button>
                )}
              </div>
            </div>
          ) : isCardPhase ? (
            <div className="flex-1 flex flex-col items-center justify-center animate-fade-in-up">
              {/* World card reveal */}
              {phase === 'world_card_reveal' && (
                <InlineWorldCardReveal
                  worldCard={gameState.worldCard}
                  onReveal={() => dispatch({ type: 'ADVANCE_PHASE' })}
                  t={t}
                />
              )}

              {/* Era card selection */}
              {phase === 'era_cards_deal' && hasPendingEraChoices && (
                <InlineCardSelector
                  cards={pendingEra!}
                  label={t.era1.eraCardTitle}
                  color="#3b82f6"
                  title={t.era1.chooseEraCard}
                  subtitle={t.era1.chooseEraCardSub}
                  onSelect={(cardId) => {
                    dispatch({ type: 'CHOOSE_ERA_CARD', playerId: localPlayerId!, cardId });
                    dispatch({ type: 'ADVANCE_PHASE' });
                  }}
                  t={t}
                />
              )}
              {phase === 'era_cards_deal' && !hasPendingEraChoices && (
                <div className="text-center">
                  <div className="text-game-gold text-lg font-bold mb-2 animate-title-glow">{t.era1.preparation}</div>
                  <div className="w-8 h-8 border-2 border-game-gold/30 border-t-game-gold rounded-full animate-spin mx-auto" />
                </div>
              )}

              {/* Relic selection */}
              {phase === 'relics_deal' && hasPendingRelicChoices && (
                <InlineCardSelector
                  cards={pendingRelic!}
                  label={t.era1.relicTitle}
                  color="#f59e0b"
                  title={t.era1.chooseRelic}
                  subtitle={t.era1.chooseRelicSub}
                  onSelect={(relicId) => {
                    dispatch({ type: 'CHOOSE_RELIC', playerId: localPlayerId!, relicId });
                    dispatch({ type: 'ADVANCE_PHASE' });
                  }}
                  t={t}
                />
              )}
              {phase === 'relics_deal' && !hasPendingRelicChoices && (
                <div className="text-center">
                  <div className="text-game-gold text-lg font-bold mb-2 animate-title-glow">{t.era1.preparation}</div>
                  <div className="w-8 h-8 border-2 border-game-gold/30 border-t-game-gold rounded-full animate-spin mx-auto" />
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-lg mx-auto w-full space-y-4 animate-fade-in-up">
              {/* Animated draw tiles view */}
              {phase === 'draw_tiles' && isDrawing ? (
                <DrawTilesAnimation
                  drawnTiles={drawnTiles}
                  complete={drawComplete}
                  onSkip={handleSkipDraw}
                  onFinish={handleFinishDraw}
                  t={t}
                />
              ) : (
                <>
                  {/* Tile counts */}
                  {playerTileCount > 0 && (
                    <div>
                      <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">
                        {t.hexBoard.availableTiles}
                      </div>
                      <TileCounter tiles={player.tiles} />
                    </div>
                  )}

                  {/* Phase-specific actions */}
                  <div className="space-y-3">
                    {phase === 'draw_tiles' && (
                      <>
                        {playerTileCount === 0 ? (
                          <button
                            type="button"
                            onClick={handleDrawTiles}
                            className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all shadow-accent"
                          >
                            <div className="absolute inset-0 animate-shimmer pointer-events-none" />
                            <span className="relative">{t.actions.drawTiles} (18)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleAdvanceToTrade}
                            className="w-full bg-game-accent text-white py-3 rounded-xl font-bold text-base"
                          >
                            {t.actions.next}
                          </button>
                        )}
                        <p className="text-text-secondary text-sm text-center">
                          {t.era1.tilesRemaining}: {gameState.tilePile.length}
                        </p>
                      </>
                    )}

                    {phase === 'trade' && (
                      <>
                        {!player.hasTraded && !isSoloNoOpponents && (
                          <button
                            type="button"
                            onClick={() => setShowTradeModal(true)}
                            className="w-full bg-game-gold text-game-bg py-3 rounded-xl font-bold text-base"
                          >
                            {t.actions.proposeTrade}
                          </button>
                        )}
                        {isSoloNoOpponents && !player.hasTraded && (
                          <SoloTradePanel player={player} dispatch={dispatch} t={t} favorableTerrain={race.favorableTerrain} />
                        )}
                        {gameState.activeTrades
                          .filter(tr => tr.toPlayerId === localPlayerId && tr.status === 'pending')
                          .map(trade => (
                            <div key={trade.id} className="bg-game-surface/80 border border-border-subtle p-3 rounded-xl flex items-center justify-between">
                              <span className="text-text-primary text-base">
                                {t.terrain[trade.tileOffered]} &rarr; {t.terrain[trade.tileRequested]}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => dispatch({ type: 'ACCEPT_TRADE', tradeId: trade.id })}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-text-primary px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                >
                                  {t.actions.acceptTrade}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dispatch({ type: 'REJECT_TRADE', tradeId: trade.id })}
                                  className="bg-red-600/80 hover:bg-red-500 text-text-primary px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                >
                                  {t.actions.rejectTrade}
                                </button>
                              </div>
                            </div>
                          ))
                        }
                        <button
                          type="button"
                          onClick={handleEndTrade}
                          className="w-full bg-game-surface/80 border border-border-subtle text-text-secondary hover:text-text-primary py-2.5 rounded-xl text-base transition-colors"
                        >
                          {t.actions.endTrade}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showTradeModal && (
        <TradeModal
          currentPlayer={player}
          otherPlayers={gameState.players.filter(p => p.id !== localPlayerId)}
          onPropose={handleProposeTrade}
          onClose={() => setShowTradeModal(false)}
        />
      )}

      {showScoringModal && (
        <ScoringModal
          gameState={gameState}
          onClose={() => setShowScoringModal(false)}
          onBackToMenu={() => setScreen('menu')}
          t={t}
        />
      )}
    </div>
  );
}

// ── Era Timeline Wizard ──────────────────────────────────────────

function EraTimeline({ currentPhase, t }: { currentPhase: string; t: Translations }) {
  const currentIdx = ERA_PHASES.indexOf(currentPhase as typeof ERA_PHASES[number]);

  return (
    <div id="era-timeline" className="fixed top-0 left-0 right-0 z-30 bg-game-bg/90 backdrop-blur-sm border-b border-border-subtle">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-game-gold font-bold uppercase tracking-wider">
          <span>{t.menu.era} I</span>
        </div>
        <div className="flex items-center gap-1">
          {ERA_PHASES.map((phase, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            const isFuture = i > currentIdx;
            return (
              <div key={phase} className="flex items-center">
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
                  <span className={`text-xs font-medium hidden sm:inline ${
                    isActive ? 'text-game-gold' : isDone ? 'text-text-secondary' : 'text-text-faint'
                  }`}>
                    {t.phases[phase]}
                  </span>
                </div>
                {i < ERA_PHASES.length - 1 && (
                  <div className={`w-4 sm:w-6 h-px mx-0.5 transition-colors ${
                    isDone ? 'bg-game-gold/40' : 'bg-border-subtle'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Draw Tiles Animation ─────────────────────────────────────────

const TILE_ICONS: Record<TerrainType, string> = {
  plain: '🌾', mountain: '⛰️', forest: '🌲', swamp: '🌿', road: '🛤️',
};

const TILE_COLORS: Record<TerrainType, string> = {
  plain: 'tile-plain',
  mountain: 'tile-mountain',
  forest: 'tile-forest',
  swamp: 'tile-swamp',
  road: 'tile-road',
};

const TILE_STYLES: Record<TerrainType, { bg: string; border: string }> = {
  plain:    { bg: 'var(--tile-plain-bg)',    border: 'var(--tile-plain-border)' },
  mountain: { bg: 'var(--tile-mountain-bg)', border: 'var(--tile-mountain-border)' },
  forest:   { bg: 'var(--tile-forest-bg)',   border: 'var(--tile-forest-border)' },
  swamp:    { bg: 'var(--tile-swamp-bg)',    border: 'var(--tile-swamp-border)' },
  road:     { bg: 'var(--tile-road-bg)',     border: 'var(--tile-road-border)' },
};

function DrawTilesAnimation({ drawnTiles, complete, onSkip, onFinish, t }: {
  drawnTiles: TerrainType[];
  complete: boolean;
  onSkip: () => void;
  onFinish: () => void;
  t: Translations;
}) {
  // Count tiles by type
  const counts: Partial<Record<TerrainType, number>> = {};
  for (const tile of drawnTiles) {
    counts[tile] = (counts[tile] ?? 0) + 1;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <div className="text-game-gold text-base font-bold uppercase tracking-wider mb-1">
          {t.era1.drawing}
        </div>
        <div className="text-text-secondary text-sm">
          {drawnTiles.length} / 18 {t.era1.drawnCount}
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-game-surface rounded-full overflow-hidden max-w-xs mx-auto">
          <div
            className="h-full bg-gradient-to-r from-game-gold to-game-ember rounded-full transition-all duration-200"
            style={{ width: `${(drawnTiles.length / 18) * 100}%` }}
          />
        </div>
      </div>

      {/* Tile grid — animated entry */}
      <div className="flex flex-wrap gap-2 justify-center min-h-[120px]">
        {drawnTiles.map((tile, i) => (
          <div
            key={i}
            className="w-14 h-16 rounded-lg border flex flex-col items-center justify-center animate-scale-in"
            style={{ animationDelay: `${i * 0.02}s`, backgroundColor: TILE_STYLES[tile].bg, borderColor: TILE_STYLES[tile].border }}
          >
            <span className="text-xl">{TILE_ICONS[tile]}</span>
            <span className="text-[10px] text-text-secondary mt-0.5">{i + 1}</span>
          </div>
        ))}
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-5 gap-2">
        {(['plain', 'mountain', 'forest', 'swamp', 'road'] as TerrainType[]).map(terrain => (
          <div key={terrain} className="rounded-lg p-2 text-center border"
            style={{ backgroundColor: TILE_STYLES[terrain].bg, borderColor: TILE_STYLES[terrain].border }}>
            <div className="text-lg">{TILE_ICONS[terrain]}</div>
            <div className="text-base font-bold text-text-primary tabular-nums">{counts[terrain] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        {!complete ? (
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 bg-game-surface/80 border border-border-subtle text-text-secondary hover:text-text-primary py-2.5 rounded-xl text-base transition-colors"
          >
            {t.era1.skipAnimation}
          </button>
        ) : (
          <button
            type="button"
            onClick={onFinish}
            className="flex-1 bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-2.5 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all"
          >
            <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            <span className="relative">{t.actions.next}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Simple tile counter for pre-placement phases ─────────────────

function TileCounter({ tiles }: { tiles: Record<TerrainType, number> }) {
  const t = useI18n(s => s.t);
  const terrains: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

  return (
    <div className="grid grid-cols-5 gap-2">
      {terrains.map(terrain => (
        <div key={terrain} className="rounded-lg p-2 text-center text-text-primary border"
          style={{ backgroundColor: TILE_STYLES[terrain].bg, borderColor: TILE_STYLES[terrain].border }}>
          <div className="text-2xl" aria-hidden="true">{TILE_ICONS[terrain]}</div>
          <div className="text-xs mt-0.5 text-text-secondary">{t.terrain[terrain]}</div>
          <div className="text-lg font-bold">{tiles[terrain]}</div>
        </div>
      ))}
    </div>
  );
}

// ── Solo trade panel ─────────────────────────────────────────────

function SoloTradePanel({ player, dispatch, t, favorableTerrain }: {
  player: { id: string; raceId: string; tiles: Record<TerrainType, number>; hasTraded: boolean };
  dispatch: (action: GameAction) => void;
  t: Translations;
  favorableTerrain: TerrainType;
}) {
  const [selectedTiles, setSelectedTiles] = useState<TerrainType[]>([]);
  const terrains: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

  const favorableCount = player.tiles[favorableTerrain];
  const canTrade = favorableCount < 6;

  function handleToggleTile(tt: TerrainType) {
    setSelectedTiles(prev => {
      const selectedOfType = prev.filter(t => t === tt).length;
      const available = player.tiles[tt];
      if (prev.length < 2 && selectedOfType < available) {
        return [...prev, tt];
      } else if (selectedOfType > 0) {
        const idx = prev.indexOf(tt);
        return prev.filter((_, i) => i !== idx);
      }
      return prev;
    });
  }

  function handleSoloTrade() {
    if (selectedTiles.length !== 2) return;
    dispatch({ type: 'SOLO_TRADE', playerId: player.id, discardTiles: selectedTiles as [TerrainType, TerrainType] });
  }

  if (!canTrade) {
    return (
      <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
        <div className="text-text-secondary text-sm text-center">
          <span className="text-xl block mb-1">{TILE_ICONS[favorableTerrain]}</span>
          {t.trade.cannotTrade} ({favorableCount} {t.terrain[favorableTerrain]})
        </div>
      </div>
    );
  }

  return (
    <div className="bg-game-surface/60 border border-border-subtle rounded-xl p-4">
      <div className="text-text-primary text-sm font-medium mb-1">{t.trade.soloSwap}</div>
      <div className="text-text-secondary text-xs mb-3">
        {t.trade.selectTwo} ({selectedTiles.length}/2)
      </div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {terrains.filter(tt => player.tiles[tt] > 0).map(tt => {
          const selectedOfType = selectedTiles.filter(s => s === tt).length;
          return (
            <button
              key={tt}
              type="button"
              onClick={() => handleToggleTile(tt)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${
                selectedOfType > 0
                  ? 'border-game-gold bg-game-gold/10 text-game-gold'
                  : 'border-border-subtle text-text-secondary hover:border-border-medium'
              }`}
            >
              <span className="text-sm">{TILE_ICONS[tt]}</span>
              <span className="text-sm tabular-nums">{player.tiles[tt]}</span>
              {selectedOfType > 0 && (
                <span className="text-[10px] bg-game-gold/20 rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {selectedOfType}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mb-3 text-xs text-text-secondary">
        <span>{TILE_ICONS[favorableTerrain]}</span>
        <span>{t.terrain[favorableTerrain]}: {favorableCount}/6</span>
      </div>
      <button
        type="button"
        onClick={handleSoloTrade}
        disabled={selectedTiles.length !== 2}
        className="w-full bg-game-gold text-game-bg py-2.5 rounded-lg font-bold text-base disabled:opacity-30 transition-all"
      >
        {t.trade.swap}
      </button>
    </div>
  );
}

// ── Inline World Card Reveal ────────────────────────────────────

function InlineWorldCardReveal({ worldCard, onReveal, t }: {
  worldCard: WorldCard | null;
  onReveal: () => void;
  t: Translations;
}) {
  const [revealed, setRevealed] = useState(false);
  const color = '#8b5cf6';

  if (!worldCard) {
    onReveal();
    return null;
  }

  function handleReveal() {
    setRevealed(true);
  }

  function handleContinue() {
    onReveal();
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div
          className="text-lg font-black font-display uppercase tracking-widest mb-2"
          style={{ color, textShadow: `0 0 30px ${color}60` }}
        >
          {t.era1.worldCardTitle}
        </div>
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${color}50)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${color}50)` }} />
        </div>
        {!revealed && (
          <p className="text-text-secondary text-sm italic">{t.era1.worldCardNarrative}</p>
        )}
      </div>

      {/* Card */}
      {!revealed ? (
        <button
          type="button"
          onClick={handleReveal}
          className="w-full group"
        >
          <div
            className="rounded-2xl border-2 p-8 flex flex-col items-center justify-center min-h-[240px] relative overflow-hidden transition-all group-hover:border-opacity-60"
            style={{
              borderColor: `${color}30`,
              background: `radial-gradient(ellipse at center, ${color}12 0%, rgba(10,10,26,0.99) 70%)`,
            }}
          >
            <div className="text-6xl mb-4" style={{ filter: `drop-shadow(0 0 30px ${color}50)` }}>🌍</div>
            <div className="text-4xl font-black mb-3" style={{ color: `${color}30`, animation: 'pulse 2s ease-in-out infinite' }}>?</div>
            <div className="text-xs font-medium" style={{ color: `${color}60` }}>{t.era1.worldCardHint}</div>
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background: `linear-gradient(110deg, transparent 25%, ${color}06 40%, ${color}12 50%, ${color}06 60%, transparent 75%)`,
                backgroundSize: '250% 100%',
                animation: 'shimmer 4s linear infinite',
              }}
            />
          </div>
        </button>
      ) : (
        <div className="animate-scale-in">
          <GameCard card={worldCard} label={t.era1.worldCardTitle} accentColor={color} />
          <button
            type="button"
            onClick={handleContinue}
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

// ── Inline Card Selector (era cards / relics) ───────────────────

function InlineCardSelector({ cards, label, color, title, subtitle, onSelect, t }: {
  cards: (EraCard | RelicCard)[];
  label: string;
  color: string;
  title: string;
  subtitle: string;
  onSelect: (id: string) => void;
  t: Translations;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const locale = useI18n(s => s.locale);

  function getCardText(card: EraCard | RelicCard) {
    if (locale === 'en') {
      return {
        name: card.name_en || card.name,
        flavorText: card.flavorText_en || card.flavorText,
        mechanicalText: card.mechanicalText_en || card.mechanicalText,
      };
    }
    return { name: card.name, flavorText: card.flavorText, mechanicalText: card.mechanicalText };
  }

  function handleConfirm() {
    if (!selectedId) return;
    setConfirmed(true);
    setTimeout(() => onSelect(selectedId), 400);
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header */}
      <div className={`text-center mb-6 transition-all duration-500 ${confirmed ? 'opacity-0 -translate-y-4' : ''}`}>
        <div
          className="text-lg font-black font-display uppercase tracking-widest mb-2"
          style={{ color, textShadow: `0 0 30px ${color}60` }}
        >
          {title}
        </div>
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${color}50)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
          <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${color}50)` }} />
        </div>
        <p className="text-text-secondary text-sm italic">{subtitle}</p>
      </div>

      {/* Card grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 transition-all duration-500 ${confirmed ? 'opacity-0 scale-95' : ''}`}>
        {cards.map((card, i) => {
          const text = getCardText(card);
          const isSelected = selectedId === card.id;
          const isUnselected = selectedId !== null && !isSelected;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => !confirmed && setSelectedId(card.id)}
              className={`text-left rounded-xl border-2 overflow-hidden transition-all duration-300 ${
                isSelected ? 'scale-[1.03]' : isUnselected ? 'opacity-50 scale-[0.97]' : 'hover:scale-[1.02]'
              }`}
              style={{
                borderColor: isSelected ? color : `${color}25`,
                background: `linear-gradient(180deg, ${color}${isSelected ? '20' : '10'} 0%, ${color}05 40%, transparent 100%)`,
                boxShadow: isSelected ? `0 0 30px ${color}30, 0 0 0 3px ${color}60` : `0 0 10px ${color}08`,
                animationDelay: `${i * 100}ms`,
              }}
            >
              {/* Card header */}
              <div className="px-3 py-2.5 border-b flex items-center justify-between" style={{ borderColor: `${color}20` }}>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: `${color}aa` }}>{label}</div>
                  <h3 className="text-text-primary font-bold text-sm">{text.name}</h3>
                </div>
                {isSelected && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Flavor */}
              <div className="px-3 py-2 border-b" style={{ borderColor: `${color}10` }}>
                <p className="text-text-secondary text-xs italic leading-relaxed">&ldquo;{text.flavorText}&rdquo;</p>
              </div>

              {/* Mechanical effect */}
              <div className="px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: `${color}90` }}>{t.era1.effect}</div>
                <p className="text-text-primary/90 text-xs leading-relaxed font-medium">{text.mechanicalText}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirm button */}
      <div className={`mt-6 transition-all duration-500 ${selectedId && !confirmed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full bg-gradient-to-r from-game-accent to-game-ember text-text-primary py-3 rounded-xl font-bold text-base uppercase tracking-wider relative overflow-hidden hover:-translate-y-0.5 transition-all"
          style={{ boxShadow: `0 0 20px ${color}20` }}
        >
          <div className="absolute inset-0 animate-shimmer pointer-events-none" />
          <span className="relative">{t.era1.selectCard}</span>
        </button>
      </div>
    </div>
  );
}

// ── Scoring Modal (replaces ScoringScreen) ──────────────────────

function ScoringModal({ gameState, onClose, onBackToMenu, t }: {
  gameState: GameState;
  onClose: () => void;
  onBackToMenu: () => void;
  t: Translations;
}) {
  const playerScores = gameState.players
    .map(player => ({
      player,
      race: getRaceById(player.raceId),
      breakdown: calculateScoreBreakdown(gameState, player.id),
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  const totalScore = playerScores.reduce((sum, ps) => sum + ps.breakdown.total, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-game-bg border border-border-medium rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Decorative glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 bg-game-gold/[0.06] rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-6">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-game-surface border border-border-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🏆</div>
            <h2 className="text-2xl font-bold text-game-gold animate-title-glow">
              {t.scoring.eraComplete}
            </h2>
            <p className="text-text-secondary text-sm mt-1.5">
              {t.scoring.eraCompleteSub}
            </p>
            <p className="text-text-primary/80 text-base mt-3">
              {t.scoring.totalKingdom}: <span className="text-game-gold font-bold text-lg">{totalScore}</span>
            </p>
          </div>

          {/* Score breakdowns */}
          <div className="space-y-4 mb-6">
            {playerScores.map(({ player, race, breakdown }) => (
              <ScoreBreakdown
                key={player.id}
                playerName={player.name}
                raceColor={race.color}
                breakdown={breakdown}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              type="button"
              disabled
              className="w-full bg-gradient-to-r from-game-gold/30 to-game-gold-dark/30 text-text-muted py-3 rounded-xl font-bold text-base uppercase tracking-wider cursor-not-allowed relative"
            >
              {t.scoring.advanceToEra2}
              <span className="ml-2 text-xs font-normal normal-case opacity-70">({t.scoring.comingSoon})</span>
            </button>
            <button
              type="button"
              onClick={onBackToMenu}
              className="w-full bg-game-surface border border-border-medium text-text-primary py-3 rounded-xl font-bold text-base hover:bg-game-surface-light transition-colors"
            >
              {t.scoring.backToMenu}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
