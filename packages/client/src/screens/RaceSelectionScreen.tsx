import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { getAllRaces, generateFullName } from '@war-of-gods/engine';
import type { RaceId, Race } from '@war-of-gods/engine';
import { useGameStore } from '../stores/gameStore.js';
import { useI18n } from '../i18n/index.js';
import type { Translations } from '../i18n/es.js';
import { RacePortrait } from '../components/RacePortrait.js';
import { RaceTerrainPreview3D } from '../components/RaceTerrainPreview3D.js';

const TERRAIN_ICONS: Record<string, string> = {
  plain: '🌾',
  mountain: '⛰️',
  forest: '🌲',
  swamp: '🌿',
};

const TERRAINS = ['plain', 'mountain', 'forest', 'swamp'] as const;

/** High-contrast race theme colors + decorative accent for card visuals */
const RACE_THEME: Record<string, { glow: string; border: string; accent: string; symbol: string }> = {
  elf:     { glow: '#FF8FAA', border: '#FF6B8A', accent: '#4A7C59', symbol: '🌲' },
  dwarf:   { glow: '#FFD700', border: '#E6C200', accent: '#B8860B', symbol: '⛰️' },
  human:   { glow: '#6BAAFF', border: '#4A90E2', accent: '#2C3E6B', symbol: '🌾' },
  halfelf: { glow: '#C77DDB', border: '#9B59B6', accent: '#6B3A8A', symbol: '🌙' },
  orc:     { glow: '#FF6B5A', border: '#E74C3C', accent: '#8B2020', symbol: '🔥' },
  giant:   { glow: '#7FAACC', border: '#5A8AAA', accent: '#3A5A6A', symbol: '⛰️' },
  goblin:  { glow: '#4ADB7A', border: '#27AE60', accent: '#1A6B3A', symbol: '🌲' },
  halforc: { glow: '#B0BEC5', border: '#8FA4AD', accent: '#5A6A6D', symbol: '💀' },
};

