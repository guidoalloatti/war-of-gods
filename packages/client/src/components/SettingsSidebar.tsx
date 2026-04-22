import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useI18n } from '../i18n/index.js';
import type { Locale, Theme } from '../i18n/index.js';
import { useAuth } from '../stores/authStore.js';
import { useGameStore } from '../stores/gameStore.js';

type Props = {
  open: boolean;
  onClose: () => void;
};

const LANGUAGES: { code: Locale; flag: string }[] = [
  { code: 'en', flag: 'EN' },
  { code: 'es', flag: 'ES' },
];

// ── Accordion section ────────────────────────────────────────────

function Accordion({ title, icon, defaultOpen, children }: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-game-surface/60 hover:bg-game-surface/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-text-primary font-medium text-xs">{title}</span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-3 bg-game-bg/20">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Profile edit panel ───────────────────────────────────────────

function ProfileEditPanel({ onBack }: { onBack: () => void }) {
  const t = useI18n(s => s.t);
  const user = useAuth(s => s.user);
  const [displayName, setDisplayName] = useState(user?.name ?? '');

  function handleSave() {
    // For now, just close - when backend supports profile update, dispatch here
    onBack();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border-subtle flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="text-text-muted hover:text-text-primary w-10 h-10 flex items-center justify-center rounded-lg hover:bg-hover-bg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-text-primary font-medium text-sm">{t.auth.editProfile}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Avatar */}
        {user?.picture && (
          <div className="flex justify-center">
            <img
              src={user.picture}
              alt={user.name}
              className="w-20 h-20 rounded-full border-2 border-border-medium"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        {/* Display name */}
        <label className="block">
          <span className="text-text-secondary text-[10px] uppercase tracking-wider font-medium">
            {t.auth.displayName}
          </span>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="mt-1 w-full bg-game-surface/80 text-text-primary rounded-lg px-3 py-2 border border-border-subtle focus:border-game-gold/50 focus:outline-none transition-all text-sm"
          />
        </label>

        {/* Email (read-only) */}
        <label className="block">
          <span className="text-text-secondary text-[10px] uppercase tracking-wider font-medium">
            {t.auth.email}
          </span>
          <input
            type="email"
            value={user?.email ?? ''}
            readOnly
            className="mt-1 w-full bg-game-surface/40 text-text-muted rounded-lg px-3 py-2 border border-border-subtle text-sm cursor-not-allowed"
          />
        </label>
      </div>

      {/* Footer buttons */}
      <div className="p-3 border-t border-border-subtle flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 bg-game-surface/60 text-text-secondary py-2 rounded-lg text-sm border border-border-subtle hover:text-text-primary transition-colors"
        >
          {t.auth.cancel}
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 bg-game-gold text-game-bg py-2 rounded-lg font-bold text-sm transition-all hover:brightness-110"
        >
          {t.auth.save}
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

export function SettingsSidebar({ open, onClose }: Props) {
  const t = useI18n(s => s.t);
  const locale = useI18n(s => s.locale);
  const setLocale = useI18n(s => s.setLocale);
  const theme = useI18n(s => s.theme);
  const setTheme = useI18n(s => s.setTheme);
  const mapFontScale = useI18n(s => s.mapFontScale);
  const setMapFontScale = useI18n(s => s.setMapFontScale);
  const fogOfWar = useI18n(s => s.fogOfWar);
  const setFogOfWar = useI18n(s => s.setFogOfWar);
  const user = useAuth(s => s.user);
  const login = useAuth(s => s.login);
  const logout = useAuth(s => s.logout);
  const gameState = useGameStore(s => s.gameState);
  const abandonGame = useGameStore(s => s.abandonGame);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Reset profile view and abandon confirm when sidebar closes
  useEffect(() => {
    if (!open) {
      setShowProfile(false);
      setShowAbandonConfirm(false);
    }
  }, [open]);

  return createPortal(
    <>
      {/* Overlay — only when open */}
      {open && (
        <div
          id="settings-overlay"
          className="fixed inset-0 bg-overlay-bg z-[90] backdrop-blur-sm animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel — slides in from the right to avoid colliding with the left game sidebar */}
      <div
        id="settings-sidebar"
        ref={sidebarRef}
        className={`fixed top-0 right-0 bottom-0 z-[100] w-72 max-w-[85vw] flex flex-col bg-game-surface border-l border-border-medium shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal={open}
        aria-label={t.settings.title}
      >
        {/* Show profile edit panel if active */}
        {showProfile ? (
          <ProfileEditPanel onBack={() => setShowProfile(false)} />
        ) : (
          <>
            {/* Header with close + toggles */}
            <div className="px-3 py-2.5 border-b border-border-subtle flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                {/* Language toggle */}
                <div className="flex items-center gap-0.5 bg-game-bg/40 rounded-lg p-0.5 border border-border-subtle">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setLocale(lang.code)}
                      className={`w-9 h-8 flex items-center justify-center rounded-md text-xs font-bold tracking-wide transition-all ${
                        locale === lang.code
                          ? 'bg-game-accent text-white shadow-sm'
                          : 'text-text-muted hover:text-text-primary hover:bg-white/5'
                      }`}
                      title={lang.code === 'en' ? 'English' : 'Español'}
                    >
                      {lang.flag}
                    </button>
                  ))}
                </div>

                {/* Theme toggle */}
                <div className="flex items-center gap-0.5 bg-game-bg/40 rounded-lg p-0.5 border border-border-subtle">
                  {([
                    { code: 'dark' as Theme, icon: (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    )},
                    { code: 'light' as Theme, icon: (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    )},
                  ]).map(opt => (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => setTheme(opt.code)}
                      className={`w-9 h-8 flex items-center justify-center rounded-md transition-all ${
                        theme === opt.code
                          ? 'bg-game-accent text-white shadow-sm'
                          : 'text-text-muted hover:text-text-primary hover:bg-white/5'
                      }`}
                      title={opt.code === 'dark' ? t.settings.dark : t.settings.light}
                    >
                      {opt.icon}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="text-text-muted hover:text-text-primary w-9 h-9 flex items-center justify-center rounded-lg hover:bg-hover-bg transition-colors shrink-0"
                aria-label={t.settings.close}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Font size control — right below the header */}
            <div className="px-3 py-2 border-b border-border-subtle shrink-0">
              <div className="text-text-muted text-[10px] uppercase tracking-wider mb-1.5">{t.settings.mapFontSize}</div>
              <div className="flex items-center gap-2">
                <span className="text-text-faint text-[9px] shrink-0">{t.settings.mapFontSizeSmall}</span>
                <input
                  type="range"
                  min={0.6}
                  max={2.5}
                  step={0.1}
                  value={mapFontScale}
                  onChange={e => setMapFontScale(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 accent-game-gold cursor-pointer"
                />
                <span className="text-text-faint text-[9px] shrink-0">{t.settings.mapFontSizeLarge}</span>
              </div>
              <div className="flex justify-between mt-1">
                {[0.7, 1.0, 1.4, 2.0, 2.5].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMapFontScale(v)}
                    className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${Math.abs(mapFontScale - v) < 0.05 ? 'bg-game-gold/20 text-game-gold' : 'text-text-muted hover:text-text-primary'}`}
                  >
                    {v === 0.7 ? 'XS' : v === 1.0 ? 'S' : v === 1.4 ? 'M' : v === 2.0 ? 'L' : 'XL'}
                  </button>
                ))}
              </div>
            </div>

            {/* Fog of War toggle */}
            <div className="px-3 py-2 border-b border-border-subtle shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-text-muted text-[10px] uppercase tracking-wider">{t.settings.fogOfWar}</div>
                  <div className="text-text-faint text-[9px] mt-0.5">{t.settings.fogOfWarDesc}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFogOfWar(!fogOfWar)}
                  className={`relative w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none ${fogOfWar ? 'bg-game-gold' : 'bg-game-surface border border-border-subtle'}`}
                  role="switch"
                  aria-checked={fogOfWar}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${fogOfWar ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* How to play — visual timeline */}
              <Accordion
                title={t.sidebar.helpTitle}
                defaultOpen
                icon={
                  <svg className="w-3.5 h-3.5 text-game-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              >
                <div className="relative pl-5">
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-game-gold/20" />
                  {(t.sidebar.helpContent as string[]).map((step, i) => (
                    <div key={i} className="relative pb-3 last:pb-0">
                      <div className="absolute left-[-13px] top-[3px] w-[11px] h-[11px] rounded-full border-2 border-game-gold/40 bg-game-bg" />
                      <p className="text-text-secondary text-[11px] leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </Accordion>

              {/* Scoring rules */}
              <Accordion
                title={t.sidebar.rulesTitle}
                icon={
                  <svg className="w-3.5 h-3.5 text-game-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                }
              >
                <div className="space-y-2">
                  <div className="rounded-lg border border-border-subtle overflow-hidden">
                    <div className="px-2.5 py-1.5 bg-green-500/5 border-b border-border-subtle">
                      <span className="text-green-400 text-[10px] font-bold uppercase tracking-wider">Bonuses</span>
                    </div>
                    <div className="divide-y divide-border-subtle">
                      {[
                        { label: t.scoring.base, desc: t.sidebar.rulesBase, icon: '=' },
                        { label: t.scoring.terrainBonus, desc: t.sidebar.rulesTerrainBonus, icon: '+' },
                        { label: t.scoring.roadBonus, desc: t.sidebar.rulesRoadBonus, icon: '+' },
                        { label: t.scoring.diversityBonus, desc: t.sidebar.rulesDiversity, icon: '+' },
                        { label: t.scoring.balanceBonus, desc: t.sidebar.rulesBalance, icon: '+' },
                        { label: t.scoring.adjacencyBonus, desc: t.sidebar.rulesAdjacency, icon: '±' },
                        { label: t.scoring.roadConnectionBonus, desc: t.sidebar.rulesRoadConnection, icon: '+' },
                        { label: t.scoring.cardEffects, desc: t.sidebar.rulesCards, icon: '+' },
                      ].map(rule => (
                        <div key={rule.label} className="px-2.5 py-2 flex gap-2">
                          <span className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold text-green-400 bg-green-400/10 shrink-0 mt-0.5">
                            {rule.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="text-text-primary text-[11px] font-semibold">{rule.label}</div>
                            <div className="text-text-muted text-[10px] leading-snug">{rule.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-subtle overflow-hidden">
                    <div className="px-2.5 py-1.5 bg-red-500/5 border-b border-border-subtle">
                      <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Penalties</span>
                    </div>
                    <div className="px-2.5 py-2 flex gap-2">
                      <span className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold text-red-400 bg-red-400/10 shrink-0 mt-0.5">
                        -
                      </span>
                      <div className="min-w-0">
                        <div className="text-text-primary text-[11px] font-semibold">{t.scoring.concentrationPenalty}</div>
                        <div className="text-text-muted text-[10px] leading-snug">{t.sidebar.rulesConcentration}</div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2.5 py-2 bg-game-gold/5 border border-game-gold/15 rounded-lg">
                    <div className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-0.5">{t.scoring.total}</div>
                    <p className="text-text-secondary text-[10px] leading-snug font-mono">
                      {t.sidebar.rulesFormula}
                    </p>
                  </div>
                </div>
              </Accordion>

              {/* Road bonus table */}
              <Accordion
                title={t.scoring.roadBonus}
                icon={
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                  </svg>
                }
              >
                <div className="grid grid-cols-8 gap-1 text-[10px]">
                  {[
                    ['0', '-9'], ['1', '-6'], ['2', '-3'], ['3', '0'],
                    ['4', '+1'], ['5', '+3'], ['6', '+5'], ['7+', '+6'],
                  ].map(([roads, bonus]) => (
                    <div key={roads} className="bg-game-surface/60 rounded px-1 py-1.5 text-center border border-border-subtle">
                      <div className="text-text-muted text-[8px]">R</div>
                      <div className="text-text-primary font-bold">{roads}</div>
                      <div className={`font-bold ${bonus.startsWith('-') ? 'text-red-400' : bonus === '0' ? 'text-text-muted' : 'text-green-400'}`}>
                        {bonus}
                      </div>
                    </div>
                  ))}
                </div>
              </Accordion>

              {/* Race terrain values */}
              <Accordion
                title={t.raceSelection.terrainPoints}
                icon={
                  <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                }
              >
                <div>
                  <div className="grid gap-1 mb-1.5 text-[10px] text-text-muted font-medium" style={{ gridTemplateColumns: '4.5rem repeat(4, 1fr) 1.5rem' }}>
                    <span />
                    <span className="text-center">P</span>
                    <span className="text-center">M</span>
                    <span className="text-center">F</span>
                    <span className="text-center">S</span>
                    <span className="text-center">=</span>
                  </div>
                  {(['elf', 'dwarf', 'human', 'halfelf', 'orc', 'giant', 'goblin', 'halforc'] as const).map(raceId => {
                    const values: Record<string, number[]> = {
                      elf: [1, 0, 3, 1], dwarf: [0, 4, 0, 1], human: [3, 0, 1, 1], halfelf: [2, 1, 2, 0],
                      orc: [1, 0, 1, 3], giant: [0, 3, 1, 1], goblin: [1, 1, 2, 1], halforc: [2, 1, 0, 2],
                    };
                    const v = values[raceId];
                    return (
                      <div key={raceId} className="grid gap-1 items-center py-1 border-t border-border-subtle" style={{ gridTemplateColumns: '4.5rem repeat(4, 1fr) 1.5rem' }}>
                        <span className="text-text-secondary text-[10px] truncate">{t.races[raceId]}</span>
                        {v.map((val, j) => (
                          <span key={j} className={`text-center text-[10px] font-mono font-bold ${val === 0 ? 'text-text-faint' : val >= 3 ? 'text-green-400' : 'text-text-secondary'}`}>
                            {val}
                          </span>
                        ))}
                        <span className="text-center text-[10px] font-mono font-bold text-game-gold">5</span>
                      </div>
                    );
                  })}
                </div>
              </Accordion>
            </div>

            {/* ── Abandon game — only shown when a game is active ── */}
            {gameState && (
              <div className="border-t border-border-subtle p-3 shrink-0">
                {showAbandonConfirm ? (
                  <div className="space-y-2">
                    <p className="text-text-secondary text-[11px] leading-snug">{t.settings.abandonGameConfirm}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAbandonConfirm(false)}
                        className="flex-1 bg-game-surface/60 text-text-secondary py-1.5 rounded-lg text-xs border border-border-subtle hover:text-text-primary transition-colors"
                      >
                        {t.actions.back}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void abandonGame(); onClose(); }}
                        className="flex-1 bg-game-accent/90 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-game-accent transition-colors"
                      >
                        {t.settings.abandonGameConfirmBtn}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAbandonConfirm(true)}
                    className="w-full flex items-center justify-center gap-1.5 text-text-muted hover:text-error-text text-xs py-1.5 rounded-lg hover:bg-error-bg/20 transition-colors border border-transparent hover:border-error-bg/40"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {t.settings.abandonGame}
                  </button>
                )}
              </div>
            )}

            {/* ── Account section — fixed at bottom ── */}
            <div className="border-t border-border-subtle p-3 shrink-0">
              {user ? (
                <div className="flex items-center gap-2.5">
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-9 h-9 rounded-full shrink-0 cursor-pointer hover:ring-2 hover:ring-game-gold/40 transition-all"
                    referrerPolicy="no-referrer"
                    onClick={() => setShowProfile(true)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary text-sm font-medium truncate">{user.name}</div>
                    <button
                      type="button"
                      onClick={() => setShowProfile(true)}
                      className="text-text-muted text-[10px] hover:text-game-gold transition-colors"
                    >
                      {t.auth.editProfile}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="text-text-muted hover:text-error-text p-1.5 rounded-lg hover:bg-error-bg/30 transition-colors shrink-0"
                    title={t.auth.logout}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <GoogleLogin
                    onSuccess={async (response) => {
                      if (response.credential) {
                        try {
                          setAuthError(null);
                          await login(response.credential);
                        } catch {
                          setAuthError(t.auth.loginFailed);
                        }
                      }
                    }}
                    onError={() => setAuthError(t.auth.loginFailed)}
                    size="medium"
                    theme={theme === 'dark' ? 'filled_black' : 'outline'}
                    shape="pill"
                    text="signin_with"
                  />
                  {authError && (
                    <p className="text-error-text text-[10px]">{authError}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
