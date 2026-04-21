import {
  BOSS_STACK_ID, DHAKHAN_OWNER_ID,
  unitAttack, unitDefense, unitMaxHp, isVeteran,
} from '@war-of-gods/engine';
import type { Hex, Stack, UnitType, Player, Unit } from '@war-of-gods/engine';
import { useI18n } from '../../i18n/index.js';

const UNIT_GLYPH: Record<UnitType, string> = {
  infantry: '🛡',
  ranged: '🏹',
  mounted: '🐎',
  siege: '🏰',
  flying: '🦅',
};

export function HexInspectorPanel({
  hex, stack, players, onClose,
}: {
  hex: Hex;
  stack: Stack | null;
  players: Player[];
  onClose: () => void;
}) {
  const t = useI18n(s => s.t);

  const ownerName = (() => {
    if (!stack) return null;
    if (stack.id === BOSS_STACK_ID) return t.era3.bossLabel;
    if (stack.ownerId === DHAKHAN_OWNER_ID) return t.era3.wrought;
    const p = players.find(pl => pl.id === stack.ownerId);
    return p?.name ?? stack.ownerId;
  })();

  const capitalOwnerName = hex.capitalOwnerId
    ? players.find(p => p.id === hex.capitalOwnerId)?.name ?? hex.capitalOwnerId
    : null;

  return (
    <div className="absolute top-2 left-2 z-30 panel max-w-[90vw] w-80 space-y-2 pointer-events-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">{t.era3.terrain[hex.terrain]}</div>
          <div className="text-text-muted text-[10px] tabular-nums">
            ({hex.coord.q}, {hex.coord.r})
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-sm w-6 h-6 flex items-center justify-center"
          aria-label="close"
        >
          ✕
        </button>
      </div>

      {hex.isCapital && (
        <div className="bg-game-gold/10 border border-game-gold/40 rounded-md px-2 py-1.5">
          <div className="text-game-gold text-[10px] uppercase tracking-wider font-semibold">
            {t.era3.legend.capital}
          </div>
          {capitalOwnerName && (
            <div className="text-text-primary text-xs mt-0.5">{capitalOwnerName}</div>
          )}
        </div>
      )}

      {hex.terrain === 'citadel' && (
        <div className="bg-game-accent/10 border border-game-accent/40 rounded-md px-2 py-1.5">
          <div className="text-game-accent text-[10px] uppercase tracking-wider font-semibold">
            {t.era3.legend.citadel}
          </div>
          <div className="text-text-secondary text-[11px] mt-0.5">
            {t.era3.citadelHint ?? 'The heart of Dhakhan.'}
          </div>
        </div>
      )}

      {hex.isSpawnZone && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-md px-2 py-1.5">
          <div className="text-red-400 text-[10px] uppercase tracking-wider font-semibold">
            {t.era3.legend.spawnZone}
          </div>
          <div className="text-text-secondary text-[11px] mt-0.5">
            {t.era3.spawnZoneHint ?? 'Wrought appear here each cycle.'}
          </div>
        </div>
      )}

      {stack && stack.units.length > 0 ? (
        <div className="border-t border-border-subtle pt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="eyebrow">
              {ownerName ?? t.era3.stackInfo.title}
            </div>
            <div className="chip-muted text-[10px]">
              {stack.units.length} / 6
            </div>
          </div>
          <ul className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
            {stack.units.map(u => (
              <UnitRow key={u.id} unit={u} t={t} />
            ))}
          </ul>
          <div className="mt-2 text-[10px] text-text-muted flex items-center justify-between">
            <span>
              {t.era3.movementLeft}: <span className="text-game-gold tabular-nums font-semibold">{stack.movementLeft}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-game-gold" />
              <span>{t.era3.veteranLegend ?? 'Veteran'}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="text-text-muted text-xs italic">
          {t.era3.stackInfo.noAdjacentEnemies ?? 'No units here'}
        </div>
      )}
    </div>
  );
}

function UnitRow({ unit, t }: { unit: Unit; t: ReturnType<typeof useI18n.getState>['t'] }) {
  const wins = unit.wins ?? 0;
  const veteran = isVeteran(unit);
  const atk = unitAttack(unit);
  const dfs = unitDefense(unit);
  const maxHp = unitMaxHp(unit);
  const hpPct = Math.max(0, Math.min(100, (unit.currentHp / maxHp) * 100));

  return (
    <li className={`rounded-md border px-2 py-1.5 ${veteran ? 'border-game-gold/60 bg-game-gold/5' : 'border-border-subtle bg-game-bg/60'}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg shrink-0">{UNIT_GLYPH[unit.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-text-primary text-xs font-semibold truncate">
              {t.units[unit.type]}
            </span>
            {veteran && (
              <span className="text-game-gold text-[9px] uppercase tracking-wider font-bold">
                ★ {t.era3.veteran ?? 'Veteran'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] tabular-nums mt-0.5">
            <span className="text-text-secondary">
              ⚔ <span className={veteran ? 'text-game-gold font-semibold' : 'text-text-primary'}>{atk}</span>
            </span>
            <span className="text-text-secondary">
              🛡 <span className={veteran ? 'text-game-gold font-semibold' : 'text-text-primary'}>{dfs}</span>
            </span>
            <span className="text-text-secondary">
              ❤ <span className="text-text-primary">{unit.currentHp}</span>
              <span className="text-text-muted">/{maxHp}</span>
            </span>
            <span className="text-text-muted ml-auto">
              {t.era3.wins ?? 'wins'}: <span className={veteran ? 'text-game-gold font-semibold' : ''}>{wins}</span>
            </span>
          </div>
          <div className="h-1 bg-game-bg rounded-full overflow-hidden mt-1">
            <div
              className={`h-full ${hpPct > 60 ? 'bg-emerald-500' : hpPct > 30 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
      </div>
    </li>
  );
}
