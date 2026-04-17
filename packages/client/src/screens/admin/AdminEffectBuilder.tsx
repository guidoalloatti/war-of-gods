import { useI18n } from '../../i18n/index.js';

const EFFECT_TYPES = [
  'modify_draw_count',
  'modify_trade_limit',
  'skip_trade_phase',
  'bonus_per_terrain',
  'flat_bonus',
  'free_tech_level',
  'swap_relic',
  'grant_relic_to_all',
  'draw_two_era_cards_keep_one',
  'bonus_per_favorable',
  'bonus_per_road',
  'bonus_for_all_terrains',
  'all_players_bonus',
  'double_if_positive',
  'modify_road_requirement',
  'waive_road_requirement',
  'discard_and_redraw',
  'manual_pick',
  'view_opponents_tiles',
  'double_favorable_tiles',
  'return_tiles_to_pile',
] as const;

const TRIGGER_TYPES = [
  'on_draw',
  'on_score',
  'on_trade',
  'on_reveal',
  'immediate',
] as const;

type Effect = Record<string, unknown>;

type Props = {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
};

export function AdminEffectBuilder({ effects, onChange }: Props) {
  const t = useI18n(s => s.t);

  function addEffect() {
    onChange([...effects, { type: 'flat_bonus', trigger: 'on_score', params: {} }]);
  }

  function removeEffect(index: number) {
    onChange(effects.filter((_, i) => i !== index));
  }

  function updateEffect(index: number, field: string, value: unknown) {
    const updated = effects.map((eff, i) => {
      if (i !== index) return eff;
      return { ...eff, [field]: value };
    });
    onChange(updated);
  }

  function updateParam(index: number, key: string, value: string) {
    const eff = effects[index];
    const params = (eff.params as Record<string, unknown>) ?? {};
    const numVal = Number(value);
    const updated = { ...params, [key]: isNaN(numVal) ? value : numVal };
    updateEffect(index, 'params', updated);
  }

  function removeParam(index: number, key: string) {
    const eff = effects[index];
    const params = { ...(eff.params as Record<string, unknown>) };
    delete params[key];
    updateEffect(index, 'params', params);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-text-muted text-xs font-medium">{t.admin.effects}</label>
        <button
          type="button"
          onClick={addEffect}
          className="flex items-center gap-1 text-game-gold text-xs font-medium hover:text-game-gold/80 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t.admin.addEffect}
        </button>
      </div>

      {effects.length === 0 ? (
        <div className="text-text-muted text-xs text-center py-4 bg-game-surface/30 rounded-lg border border-border-subtle border-dashed">
          No effects configured
        </div>
      ) : (
        <div className="space-y-3">
          {effects.map((eff, i) => (
            <div key={i} className="bg-game-surface/30 border border-border-subtle rounded-lg p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  {/* Effect type */}
                  <div>
                    <label className="block text-text-muted text-[10px] font-medium mb-1">{t.admin.effectType}</label>
                    <select
                      value={(eff.type as string) ?? ''}
                      onChange={e => updateEffect(i, 'type', e.target.value)}
                      className="w-full bg-game-bg/50 border border-border-subtle rounded-md px-2 py-1.5 text-xs text-text-primary focus:border-game-gold/30 focus:outline-none"
                    >
                      {EFFECT_TYPES.map(et => (
                        <option key={et} value={et}>{et}</option>
                      ))}
                    </select>
                  </div>

                  {/* Trigger */}
                  <div>
                    <label className="block text-text-muted text-[10px] font-medium mb-1">{t.admin.trigger}</label>
                    <select
                      value={(eff.trigger as string) ?? 'on_score'}
                      onChange={e => updateEffect(i, 'trigger', e.target.value)}
                      className="w-full bg-game-bg/50 border border-border-subtle rounded-md px-2 py-1.5 text-xs text-text-primary focus:border-game-gold/30 focus:outline-none"
                    >
                      {TRIGGER_TYPES.map(tt => (
                        <option key={tt} value={tt}>{tt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeEffect(i)}
                  className="p-1 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors mt-4"
                  title={t.admin.removeEffect}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Params */}
              <div className="mt-2">
                <ParamEditor
                  params={(eff.params as Record<string, unknown>) ?? {}}
                  onUpdate={(key, value) => updateParam(i, key, value)}
                  onRemove={(key) => removeParam(i, key)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ParamEditor({
  params,
  onUpdate,
  onRemove,
}: {
  params: Record<string, unknown>;
  onUpdate: (key: string, value: string) => void;
  onRemove: (key: string) => void;
}) {
  const entries = Object.entries(params);

  function addParam() {
    const key = prompt('Parameter name:');
    if (key && !(key in params)) {
      onUpdate(key, '');
    }
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-text-muted text-[10px] font-mono w-24 truncate shrink-0">{key}</span>
          <input
            type="text"
            value={String(val ?? '')}
            onChange={e => onUpdate(key, e.target.value)}
            className="flex-1 bg-game-bg/50 border border-border-subtle rounded-md px-2 py-1 text-xs text-text-primary focus:border-game-gold/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onRemove(key)}
            className="text-text-muted hover:text-red-400 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addParam}
        className="text-text-muted hover:text-game-gold text-[10px] font-medium transition-colors"
      >
        + Add parameter
      </button>
    </div>
  );
}
