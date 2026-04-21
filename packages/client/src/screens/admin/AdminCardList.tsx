import { useEffect, useCallback } from 'react';
import { useAdminStore } from '../../stores/adminStore.js';
import { useI18n } from '../../i18n/index.js';

const CARD_TYPES = [
  'world_era1', 'world_era2', 'world_era3',
  'era1', 'era2', 'era3',
  'relic',
] as const;

const TYPE_COLORS: Record<string, string> = {
  world_era1: '#8b5cf6',
  world_era2: '#a855f7',
  world_era3: '#c084fc',
  era1: '#3b82f6',
  era2: '#0ea5e9',
  era3: '#06b6d4',
  relic: '#f59e0b',
};

export function AdminCardList() {
  const cards = useAdminStore(s => s.cards);
  const loading = useAdminStore(s => s.loading);
  const typeFilter = useAdminStore(s => s.typeFilter);
  const searchQuery = useAdminStore(s => s.searchQuery);
  const setTypeFilter = useAdminStore(s => s.setTypeFilter);
  const setSearchQuery = useAdminStore(s => s.setSearchQuery);
  const loadCards = useAdminStore(s => s.loadCards);
  const startNewCard = useAdminStore(s => s.startNewCard);
  const startEditCard = useAdminStore(s => s.startEditCard);
  const removeCard = useAdminStore(s => s.removeCard);
  const duplicateCard = useAdminStore(s => s.duplicateCard);
  const success = useAdminStore(s => s.success);
  const error = useAdminStore(s => s.error);
  const clearMessages = useAdminStore(s => s.clearMessages);
  const t = useI18n(s => s.t);
  const locale = useI18n(s => s.locale);

  const debouncedSearch = useCallback(() => {
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    const timer = setTimeout(debouncedSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, debouncedSearch]);

  // Filter cards by search client-side (in addition to server-side)
  const filteredCards = cards.filter(card => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      card.name.toLowerCase().includes(q) ||
      card.name_en.toLowerCase().includes(q) ||
      card.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">{t.admin.cards}</h1>
        <button
          type="button"
          onClick={startNewCard}
          className="flex items-center gap-2 bg-game-gold text-game-bg font-bold text-sm px-4 py-2 rounded-lg hover:brightness-110 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t.admin.newCard}
        </button>
      </div>

      {/* Messages */}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg text-sm mb-4 flex items-center justify-between">
          <span>{(t.admin as Record<string, string>)[success] ?? success}</span>
          <button type="button" onClick={clearMessages} className="text-emerald-400/60 hover:text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {error && (
        <div className="bg-error-bg text-error-text px-4 py-2 rounded-lg text-sm mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={clearMessages} className="text-error-text/60 hover:text-error-text">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t.admin.search}
            className="w-full bg-game-surface/50 border border-border-subtle rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-game-gold/30 focus:outline-none transition-colors"
          />
        </div>

        {/* Type tabs */}
        <div className="flex items-center gap-1 bg-game-surface/30 rounded-lg p-0.5">
          <TypeTab
            label={t.admin.allTypes}
            active={typeFilter === null}
            onClick={() => setTypeFilter(null)}
          />
          {CARD_TYPES.map(type => (
            <TypeTab
              key={type}
              label={(t.admin as Record<string, string>)[type] ?? type}
              active={typeFilter === type}
              onClick={() => setTypeFilter(type)}
              color={TYPE_COLORS[type]}
            />
          ))}
        </div>
      </div>

      {/* Cards table */}
      {loading && cards.length === 0 ? (
        <div className="text-text-muted text-sm text-center py-12">Loading...</div>
      ) : filteredCards.length === 0 ? (
        <div className="text-text-muted text-sm text-center py-12">{t.admin.noCards}</div>
      ) : (
        <div className="bg-game-surface/30 border border-border-subtle rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider px-4 py-3">{t.admin.cardName}</th>
                <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider px-4 py-3">{t.admin.cardType}</th>
                <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider px-4 py-3">{t.admin.effects}</th>
                <th className="text-center text-text-muted text-xs font-medium uppercase tracking-wider px-4 py-3">{t.admin.active}</th>
                <th className="text-right text-text-muted text-xs font-medium uppercase tracking-wider px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredCards.map(card => {
                const color = TYPE_COLORS[card.card_type] ?? '#6b7280';
                const effects = JSON.parse(card.effects || '[]') as unknown[];
                const displayName = locale === 'en' && card.name_en ? card.name_en : card.name;
                return (
                  <tr
                    key={card.id}
                    className="border-b border-border-subtle/50 hover:bg-game-surface/30 transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => startEditCard(card)}
                        className="text-left"
                      >
                        <div className="text-text-primary text-sm font-medium hover:text-game-gold transition-colors">{displayName}</div>
                        <div className="text-text-muted text-xs truncate max-w-[300px]">{card.id}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {(t.admin as Record<string, string>)[card.card_type] ?? card.card_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-text-muted text-xs">{effects.length} effect{effects.length !== 1 ? 's' : ''}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {card.active ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => startEditCard(card)}
                          className="p-1.5 rounded-md hover:bg-game-gold/10 text-text-muted hover:text-game-gold transition-colors"
                          title={t.admin.editCard}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateCard(card.id)}
                          className="p-1.5 rounded-md hover:bg-blue-500/10 text-text-muted hover:text-blue-400 transition-colors"
                          title={t.admin.cloneCard}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(t.admin.confirmDelete)) removeCard(card.id);
                          }}
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                          title={t.admin.deleteCard}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TypeTab({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? 'bg-game-surface text-text-primary shadow-sm'
          : 'text-text-muted hover:text-text-secondary'
      }`}
      style={active && color ? { color } : undefined}
    >
      {label}
    </button>
  );
}
