import type { Translations } from '../../i18n/es.js';

export function DoomClockDisplay({ value, t }: { value: number; t: Translations }) {
  const pct = Math.max(0, Math.min(1, value / 12));
  const hue = 20 + pct * 40; // red → orange → gold as clock goes up

  return (
    <div
      className="bg-game-surface/60 border border-border-subtle rounded-xl p-3 animate-fade-in relative overflow-hidden"
      title={t.doomClock.tooltip}
    >
      <div className="text-text-secondary text-xs uppercase tracking-wider font-semibold mb-1">
        {t.doomClock.label}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-4xl" style={{ filter: `hue-rotate(${hue - 30}deg)` }}>
          ⏳
        </div>
        <div className="flex-1">
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: `hsl(${hue}, 80%, 55%)` }}
          >
            {value}
          </div>
          <div className="h-1 bg-game-bg rounded-full overflow-hidden mt-1">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct * 100}%`,
                background: `hsl(${hue}, 80%, 55%)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
