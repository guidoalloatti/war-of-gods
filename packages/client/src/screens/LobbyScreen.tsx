import { useState } from 'react';
import { getRaceById } from '@war-of-gods/engine';
import { useGameStore } from '../stores/gameStore.js';
import { useI18n } from '../i18n/index.js';

export function LobbyScreen() {
  const gameState = useGameStore(s => s.gameState);
  const roomCode = useGameStore(s => s.roomCode);
  const isHost = useGameStore(s => s.isHost);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const dispatch = useGameStore(s => s.dispatch);
  const disconnectSocket = useGameStore(s => s.disconnectSocket);
  const setScreen = useGameStore(s => s.setScreen);
  const error = useGameStore(s => s.error);
  const t = useI18n(s => s.t);

  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleLeave() {
    disconnectSocket();
    setScreen('menu');
  }

  function handleStart() {
    dispatch({ type: 'ADVANCE_PHASE' });
  }

  if (!gameState || !roomCode) return null;

  const connectedCount = gameState.players.filter(p => p.connected && !p.isBot).length;
  const canStart = connectedCount >= 2;

  return (
    <div id="lobby-screen" className="min-h-screen bg-game-bg bg-radial-theme flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-radial-gold pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Back button */}
        <button
          type="button"
          onClick={handleLeave}
          className="group flex items-center gap-1.5 text-text-muted hover:text-game-gold mb-6 transition-colors text-sm"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t.actions.back}
        </button>

        {/* Room code card */}
        <div className="bg-game-surface/60 backdrop-blur-sm border border-border-subtle rounded-2xl p-6 mb-6 animate-fade-in-up text-center">
          {/* Top illustration */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-game-accent/[0.08] mb-4">
            <svg className="w-8 h-8 text-game-accent" viewBox="0 0 48 48" fill="none">
              <circle cx="16" cy="18" r="6" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
              <circle cx="32" cy="18" r="6" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
              <path d="M10 38c0-5 4-9 9-9h10c5 0 9 4 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
              <path d="M20 30c-3 0-6 2-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
              <path d="M28 30c3 0 6 2 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            </svg>
          </div>

          <div className="text-text-secondary text-xs uppercase tracking-widest mb-2 font-medium">{t.multiplayer.roomCode}</div>
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-4xl sm:text-5xl font-black font-display text-game-gold tracking-[0.3em] animate-title-glow">
              {roomCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-text-muted hover:text-game-gold transition-colors p-2 rounded-lg hover:bg-game-gold/10"
              aria-label={t.multiplayer.copyCode}
            >
              {copied ? (
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-text-muted text-sm">{t.multiplayer.share}</p>
          {copied && (
            <div className="mt-2 text-emerald-400 text-xs font-medium animate-fade-in">
              {t.multiplayer.copied}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-error-bg text-error-text p-3 rounded-lg mb-4 text-sm animate-fade-in" role="alert">
            {error}
          </div>
        )}

        {/* Players list */}
        <div className="bg-game-surface/60 backdrop-blur-sm border border-border-subtle rounded-2xl p-5 mb-6 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold">
              {t.multiplayer.players}
            </div>
            <div className="flex items-center gap-1.5 bg-game-surface/60 rounded-full px-3 py-1 border border-border-subtle">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-text-primary text-xs font-bold tabular-nums">
                {connectedCount}/{gameState.players.filter(p => !p.isBot).length}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {gameState.players.filter(p => !p.isBot).map(player => {
              const race = getRaceById(player.raceId);
              const isLocal = player.id === localPlayerId;
              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    player.connected
                      ? 'bg-game-surface-light/60 border border-border-subtle'
                      : 'bg-game-surface/30 border border-transparent opacity-40'
                  }`}
                >
                  {/* Race color indicator with crown for host */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${player.connected ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: `${race.color}20`, border: `2px solid ${race.color}40` }}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill={race.color} opacity={0.7}>
                        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                      </svg>
                    </div>
                    {isLocal && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-game-gold rounded-full flex items-center justify-center border-2 border-game-bg">
                        <svg className="w-2.5 h-2.5 text-game-bg" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary text-sm font-bold">
                      {player.name}
                      {isLocal && <span className="text-game-gold/60 ml-1.5 text-xs font-normal">({t.era1.you})</span>}
                    </div>
                    <div className="text-text-muted text-xs">{t.races[player.raceId as keyof typeof t.races]}</div>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${player.connected ? 'text-emerald-400' : 'text-text-faint'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-text-faint'}`} />
                    {player.connected ? t.multiplayer.connected : t.multiplayer.disconnected}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Host controls / waiting message */}
        <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          {isHost ? (
            <>
              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart}
                className={`w-full relative overflow-hidden font-bold py-3.5 rounded-xl transition-all duration-300 text-base uppercase tracking-wider ${
                  canStart
                    ? 'bg-gradient-to-r from-game-accent to-game-ember text-text-primary shadow-accent hover:shadow-lg hover:-translate-y-0.5'
                    : 'bg-game-surface text-text-faint border border-border-subtle cursor-not-allowed'
                }`}
              >
                {canStart && <div className="absolute inset-0 animate-shimmer pointer-events-none" />}
                <span className="relative">{t.actions.start}</span>
              </button>
              {!canStart && (
                <p className="text-text-muted text-sm text-center mt-3">{t.multiplayer.needMorePlayers}</p>
              )}
            </>
          ) : (
            <div className="text-center bg-game-surface/40 rounded-xl p-4 border border-border-subtle">
              <div className="inline-flex items-center gap-2.5 text-text-secondary text-sm">
                <div className="w-2 h-2 rounded-full bg-game-gold animate-pulse" />
                {t.multiplayer.waitingForHost}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
