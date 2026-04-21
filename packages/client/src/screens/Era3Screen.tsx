import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  getRaceById, TECH_TYPES,
  ERA3_RECRUIT_COSTS, ERA3_RECRUITS_PER_TURN, ERA3_BASE_INCOME, validateRecruit,
  ERA3_BUILD_ROAD_COST, ERA3_ROADS_PER_TURN, validateBuildRoad,
  neighbors, hexKey, distance, DHAKHAN_OWNER_ID, BOSS_STACK_ID, MAX_STACK_SIZE,
  getIncrementalCost, ERA3_TECH_UPGRADE_MULTIPLIER,
  ERA3_WAR_RECRUITS_PER_LEVEL, ERA3_RESOURCES_STACK_SIZE_PER_LEVEL,
  ERA3_SCIENCE_UNIT_REQS, ERA3_WAR_ATTACK_PER_LEVEL,
  recruitsPerTurn, maxStackSize, scienceAllowsUnit,
  UNIT_DEFINITIONS,
} from '@war-of-gods/engine';
import type { TechType, UnitType, HexCoord, EraCard, CardEffect, CombatEntry, Stack, Player, RuinsLootEntry } from '@war-of-gods/engine';
import type { Translations } from '../i18n/es.js';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../stores/gameStore.js';
import { useI18n } from '../i18n/index.js';
import { Era3HexMap3D, type HexContextAction } from '../components/era3/Era3HexMap3D.js';
import { HexInspectorPanel } from '../components/era3/HexInspectorPanel.js';
import { ArmyPanel } from '../components/era3/ArmyPanel.js';
import type { Hex } from '@war-of-gods/engine';

const TECH_ICONS: Record<TechType, string> = {
  war: '⚔️',
  science: '🔬',
  resources: '🌾',
  economy: '💰',
};

const UNIT_ICONS: Record<UnitType, string> = {
  infantry: '🛡️',
  ranged: '🏹',
  mounted: '🐎',
  siege: '🏰',
  flying: '🦅',
};

