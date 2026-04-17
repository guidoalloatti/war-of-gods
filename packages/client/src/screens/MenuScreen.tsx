import { useState, useEffect } from 'react';
import type { GameMode } from '@war-of-gods/engine';
import { useGameStore } from '../stores/gameStore.js';
import { useAuth } from '../stores/authStore.js';
import { useI18n } from '../i18n/index.js';

export function MenuScreen() {
  const setScreen = useGameStore(s => s.setScreen);
  const setGameMode = useGameStore(s => s.setGameMode);
  const startJoinFlow = useGameStore(s => s.startJoinFlow);
  const error = useGameStore(s => s.error);
  const setError = useGameStore(s => s.setError);
  const saves = useGameStore(s => s.saves);
  const savesLoading = useGameStore(s => s.savesLoading);
  const fetchSaves = useGameStore(s => s.fetchSaves);
  const loadGame = useGameStore(s => s.loadGame);
  const deleteGame = useGameStore(s => s.deleteGame);
  const user = useAuth(s => s.user);
  const t = useI18n(s => s.t);

  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (user) fetchSaves();
  }, [user, fetchSaves]);

  function handleSelect(mode: GameMode) {
    setError(null);
    setGameMode(mode);
    setScreen('race_selection');
  }

  function handleJoinSubmit() {
    if (joinCode.trim().length < 4) return;
    setError(null);
    startJoinFlow(joinCode.trim());
  }

  return (
    <div id="menu-screen" className="min-h-screen bg-game-bg relative overflow-hidden flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Background */}
      <div className="absolute inset-0 bg-radial-theme" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-radial-gold pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-game-gold/30 to-transparent" />

      <div className="relative z-10 w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-game-gold/10 border border-game-gold/20 mb-4 animate-pulse-slow">
            <svg className="w-8 h-8 text-game-gold" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black font-display text-transparent bg-clip-text bg-gradient-to-b from-game-gold via-game-gold to-game-gold-dark animate-title-glow tracking-tight uppercase">
            {t.app.title}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-game-gold/30" />
            <span className="text-game-gold/40 text-xs tracking-[0.5em] uppercase font-semibold">{t.menu.era} I</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-game-gold/30" />
          </div>
        </div>

        {error && (
          <div className="bg-error-bg text-error-text p-3 rounded-lg mb-4 text-sm animate-fade-in" role="alert">
            {error}
          </div>
        )}

        {/* Saved games */}
        {user && saves.length > 0 && (
          <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <h3 className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-2">{t.auth.savedGames}</h3>
            <div className="space-y-1.5">
              {saves.slice(0, 3).map(save => (
                <div
                  key={save.id}
                  className="group flex items-center gap-2 bg-game-surface/60 border border-border-subtle rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-text-primary text-sm font-medium capitalize">{save.gameMode.replace('_', ' ')}</span>
                    <span className="text-text-muted text-xs ml-2">
                      {new Date(save.updatedAt * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadGame(save.id)}
                    className="text-game-gold text-xs font-bold hover:text-game-gold/80 transition-colors"
                  >
                    {t.auth.continueGame}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteGame(save.id)}
                    className="text-text-faint hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two-column layout: Single Player | Multiplayer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>

          {/* ── Single Player Column ── */}
          <div className="bg-game-surface/50 backdrop-blur-sm border border-border-subtle rounded-2xl p-5 flex flex-col">
            {/* Column header with illustration */}
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-game-gold/[0.07] mb-3">
                {/* Single crown illustration */}
                <svg className="w-10 h-10 text-game-gold" viewBox="0 0 48 48" fill="none">
                  <path d="M8 32L4 12l9 8L24 8l11 12 9-8-4 20H8z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <rect x="8" y="34" width="32" height="5" rx="1.5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="24" cy="22" r="3" fill="currentColor" />
                  <circle cx="15" cy="20" r="2" fill="currentColor" fillOpacity="0.6" />
                  <circle cx="33" cy="20" r="2" fill="currentColor" fillOpacity="0.6" />
                </svg>
              </div>
              <h2 className="text-game-gold font-bold text-base uppercase tracking-wider">{t.menu.localGames}</h2>
            </div>

            <div className="space-y-2.5 flex-1">
              {/* Solo */}
              <button
                type="button"
                onClick={() => handleSelect('solo')}
                className="w-full group relative bg-game-bg/50 border border-border-subtle hover:border-game-gold/30 rounded-xl px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-game-gold/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-3">
                  <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-game-gold/10 text-game-gold group-hover:bg-game-gold/15 transition-colors shrink-0">
                    {/* Solo player shield */}
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                      <path d="M12 8v4m0 0v4m0-4h4m-4 0H8" strokeLinecap="round" strokeWidth="1.5" opacity="0.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary font-bold text-sm group-hover:text-game-gold transition-colors">{t.menu.solo}</div>
                    <div className="text-text-muted text-xs">{t.menu.soloSubtitle}</div>
                  </div>
                  <svg className="w-4 h-4 text-text-faint group-hover:text-game-gold/60 transition-all group-hover:translate-x-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Solo with Bots */}
              <button
                type="button"
                onClick={() => handleSelect('solo_bots')}
                className="w-full group relative bg-game-bg/50 border border-border-subtle hover:border-game-ember/30 rounded-xl px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-game-ember/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-3">
                  <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-game-ember/10 text-game-ember group-hover:bg-game-ember/15 transition-colors shrink-0">
                    {/* Bot/AI icon */}
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="4" y="8" width="16" height="12" rx="3" />
                      <path d="M9 13h.01M15 13h.01" strokeWidth="2.5" strokeLinecap="round" />
                      <path d="M10 17h4" strokeLinecap="round" />
                      <path d="M12 4v4M7 6l1.5 2M17 6l-1.5 2" strokeLinecap="round" />
                      <circle cx="12" cy="3.5" r="1" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary font-bold text-sm group-hover:text-game-ember transition-colors">{t.menu.soloBots}</div>
                    <div className="text-text-muted text-xs">{t.menu.botsSubtitle}</div>
                  </div>
                  <svg className="w-4 h-4 text-text-faint group-hover:text-game-ember/60 transition-all group-hover:translate-x-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>
          </div>

          {/* ── Multiplayer Column ── */}
          <div className="bg-game-surface/50 backdrop-blur-sm border border-border-subtle rounded-2xl p-5 flex flex-col">
            {/* Column header with illustration */}
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-game-accent/[0.07] mb-3">
                {/* Multiple players / swords illustration */}
                <svg className="w-10 h-10 text-game-accent" viewBox="0 0 48 48" fill="none">
                  {/* Three crowns representing multiplayer */}
                  <path d="M14 30L11 18l4 3.5L20 16l5 5.5 4-3.5-3 12H14z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M26 26L23 14l4 3.5L32 12l5 5.5 4-3.5-3 12H26z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <circle cx="16" cy="10" r="3.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="32" cy="8" r="3.5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 42h28M14 38h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
                </svg>
              </div>
              <h2 className="text-game-accent font-bold text-base uppercase tracking-wider">{t.menu.onlineGames}</h2>
            </div>

            <div className="space-y-2.5 flex-1">
              {/* Create Multiplayer */}
              <button
                type="button"
                onClick={() => handleSelect('multiplayer')}
                className="w-full group relative bg-game-bg/50 border border-border-subtle hover:border-game-accent/30 rounded-xl px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-game-accent/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-3">
                  <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-game-accent/10 text-game-accent group-hover:bg-game-accent/15 transition-colors shrink-0">
                    {/* Create room / globe icon */}
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 3c-3 3.5-3 8.5 0 18M12 3c3 3.5 3 8.5 0 18" />
                      <path d="M3.5 9h17M3.5 15h17" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary font-bold text-sm group-hover:text-game-accent transition-colors">{t.menu.multiplayer}</div>
                    <div className="text-text-muted text-xs">{t.menu.multiplayerSubtitle}</div>
                  </div>
                  <svg className="w-4 h-4 text-text-faint group-hover:text-game-accent/60 transition-all group-hover:translate-x-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Join Room */}
              {!showJoin ? (
                <button
                  type="button"
                  onClick={() => setShowJoin(true)}
                  className="w-full group relative bg-game-bg/30 border border-dashed border-border-medium hover:border-game-accent/30 rounded-xl px-4 py-3.5 text-left transition-all duration-200"
                >
                  <div className="relative flex items-center gap-3">
                    <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-game-accent/5 text-text-muted group-hover:text-game-accent group-hover:bg-game-accent/10 transition-colors shrink-0">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-secondary font-bold text-sm group-hover:text-game-accent transition-colors">{t.multiplayer.joinRoom}</div>
                      <div className="text-text-muted text-xs">{t.menu.joinSubtitle}</div>
                    </div>
                    <svg className="w-4 h-4 text-text-faint group-hover:text-game-accent/60 transition-all group-hover:translate-x-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ) : (
                <div className="bg-game-bg/50 border border-border-subtle rounded-xl p-4 animate-scale-in">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-text-primary text-sm font-bold">{t.multiplayer.joinRoom}</span>
                    <button type="button" onClick={() => setShowJoin(false)} className="text-text-muted hover:text-text-primary transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ABCDEF"
                      maxLength={6}
                      aria-label={t.multiplayer.roomCode}
                      className="flex-1 bg-game-bg text-text-primary text-center text-base font-bold tracking-[0.2em] rounded-lg px-3 py-2.5 border border-border-subtle focus:border-game-accent/50 focus:outline-none transition-all placeholder:text-text-faint uppercase"
                      onKeyDown={e => e.key === 'Enter' && handleJoinSubmit()}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleJoinSubmit}
                      disabled={joinCode.trim().length < 4}
                      className="bg-game-accent text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-30 transition-all hover:bg-game-accent/90"
                    >
                      {t.multiplayer.join}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Admin access */}
        {user?.role === 'admin' && (
          <div className="mt-4 flex justify-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <button
              type="button"
              onClick={() => setScreen('admin')}
              className="group flex items-center gap-2 text-text-muted hover:text-game-gold text-xs font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{t.admin.title}</span>
            </button>
          </div>
        )}

        {/* Footer hint */}
        <p className="text-text-muted text-xs text-center mt-6 tracking-wide italic animate-fade-in" style={{ animationDelay: '0.4s' }}>
          {t.menu.theWorldAwaits}
        </p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-game-gold/20 to-transparent" />
    </div>
  );
}
