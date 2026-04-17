import { useAdminStore } from '../../stores/adminStore.js';
import { useI18n } from '../../i18n/index.js';

const TYPE_COLORS: Record<string, string> = {
  world_era1: '#8b5cf6',
  era1: '#3b82f6',
  relic: '#f59e0b',
};

export function AdminDashboard() {
  const stats = useAdminStore(s => s.stats);
  const cards = useAdminStore(s => s.cards);
  const setView = useAdminStore(s => s.setView);
  const setTypeFilter = useAdminStore(s => s.setTypeFilter);
  const t = useI18n(s => s.t);

  const totalCards = Object.values(stats).reduce((a, b) => a + b, 0);
  const activeCards = cards.filter(c => c.active).length;

  const recentCards = [...cards]
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, 5);

  function handleTypeClick(type: string) {
    setTypeFilter(type);
    setView('list');
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-text-primary mb-6">{t.admin.dashboard}</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label={t.admin.totalCards}
          value={totalCards}
          color="#f5c518"
        />
        <StatCard
          label={t.admin.activeCards}
          value={activeCards}
          color="#22c55e"
        />
        <StatCard
          label={t.admin.cardTypes}
          value={Object.keys(stats).length}
          color="#3b82f6"
        />
      </div>

      {/* Card type breakdown */}
      <div className="bg-game-surface/50 border border-border-subtle rounded-xl p-5 mb-6">
        <h2 className="text-text-primary font-semibold text-sm mb-4">{t.admin.cardTypes}</h2>
        <div className="space-y-3">
          {Object.entries(stats).map(([type, count]) => {
            const color = TYPE_COLORS[type] ?? '#6b7280';
            const pct = totalCards > 0 ? (count / totalCards) * 100 : 0;
            const typeLabel = (t.admin as Record<string, string>)[type] ?? type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeClick(type)}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text-secondary text-xs font-medium group-hover:text-game-gold transition-colors">
                    {typeLabel}
                  </span>
                  <span className="text-text-muted text-xs">{count}</span>
                </div>
                <div className="h-2 bg-game-bg rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recently updated */}
      {recentCards.length > 0 && (
        <div className="bg-game-surface/50 border border-border-subtle rounded-xl p-5">
          <h2 className="text-text-primary font-semibold text-sm mb-4">{t.admin.recentlyUpdated}</h2>
          <div className="space-y-2">
            {recentCards.map(card => {
              const color = TYPE_COLORS[card.card_type] ?? '#6b7280';
              return (
                <div
                  key={card.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-game-bg/50 transition-colors cursor-default"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-text-primary text-sm font-medium truncate block">{card.name}</span>
                  </div>
                  <span className="text-text-muted text-xs shrink-0">
                    {new Date(card.updated_at * 1000).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="bg-game-surface/50 border border-border-subtle rounded-xl p-4"
      style={{ borderLeftColor: `${color}60`, borderLeftWidth: 3 }}
    >
      <div className="text-text-muted text-xs font-medium mb-1">{label}</div>
      <div className="text-text-primary text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
