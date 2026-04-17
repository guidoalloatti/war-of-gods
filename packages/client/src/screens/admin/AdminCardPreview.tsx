import { useI18n } from '../../i18n/index.js';

const TYPE_COLORS: Record<string, string> = {
  world_era1: '#8b5cf6',
  era1: '#3b82f6',
  relic: '#f59e0b',
};

type Props = {
  cardType: string;
  name: string;
  nameEn: string;
  flavorText: string;
  flavorTextEn: string;
  mechanicalText: string;
  mechanicalTextEn: string;
};

export function AdminCardPreview({ cardType, name, nameEn, flavorText, flavorTextEn, mechanicalText, mechanicalTextEn }: Props) {
  const locale = useI18n(s => s.locale);
  const t = useI18n(s => s.t);

  const color = TYPE_COLORS[cardType] ?? '#6b7280';
  const displayName = locale === 'en' ? (nameEn || name || 'Untitled') : (name || 'Sin nombre');
  const displayFlavor = locale === 'en' ? (flavorTextEn || flavorText) : (flavorText || flavorTextEn);
  const displayMechanical = locale === 'en' ? (mechanicalTextEn || mechanicalText) : (mechanicalText || mechanicalTextEn);
  const typeLabel = (t.admin as Record<string, string>)[cardType] ?? cardType;

  return (
    <div
      className="rounded-xl border-2 overflow-hidden transition-all"
      style={{
        borderColor: `${color}40`,
        background: `linear-gradient(180deg, ${color}15 0%, ${color}05 40%, transparent 100%)`,
        boxShadow: `0 0 20px ${color}15, inset 0 1px 0 ${color}10`,
      }}
    >
      {/* Card header */}
      <div
        className="px-4 py-2.5 border-b flex items-center justify-between"
        style={{ borderColor: `${color}20` }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: `${color}aa` }}>
            {typeLabel}
          </div>
          <h3 className="text-text-primary font-bold text-sm">{displayName}</h3>
        </div>
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }}
        />
      </div>

      {/* Flavor text */}
      {displayFlavor && (
        <div className="px-4 py-2.5 border-b" style={{ borderColor: `${color}10` }}>
          <p className="text-text-secondary text-xs italic leading-relaxed">
            &ldquo;{displayFlavor}&rdquo;
          </p>
        </div>
      )}

      {/* Mechanical effect */}
      {displayMechanical && (
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5" style={{ color: `${color}90` }}>
            {t.era1.effect}
          </div>
          <p className="text-text-primary/90 text-xs leading-relaxed font-medium">
            {displayMechanical}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!displayFlavor && !displayMechanical && (
        <div className="px-4 py-6 text-center">
          <p className="text-text-muted text-xs italic">Fill in the card details to see a preview</p>
        </div>
      )}
    </div>
  );
}
