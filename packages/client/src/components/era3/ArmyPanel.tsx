import type { GameState, Stack, General, UnitType } from '@war-of-gods/engine';
import { GENERAL_MIN_STACK_SIZE, UNIT_DEFINITIONS, MAX_STACK_SIZE, ERA3_RECRUIT_COSTS, totalFoodConsumed, maxFoodCapacity, unitFoodCost } from '@war-of-gods/engine';
import { useI18n } from '../../i18n/index.js';

const UNIT_ICONS: Record<string, string> = {
  infantry: '🛡️', ranged: '🏹', mounted: '🐎', siege: '🏰', flying: '🦅',
};

function unitMaxHp(type: UnitType): number {
  const def = UNIT_DEFINITIONS.find(d => d.id === type);
  return def ? def.defense + 2 : 3;
}

function HpBar({ current, max, small }: { current: number; max: number; small?: boolean }) {
  const ratio = max > 0 ? Math.max(0, current) / max : 0;
  const color = ratio > 0.6 ? '#4ade80' : ratio > 0.3 ? '#facc15' : '#f87171';
  return (
    <div className="flex items-center gap-1">
      <div
        className="rounded-full overflow-hidden bg-game-bg/80 border border-border-subtle"
        style={{ width: small ? 36 : 48, height: small ? 4 : 5 }}
      >
        <div
          style={{ width: `${ratio * 100}%`, height: '100%', background: color, borderRadius: 9999, transition: 'width 0.25s' }}
        />
      </div>
      <span style={{ color, fontSize: 9, fontWeight: 700, tabularNums: true } as React.CSSProperties}>
        {current}/{max}
      </span>
    </div>
  );
}

type Props = {
  gameState: GameState;
  localPlayerId: string;
  goldCoins: number;
  recruitsThisTurn: number;
  roadsBuiltThisTurn: number;
  isMyTurn: boolean;
  onAssignGeneral: (generalId: string, stackId: string) => void;
  onUnassignGeneral: (stackId: string) => void;
  onSplitStack: (stackId: string, unitIds: string[]) => void;
};

