import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  getRaceById, TECH_TYPES, RACE_TECH_MAX,
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
import { HexBoard3D } from '../components/HexBoard3D.js';
import { TechPentagon } from '../components/TechPentagon.js';
import type { Hex } from '@war-of-gods/engine';

const UNIT_ICONS: Record<UnitType, string> = {
  infantry: '🛡️',
  ranged: '🏹',
  mounted: '🐎',
  siege: '🏰',
  flying: '🦅',
};

export function Era3Screen() {
  const { gameState, localPlayerId, dispatch, runBots, setScreen, abandonGame, localBoardLayout } = useGameStore(
    useShallow(s => ({
      gameState: s.gameState,
      localPlayerId: s.localPlayerId,
      dispatch: s.dispatch,
      runBots: s.runBots,
      setScreen: s.setScreen,
      abandonGame: s.abandonGame,
      localBoardLayout: s.localBoardLayout,
    })),
  );
  const t = useI18n(s => s.t);
  const fogOfWarEnabled = useI18n(s => s.fogOfWar);

  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [buildingRoad, setBuildingRoad] = useState(false);
  const [inspected, setInspected] = useState<{ hex: Hex; stack: Stack | null } | null>(null);
  const [ruinsModal, setRuinsModal] = useState<RuinsLootEntry | null>(null);
  const [escMenu, setEscMenu] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  // Initialize to current log length so we never re-show ruins from before this session.
  const shownRuinsRef = useRef<number>(gameState?.era3RuinsLog?.length ?? 0);
  const [legendOpen, setLegendOpen] = useState(true);

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

  // Run bots when it's a bot's turn. setTimeout defers one tick so React
  // flushes the render before bots synchronously chain multiple state updates.
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.era3Phase;
    const isAwaitingStart = phase === 'awaiting_next_session';
    const isBotTurn = (phase === 'game_loop' || phase === 'final_heroic_turn') && !!activePlayer?.isBot;
    if (!isAwaitingStart && !isBotTurn) return;
    const id = setTimeout(() => { runBots(); }, 50);
    return () => clearTimeout(id);
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

  const techLockedUnits = useMemo((): UnitType[] => {
    if (!isMyTurn || !player || recruitedThisTurn) return [];
    return (Object.keys(ERA3_RECRUIT_COSTS) as UnitType[]).filter(ut => !scienceAllowsUnit(player, ut));
  }, [isMyTurn, player, recruitedThisTurn]);

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
    } else if (action.kind === 'destroy_spawn_zone') {
      dispatch({ type: 'DESTROY_SPAWN_ZONE', playerId: localPlayerId, stackId: action.stackId, coord: action.coord });
    } else if (action.kind === 'split_stack') {
      if (!gameState.map || !gameState.era3Stacks) return;
      const srcStack = gameState.era3Stacks[action.stackId];
      if (!srcStack) return;
      // Find nearest free adjacent hex for the split-off unit.
      const freeNeighbor = neighbors(srcStack.position).find(n => {
        const h = gameState.map!.hexes[hexKey(n)];
        return h && !h.stackId && h.terrain !== 'lake';
      });
      dispatch({ type: 'SPLIT_STACK', playerId: localPlayerId, stackId: action.stackId, unitIds: [action.unitId] });
      if (freeNeighbor) {
        // The new stack id is derived deterministically in the reducer: `${stackId}_s${seed}`
        // We can't know it here, so we defer the move one tick so state is updated.
        const splitTargetCoord = freeNeighbor;
        setTimeout(() => {
          const updatedState = useGameStore.getState().gameState;
          if (!updatedState?.era3Stacks) return;
          // Find the newly created stack at the same position as srcStack that is NOT the original.
          const newStack = Object.values(updatedState.era3Stacks).find(
            s => s.ownerId === localPlayerId &&
              s.position.q === srcStack.position.q &&
              s.position.r === srcStack.position.r &&
              s.id !== action.stackId &&
              s.units.some(u => u.id === action.unitId),
          );
          if (newStack) {
            useGameStore.getState().dispatch({
              type: 'MOVE_STACK',
              playerId: localPlayerId!,
              stackId: newStack.id,
              path: [srcStack.position, splitTargetCoord],
            });
          }
        }, 0);
      }
    } else if (action.kind === 'merge_stacks') {
      dispatch({ type: 'MERGE_STACKS', playerId: localPlayerId, sourceStackId: action.sourceStackId, targetStackId: action.targetStackId });
    }
  };
  const bossKillerId = gameState.era3BossKillerId ?? null;
  const bossKiller = bossKillerId ? gameState.players.find(p => p.id === bossKillerId) : null;
  const worldCard = gameState.worldCardEra3 ?? null;
  const hand = (localPlayerId && gameState.era3Hands?.[localPlayerId]) || [];
  const deckSize = gameState.era3Deck?.length ?? 0;
  const cardsPlayedThisTurn = (localPlayerId && gameState.era3CardPlayedThisTurn?.[localPlayerId]) || 0;
  const cardAlreadyPlayed = cardsPlayedThisTurn >= 2;
  const cardOffers = (localPlayerId && gameState.era3CardOffers?.[localPlayerId]) || [];

  const formatEffect = (e: CardEffect): string => {
    const effects = t.era3.cardEffects as Record<string, string>;
    const techLabels = t.tech as unknown as Record<string, string>;
    const tpl = effects[e.type] ?? e.type;
    const unitName = (ut: UnitType) => t.units[ut];
    switch (e.type) {
      case 'era3_attack_boost':
      case 'era3_extra_movement':
      case 'era3_global_passive_atk':
      case 'era3_defense_boost':
        return tpl.replace('{bonus}', String(e.bonus));
      case 'era3_gold_bonus':
      case 'era3_food_bonus':
      case 'era3_permanent_gold_income':
      case 'era3_permanent_food_income':
        return tpl.replace('{amount}', String(e.amount));
      case 'era3_heal_all_stacks':
        return e.hpAmount >= 99
          ? tpl.replace('{hpAmount}', '∞')
          : tpl.replace('{hpAmount}', String(e.hpAmount));
      case 'era3_free_recruit':
      case 'era3_free_recruit_two':
        return tpl.replace('{unit}', unitName(e.unit));
      case 'era3_tech_upgrade':
        return tpl.replace('{tech}', techLabels[e.tech] ?? e.tech);
      default:
        return tpl;
    }
  };

  const rarityStyle = (rarity?: string) => {
    if (rarity === 'legendary') return 'border-yellow-400/70 bg-yellow-900/20 shadow-[0_0_8px_rgba(234,179,8,0.3)]';
    if (rarity === 'rare') return 'border-purple-400/60 bg-purple-900/15';
    return 'border-border-subtle bg-game-bg/60';
  };

  const rarityBadge = (rarity?: string) => {
    if (rarity === 'legendary') return <span className="text-yellow-400 text-[9px] font-black uppercase tracking-widest">★ {(t.era3.rarities as Record<string, string>)?.legendary ?? 'Legendaria'}</span>;
    if (rarity === 'rare') return <span className="text-purple-400 text-[9px] font-bold uppercase tracking-wider">◆ {(t.era3.rarities as Record<string, string>)?.rare ?? 'Rara'}</span>;
    return <span className="text-text-faint text-[9px] uppercase tracking-wider">{(t.era3.rarities as Record<string, string>)?.common ?? 'Común'}</span>;
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
          {/* Eternal mode: only on defeat when a turn limit was in place */}
          {isDefeat && (gameState.era3MaxTurns ?? 20) > 0 && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'ERA3_CONTINUE_ETERNAL' })}
              className="btn btn-primary w-full"
            >
              {t.era3.continueEternal ?? 'Continue in eternal mode'}
            </button>
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
              <button type="button" className="btn btn-danger w-full" onClick={() => { setEscMenu(false); setAbandonConfirm(true); }}>
                {t.escMenu.abandon}
              </button>
            </div>
          </div>
        </div>
      )}
      {abandonConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-game-surface/95 border border-red-800/60 rounded-2xl p-6 w-80 space-y-4 shadow-2xl animate-scale-in">
            <h2 className="text-lg font-bold text-red-400 text-center">⚠ {t.escMenu.abandon}</h2>
            <p className="text-text-secondary text-sm text-center">{t.escMenu.abandonConfirm}</p>
            <div className="flex gap-2 pt-2">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setAbandonConfirm(false)}>
                {t.escMenu.resume}
              </button>
              <button
                type="button"
                className="btn btn-danger flex-1"
                onClick={() => { setAbandonConfirm(false); void abandonGame(); }}
              >
                {t.escMenu.abandon}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-game-accent/[0.05] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-game-ember/[0.05] rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row gap-0 h-screen overflow-hidden pt-12">
        <aside className="w-full lg:w-60 xl:w-64 shrink-0 overflow-y-auto p-2 space-y-1.5 border-r border-border-subtle bg-game-surface/20">

          {/* Stats strip: cards, army size, movement */}
          {inGameLoop && (
            <div className="flex gap-1 px-1">
              <StatChip icon="🃏" value={hand.length} sub={`/${deckSize}`} />
              <StatChip icon="⚔️" value={playerStack?.units.length ?? 0} />
              <StatChip icon="👣" value={isMyTurn ? (playerStack?.movementLeft ?? 0) : 0} dim={!isMyTurn} />
            </div>
          )}
          {!inGameLoop && gameState.era3Phase && (
            <div className="px-1">
              <span className="chip-gold text-[9px]">{t.era3.phases[gameState.era3Phase]}</span>
            </div>
          )}

          {/* Heroic banner (compact) */}
          {inHeroic && (
            <div className="rounded-lg border border-game-ember/50 bg-game-ember/10 px-2.5 py-1.5 text-[10px] text-game-ember font-bold uppercase tracking-wider">
              ⚡ {t.era3.heroicTurnBanner}
            </div>
          )}

          {/* Awaiting / eliminated */}
          {awaitingStart && (
            <button type="button" onClick={handleStartGameLoop} className="btn btn-primary w-full">
              {t.era3.startGameLoop}
            </button>
          )}
          {isEliminated && (
            <div className="rounded-lg px-2.5 py-1.5 text-center border border-red-500/40 bg-red-900/20 text-red-300 text-[10px] uppercase tracking-wider font-semibold">
              {t.era3.eliminated}
            </div>
          )}

          {/* ── Mi turno: checklist + recruit + road + end turn ── */}
          {inGameLoop && isMyTurn && !isEliminated && (
            <div className="rounded-xl border border-game-gold/40 bg-game-gold/5 overflow-hidden">
              {/* Checklist inline */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-game-gold/20 text-[10px]">
                <CheckDot done={cardAlreadyPlayed} available={hand.length > 0 || cardOffers.length > 0} label={`Carta ${cardsPlayedThisTurn}/2`} />
                <CheckDot done={recruitedThisTurn} available={Object.values(recruitValidations).some(v => v.ok)} label={`Recluta ${recruitsThisTurn}/${player ? recruitsPerTurn(player) : ERA3_RECRUITS_PER_TURN}`} />
                <CheckDot done={false} available={anyStackCanAct} label="Mover" />
              </div>

              <div className="px-2.5 py-2 space-y-2">
                {/* Recruit — 5 unit buttons in a row */}
                <div>
                  <div className="eyebrow mb-1">{t.era3.recruit}</div>
                  <div className="flex gap-1">
                    {(Object.keys(ERA3_RECRUIT_COSTS) as UnitType[]).map(ut => {
                      const v = recruitValidations[ut];
                      const ok = v?.ok === true;
                      const cost = ERA3_RECRUIT_COSTS[ut];
                      const scienceReq = ERA3_SCIENCE_UNIT_REQS[ut] ?? 0;
                      const scienceLocked = player && !scienceAllowsUnit(player, ut);
                      const sciLockLabel = t.tech.scienceLocked.replace('{req}', String(scienceReq));
                      return (
                        <button
                          key={ut}
                          type="button"
                          onClick={() => handleRecruit(ut)}
                          disabled={!ok}
                          title={scienceLocked ? sciLockLabel : `${t.units[ut]} 💰${cost}`}
                          className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-1.5 border text-center transition-colors ${
                            ok
                              ? 'bg-emerald-500/10 border-emerald-400/30 hover:bg-emerald-500/20'
                              : scienceLocked
                              ? 'bg-game-bg/30 border-purple-900/30 opacity-40 cursor-not-allowed'
                              : 'bg-game-bg/30 border-border-subtle opacity-40 cursor-not-allowed'
                          }`}
                        >
                          <span className="text-sm leading-none">{UNIT_ICONS[ut]}</span>
                          <span className={`text-[8px] tabular-nums font-semibold ${goldCoins < cost && !scienceLocked ? 'text-red-400' : ok ? 'text-game-gold' : 'text-text-muted'}`}>
                            {scienceLocked ? `🔬${scienceReq}` : `💰${cost}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Build road — inline compact */}
                {gameState.era3Phase === 'game_loop' && (
                  buildingRoad ? (
                    <div className="flex items-center gap-2 rounded-lg border border-game-gold/40 bg-game-gold/10 px-2 py-1.5">
                      <span className="text-[10px] text-game-gold flex-1">{t.era3.buildRoad.active}</span>
                      <button type="button" onClick={() => setBuildingRoad(false)} className="btn-sm btn-ghost text-[9px] py-0.5 px-2">
                        {t.era3.buildRoad.cancel}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBuildingRoad(true)}
                      disabled={!canStartBuildRoad}
                      className="btn-sm btn-ghost w-full text-[10px]"
                    >
                      🛤️ {t.era3.buildRoad.build} ({roadsBuiltThisTurn}/3) · 💰{ERA3_BUILD_ROAD_COST}
                    </button>
                  )
                )}

                {/* Selected stack compact */}
                {selectedStack && (
                  <SelectedStackPanel
                    stack={selectedStack}
                    adjacentEnemies={selectedStackAdjacentEnemies}
                    onAttack={handleAttackStack}
                    onDeselect={() => setSelectedStackId(null)}
                    t={t}
                  />
                )}

              </div>
            </div>
          )}

          {/* Spectating selected stack */}
          {inGameLoop && !isMyTurn && selectedStack && (
            <div className="rounded-xl border border-border-subtle bg-game-surface/40 px-2.5 py-2">
              <SelectedStackPanel
                stack={selectedStack}
                adjacentEnemies={selectedStackAdjacentEnemies}
                onAttack={handleAttackStack}
                onDeselect={() => setSelectedStackId(null)}
                t={t}
              />
            </div>
          )}

          {/* ── Mi ejército + Mi reino — collapsible, fused ── */}
          {inGameLoop && gameState && localPlayerId && (
            <Section title={`${t.era3.army} · ${t.era3.sections.kingdom}`} icon="🎖️" defaultOpen={isMyTurn}>
              <div className="space-y-3">
                {/* Tech pentagon */}
                {techLevels && era3 && (() => {
                  const raceTechMax = RACE_TECH_MAX[player.raceId as keyof typeof RACE_TECH_MAX] ?? Object.fromEntries(TECH_TYPES.map(t => [t, 5])) as Record<TechType, number>;
                  return (
                    <TechPentagon
                      techLevels={techLevels}
                      raceTechMax={raceTechMax}
                      t={t}
                      size={180}
                      onUpgrade={tech => localPlayerId && dispatch({ type: 'ERA3_UPGRADE_TECH', playerId: localPlayerId, tech })}
                      canUpgrade={tech => {
                        const cur = techLevels[tech] ?? 0;
                        const raceMax = raceTechMax[tech] ?? 5;
                        if (cur >= raceMax) return false;
                        const nextLvl = cur + 1;
                        const cost = Math.ceil(getIncrementalCost(tech, nextLvl) * ERA3_TECH_UPGRADE_MULTIPLIER);
                        return isMyTurn && inGameLoop && !isEliminated && goldCoins >= cost && !!localPlayerId;
                      }}
                      goldCost={tech => {
                        const cur = techLevels[tech] ?? 0;
                        const raceMax = raceTechMax[tech] ?? 5;
                        if (cur >= raceMax) return 0;
                        return Math.ceil(getIncrementalCost(tech, cur + 1) * ERA3_TECH_UPGRADE_MULTIPLIER);
                      }}
                      goldCoins={goldCoins}
                    />
                  );
                })()}

                {/* Army panel */}
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
              </div>
            </Section>
          )}

          <button type="button" onClick={() => setScreen('menu')} className="btn btn-ghost w-full text-xs">
            {t.era3.backToMenu}
          </button>
        </aside>

        {/* Map — center column, fills all remaining space */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
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
                techLockedUnits={isMyTurn && !isEliminated ? techLockedUnits : undefined}
                canBuildRoad={isMyTurn && !isEliminated && canStartBuildRoad}
                exploredHexes={localPlayerId ? (gameState.era3ExploredHexes?.[localPlayerId] ?? undefined) : undefined}
                fogOfWar={fogOfWarEnabled}
                playerCapitalCoord={era3?.capitalCoord ?? null}
                playerRaces={Object.fromEntries(gameState.players.map(p => [p.id, p.raceId]))}
              />
              {inspected && (
                <HexInspectorPanel
                  hex={inspected.hex}
                  stack={inspected.stack}
                  players={gameState.players}
                  onClose={() => setInspected(null)}
                />
              )}


              {/* ── Map Legend overlay — bottom-right corner, collapsible ── */}
              <div className="absolute bottom-3 right-3 z-10 select-none" style={{ maxWidth: 220 }}>
                <div className="rounded-xl overflow-hidden border border-game-gold/25 bg-game-bg/88 backdrop-blur-md shadow-2xl"
                  style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(245,197,24,0.10)' }}
                >
                  {/* Header — always visible, clickable to toggle */}
                  <button
                    type="button"
                    onClick={() => setLegendOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 border-b border-game-gold/15 bg-game-gold/8 hover:bg-game-gold/12 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-game-gold text-base leading-none">🗺️</span>
                      <span className="text-game-gold text-[10px] font-bold uppercase tracking-[0.15em] animate-title-glow">
                        {t.era3.mapTitle}
                      </span>
                    </div>
                    <span className="text-game-gold/60 text-[10px] font-bold leading-none transition-transform duration-200"
                      style={{ transform: legendOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                      ▼
                    </span>
                  </button>

                  {legendOpen && (
                    <>
                      {/* Special markers */}
                      <div className="px-3 pt-2 pb-1">
                        <div className="text-[8px] text-game-gold/50 uppercase tracking-widest mb-1">Marcadores</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          {[
                            { icon: '♚', color: '#f5c518', label: t.era3.legend.capital },
                            { icon: '🏯', color: '#fbbf24', label: t.era3.legend.citadel },
                            { icon: '☠', color: '#e94560', label: t.era3.legend.spawnZone },
                            { icon: '🏰', color: '#a78bfa', label: 'Fuerte' },
                          ].map(({ icon, color, label }) => (
                            <div key={label} className="flex items-center gap-1.5 py-0.5">
                              <span className="text-[13px] leading-none shrink-0" style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.9))' }}>{icon}</span>
                              <span className="text-[9px] font-semibold leading-none truncate" style={{ color }}>{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mx-3 border-t border-game-gold/10" />
                      {/* Terrain */}
                      <div className="px-3 pt-1.5 pb-1">
                        <div className="text-[8px] text-game-gold/50 uppercase tracking-widest mb-1">Terrenos</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          {[
                            { icon: '🌾', color: '#86efac', label: 'Llanura', cost: 3 },
                            { icon: '⛰️', color: '#a8a29e', label: 'Montaña', cost: 6 },
                            { icon: '🌲', color: '#4ade80', label: 'Bosque', cost: 6 },
                            { icon: '🌿', color: '#2dd4bf', label: 'Pantano', cost: 4 },
                            { icon: '🏔️', color: '#c084fc', label: 'Colina', cost: 3 },
                            { icon: '🏜️', color: '#fcd34d', label: 'Desierto', cost: 6 },
                            { icon: '🌊', color: '#60a5fa', label: 'Lago', cost: null },
                            { icon: '🏛️', color: '#f59e0b', label: 'Ruinas', cost: 3 },
                            { icon: '🛤️', color: '#fbbf24', label: 'Camino', cost: 1 },
                            { icon: '🌉', color: '#94a3b8', label: 'Puente', cost: 1 },
                          ].map(({ icon, color, label, cost }) => (
                            <div key={label} className="flex items-center gap-1.5 py-0.5">
                              <span className="text-[13px] leading-none shrink-0" style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.9))' }}>{icon}</span>
                              <span className="text-[9px] font-medium leading-none truncate" style={{ color }}>{label}</span>
                              {cost !== null ? (
                                <span className="ml-auto text-[8px] text-text-faint shrink-0 tabular-nums">·{cost}</span>
                              ) : (
                                <span className="ml-auto text-[8px] text-red-400/70 shrink-0">✕</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Footer hint */}
                      <div className="px-3 py-1.5 border-t border-game-gold/10 bg-black/25">
                        <span className="text-text-faint text-[8px] uppercase tracking-wider">
                          Costo de movimiento (×1/3 escala)
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              {t.era3.phases.map_generation}…
            </div>
          )}

          {/* ── End Turn overlay — positioned over map, outside canvas so pointer events work ── */}
          {inGameLoop && (
            <div className="absolute top-3 left-3 z-30 pointer-events-none">
              <div className="pointer-events-auto">
                {isMyTurn && !isEliminated ? (
                  <button
                    type="button"
                    onClick={handleEndTurn}
                    className="flex items-center gap-3 rounded-2xl px-6 py-3.5 font-black text-base border-2 shadow-2xl transition-all select-none bg-game-accent border-game-accent text-white hover:bg-red-500 hover:border-red-400 hover:scale-105 active:scale-95 cursor-pointer"
                    style={{ boxShadow: '0 0 28px rgba(233,69,96,0.55), 0 0 60px rgba(233,69,96,0.20), 0 6px 16px rgba(0,0,0,0.6)' }}
                  >
                    <span className="text-xl leading-none">⏭</span>
                    <span className="tracking-wide uppercase">{t.era3.endTurn}</span>
                  </button>
                ) : (
                  <div
                    className="flex items-center gap-2.5 rounded-2xl px-5 py-3 font-bold text-sm border-2 border-border-subtle bg-game-surface/70 text-text-muted opacity-80"
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
                  >
                    <span className="text-base leading-none animate-pulse">⏳</span>
                    <span className="tracking-wide">{activePlayer ? `${t.era3.turnOf} ${activePlayer.name}` : '…'}</span>
                  </div>
                )}
                {gameState.era3TurnNumber && (
                  <div className="mt-1.5 text-center">
                    <span className="text-[10px] text-game-gold/70 font-semibold uppercase tracking-widest tabular-nums">
                      Turno {gameState.era3TurnNumber}
                      {gameState.era3MaxTurns ? ` / ${gameState.era3MaxTurns}` : ' ∞'}
                    </span>
                  </div>
                )}
              </div>
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
                      <li key={card.id} className={`border rounded-lg p-2 ${rarityStyle(card.rarity)}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 mb-0.5">
                              {rarityBadge(card.rarity)}
                            </div>
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
              {isMyTurn && (
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-[10px] font-bold ${cardsPlayedThisTurn >= 2 ? 'text-text-muted' : 'text-game-gold'}`}>
                    {cardsPlayedThisTurn}/2 {t.era3.cardsPlayed ?? 'cartas jugadas'}
                  </span>
                </div>
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

      {/* Card offer modal — shown when a player has 2 cards to choose from */}
      {cardOffers.length > 0 && isMyTurn && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in-up">
          <div className="max-w-lg w-full space-y-4 animate-scale-in">
            {/* Header */}
            <div className="text-center">
              <div className="text-4xl mb-2">🃏</div>
              <h2 className="text-2xl font-black text-game-gold animate-title-glow uppercase tracking-wider">
                {t.era3.cardOfferTitle ?? 'Nueva carta'}
              </h2>
              <p className="text-text-secondary text-sm mt-1">
                {t.era3.cardOfferSubtitle ?? 'Elige una carta para tu mano. La otra será descartada.'}
              </p>
            </div>

            {/* Card options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cardOffers.map((card: EraCard) => {
                const borderClass = card.rarity === 'legendary'
                  ? 'border-yellow-400/60 bg-yellow-900/15 hover:border-yellow-400/90 hover:bg-yellow-900/25'
                  : card.rarity === 'rare'
                    ? 'border-purple-400/50 bg-purple-900/10 hover:border-purple-400/80 hover:bg-purple-900/20'
                    : 'border-border-subtle bg-game-surface/80 hover:border-game-gold/60 hover:bg-game-gold/5';
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => { if (localPlayerId) dispatch({ type: 'PICK_CARD_OFFER', playerId: localPlayerId, cardId: card.id }); }}
                    className={`group relative border-2 rounded-2xl p-4 text-left transition-all duration-200 hover:shadow-gold-sm ${borderClass}`}
                  >
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-game-gold text-xs font-bold uppercase tracking-wider">Elegir ✓</span>
                    </div>
                    <div className="mb-1">{rarityBadge(card.rarity)}</div>
                    <div className="text-game-gold font-black text-base mb-2 pr-12">{card.name}</div>
                    <ul className="space-y-1">
                      {card.effects.map((e, i) => (
                        <li key={i} className="text-text-secondary text-xs">• {formatEffect(e)}</li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* Discard all (only if hand is full) */}
            {hand.length >= 5 && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { if (localPlayerId) dispatch({ type: 'DISCARD_CARD_OFFER', playerId: localPlayerId }); }}
                  className="btn btn-ghost text-text-muted hover:text-game-accent text-xs"
                >
                  {t.era3.discardOffer ?? 'Mano llena — descartar ambas'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Starvation modal — player chooses which unit to sacrifice */}
      {localPlayerId && player?.era3State?.era3StarvationPending && stacks && (() => {
        const playerStacks = Object.values(stacks).filter(s => s.ownerId === localPlayerId && s.units.length > 0);
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-game-surface border border-red-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">💀</div>
                <h3 className="text-red-400 font-black text-xl">¡Hambruna!</h3>
                <p className="text-text-secondary text-sm mt-1">Las reservas de comida se han agotado. Elige una unidad para sacrificar.</p>
                <div className="text-text-muted text-xs mt-1">Reservas: <span className="text-red-400 font-bold">{player.era3State.foodReserves}</span></div>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {playerStacks.map(stack => (
                  stack.units.map(unit => {
                    const defInfo = UNIT_DEFINITIONS.find(d => d.id === unit.type);
                    const maxHp = defInfo ? defInfo.defense + 2 : 3;
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => dispatch({ type: 'DISBAND_UNIT_STARVATION', playerId: localPlayerId, stackId: stack.id, unitId: unit.id })}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-red-500/20 hover:border-red-500/60 hover:bg-red-900/20 transition-all text-left"
                      >
                        <span className="text-xl">{UNIT_ICONS[unit.type]}</span>
                        <div className="flex-1">
                          <div className="text-text-primary font-bold text-sm">{(t.units as Record<string, string>)[unit.type] ?? unit.type}</div>
                          <div className="text-text-muted text-xs">HP {unit.currentHp}/{maxHp}</div>
                        </div>
                        <div className="text-red-400 text-xs font-bold">Sacrificar</div>
                      </button>
                    );
                  })
                ))}
              </div>
            </div>
          </div>
        );
      })()}

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

function StatChip({
  icon, value, sub, dim = false,
}: {
  icon: string;
  value: number | string;
  sub?: string;
  dim?: boolean;
}) {
  return (
    <div className={`flex-1 flex items-center gap-1 bg-game-bg/50 border border-border-subtle rounded px-1.5 py-1 ${dim ? 'opacity-40' : ''}`}>
      <span className="text-xs leading-none">{icon}</span>
      <span className="text-xs font-bold text-game-gold tabular-nums">
        {value}{sub && <span className="text-[9px] text-text-muted font-normal">{sub}</span>}
      </span>
    </div>
  );
}

function CheckDot({ done, available, label }: { done: boolean; available: boolean; label: string }) {
  const color = done ? 'text-emerald-400' : available ? 'text-game-gold' : 'text-text-muted';
  const dot = done ? '✓' : available ? '·' : '×';
  return (
    <span className={`flex items-center gap-0.5 shrink-0 ${color}`} title={label}>
      <span className="font-bold text-[11px]">{dot}</span>
      <span className="text-[9px] hidden sm:inline">{label}</span>
    </span>
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
