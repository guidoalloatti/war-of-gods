import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore.js';
import { useAdminStore } from '../../stores/adminStore.js';
import { useI18n } from '../../i18n/index.js';
import { AdminDashboard } from './AdminDashboard.js';
import { AdminCardList } from './AdminCardList.js';
import { AdminCardEditor } from './AdminCardEditor.js';

export function AdminLayout() {
  const setScreen = useGameStore(s => s.setScreen);
  const view = useAdminStore(s => s.view);
  const setView = useAdminStore(s => s.setView);
  const t = useI18n(s => s.t);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    useAdminStore.getState().loadCards();
    useAdminStore.getState().loadStats();
  }, []);

  const navItems = [
    { key: 'dashboard' as const, label: t.admin.dashboard, icon: DashboardIcon },
    { key: 'list' as const, label: t.admin.cards, icon: CardsIcon },
  ];

  function handleNav(key: 'dashboard' | 'list') {
    setView(key);
    setSidebarOpen(false);
  }

  return (
    <div className="min-h-screen bg-game-bg flex relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40 md:z-auto
        w-56 bg-game-surface/95 md:bg-game-surface/50 border-r border-border-subtle flex flex-col shrink-0
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo area */}
        <div className="px-4 py-5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-game-gold/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-game-gold" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
              </svg>
            </div>
            <div>
              <div className="text-text-primary text-sm font-bold">War of Gods</div>
              <div className="text-text-muted text-[10px] uppercase tracking-wider">{t.admin.title}</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => handleNav(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                view === item.key || (view === 'editor' && item.key === 'list')
                  ? 'bg-game-gold/10 text-game-gold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-game-surface'
              }`}
            >
              <item.icon active={view === item.key || (view === 'editor' && item.key === 'list')} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Back to game */}
        <div className="p-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-game-surface transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            {t.admin.backToGame}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-game-surface/50">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-game-surface border border-border-subtle text-text-secondary"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-text-primary font-bold text-sm">
            {navItems.find(n => n.key === view || (view === 'editor' && n.key === 'list'))?.label ?? t.admin.title}
          </span>
        </div>

        {view === 'dashboard' && <AdminDashboard />}
        {view === 'list' && <AdminCardList />}
        {view === 'editor' && <AdminCardEditor />}
      </main>
    </div>
  );
}

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-game-gold' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function CardsIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-game-gold' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  );
}