export function ArmyPanel({
  gameState,
  localPlayerId,
  goldCoins,
  recruitsThisTurn,
  roadsBuiltThisTurn,
  isMyTurn,
  onAssignGeneral,
  onUnassignGeneral,
  onSplitStack,
}: Props) {
  const t = useI18n(s => s.t);
  const player = gameState.players.find(p => p.id === localPlayerId);
  if (!player?.era3State) return null;

  const allStacks = Object.values(gameState.era3Stacks ?? {});
  const playerStacks = allStacks.filter((s): s is Stack => s.ownerId === localPlayerId);
  const generals: General[] = player.era3State.generals ?? [];
  const reserve = generals.filter(g => !g.assignedStackId);

  // Total army size across all own stacks
  const totalUnits = playerStacks.reduce((s, st) => s + st.units.length, 0);
  const totalSlots = playerStacks.reduce((s, _) => s + MAX_STACK_SIZE, 0);

  // Food supply
  const foodConsumed = totalFoodConsumed(gameState.era3Stacks ?? {}, localPlayerId);
  const foodMax = maxFoodCapacity(player);
  const foodAvailable = foodMax - foodConsumed;
  const foodRatio = foodMax > 0 ? Math.min(foodConsumed / foodMax, 1) : 0;
  const foodColor = foodRatio >= 1 ? '#f87171' : foodRatio >= 0.8 ? '#facc15' : '#4ade80';

  // Per-unit-type affordable recruit check (also considers food cap)
  const affordableTypes = (Object.keys(ERA3_RECRUIT_COSTS) as UnitType[]).filter(
    ut => ERA3_RECRUIT_COSTS[ut] <= goldCoins && recruitsThisTurn < 3
      && foodConsumed + unitFoodCost(ut) <= foodMax,
  );

  if (playerStacks.length === 0 && generals.length === 0) {
    return <div className="text-text-muted text-xs italic">{t.era3.noUnits}</div>;
  }

  return (
    <div className="space-y-3">
      {/* ── Army summary header ── */}
      <div className="rounded-lg border border-border-subtle bg-game-bg/40 p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">{t.era3.army}</span>
          <span className="text-[11px] font-bold text-text-primary tabular-nums">
            {totalUnits}/{totalSlots} {t.era3.armySlots ?? 'slots'}
          </span>
        </div>
        {/* Overall HP bar */}
        {playerStacks.length > 0 && (() => {
          const hp = playerStacks.flatMap(s => s.units).reduce((s, u) => s + Math.max(0, u.currentHp), 0);
          const maxHp = playerStacks.flatMap(s => s.units).reduce((s, u) => s + unitMaxHp(u.type), 0);
          return <HpBar current={hp} max={maxHp} />;
        })()}

        {/* ── Food supply ── */}
        <div className="pt-1 border-t border-border-subtle/60 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-text-muted uppercase tracking-wider flex items-center gap-1">
              🌾 {t.era3.food}
            </span>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: foodColor }}>
              {foodConsumed}/{foodMax}
            </span>
          </div>
          {/* Food bar */}
          <div className="rounded-full overflow-hidden bg-game-bg/80 border border-border-subtle" style={{ height: 5 }}>
            <div
              style={{ width: `${foodRatio * 100}%`, height: '100%', background: foodColor, borderRadius: 9999, transition: 'width 0.25s' }}
            />
          </div>
          {/* Three stat cells */}
          <div className="grid grid-cols-3 gap-1 pt-0.5">
            <div className="text-center">
              <div className="text-[8px] text-text-muted uppercase tracking-wider">{t.era3.foodConsumed}</div>
              <div className="text-[11px] font-bold tabular-nums" style={{ color: foodColor }}>{foodConsumed}</div>
            </div>
            <div className="text-center">
              <div className="text-[8px] text-text-muted uppercase tracking-wider">{t.era3.foodMax}</div>
              <div className="text-[11px] font-bold tabular-nums text-text-primary">{foodMax}</div>
            </div>
            <div className="text-center">
              <div className="text-[8px] text-text-muted uppercase tracking-wider">{t.era3.foodAvailable}</div>
              <div className={`text-[11px] font-bold tabular-nums ${foodAvailable <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>{foodAvailable}</div>
            </div>
          </div>
          {foodAvailable <= 0 && (
            <div className="text-[9px] text-red-400 text-center font-semibold">{t.era3.foodCapExceeded}</div>
          )}
        </div>

        {/* Turn resource bars */}
        {isMyTurn && (
          <div className="grid grid-cols-2 gap-1 pt-1 border-t border-border-subtle/60">
            <div className="text-center">
              <div className="text-[9px] text-text-muted uppercase tracking-wider">{t.era3.recruit ?? 'Recruit'}</div>
              <div className="flex items-center justify-center gap-0.5 mt-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-sm border ${i < recruitsThisTurn ? 'bg-emerald-500 border-emerald-400' : 'bg-game-bg border-border-subtle'}`}
                  />
                ))}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-text-muted uppercase tracking-wider">{t.era3.buildRoad?.title ?? 'Roads'}</div>
              <div className="flex items-center justify-center gap-0.5 mt-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-sm border ${i < roadsBuiltThisTurn ? 'bg-amber-500 border-amber-400' : 'bg-game-bg border-border-subtle'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Recruit cost reference ── */}
      {isMyTurn && recruitsThisTurn < 3 && (
        <div className="rounded-lg border border-border-subtle bg-game-bg/30 p-1.5">
          <div className="eyebrow mb-1">{t.era3.recruit ?? 'Recruit'} ({recruitsThisTurn}/3)</div>
          <div className="grid grid-cols-5 gap-0.5">
            {(Object.keys(ERA3_RECRUIT_COSTS) as UnitType[]).map(ut => {
              const cost = ERA3_RECRUIT_COSTS[ut];
              const canAfford = affordableTypes.includes(ut);
              return (
                <div
                  key={ut}
                  className={`rounded p-1 text-center border ${canAfford ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border-subtle bg-game-bg/60 opacity-50'}`}
                  title={`${t.units[ut]} — 💰${cost} · 🌾${unitFoodCost(ut)}`}
                >
                  <div className="text-sm">{UNIT_ICONS[ut]}</div>
                  <div className="text-game-gold text-[9px] tabular-nums font-bold">💰{cost}</div>
                  <div className="text-emerald-400 text-[8px] tabular-nums">🌾{unitFoodCost(ut)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Generals reserve ── */}
      {reserve.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5">{t.era3.generalsReserve}</div>
          <div className="flex flex-wrap gap-1">
            {reserve.map(g => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1 rounded-lg border border-game-gold/40 bg-game-gold/10 px-2 py-1 text-[11px] text-game-gold"
                title={`+${g.attackBonus} atk / +${g.defenseBonus} def`}
              >
                <span>🎖️</span>
                <span className="font-semibold">{g.name}</span>
                <span className="text-game-gold/60">+{g.attackBonus}⚔️</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Stacks ── */}
      <div className="space-y-2">
        {playerStacks.map(stack => {
          const general = stack.generalId
            ? generals.find(g => g.id === stack.generalId) ?? null
            : null;
          const canGeneral = stack.units.length >= GENERAL_MIN_STACK_SIZE;
          const canSplit = stack.units.length > 1;
          const freeSlots = MAX_STACK_SIZE - stack.units.length;

          // Group units by type for compact display
          const byType: Record<string, { count: number; hp: number; maxHp: number }> = {};
          for (const u of stack.units) {
            if (!byType[u.type]) byType[u.type] = { count: 0, hp: 0, maxHp: 0 };
            byType[u.type].count++;
            byType[u.type].hp += Math.max(0, u.currentHp);
            byType[u.type].maxHp += unitMaxHp(u.type as UnitType);
          }
          const stackHp = stack.units.reduce((s, u) => s + Math.max(0, u.currentHp), 0);
          const stackMaxHp = stack.units.reduce((s, u) => s + unitMaxHp(u.type as UnitType), 0);

          return (
            <div
              key={stack.id}
              className="rounded-lg border border-border-subtle bg-game-bg/40 p-2 space-y-1.5"
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted text-[10px] tabular-nums">
                    ({stack.position.q},{stack.position.r})
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {stack.units.length}/{MAX_STACK_SIZE}🪖 · {stack.movementLeft}⚡
                  </span>
                </div>
                {general && (
                  <button
                    type="button"
                    onClick={() => onUnassignGeneral(stack.id)}
                    className="text-[10px] text-game-accent hover:text-red-300"
                  >
                    {t.era3.unassignGeneral}
                  </button>
                )}
              </div>

              {/* Stack HP bar */}
              <HpBar current={stackHp} max={stackMaxHp} />

              {/* Free slots */}
              {freeSlots > 0 && (
                <div className="flex gap-0.5">
                  {Array.from({ length: freeSlots }).map((_, i) => (
                    <div key={i} className="w-4 h-4 rounded border border-dashed border-border-medium opacity-40" />
                  ))}
                  <span className="text-[9px] text-text-muted ml-1 self-center">{freeSlots} {t.era3.freeSlots ?? 'libre'}</span>
                </div>
              )}

              {/* Unit type breakdown with individual HP bars */}
              <div className="space-y-1">
                {Object.entries(byType).map(([type, data]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <span className="text-sm w-5 text-center">{UNIT_ICONS[type] ?? '?'}</span>
                    <span className="text-[10px] text-text-secondary w-3 tabular-nums font-bold">×{data.count}</span>
                    <div className="flex-1">
                      <HpBar current={data.hp} max={data.maxHp} small />
                    </div>
                  </div>
                ))}
              </div>

              {/* General assignment */}
              {general ? (
                <div className="text-[11px] text-game-gold flex items-center gap-1">
                  <span>🎖️</span>
                  <span className="font-semibold">{general.name}</span>
                  <span className="text-text-muted">(+{general.attackBonus}⚔️ +{general.defenseBonus}🛡)</span>
                </div>
              ) : canGeneral && reserve.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {reserve.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onAssignGeneral(g.id, stack.id)}
                      className="text-[10px] text-game-gold hover:text-yellow-200 underline"
                    >
                      {t.era3.assignGeneral}: {g.name}
                    </button>
                  ))}
                </div>
              ) : !canGeneral ? (
                <div className="text-text-muted text-[10px] italic">
                  {t.era3.needUnitsForGeneral.replace('{min}', String(GENERAL_MIN_STACK_SIZE))}
                </div>
              ) : null}

              {/* Split controls */}
              {canSplit && (
                <div className="pt-1 border-t border-border-subtle/60">
                  <div className="text-[10px] text-text-muted mb-1">{t.era3.splitStack}:</div>
                  <div className="flex flex-wrap gap-1">
                    {stack.units.map(u => {
                      const maxHp = unitMaxHp(u.type as UnitType);
                      const ratio = maxHp > 0 ? Math.max(0, u.currentHp) / maxHp : 0;
                      const hpColor = ratio > 0.6 ? 'text-emerald-400' : ratio > 0.3 ? 'text-yellow-400' : 'text-red-400';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => onSplitStack(stack.id, [u.id])}
                          className="flex flex-col items-center rounded-md border border-border-subtle bg-game-bg/60 px-1.5 py-1 hover:border-border-medium group"
                          title={t.era3.detachUnit}
                        >
                          <span className="text-sm">{UNIT_ICONS[u.type]}</span>
                          <span className={`text-[9px] tabular-nums font-bold ${hpColor}`}>{u.currentHp}/{maxHp}</span>
                          <span className="text-[8px] text-text-faint group-hover:text-text-muted">↷</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