export function RaceSelectionScreen() {
  const gameMode = useGameStore(s => s.gameMode);
  const startLocalGame = useGameStore(s => s.startLocalGame);
  const createRoom = useGameStore(s => s.createRoom);
  const setScreen = useGameStore(s => s.setScreen);
  const error = useGameStore(s => s.error);
  const t = useI18n(s => s.t);
  const locale = useI18n(s => s.locale);

  const isMobile = useMediaQuery('(max-width: 639px)');

  const isJoining = useGameStore(s => s.isJoining);
  const pendingJoinCode = useGameStore(s => s.pendingJoinCode);
  const joinWithRace = useGameStore(s => s.joinWithRace);

  const races = getAllRaces();

  // Random default selection — keep index and raceId in sync
  const [selectedIndex, setSelectedIndex] = useState(() => Math.floor(Math.random() * races.length));
  const selectedRace = races[selectedIndex].id;

  const [botCount, setBotCount] = useState(1);
  const [nameSeed, setNameSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [playerName, setPlayerName] = useState('');

  // Set initial name based on random race
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      setPlayerName(generateFullName(selectedRace, nameSeed, locale));
    }
  }, [selectedRace, nameSeed, locale]);

  const selectedRaceData = races[selectedIndex];

  const handleSelectRace = useCallback((index: number) => {
    // Wrap around
    const wrapped = ((index % races.length) + races.length) % races.length;
    setSelectedIndex(prev => {
      const prevRaceId = races[prev].id;
      const newRaceId = races[wrapped].id;
      // Auto-update name if it matches the previous race's generated name
      const prevName = generateFullName(prevRaceId, nameSeed, locale);
      if (!playerName || playerName === prevName) {
        setPlayerName(generateFullName(newRaceId, nameSeed, locale));
      }
      return wrapped;
    });
  }, [races, playerName, nameSeed, locale]);

  function handleRerollName() {
    const newSeed = Math.floor(Math.random() * 100000);
    setNameSeed(newSeed);
    setPlayerName(generateFullName(selectedRace, newSeed, locale));
  }

  // Arrow key navigation — global listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSelectRace(selectedIndex - 1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSelectRace(selectedIndex + 1);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, handleSelectRace]);

  function handleStart() {
    if (!selectedRace) return;
    const name = playerName || t.raceSelection.playerPlaceholder;

    if (isJoining && pendingJoinCode) {
      joinWithRace(pendingJoinCode, name, selectedRace);
      return;
    }

    if (!gameMode) return;

    if (gameMode === 'multiplayer') {
      createRoom({
        mode: 'multiplayer',
        playerConfigs: [{ name, raceId: selectedRace, isBot: false }],
      });
      return;
    }

    const botRaces = races
      .filter(r => r.id !== selectedRace)
      .slice(0, gameMode === 'solo_bots' ? botCount : 0);

    startLocalGame({
      mode: gameMode,
      playerConfigs: [
        { name, raceId: selectedRace, isBot: false },
        ...botRaces.map((r, i) => ({
          name: `${t.era1.bot} ${i + 1}`,
          raceId: r.id,
          isBot: true,
          botDifficulty: 'easy' as const,
        })),
      ],
    });
  }

  // Compute the visual order: center the selected race, with wrapping
  const carouselOrder = useMemo(() => {
    const count = races.length;
    const items: { race: Race; originalIndex: number; offset: number }[] = [];
    for (let i = 0; i < count; i++) {
      // offset from center: -3, -2, -1, 0, 1, 2, 3, 4 for 8 races
      const offset = ((i - selectedIndex + count + Math.floor(count / 2)) % count) - Math.floor(count / 2);
      items.push({ race: races[i], originalIndex: i, offset });
    }
    items.sort((a, b) => a.offset - b.offset);
    return items;
  }, [races, selectedIndex]);

  return (
    <div id="race-selection-screen" className="h-screen bg-game-bg bg-radial-theme flex flex-col relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-radial-gold pointer-events-none opacity-40" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-game-gold/15 to-transparent" />

      {/* Back button — right side to avoid IDE sidebar overlap */}
      <div className="relative z-20 p-4 pb-0 shrink-0 flex justify-end">
        <button
          type="button"
          onClick={() => setScreen('menu')}
          className="group flex items-center gap-1.5 text-text-muted hover:text-game-gold transition-colors text-sm animate-fade-in"
          aria-label={t.actions.back}
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t.actions.back}
        </button>
      </div>

      {/* Title */}
      <div className="text-center mb-1 animate-fade-in-up relative z-10 px-4 pt-1 shrink-0">
        <h2 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight font-display">{t.raceSelection.chooseYourKing}</h2>
        <p className="text-text-muted text-sm mt-0.5">{t.raceSelection.subtitle}</p>
      </div>

      {/* ── Top panel: name + config + start ── */}
      <div className="relative z-10 px-4 mb-2 animate-fade-in shrink-0">
        <div className="max-w-xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <label className="flex-1 block">
              <span className="text-text-primary text-[10px] uppercase tracking-wider font-semibold">{t.raceSelection.name}</span>
              <div className="flex gap-1.5 mt-1">
                <input
                  type="text"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder={t.raceSelection.playerPlaceholder}
                  className="flex-1 bg-game-surface text-white rounded-lg px-3 py-2 border border-border-medium focus:border-game-gold/50 focus:outline-none focus:shadow-gold-sm transition-all placeholder:text-text-muted text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={handleRerollName}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-game-surface/80 border border-border-subtle hover:border-game-gold/40 text-text-secondary hover:text-game-gold transition-all shrink-0"
                  title={t.era1.rerollName}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </label>

            {gameMode === 'solo_bots' && (
              <label className="w-24 block">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary text-[10px] uppercase tracking-wider font-medium">Bots</span>
                  <span className="text-game-gold font-bold text-xs tabular-nums">{botCount}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={botCount}
                  onChange={e => setBotCount(Number(e.target.value))}
                  className="w-full mt-2.5 accent-game-gold"
                />
              </label>
            )}

            <button
              type="button"
              onClick={handleStart}
              className="relative overflow-hidden font-bold py-2.5 px-6 rounded-xl transition-all duration-300 text-sm uppercase tracking-wider bg-gradient-to-r from-game-accent to-game-ember text-text-primary shadow-accent hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 w-full sm:w-auto sm:shrink-0 min-h-[44px]"
            >
              <div className="absolute inset-0 animate-shimmer pointer-events-none" />
              <span className="relative">{t.actions.start}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 bg-error-bg text-error-text p-3 rounded-lg mb-2 text-sm animate-fade-in relative z-10 shrink-0" role="alert">
          {error}
        </div>
      )}

      {/* ── Carousel ── */}
      <div id="race-carousel" className="relative z-10 shrink-0 py-2">
        {isMobile ? (
          /* Mobile: horizontal scroll list */
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: 'none' }}>
            {races.map((race, index) => (
              <div key={race.id} className="snap-center shrink-0">
                <CarouselCard
                  race={race}
                  isCenter={index === selectedIndex}
                  onClick={() => handleSelectRace(index)}
                  t={t}
                />
              </div>
            ))}
          </div>
        ) : (
          /* Desktop: 3D perspective carousel */
          <>
            <button
              type="button"
              onClick={() => handleSelectRace(selectedIndex - 1)}
              className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-game-surface/60 border border-border-subtle hover:border-game-gold/40 text-text-secondary hover:text-game-gold transition-all backdrop-blur-sm"
              aria-label="Previous race"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleSelectRace(selectedIndex + 1)}
              className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-game-surface/60 border border-border-subtle hover:border-game-gold/40 text-text-secondary hover:text-game-gold transition-all backdrop-blur-sm"
              aria-label="Next race"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <div className="flex items-center justify-center gap-0 h-[420px] sm:h-[480px] px-12 sm:px-20">
              {carouselOrder.map(({ race, originalIndex, offset }) => {
                const isCenter = offset === 0;
                const absOffset = Math.abs(offset);
                const scale = isCenter ? 1.08 : Math.max(0.45, 0.88 - absOffset * 0.13);
                const opacity = isCenter ? 1 : Math.max(0.2, 1 - absOffset * 0.22);
                const zIndex = 20 - absOffset;
                const translateX = offset * (isCenter ? 0 : 90 + absOffset * 6);

                return (
                  <div
                    key={race.id}
                    className="absolute transition-all duration-500 ease-out"
                    style={{
                      transform: `translateX(${translateX}px) scale(${scale})`,
                      opacity,
                      zIndex,
                    }}
                  >
                    <CarouselCard
                      race={race}
                      isCenter={isCenter}
                      onClick={() => handleSelectRace(originalIndex)}
                      t={t}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Race detail panel below carousel ── */}
      <div id="race-detail-panel" className="relative z-10 flex-1 overflow-y-auto px-4 pb-4">
        <RaceDetailPanel race={selectedRaceData} t={t} />
      </div>
    </div>
  );
}

/* ── Carousel Card ─────────────────────────────────────────── */

function CarouselCard({
  race,
  isCenter,
  onClick,
  t,
}: {
  race: Race;
  isCenter: boolean;
  onClick: () => void;
  t: Translations;
}) {
  const raceName = t.races[race.id as keyof typeof t.races];
  const theme = RACE_THEME[race.id];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-[150px] sm:w-[210px] rounded-2xl text-left transition-all duration-500 overflow-hidden group relative flex flex-col ${
        isCenter
          ? 'shadow-gold-lg'
          : 'hover:brightness-110'
      }`}
      style={{
        border: isCenter
          ? `2px solid ${theme.border}`
          : '2px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Solid backdrop */}
      <div className="absolute inset-0 rounded-2xl bg-game-bg -z-10" />

      {/* Gradient background — stronger race tint */}
      <div
        className="absolute inset-0 rounded-2xl transition-opacity duration-500"
        style={{
          background: isCenter
            ? `linear-gradient(170deg, ${theme.glow}30 0%, ${theme.glow}15 30%, rgba(10,10,26,0.97) 70%, ${theme.accent}20 100%)`
            : `linear-gradient(170deg, ${theme.glow}15 0%, rgba(10,10,26,1) 50%, ${theme.accent}10 100%)`,
        }}
      />

      {/* Decorative top stripe in race color */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl transition-opacity duration-500"
        style={{
          background: `linear-gradient(90deg, transparent, ${theme.glow}, transparent)`,
          opacity: isCenter ? 0.9 : 0.3,
        }}
      />

      {isCenter && (
        <div className="absolute inset-0 animate-border-glow rounded-2xl pointer-events-none" />
      )}

      {/* Portrait area */}
      <div className="relative flex justify-center pt-6 pb-3 z-10">
        {/* Background glow orb */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl pointer-events-none transition-all duration-500"
          style={{
            width: isCenter ? 140 : 90,
            height: isCenter ? 140 : 90,
            backgroundColor: theme.glow,
            opacity: isCenter ? 0.2 : 0.08,
          }}
        />
        <div
          className="transition-all duration-500"
          style={{
            filter: isCenter
              ? `drop-shadow(0 0 22px ${theme.glow}70)`
              : `drop-shadow(0 0 10px ${theme.glow}30)`,
            animation: isCenter ? 'float-1 3s ease-in-out infinite' : 'none',
          }}
        >
          <RacePortrait raceId={race.id} size={isCenter ? 130 : 96} />
        </div>
      </div>

      {/* Race name + short description */}
      <div className="px-3 text-center relative z-10">
        <h3
          className={`font-black font-display transition-colors leading-tight ${
            isCenter ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'
          }`}
          style={{ color: isCenter ? theme.glow : 'rgba(255,255,255,0.55)' }}
        >
          {raceName}
        </h3>
        {isCenter && (
          <p className="text-text-muted text-[10px] sm:text-[11px] leading-relaxed mt-1.5 line-clamp-2">
            {t.raceDescriptions[race.id as keyof typeof t.raceDescriptions]}
          </p>
        )}
      </div>

      {/* Separator line */}
      <div className="mx-5 my-3 relative z-10">
        <div
          className="h-px transition-opacity duration-500"
          style={{
            background: `linear-gradient(90deg, transparent, ${theme.glow}${isCenter ? '60' : '20'}, transparent)`,
          }}
        />
      </div>

      {/* Favorable / Unfavorable badges */}
      <div className="px-3 pb-4 relative z-10 flex flex-col items-center gap-2">
        <span
          className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all duration-500 flex items-center gap-1"
          style={{
            color: isCenter ? '#4ADE80' : 'rgba(74,222,128,0.5)',
            backgroundColor: isCenter ? 'rgba(74,222,128,0.1)' : 'transparent',
            borderColor: isCenter ? 'rgba(74,222,128,0.2)' : 'rgba(74,222,128,0.08)',
          }}
        >
          <span>+</span>
          <span>{TERRAIN_ICONS[race.favorableTerrain]}</span>
          <span>{t.terrain[race.favorableTerrain]}</span>
        </span>
        <span
          className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all duration-500 flex items-center gap-1"
          style={{
            color: isCenter ? '#F87171' : 'rgba(248,113,113,0.45)',
            backgroundColor: isCenter ? 'rgba(248,113,113,0.1)' : 'transparent',
            borderColor: isCenter ? 'rgba(248,113,113,0.2)' : 'rgba(248,113,113,0.08)',
          }}
        >
          <span>-</span>
          <span>{TERRAIN_ICONS[race.unfavorableTerrain]}</span>
          <span>{t.terrain[race.unfavorableTerrain]}</span>
        </span>
      </div>
    </button>
  );
}

/* ── Race Detail Panel ─────────────────────────────────────── */

function RaceDetailPanel({ race, t }: { race: Race; t: Translations }) {
  const raceName = t.races[race.id as keyof typeof t.races];
  const desc = t.raceDescriptions[race.id as keyof typeof t.raceDescriptions];
  const gameplay = t.raceGameplay[race.id as keyof typeof t.raceGameplay];
  const totalValue = Object.values(race.terrainValues).reduce((a, b) => a + b, 0);
  const maxTerrainValue = Math.max(...Object.values(race.terrainValues), 4); // cap at 4 for bar scale

  return (
    <div
      key={race.id}
      className="max-w-2xl mx-auto animate-fade-in"
    >
      {/* Top row: description + terrain chart side by side */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Left: Description & gameplay */}
        <div className="flex-1 rounded-xl border border-border-subtle p-3 sm:p-4"
          style={{
            background: `linear-gradient(135deg, ${race.color}08 0%, rgba(10,10,26,0.6) 100%)`,
          }}
        >
          {/* Race title with color accent */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: race.color }} />
            <h3 className="text-base font-black text-text-primary font-display">{raceName}</h3>
          </div>

          <p className="text-text-secondary text-xs leading-relaxed mb-3">{desc}</p>

          <div className="border-t border-border-subtle pt-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] text-game-gold font-semibold uppercase tracking-wider">{t.raceSelection.gameplay}</span>
            </div>
            <p className="text-text-muted text-[11px] leading-relaxed">{gameplay}</p>
          </div>
        </div>

        {/* Right: 3D terrain preview + compact stats */}
        <div className="w-full sm:w-72 shrink-0 flex flex-col gap-2">
          {/* 3D terrain mini-map */}
          <div
            className="w-full rounded-xl border overflow-hidden"
            style={{
              height: 200,
              borderColor: `${race.color}30`,
              background: `linear-gradient(135deg, ${race.color}08 0%, rgba(10,10,26,0.6) 100%)`,
            }}
          >
            <RaceTerrainPreview3D
              favorableTerrain={race.favorableTerrain}
              raceColor={race.color}
              className="w-full h-full"
            />
          </div>

          {/* Compact terrain score rows */}
          <div
            className="rounded-xl border border-border-subtle p-3"
            style={{ background: `linear-gradient(135deg, ${race.color}06 0%, rgba(10,10,26,0.6) 100%)` }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">{t.raceSelection.terrainPoints}</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-faint uppercase tracking-wider">{t.raceSelection.totalValue}</span>
                <span className="text-sm font-black text-game-gold tabular-nums">{totalValue}</span>
              </div>
            </div>
            <div className="space-y-2">
              {TERRAINS.map(terrain => {
                const value = race.terrainValues[terrain];
                const pct = maxTerrainValue > 0 ? (value / maxTerrainValue) * 100 : 0;
                const isFavorable = terrain === race.favorableTerrain;
                const isUnfavorable = terrain === race.unfavorableTerrain;
                const barColor = isFavorable
                  ? 'from-emerald-600 to-emerald-400'
                  : isUnfavorable
                  ? 'from-red-600/70 to-red-400/70'
                  : value > 0
                  ? 'from-slate-500/50 to-slate-400/50'
                  : 'from-slate-700/30 to-slate-600/30';
                return (
                  <div key={terrain} className="flex items-center gap-2">
                    <div className="w-20 shrink-0 flex items-center gap-1.5">
                      <span className="text-sm">{TERRAIN_ICONS[terrain]}</span>
                      <span className={`text-[11px] font-medium truncate ${
                        isFavorable ? 'text-emerald-400' : isUnfavorable ? 'text-red-400' : 'text-text-secondary'
                      }`}>{t.terrain[terrain]}</span>
                    </div>
                    <div className="flex-1 h-2.5 rounded-full bg-game-surface/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                    <span className={`w-5 text-right text-xs font-bold tabular-nums ${
                      isFavorable ? 'text-emerald-400' : isUnfavorable ? 'text-red-400' : value > 0 ? 'text-text-primary' : 'text-text-faint'
                    }`}>{value}</span>
                    {isFavorable && <span className="text-[8px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-1 py-px font-semibold shrink-0">+</span>}
                    {isUnfavorable && <span className="text-[8px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-1 py-px font-semibold shrink-0">-</span>}
                    {!isFavorable && !isUnfavorable && <span className="w-4 shrink-0" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 pt-2 border-t border-border-subtle flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-emerald-400/90 bg-emerald-400/10 rounded-full px-2 py-0.5 border border-emerald-400/20 flex items-center gap-1">
                <span className="font-bold">+</span>
                <span>{TERRAIN_ICONS[race.favorableTerrain]}</span>
                <span>{t.terrain[race.favorableTerrain]}</span>
              </span>
              <span className="text-[10px] text-red-400/90 bg-red-400/10 rounded-full px-2 py-0.5 border border-red-400/20 flex items-center gap-1">
                <span className="font-bold">-</span>
                <span>{TERRAIN_ICONS[race.unfavorableTerrain]}</span>
                <span>{t.terrain[race.unfavorableTerrain]}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Advantage / Disadvantage cards */}
      <div className="flex flex-col sm:flex-row gap-3 mt-3">
        {/* Advantage */}
        <div className="flex-1 rounded-xl border border-emerald-500/20 p-3"
          style={{
            background: `linear-gradient(135deg, rgba(74,222,128,0.06) 0%, rgba(10,10,26,0.6) 100%)`,
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">{t.raceSelection.advantage}</span>
          </div>
          <h4 className="text-sm font-bold text-emerald-300 mb-0.5">
            {(t.raceAdvantages[race.id as keyof typeof t.raceAdvantages] as { name: string; description: string }).name}
          </h4>
          <p className="text-[11px] text-text-muted leading-relaxed">
            {(t.raceAdvantages[race.id as keyof typeof t.raceAdvantages] as { name: string; description: string }).description}
          </p>
        </div>

        {/* Disadvantage */}
        <div className="flex-1 rounded-xl border border-red-500/20 p-3"
          style={{
            background: `linear-gradient(135deg, rgba(248,113,113,0.06) 0%, rgba(10,10,26,0.6) 100%)`,
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">{t.raceSelection.disadvantage}</span>
          </div>
          <h4 className="text-sm font-bold text-red-300 mb-0.5">
            {(t.raceDisadvantages[race.id as keyof typeof t.raceDisadvantages] as { name: string; description: string }).name}
          </h4>
          <p className="text-[11px] text-text-muted leading-relaxed">
            {(t.raceDisadvantages[race.id as keyof typeof t.raceDisadvantages] as { name: string; description: string }).description}
          </p>
        </div>
      </div>
    </div>
  );
}