export function Era3Screen() {
  const { gameState, localPlayerId, dispatch, runBots, setScreen } = useGameStore(
    useShallow(s => ({
      gameState: s.gameState,
      localPlayerId: s.localPlayerId,
      dispatch: s.dispatch,
      runBots: s.runBots,
      setScreen: s.setScreen,
    })),
  );
  const t = useI18n(s => s.t);

  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [buildingRoad, setBuildingRoad] = useState(false);
  const [inspected, setInspected] = useState<{ hex: Hex; stack: Stack | null } | null>(null);
  const [ruinsModal, setRuinsModal] = useState<RuinsLootEntry | null>(null);
  const [escMenu, setEscMenu] = useState(false);
  const shownRuinsRef = useRef<number>(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (buildingRoad) { setBuildingRoad(false); return; }
        if (selectedStackId) { setSelectedStackId(null); return; }
        setEscMenu(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [buildingRoad, selectedStackId]);

  const player = useMemo(
    () => gameState?.players.find(p => p.id === localPlayerId),
    [gameState?.players, localPlayerId],
  );

  const activePlayerId = gameState?.era3CurrentPlayerId ?? null;
  const activePlayer = useMemo(
    () => gameState?.players.find(p => p.id === activePlayerId) ?? null,
    [gameState?.players, activePlayerId],
  );
  const isMyTurn = !!localPlayerId && activePlayerId === localPlayerId;

  // Run bots when it's a bot's turn in game_loop or final_heroic_turn.
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.era3Phase;
    if (phase !== 'game_loop' && phase !== 'final_heroic_turn') return;
    if (!activePlayer?.isBot) return;
    runBots();
  }, [gameState, activePlayer, runBots]);

  // Show ruins reward modal when new loot entries appear for local player.
  useEffect(() => {
    if (!gameState?.era3RuinsLog || !localPlayerId) return;
    const log = gameState.era3RuinsLog;
    if (log.length > shownRuinsRef.current) {
      const newEntries = log.slice(shownRuinsRef.current);
      shownRuinsRef.current = log.length;
      const mine = newEntries.filter(e => e.playerId === localPlayerId);
      if (mine.length > 0) setRuinsModal(mine[mine.length - 1]);
    }
  }, [gameState?.era3RuinsLog, localPlayerId]);

  if (!gameState || !player) return null;

  const race = getRaceById(player.raceId);
  const era3 = player.era3State;
  const techLevels = era3?.techLevels ?? player.era2State?.techLevels;
  const goldCoins = era3?.goldCoins ?? player.era2State?.goldCoins ?? 0;
  const map = gameState.map;
  const stacks = gameState.era3Stacks ?? {};

  const playerStack = Object.values(stacks).find(s => s.ownerId === player.id) ?? null;

  const selectedStack = selectedStackId ? stacks[selectedStackId] ?? null : null;

  const selectedStackAdjacentEnemies = useMemo(() => {
    if (!selectedStack || !map) return [] as { coord: HexCoord; stack: Stack }[];
    const hasSiege = selectedStack.units.some(u => u.type === 'siege' && !u.hasAttackedThisTurn);
    const seen = new Set<string>();
    const out: { coord: HexCoord; stack: Stack }[] = [];
    const addIfEnemy = (coord: HexCoord) => {
      const k = hexKey(coord);
      if (seen.has(k)) return;
      seen.add(k);
      const h = map.hexes[k];
      if (!h?.stackId) return;
      const s = stacks[h.stackId];
      if (s && s.ownerId === DHAKHAN_OWNER_ID) out.push({ coord, stack: s });
    };
    for (const n of neighbors(selectedStack.position)) addIfEnemy(n);
    if (hasSiege) {
      for (const n1 of neighbors(selectedStack.position)) {
        for (const n2 of neighbors(n1)) {
          if (distance(selectedStack.position, n2) === 2) addIfEnemy(n2);
        }
      }
    }
    return out;
  }, [selectedStack, map, stacks]);

  const recruitsThisTurn = era3?.recruitsThisTurn ?? 0;
  const roadsBuiltThisTurn = era3?.roadsBuiltThisTurn ?? 0;
  const maxRecruitsThisTurn = player ? recruitsPerTurn(player) : ERA3_RECRUITS_PER_TURN;
  const recruitedThisTurn = recruitsThisTurn >= maxRecruitsThisTurn;
  const roadBuiltThisTurn = roadsBuiltThisTurn >= ERA3_ROADS_PER_TURN;

  const anyStackCanAct = useMemo(() => {
    if (!isMyTurn) return false;
    return Object.values(stacks).some(s => {
      if (s.ownerId !== localPlayerId) return false;
      if (s.movementLeft > 0) return true;
      return s.units.some(u => !u.hasAttackedThisTurn);
    });
  }, [stacks, isMyTurn, localPlayerId]);

  const unitSummary = useMemo(() => {
    if (!playerStack) return [] as { type: UnitType; count: number }[];
    const counts = new Map<UnitType, number>();
    for (const u of playerStack.units) {
      counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
    }
    return [...counts.entries()].map(([type, count]) => ({ type, count }));
  }, [playerStack]);

  const handleStartGameLoop = () => {
    dispatch({ type: 'START_ERA3_GAME_LOOP' });
  };

  const handleEndTurn = () => {
    if (!localPlayerId) return;
    dispatch({ type: 'END_TURN', playerId: localPlayerId });
  };

  const handleMoveStack = (stackId: string, path: HexCoord[]) => {
    if (!localPlayerId) return;
    dispatch({ type: 'MOVE_STACK', playerId: localPlayerId, stackId, path });
    setSelectedStackId(null);
  };

  const handleAttackStack = (attackerStackId: string, targetCoord: HexCoord) => {
    if (!localPlayerId) return;
    dispatch({ type: 'ATTACK_STACK', playerId: localPlayerId, attackerStackId, targetCoord });
    setSelectedStackId(null);
  };

  const handleRecruit = (unitType: UnitType) => {
    if (!localPlayerId) return;
    dispatch({ type: 'RECRUIT_UNIT', playerId: localPlayerId, unitType });
  };

  const handlePlayCard = (cardId: string) => {
    if (!localPlayerId) return;
    dispatch({ type: 'PLAY_ERA3_CARD', playerId: localPlayerId, cardId });
  };

  const expectedIncome = useMemo(() => {
    if (!era3) return 0;
    return ERA3_BASE_INCOME + (era3.techLevels.economy ?? 0);
  }, [era3]);

  const recruitValidations = useMemo(() => {
    if (!gameState || !localPlayerId) return {} as Record<UnitType, ReturnType<typeof validateRecruit>>;
    const out = {} as Record<UnitType, ReturnType<typeof validateRecruit>>;
    (Object.keys(ERA3_RECRUIT_COSTS) as UnitType[]).forEach(ut => {
      out[ut] = validateRecruit(gameState, localPlayerId, ut);
    });
    return out;
  }, [gameState, localPlayerId]);

  const inHeroic = gameState.era3Phase === 'final_heroic_turn';
  const inGameLoop = gameState.era3Phase === 'game_loop' || inHeroic;
  const awaitingStart = gameState.era3Phase === 'awaiting_next_session';
  const isVictory = gameState.era3Phase === 'victory';
  const isDefeat = gameState.era3Phase === 'defeat';
  const combatLog = gameState.era3CombatLog ?? [];

  // Track recently-resolved combats so the 3D map can render brief impact bursts.
  const lastCombatLenRef = useRef<number>(combatLog.length);
  const [recentCombats, setRecentCombats] = useState<Array<{ q: number; r: number; id: string }>>([]);
  useEffect(() => {
    const prev = lastCombatLenRef.current;
    if (combatLog.length > prev) {
      const added = combatLog.slice(prev).map((e, i) => ({
        q: e.at.q,
        r: e.at.r,
        id: `${prev + i}-${e.at.q},${e.at.r}-${e.turnNumber ?? 0}`,
      }));
      setRecentCombats(cur => [...cur, ...added]);
      const ids = new Set(added.map(a => a.id));
      const timeout = setTimeout(() => {
        setRecentCombats(cur => cur.filter(c => !ids.has(c.id)));
      }, 900);
      lastCombatLenRef.current = combatLog.length;
      return () => clearTimeout(timeout);
    }
    lastCombatLenRef.current = combatLog.length;
  }, [combatLog]);
  const isEliminated = !!era3?.eliminated;

  const canStartBuildRoad =
    isMyTurn &&
    !isEliminated &&
    gameState.era3Phase === 'game_loop' &&
    !roadBuiltThisTurn &&
    goldCoins >= ERA3_BUILD_ROAD_COST;

  // Reset build mode when turn changes / conditions invalidate it.
  useEffect(() => {
    if (!canStartBuildRoad && buildingRoad) setBuildingRoad(false);
  }, [canStartBuildRoad, buildingRoad]);

  const eligibleRoadHexes = useMemo(() => {
    if (!buildingRoad || !localPlayerId || !map) return new Set<string>();
    const out = new Set<string>();
    for (const h of Object.values(map.hexes)) {
      if (validateBuildRoad(gameState, localPlayerId, h.coord) === null) {
        out.add(hexKey(h.coord));
      }
    }
    return out;
  }, [buildingRoad, localPlayerId, map, gameState]);

  const handleBuildRoad = (coord: HexCoord) => {
    if (!localPlayerId) return;
    dispatch({ type: 'BUILD_ROAD', playerId: localPlayerId, coord });
    setBuildingRoad(false);
  };

  const recruitableUnits = useMemo((): UnitType[] => {
    if (!isMyTurn || !gameState || !localPlayerId || recruitedThisTurn) return [];
    return (Object.keys(ERA3_RECRUIT_COSTS) as UnitType[]).filter(ut => {
      const v = validateRecruit(gameState, localPlayerId, ut);
      return v.ok;
    });
  }, [isMyTurn, gameState, localPlayerId, recruitedThisTurn]);

  const handleHexContextAction = (action: HexContextAction) => {
    if (!localPlayerId) return;
    if (action.kind === 'build_road') {
      dispatch({ type: 'BUILD_ROAD', playerId: localPlayerId, coord: action.coord });
    } else if (action.kind === 'recruit') {
      dispatch({ type: 'RECRUIT_UNIT', playerId: localPlayerId, unitType: action.unitType });
    } else if (action.kind === 'rest_stack') {
      dispatch({ type: 'REST_STACK', playerId: localPlayerId, stackId: action.stackId });
    } else if (action.kind === 'fortify_stack') {
      dispatch({ type: 'FORTIFY_STACK', playerId: localPlayerId, stackId: action.stackId });
    } else if (action.kind === 'unfortify_stack') {
      dispatch({ type: 'UNFORTIFY_STACK', playerId: localPlayerId, stackId: action.stackId });
    } else if (action.kind === 'disband_unit') {
      dispatch({ type: 'DISBAND_UNIT', playerId: localPlayerId, stackId: action.stackId, unitId: action.unitId });
    } else if (action.kind === 'terraform') {
      dispatch({ type: 'TERRAFORM', playerId: localPlayerId, stackId: action.stackId, coord: action.coord });
    } else if (action.kind === 'build_road_overlay') {
      dispatch({ type: 'BUILD_ROAD_OVERLAY', playerId: localPlayerId, stackId: action.stackId, coord: action.coord });
    } else if (action.kind === 'drain_water') {
      dispatch({ type: 'DRAIN_WATER', playerId: localPlayerId, stackId: action.stackId, coord: action.coord });
    } else if (action.kind === 'build_bridge') {
      dispatch({ type: 'BUILD_BRIDGE', playerId: localPlayerId, stackId: action.stackId, coord: action.coord });
    }
  };
  const bossKillerId = gameState.era3BossKillerId ?? null;
  const bossKiller = bossKillerId ? gameState.players.find(p => p.id === bossKillerId) : null;
  const worldCard = gameState.worldCardEra3 ?? null;
  const hand = (localPlayerId && gameState.era3Hands?.[localPlayerId]) || [];
  const deckSize = gameState.era3Deck?.length ?? 0;
  const cardAlreadyPlayed = !!(localPlayerId && gameState.era3CardPlayedThisTurn?.[localPlayerId]);

  const formatEffect = (e: CardEffect): string => {
    const effects = t.era3.cardEffects as Record<string, string>;
    const tpl = effects[e.type] ?? e.type;
    const unitName = (ut: UnitType) => t.units[ut];
    switch (e.type) {
      case 'era3_attack_boost':
      case 'era3_extra_movement':
      case 'era3_global_passive_atk':
        return tpl.replace('{bonus}', String(e.bonus));
      case 'era3_gold_bonus':
        return tpl.replace('{amount}', String(e.amount));
      case 'era3_free_recruit':
        return tpl.replace('{unit}', unitName(e.unit));
      default:
        return tpl;
    }
  };

  if (isVictory || isDefeat) {
    return (
      <div className="min-h-screen bg-game-bg bg-radial-theme flex items-center justify-center p-6">
        <div
          className={`relative max-w-md w-full rounded-2xl border p-6 sm:p-8 text-center space-y-5 backdrop-blur-sm animate-scale-in ${
            isVictory
              ? 'border-game-gold/70 bg-gradient-to-br from-game-gold/15 via-game-gold/5 to-transparent shadow-gold-md'
              : 'border-game-accent/70 bg-gradient-to-br from-game-accent/15 via-game-accent/5 to-transparent shadow-accent'
          }`}
        >
          <div className="text-6xl drop-shadow-lg">{isVictory ? '👑' : '💀'}</div>
          <div className="space-y-1.5">
            <h1
              className={`text-3xl font-bold tracking-tight ${
                isVictory ? 'text-game-gold animate-title-glow' : 'text-game-accent'
              }`}
            >
              {isVictory ? t.era3.victoryTitle : t.era3.defeatTitle}
            </h1>
            <p className="text-text-secondary text-sm">
              {isVictory ? t.era3.victorySubtitle : t.era3.defeatSubtitle}
            </p>
          </div>
          {isVictory && bossKiller && (
            <div className="panel-accent text-left flex items-center gap-3">
              <div className="text-2xl">🏆</div>
              <div className="flex-1 min-w-0">
                <div className="eyebrow">{t.era3.bossKiller}</div>
                <div className="text-lg font-bold text-game-gold truncate">{bossKiller.name}</div>
                <div className="text-xs text-text-muted">
                  {t.races[bossKiller.raceId as keyof typeof t.races]}
                </div>
              </div>
            </div>
          )}
          <button type="button" onClick={() => setScreen('menu')} className="btn btn-ghost w-full">
            {t.era3.backToMenu}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="era3-screen" className="min-h-screen bg-game-bg bg-radial-theme relative overflow-hidden">
      {/* Escape menu overlay */}
      {escMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEscMenu(false)}>
          <div className="relative bg-game-surface/95 border border-border-subtle rounded-2xl p-6 w-72 space-y-3 shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-game-gold text-center animate-title-glow">{t.era3.title}</h2>
            <p className="text-text-secondary text-xs text-center">{inGameLoop ? (isMyTurn ? t.era3.yourTurn : `${t.era3.turnOf} ${activePlayer?.name ?? ''}`) : (gameState.era3Phase ? t.era3.phases[gameState.era3Phase] : '')}</p>
            <div className="space-y-2 pt-2">
              <button type="button" className="btn btn-ghost w-full" onClick={() => setEscMenu(false)}>
                {t.escMenu.resume}
              </button>
              {isMyTurn && inGameLoop && !isEliminated && (
                <button type="button" className="btn btn-ghost w-full" onClick={() => { setEscMenu(false); handleEndTurn(); }}>
                  {t.era3.endTurn}
                </button>
              )}
              <hr className="border-border-subtle" />
              <button type="button" className="btn btn-ghost w-full text-game-ember" onClick={() => { setEscMenu(false); setScreen('menu'); }}>
                {t.escMenu.backToMenu}
              </button>
              <button type="button" className="btn btn-danger w-full" onClick={() => { setEscMenu(false); setScreen('menu'); }}>
                {t.escMenu.abandon}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-game-accent/[0.05] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-game-ember/[0.05] rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row gap-0 h-screen overflow-hidden">
        {/* Sidebar — reorganized for clarity:
           1. Status strip (turn + movement + gold + hand) — always visible, compact
           2. "Mi turno" section — all actions grouped (card, recruit, road, checklist, end turn)
           3. Selected stack — conditional, always-visible when relevant
           4. "Mi reino" — race, tech, army (less urgent reference info)
           5. "El mundo" — world card + doom (boss) context
           6. "Crónica" — combat log
           All collapsible sections default open when relevant; collapsed otherwise.
        */}
        <aside className="w-full lg:w-64 xl:w-72 shrink-0 overflow-y-auto p-2 space-y-2 border-r border-border-subtle bg-game-surface/20">
          <header className="text-center lg:text-left">
            <h2 className="text-xl font-bold text-game-gold animate-title-glow">{t.era3.title}</h2>
            {gameState.era3Phase && (
              <div className="mt-1">
                <span className="chip-gold">{t.era3.phases[gameState.era3Phase]}</span>
              </div>
            )}
          </header>

          {inHeroic && (
            <div className="panel-danger">
              <div className="text-game-ember text-[11px] uppercase tracking-wider font-bold">
                {t.era3.heroicTurnBanner}
              </div>
              <div className="text-text-primary text-sm mt-1">{t.era3.heroicTurnDescription}</div>
            </div>
          )}

          {/* Awaiting-start gate */}
          {awaitingStart && (
            <button type="button" onClick={handleStartGameLoop} className="btn btn-primary w-full">
              {t.era3.startGameLoop}
            </button>
          )}

          {/* Eliminated banner */}
          {isEliminated && (
            <div className="rounded-xl p-3 text-center border border-red-500/40 bg-red-900/20">
              <div className="text-red-300 text-[11px] uppercase tracking-wider font-semibold">
                {t.era3.eliminated}
              </div>
            </div>
          )}

          {/* ── Fused Turn + Actions panel ── */}
          {inGameLoop && activePlayer && (
            <div className={`rounded-xl border overflow-hidden ${isMyTurn
              ? 'border-game-gold/60 bg-game-gold/5 shadow-gold-sm'
              : 'border-border-subtle bg-game-surface/40'}`}
            >
              {/* Turn header row */}
              <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="eyebrow">
                    {inHeroic ? t.era3.heroicTurn : `${t.era3.turn} ${gameState.era3TurnNumber ?? 1}`}
                  </div>
                  <div className="text-text-primary text-sm font-bold truncate">
                    {isMyTurn ? t.era3.yourTurn : `${t.era3.turnOf} ${activePlayer.name}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" style={{ color: race.color }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: race.color }} />
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">
                    {t.races[player.raceId as keyof typeof t.races]}
                  </span>
                </div>
              </div>

              {/* Gold — large, prominent */}
              <div className="mx-3 mb-2 rounded-lg border border-game-gold/40 bg-game-gold/10 px-3 py-2 flex items-center gap-3">
                <span className="text-2xl">💰</span>
                <div className="flex-1 min-w-0">
                  <div className="text-game-gold font-black text-2xl tabular-nums leading-none">
                    {goldCoins}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {t.era3.quickStats.gold}
                    {!isEliminated && (
                      <span className="ml-1.5 text-emerald-400 font-semibold">+{expectedIncome} / {t.era3.turn.toLowerCase()}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Secondary stats row */}
              <div className="grid grid-cols-3 gap-1.5 px-3 pb-3 text-center">
                <QuickStat
                  icon="🃏"
                  label={t.era3.quickStats.hand}
                  value={hand.length}
                  sub={`/${deckSize}`}
                />
                <QuickStat
                  icon="⚔️"
                  label={t.era3.quickStats.army}
                  value={playerStack?.units.length ?? 0}
                />
                <QuickStat
                  icon="👣"
                  label={t.era3.movementLeft}
                  value={isMyTurn ? (playerStack?.movementLeft ?? 0) : 0}
                  dim={!isMyTurn}
                />
              </div>

              {/* ── My turn actions — only shown when it's my turn ── */}
              {isMyTurn && !isEliminated && (
                <div className="border-t border-game-gold/20 px-3 py-3 space-y-3">
                  {/* Checklist */}
                  <ul className="space-y-0.5 text-xs bg-game-bg/40 rounded-lg p-2 border border-border-subtle">
                    <ChecklistItem
                      label={t.era3.checklist.playCard}
                      done={cardAlreadyPlayed}
                      available={hand.length > 0}
                    />
                    <ChecklistItem
                      label={`${t.era3.checklist.recruit} (${recruitsThisTurn}/${player ? recruitsPerTurn(player) : ERA3_RECRUITS_PER_TURN})`}
                      done={recruitedThisTurn}
                      available={Object.values(recruitValidations).some(v => v.ok)}
                    />
                    <ChecklistItem
                      label={t.era3.checklist.moveOrAttack}
                      done={false}
                      available={anyStackCanAct}
                    />
                  </ul>

                  {/* Recruit */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="eyebrow">{t.era3.recruit}</div>
                      {recruitedThisTurn && (
                        <span className="text-text-muted text-[9px] italic">{t.era3.alreadyPlayed}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(ERA3_RECRUIT_COSTS) as UnitType[]).map(ut => {
                        const v = recruitValidations[ut];
                        const ok = v?.ok === true;
                        const cost = ERA3_RECRUIT_COSTS[ut];
                        const scienceReq = ERA3_SCIENCE_UNIT_REQS[ut] ?? 0;
                        const scienceLocked = player && !scienceAllowsUnit(player, ut);
                        const tooExpensive = !scienceLocked && !ok && goldCoins < cost && !recruitedThisTurn;
                        const sciLockLabel = t.tech.scienceLocked.replace('{req}', String(scienceReq));
                        return (
                          <button
                            key={ut}
                            type="button"
                            onClick={() => handleRecruit(ut)}
                            disabled={!ok}
                            title={scienceLocked ? sciLockLabel : undefined}
                            className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 border text-left ${
                              ok
                                ? 'bg-emerald-500/10 border-emerald-400/30 hover:bg-emerald-500/20'
                                : scienceLocked
                                ? 'bg-game-bg/40 border-purple-900/40 opacity-60 cursor-not-allowed'
                                : tooExpensive
                                ? 'bg-game-bg/40 border-red-900/40 opacity-60 cursor-not-allowed'
                                : 'bg-game-bg/40 border-border-subtle opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <span className="text-base">{scienceLocked ? '🔬' : UNIT_ICONS[ut]}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-text-primary text-[11px] font-semibold">{t.units[ut]}</div>
                              {scienceLocked ? (
                                <div className="text-[10px] text-purple-400">{sciLockLabel}</div>
                              ) : (
                                <div className={`text-[10px] tabular-nums ${goldCoins < cost ? 'text-red-400' : 'text-game-gold'}`}>
                                  💰 {cost}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Build road */}
                  {gameState.era3Phase === 'game_loop' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="eyebrow">{t.era3.buildRoad.title} ({roadsBuiltThisTurn}/3)</div>
                        <div className={`text-[10px] font-semibold tabular-nums ${goldCoins < ERA3_BUILD_ROAD_COST ? 'text-red-400' : 'text-game-gold'}`}>
                          💰 {ERA3_BUILD_ROAD_COST}
                        </div>
                      </div>
                      {buildingRoad ? (
                        <div className="rounded-lg border border-game-gold/40 bg-game-gold/5 p-2">
                          <div className="text-text-primary text-xs mb-2">{t.era3.buildRoad.active}</div>
                          <button
                            type="button"
                            onClick={() => setBuildingRoad(false)}
                            className="btn-sm btn-ghost w-full uppercase tracking-wider"
                          >
                            {t.era3.buildRoad.cancel}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setBuildingRoad(true)}
                          disabled={!canStartBuildRoad}
                          className="btn-sm btn-primary w-full uppercase tracking-wider"
                        >
                          {t.era3.buildRoad.build}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Selected stack */}
                  {selectedStack && (
                    <SelectedStackPanel
                      stack={selectedStack}
                      adjacentEnemies={selectedStackAdjacentEnemies}
                      onAttack={handleAttackStack}
                      onDeselect={() => setSelectedStackId(null)}
                      t={t}
                    />
                  )}

                  {/* End turn — prominent at bottom */}
                  <button
                    type="button"
                    onClick={handleEndTurn}
                    className="btn btn-danger w-full"
                  >
                    {t.era3.endTurn}
                  </button>
                </div>
              )}

              {/* Spectating: show selected stack info when not my turn */}
              {!isMyTurn && selectedStack && (
                <div className="border-t border-border-subtle px-3 pb-3 pt-2">
                  <SelectedStackPanel
                    stack={selectedStack}
                    adjacentEnemies={selectedStackAdjacentEnemies}
                    onAttack={handleAttackStack}
                    onDeselect={() => setSelectedStackId(null)}
                    t={t}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Section: Mi reino (race, tech, army) ── */}
          <Section title={t.era3.sections.kingdom} icon="🏰" defaultOpen={!inGameLoop || !isMyTurn}>
            <div className="space-y-3">
              {techLevels && era3 && (
                <div>
                  <div className="eyebrow mb-1.5">{t.era3.techUpgrade.title}</div>
                  <div className="space-y-1.5">
                    {TECH_TYPES.map(tech => {
                      const current = techLevels[tech] ?? 0;
                      const maxLevel = 5;
                      const atMax = current >= maxLevel;
                      const nextLevel = current + 1;
                      const baseCost = atMax ? 0 : getIncrementalCost(tech, nextLevel);
                      const goldCost = atMax ? 0 : Math.ceil(baseCost * ERA3_TECH_UPGRADE_MULTIPLIER);
                      const canAfford = goldCoins >= goldCost;
                      const canUpgrade = isMyTurn && inGameLoop && !isEliminated && !atMax && canAfford && !!localPlayerId;

                      // Compute current effect label
                      const fx = t.tech.era3Effects[tech];
                      let currentEffect = '';
                      let nextEffect = '';
                      if (tech === 'war') {
                        const wfx = t.tech.era3Effects.war;
                        const curRecruits = ERA3_WAR_RECRUITS_PER_LEVEL[Math.min(current, ERA3_WAR_RECRUITS_PER_LEVEL.length - 1)];
                        const curAtk = ERA3_WAR_ATTACK_PER_LEVEL[Math.min(current, ERA3_WAR_ATTACK_PER_LEVEL.length - 1)];
                        currentEffect = wfx.currentTemplate.replace('{recruits}', String(curRecruits)).replace('{atk}', String(curAtk));
                        if (!atMax) {
                          const nxtRecruits = ERA3_WAR_RECRUITS_PER_LEVEL[Math.min(nextLevel, ERA3_WAR_RECRUITS_PER_LEVEL.length - 1)];
                          const nxtAtk = ERA3_WAR_ATTACK_PER_LEVEL[Math.min(nextLevel, ERA3_WAR_ATTACK_PER_LEVEL.length - 1)];
                          nextEffect = wfx.nextTemplate.replace('{recruits}', String(nxtRecruits)).replace('{atk}', String(nxtAtk));
                        }
                      } else if (tech === 'science') {
                        const sfx = t.tech.era3Effects.science;
                        const UNIT_ORDER: UnitType[] = ['infantry', 'ranged', 'mounted', 'siege', 'flying'];
                        const unlockedNow = UNIT_ORDER.filter(u => (ERA3_SCIENCE_UNIT_REQS[u] ?? 0) <= current);
                        currentEffect = sfx.currentTemplate.replace('{units}', unlockedNow.map(u => t.units[u]).join(', '));
                        if (!atMax) {
                          const nextUnlocked = UNIT_ORDER.find(u => (ERA3_SCIENCE_UNIT_REQS[u] ?? 0) === nextLevel);
                          nextEffect = nextUnlocked ? sfx.nextTemplate.replace('{unit}', t.units[nextUnlocked]) : '';
                        }
                      } else if (tech === 'resources') {
                        const rfx = t.tech.era3Effects.resources;
                        const curSize = ERA3_RESOURCES_STACK_SIZE_PER_LEVEL[Math.min(current, ERA3_RESOURCES_STACK_SIZE_PER_LEVEL.length - 1)];
                        currentEffect = rfx.currentTemplate.replace('{size}', String(curSize));
                        if (!atMax) {
                          const nxtSize = ERA3_RESOURCES_STACK_SIZE_PER_LEVEL[Math.min(nextLevel, ERA3_RESOURCES_STACK_SIZE_PER_LEVEL.length - 1)];
                          nextEffect = rfx.nextTemplate.replace('{size}', String(nxtSize));
                        }
                      } else if (tech === 'economy') {
                        const efx = t.tech.era3Effects.economy;
                        const curIncome = ERA3_BASE_INCOME + current;
                        currentEffect = efx.currentTemplate.replace('{income}', String(curIncome));
                        if (!atMax) {
                          const nxtIncome = ERA3_BASE_INCOME + nextLevel;
                          nextEffect = efx.nextTemplate.replace('{income}', String(nxtIncome));
                        }
                      }

                      return (
                        <div
                          key={tech}
                          className="bg-game-bg/60 border border-border-subtle rounded-lg p-2 group relative"
                          title={fx.desc}
                        >
                          {/* Header row: icon + name + level pips + upgrade button */}
                          <div className="flex items-center gap-2">
                            <span className="text-base shrink-0">{TECH_ICONS[tech]}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-text-secondary text-[10px] uppercase tracking-wider font-semibold">{t.tech[tech]}</span>
                                <span className="text-game-gold font-bold text-sm tabular-nums">{current}</span>
                                <div className="flex gap-0.5">
                                  {Array.from({ length: maxLevel }).map((_, i) => (
                                    <div key={i} className={`w-2 h-2 rounded-sm ${i < current ? 'bg-game-gold' : 'bg-border-subtle'}`} />
                                  ))}
                                </div>
                              </div>
                            </div>
                            {!atMax ? (
                              <button
                                type="button"
                                disabled={!canUpgrade}
                                onClick={() => localPlayerId && dispatch({ type: 'ERA3_UPGRADE_TECH', playerId: localPlayerId, tech })}
                                className={`shrink-0 text-[9px] rounded px-1.5 py-1 border font-bold transition-colors ${
                                  canUpgrade
                                    ? 'border-game-gold/50 bg-game-gold/10 text-game-gold hover:bg-game-gold/20'
                                    : canAfford
                                    ? 'border-border-subtle bg-transparent text-text-muted opacity-60 cursor-not-allowed'
                                    : 'border-red-900/40 bg-transparent text-red-400 opacity-70 cursor-not-allowed'
                                }`}
                              >
                                +1 <span className={canAfford ? 'text-game-gold' : 'text-red-400'}>💰{goldCost}</span>
                              </button>
                            ) : (
                              <span className="text-emerald-400 text-[9px] shrink-0 font-semibold">MAX</span>
                            )}
                          </div>

                          {/* Current effect */}
                          <div className="mt-1 text-[10px] text-text-secondary">
                            {currentEffect}
                          </div>

                          {/* Next level preview */}
                          {nextEffect && (
                            <div className="mt-0.5 text-[10px] text-game-gold/70">
                              {nextEffect}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="eyebrow mb-1.5">{t.era3.deployment}</div>
                {unitSummary.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {unitSummary.map(g => (
                      <div
                        key={g.type}
                        className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-400/30 rounded-md px-1.5 py-1"
                      >
                        <span className="text-sm">{UNIT_ICONS[g.type]}</span>
                        <span className="text-emerald-400 font-bold text-[11px] tabular-nums">×{g.count}</span>
                        <span className="text-text-secondary text-[10px]">{t.units[g.type]}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-text-muted text-xs italic">{t.era3.noUnits}</div>
                )}

                {era3?.initialDeploymentOverflow && era3.initialDeploymentOverflow.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border-subtle">
                    <div className="text-game-accent text-[10px] uppercase tracking-wider font-semibold mb-1">
                      {t.era3.overflowWarning}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {era3.initialDeploymentOverflow.map((g, i) => (
                        <span key={i} className="text-text-muted text-xs">
                          {UNIT_ICONS[g.unit]} ×{g.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* ── Section: Ejército — stacks + generals ── */}
          {inGameLoop && gameState && localPlayerId && (
            <Section title={t.era3.army} icon="🎖️" defaultOpen={isMyTurn}>
              <ArmyPanel
                gameState={gameState}
                localPlayerId={localPlayerId}
                goldCoins={goldCoins}
                recruitsThisTurn={recruitsThisTurn}
                roadsBuiltThisTurn={roadsBuiltThisTurn}
                isMyTurn={isMyTurn}
                onAssignGeneral={(generalId, stackId) =>
                  dispatch({ type: 'ASSIGN_GENERAL', playerId: localPlayerId, generalId, stackId })
                }
                onUnassignGeneral={(stackId) =>
                  dispatch({ type: 'UNASSIGN_GENERAL', playerId: localPlayerId, stackId })
                }
                onSplitStack={(stackId, unitIds) =>
                  dispatch({ type: 'SPLIT_STACK', playerId: localPlayerId, stackId, unitIds })
                }
              />
            </Section>
          )}

          <button type="button" onClick={() => setScreen('menu')} className="btn btn-ghost w-full text-xs">
            {t.era3.backToMenu}
          </button>
        </aside>

        {/* Map — center column, fills all remaining space */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border-subtle shrink-0">
            <h3 className="text-game-gold font-bold text-xs uppercase tracking-wider">{t.era3.mapTitle}</h3>
            <div className="flex items-center gap-2 text-[9px] text-text-muted">
              <span className="flex items-center gap-0.5"><span className="text-game-gold">♚</span>{t.era3.legend.capital}</span>
              <span className="flex items-center gap-0.5"><span className="text-game-accent">☠</span>{t.era3.legend.spawnZone}</span>
              <span className="flex items-center gap-0.5"><span className="text-game-gold">🏯</span>{t.era3.legend.citadel}</span>
            </div>
          </div>
          {map ? (
            <div className="flex-1 min-h-0 relative">
              <Era3HexMap3D
                map={map}
                stacks={stacks}
                localPlayerId={localPlayerId}
                activePlayerId={activePlayerId}
                selectedStackId={selectedStackId}
                onSelectStack={setSelectedStackId}
                onMoveStack={isMyTurn ? handleMoveStack : undefined}
                onAttackStack={isMyTurn ? handleAttackStack : undefined}
                buildingRoad={buildingRoad}
                eligibleRoadHexes={eligibleRoadHexes}
                onBuildRoad={isMyTurn ? handleBuildRoad : undefined}
                onCancelBuildRoad={() => setBuildingRoad(false)}
                onInspectHex={(hex, stack) => setInspected({ hex, stack })}
                recentCombats={recentCombats}
                onHexContextAction={isMyTurn && !isEliminated ? handleHexContextAction : undefined}
                recruitableUnits={isMyTurn && !isEliminated ? recruitableUnits : undefined}
                canBuildRoad={isMyTurn && !isEliminated && canStartBuildRoad}
              />
              {inspected && (
                <HexInspectorPanel
                  hex={inspected.hex}
                  stack={inspected.stack}
                  players={gameState.players}
                  onClose={() => setInspected(null)}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              {t.era3.phases.map_generation}…
            </div>
          )}
        </main>

        {/* Right panel — hand/cards + world card + combat log */}
        <aside className="w-full lg:w-56 xl:w-64 shrink-0 overflow-y-auto p-2 space-y-2 border-l border-border-subtle bg-game-surface/20">
          {/* Hand */}
          {inGameLoop && (
            <Section title={t.era3.hand} icon="🃏" defaultOpen badge={hand.length > 0 ? String(hand.length) : undefined}>
              {hand.length === 0 ? (
                <div className="text-text-muted text-xs italic">{t.era3.handEmpty}</div>
              ) : (
                <ul className="space-y-1.5">
                  {hand.map((card: EraCard) => {
                    const canPlay = isMyTurn && !cardAlreadyPlayed;
                    return (
                      <li key={card.id} className="bg-game-bg/60 border border-border-subtle rounded-lg p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-text-primary font-semibold text-xs">{card.name}</div>
                            {card.effects.map((e, i) => (
                              <div key={i} className="text-text-secondary text-[10px]">• {formatEffect(e)}</div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePlayCard(card.id)}
                            disabled={!canPlay}
                            className="btn-sm btn-primary shrink-0 uppercase tracking-wider"
                          >
                            {t.era3.playCard}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {cardAlreadyPlayed && (
                <div className="text-text-muted text-[10px] italic mt-1">{t.era3.alreadyPlayed}</div>
              )}
              <div className="text-text-faint text-[9px] mt-1">{t.era3.deckCount}: {deckSize}</div>
            </Section>
          )}

          {/* World card */}
          {inGameLoop && worldCard && (
            <Section title={t.era3.sections.world} icon="🌍" defaultOpen={false}>
              <div className="rounded-lg border border-game-ember/40 bg-game-ember/5 p-2">
                <div className="text-game-ember text-[10px] uppercase tracking-wider font-semibold mb-1">{t.era3.worldCard}</div>
                <div className="text-text-primary font-bold text-sm">{worldCard.name}</div>
                {worldCard.effects.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {worldCard.effects.map((e, i) => (
                      <li key={i} className="text-text-secondary text-[11px]">• {formatEffect(e)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>
          )}

          {/* Combat log */}
          {inGameLoop && (
            <Section title={t.era3.sections.log} icon="📜" defaultOpen={false} badge={combatLog.length > 0 ? String(combatLog.length) : undefined}>
              {combatLog.length === 0 ? (
                <div className="text-text-muted text-xs italic">{t.era3.noCombatYet}</div>
              ) : (
                <ul className="space-y-2 text-xs">
                  {combatLog.slice(-8).reverse().map((e, i) => (
                    <CombatNarrative key={`${e.turnNumber}-${i}`} entry={e} players={gameState.players} t={t} />
                  ))}
                </ul>
              )}
            </Section>
          )}
        </aside>
      </div>

      {/* Ruins reward modal */}
      {ruinsModal && (() => {
        const r = ruinsModal.reward;
        const rm = t.era3.ruinsModal;
        let icon = '🏛️';
        let message = rm.empty;
        if (r.kind === 'gold') { icon = '💰'; message = rm.gold.replace('{amount}', String(r.amount)); }
        else if (r.kind === 'unit') { icon = '⚔️'; message = rm.unit.replace('{unit}', t.units[r.unit]); }
        else if (r.kind === 'card') { icon = '📜'; message = rm.card; }
        else if (r.kind === 'tech') { icon = '🔬'; message = rm.tech.replace('{tech}', t.tech[r.tech]); }
        else if (r.kind === 'heal') { icon = '✨'; message = rm.heal.replace('{amount}', String(r.amount)); }
        else if (r.kind === 'fortify') { icon = '🛡️'; message = rm.fortify; }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
            <div className="panel-accent max-w-sm w-full text-center space-y-4 animate-scale-in">
              <div className="text-5xl drop-shadow-lg">{icon}</div>
              <div>
                <div className="text-game-gold font-bold text-lg animate-title-glow">{rm.title}</div>
                <div className="text-text-secondary text-sm mt-2">{message}</div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary w-full"
                onClick={() => setRuinsModal(null)}
              >
                {rm.dismiss}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Section({
  title, icon, children, defaultOpen = true, accent = false, badge,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  accent?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-xl border overflow-hidden ${
      accent
        ? 'border-game-gold/40 bg-game-gold/5'
        : 'border-border-subtle bg-game-surface/40'
    }`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-sm shrink-0">{icon}</span>}
          <span className="text-[11px] uppercase tracking-wider font-bold text-text-primary truncate">
            {title}
          </span>
          {badge && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-game-gold/20 text-game-gold text-[10px] font-bold tabular-nums">
              {badge}
            </span>
          )}
        </div>
        <span className={`text-text-muted text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

function QuickStat({
  icon, label, value, sub, dim = false,
}: {
  icon: string;
  label: string;
  value: number | string;
  sub?: string;
  dim?: boolean;
}) {
  return (
    <div className={`bg-game-bg/50 border border-border-subtle rounded-lg px-1 py-1.5 ${dim ? 'opacity-50' : ''}`}>
      <div className="text-sm leading-none mb-0.5">{icon}</div>
      <div className="text-[8px] uppercase tracking-wider text-text-muted leading-none">{label}</div>
      <div className="text-sm font-bold text-game-gold tabular-nums leading-tight">
        {value}
        {sub && <span className="text-[9px] text-text-muted font-normal ml-0.5">{sub}</span>}
      </div>
    </div>
  );
}

function ChecklistItem({
  label, done, available,
}: { label: string; done: boolean; available: boolean }) {
  const icon = done ? '✓' : available ? '•' : '×';
  const color = done
    ? 'text-emerald-400'
    : available
    ? 'text-game-gold'
    : 'text-text-muted';
  return (
    <li className={`flex items-center gap-2 ${color}`}>
      <span className="w-4 text-center font-bold">{icon}</span>
      <span className={done ? 'line-through opacity-70' : ''}>{label}</span>
    </li>
  );
}

function SelectedStackPanel({
  stack,
  adjacentEnemies,
  onAttack,
  onDeselect,
  t,
}: {
  stack: Stack;
  adjacentEnemies: { coord: HexCoord; stack: Stack }[];
  onAttack: (attackerStackId: string, targetCoord: HexCoord) => void;
  onDeselect: () => void;
  t: Translations;
}) {
  const counts = new Map<UnitType, number>();
  let totalHp = 0;
  for (const u of stack.units) {
    counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
    totalHp += u.currentHp;
  }
  const canAttack = stack.units.some(u => !u.hasAttackedThisTurn);
  const canMove = stack.movementLeft > 0;

  return (
    <div className="panel-accent">
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow">{t.era3.stackInfo.title}</div>
        <button
          type="button"
          onClick={onDeselect}
          className="text-text-muted hover:text-text-primary text-xs"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {[...counts.entries()].map(([type, count]) => (
          <div
            key={type}
            className="flex items-center gap-1 bg-game-bg/60 border border-border-subtle rounded-md px-2 py-1"
          >
            <span className="text-sm">{UNIT_ICONS[type]}</span>
            <span className="text-text-primary text-[11px] font-semibold tabular-nums">×{count}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="bg-game-bg/40 rounded-md px-2 py-1">
          <div className="text-text-muted">{t.era3.stackInfo.totalHp}</div>
          <div className="text-game-gold font-bold tabular-nums">{totalHp}</div>
        </div>
        <div className="bg-game-bg/40 rounded-md px-2 py-1">
          <div className="text-text-muted">{t.era3.movementLeft}</div>
          <div className="text-game-gold font-bold tabular-nums">{stack.movementLeft}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-1 text-[9px] uppercase tracking-wider">
        <span className={canMove ? 'text-emerald-400' : 'text-text-muted line-through'}>
          {t.era3.stackInfo.canMove}
        </span>
        <span className="text-text-muted">·</span>
        <span className={canAttack ? 'text-emerald-400' : 'text-text-muted line-through'}>
          {t.era3.stackInfo.canAttack}
        </span>
      </div>
      {adjacentEnemies.length > 0 ? (
        <div className="mt-3 pt-2 border-t border-border-subtle">
          <div className="eyebrow mb-1.5">{t.era3.stackInfo.adjacentEnemies}</div>
          <div className="space-y-1">
            {adjacentEnemies.map((e, i) => {
              const isBoss = e.stack.id === BOSS_STACK_ID;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAttack(stack.id, e.coord)}
                  disabled={!canAttack}
                  className="btn-sm btn-danger w-full flex items-center justify-between gap-2 uppercase tracking-wider"
                >
                  <span className="flex items-center gap-1.5">
                    <span>{isBoss ? '💀' : '☠'}</span>
                    <span>
                      {isBoss ? t.era3.bossLabel : t.era3.wrought}
                      <span className="text-[9px] opacity-70 ml-1">
                        ×{e.stack.units.length}
                      </span>
                    </span>
                  </span>
                  <span>{t.era3.attack}</span>
                </button>
              );
            })}
          </div>
          <div className="text-text-muted text-[9px] italic mt-1.5">
            {t.era3.attackHint}
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-2 border-t border-border-subtle text-text-muted text-[10px] italic">
          {t.era3.stackInfo.noAdjacentEnemies}
        </div>
      )}
    </div>
  );
}

function CombatNarrative({
  entry, players, t,
}: { entry: CombatEntry; players: Player[]; t: Translations }) {
  const nameOf = (ownerId: string) => {
    if (ownerId === DHAKHAN_OWNER_ID) return t.era3.wrought;
    return players.find(p => p.id === ownerId)?.name ?? ownerId;
  };
  const attackerName = nameOf(entry.attackerOwnerId);
  const defenderName = nameOf(entry.defenderOwnerId);
  const flankCount = entry.flankingStackIds?.length ?? 0;
  const verb = entry.kind === 'move_into' ? t.era3.combatNarrative.movedInto : t.era3.combatNarrative.attacked;
  const outcome = entry.defenderWiped
    ? t.era3.combatNarrative.defenderWiped
    : entry.attackerWiped
    ? t.era3.combatNarrative.attackerWiped
    : t.era3.combatNarrative.bothSurvived;
  return (
    <li className="bg-game-bg/40 border border-border-subtle rounded-md p-2 text-[11px] leading-relaxed">
      <div className="flex items-center justify-between mb-1">
        <span className="text-game-gold font-semibold text-[10px] uppercase tracking-wider">
          {t.era3.combatNarrative.turn} {entry.turnNumber}
        </span>
        <span className="text-text-muted text-[9px] tabular-nums">
          ({entry.at.q}, {entry.at.r})
        </span>
      </div>
      <div className="text-text-primary">
        <span className="font-semibold">{attackerName}</span>
        {flankCount > 0 && (
          <span className="text-text-muted">
            {' '}({t.era3.flankingWith} ×{flankCount})
          </span>
        )}{' '}
        {verb}{' '}
        <span className="font-semibold">{defenderName}</span>.
      </div>
      <div className="text-text-secondary mt-1 tabular-nums text-[10px]">
        <span className="text-red-300">⚔ {entry.attackerDamageDealt}</span>
        <span className="mx-1 text-text-muted">·</span>
        <span className="text-red-300">🛡 {entry.defenderDamageDealt}</span>
        <span className="mx-1 text-text-muted">·</span>
        <span>{t.era3.combatNarrative.lost}: </span>
        <span className="text-red-400">{entry.attackerUnitsLost}</span>
        <span className="mx-0.5 text-text-muted">/</span>
        <span className="text-red-400">{entry.defenderUnitsLost}</span>
      </div>
      {outcome && (
        <div className={`mt-1 text-[10px] font-semibold ${
          entry.defenderWiped ? 'text-emerald-400' :
          entry.attackerWiped ? 'text-red-400' :
          'text-text-muted'
        }`}>
          {outcome}
        </div>
      )}
    </li>
  );
}
