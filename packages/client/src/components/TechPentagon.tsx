import { useCallback, useEffect, useRef, useState } from 'react';
import type { TechType, PlayerEra2State } from '@war-of-gods/engine';
import { TECH_TYPES, TECH_BENEFITS, calculateTechCost, getIncrementalCost } from '@war-of-gods/engine';
import type { Translations } from '../i18n/es.js';

interface Props {
  techLevels: Record<TechType, number>;
  era2?: PlayerEra2State;
  raceTechMax: Record<TechType, number>;
  t: Translations;
  size?: number;
  /** Era2: drag to set tech level. */
  onChange?: (tech: TechType, level: number) => void;
  disabled?: boolean;
  /** Era2 confirmed — lock interaction but still show. */
  confirmed?: boolean;
  /** Era3: per-click gold upgrade button. */
  onUpgrade?: (tech: TechType) => void;
  canUpgrade?: (tech: TechType) => boolean;
  goldCost?: (tech: TechType) => number;
  goldCoins?: number;
}

const TECH_COLORS: Record<TechType, string> = {
  war:       '#e94560',
  science:   '#38bdf8',
  resources: '#4ade80',
  economy:   '#fbbf24',
  religion:  '#c084fc',
};

const TECH_ICONS: Record<TechType, string> = {
  war:       '⚔️',
  science:   '🔬',
  resources: '🌾',
  economy:   '💰',
  religion:  '✨',
};

function axisAngle(index: number): number {
  return (2 * Math.PI * index) / 5 - Math.PI / 2;
}

function axisPoint(index: number, radius: number, cx: number, cy: number) {
  const a = axisAngle(index);
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

function levelToRadius(level: number, maxLevel: number, outerR: number): number {
  if (maxLevel <= 0) return 0;
  return (level / maxLevel) * outerR;
}

function radiusToLevel(dist: number, outerR: number, maxLevel: number): number {
  const raw = (dist / outerR) * maxLevel;
  return Math.max(0, Math.min(maxLevel, Math.round(raw)));
}

function dot(ax: number, ay: number, bx: number, by: number) {
  return ax * bx + ay * by;
}

export function TechPentagon({
  techLevels,
  era2,
  raceTechMax,
  t,
  size = 260,
  onChange,
  disabled = false,
  confirmed = false,
  onUpgrade,
  canUpgrade,
  goldCost,
  goldCoins = 0,
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.37;
  const labelR = size * 0.50;
  const hitR = 12; // drag handle hit radius

  const interactive = !!onChange && !disabled && !confirmed;

  // Dragging state: which tech axis is being dragged
  const dragging = useRef<{ techIdx: number; tech: TechType } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Hover state for tooltip
  const [hoveredTech, setHoveredTech] = useState<TechType | null>(null);
  const [previewLevels, setPreviewLevels] = useState<Partial<Record<TechType, number>>>({});

  const effectiveLevels: Record<TechType, number> = { ...techLevels };
  for (const [k, v] of Object.entries(previewLevels)) {
    (effectiveLevels as Record<string, number>)[k] = v as number;
  }

  const maxLevel = era2?.allowLevel6 ? 6 : 5;

  const getSvgPos = useCallback((e: MouseEvent | TouchEvent) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (size / rect.width),
      y: (clientY - rect.top) * (size / rect.height),
    };
  }, [size]);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging.current || !interactive) return;
    const pos = getSvgPos(e);
    if (!pos) return;
    const { techIdx, tech } = dragging.current;
    const a = axisAngle(techIdx);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    // Project onto axis direction
    const axDx = Math.cos(a);
    const axDy = Math.sin(a);
    const projection = dot(dx, dy, axDx, axDy);
    const clamped = Math.max(0, projection);
    const raceMax = raceTechMax[tech] ?? maxLevel;
    const lvl = radiusToLevel(clamped, outerR, Math.min(maxLevel, raceMax));
    const baseline = era2?.baselineTechLevels[tech] ?? 0;
    const finalLvl = Math.max(lvl, baseline);
    setPreviewLevels(prev => ({ ...prev, [tech]: finalLvl }));
    e.preventDefault();
  }, [interactive, getSvgPos, cx, cy, outerR, maxLevel, raceTechMax, era2]);

  const handleMouseUp = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging.current || !interactive) return;
    const { tech } = dragging.current;
    const preview = previewLevels[tech];
    if (preview !== undefined && preview !== techLevels[tech]) {
      onChange!(tech, preview);
    }
    dragging.current = null;
    setPreviewLevels({});
    e.preventDefault();
  }, [interactive, previewLevels, techLevels, onChange]);

  useEffect(() => {
    if (!interactive) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [interactive, handleMouseMove, handleMouseUp]);

  const gridLevels = [1, 2, 3, 4, 5];

  // Build polygon points from effective levels
  const filledPoints = TECH_TYPES.map((tech, i) => {
    const raceMax = Math.min(raceTechMax[tech] ?? 5, maxLevel);
    const lvl = Math.min(effectiveLevels[tech] ?? 0, raceMax);
    const r = levelToRadius(lvl, raceMax, outerR);
    return axisPoint(i, r, cx, cy);
  });

  const filledPath = filledPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ') + ' Z';

  // For tooltip
  const hoveredLevel = hoveredTech ? effectiveLevels[hoveredTech] ?? 0 : 0;
  const hoveredBaseline = era2 && hoveredTech ? era2.baselineTechLevels[hoveredTech] ?? 0 : 0;
  const hoveredBenefits = hoveredTech ? TECH_BENEFITS[hoveredTech] : null;
  const hoveredBenefitValue = hoveredBenefits
    ? hoveredBenefits.values[Math.min(hoveredLevel, hoveredBenefits.values.length - 1)]
    : null;

  let previewCost = 0;
  if (era2 && hoveredTech) {
    const preview = previewLevels[hoveredTech];
    if (preview !== undefined && preview > techLevels[hoveredTech]) {
      const cur = techLevels[hoveredTech];
      const baseline = era2.baselineTechLevels[hoveredTech] ?? 0;
      const opts = {
        flat: era2.costModifiers.flat[hoveredTech],
        perLevel: era2.costModifiers.perLevel[hoveredTech],
        minCostPerLevel: era2.costModifiers.minCostPerLevel,
      };
      const { totalCost: total } = calculateTechCost(hoveredTech, baseline, preview, era2.freeLevelsRemaining[hoveredTech], opts, era2.allowLevel6);
      const { totalCost: paid } = calculateTechCost(hoveredTech, baseline, cur, era2.freeLevelsRemaining[hoveredTech], opts, era2.allowLevel6);
      previewCost = total - paid;
    }
  }

  const nextCost = era2 && hoveredTech && hoveredLevel < maxLevel
    ? getIncrementalCost(hoveredTech, hoveredLevel + 1)
    : null;

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg
          ref={svgRef}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ cursor: interactive ? 'default' : 'default', touchAction: 'none' }}
        >
          {/* Grid rings */}
          {gridLevels.map(level => {
            const ringPoints = TECH_TYPES.map((_, i) =>
              axisPoint(i, (level / 5) * outerR, cx, cy),
            );
            const ringPath = ringPoints
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
              .join(' ') + ' Z';
            return (
              <path
                key={level}
                d={ringPath}
                fill="none"
                stroke={level === 5 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}
                strokeWidth={level === 5 ? 1.5 : 1}
              />
            );
          })}

          {/* Axis lines */}
          {TECH_TYPES.map((tech, i) => {
            const tip = axisPoint(i, outerR, cx, cy);
            return (
              <line
                key={i}
                x1={cx} y1={cy}
                x2={tip.x} y2={tip.y}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="1"
              />
            );
          })}

          {/* Filled area */}
          <path
            d={filledPath}
            fill="rgba(245,197,24,0.10)"
            stroke="rgba(245,197,24,0.55)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Baseline ring (dashed) */}
          {era2 && (() => {
            const basePoints = TECH_TYPES.map((tech, i) => {
              const b = era2.baselineTechLevels[tech] ?? 0;
              const raceMax = Math.min(raceTechMax[tech] ?? 5, maxLevel);
              const r = levelToRadius(b, raceMax, outerR);
              return axisPoint(i, r, cx, cy);
            });
            const basePath = basePoints
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
              .join(' ') + ' Z';
            return (
              <path
                d={basePath}
                fill="none"
                stroke="rgba(245,197,24,0.30)"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            );
          })()}

          {/* Level dots + drag handles */}
          {TECH_TYPES.map((tech, i) => {
            const raceMax = Math.min(raceTechMax[tech] ?? 5, maxLevel);
            const lvl = Math.min(effectiveLevels[tech] ?? 0, raceMax);
            const r = levelToRadius(lvl, raceMax, outerR);
            const p = axisPoint(i, r, cx, cy);
            const color = TECH_COLORS[tech];
            const isDraggingThis = dragging.current?.techIdx === i;
            const isHovered = hoveredTech === tech;

            return (
              <g key={tech}>
                {/* Invisible larger hit area for dragging */}
                {interactive && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hitR + 4}
                    fill="transparent"
                    style={{ cursor: 'grab' }}
                    onMouseDown={e => {
                      dragging.current = { techIdx: i, tech };
                      e.preventDefault();
                    }}
                    onTouchStart={e => {
                      dragging.current = { techIdx: i, tech };
                      e.preventDefault();
                    }}
                    onMouseEnter={() => setHoveredTech(tech)}
                    onMouseLeave={() => { if (!dragging.current) setHoveredTech(null); }}
                  />
                )}
                {/* Visible dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isDraggingThis ? 7 : isHovered ? 6 : 5}
                  fill={color}
                  stroke={isDraggingThis ? 'white' : 'rgba(0,0,0,0.6)'}
                  strokeWidth={isDraggingThis ? 2 : 1}
                  style={{ pointerEvents: 'none', transition: isDraggingThis ? 'none' : 'r 0.1s' }}
                />
              </g>
            );
          })}

          {/* Labels */}
          {TECH_TYPES.map((tech, i) => {
            const lp = axisPoint(i, labelR, cx, cy);
            const lvl = effectiveLevels[tech] ?? 0;
            const color = TECH_COLORS[tech];
            const isHov = hoveredTech === tech;

            // Adjust label anchor based on position
            const a = axisAngle(i);
            const anchor = Math.abs(Math.cos(a)) < 0.15 ? 'middle'
              : Math.cos(a) > 0 ? 'start' : 'end';

            return (
              <g key={tech}
                onMouseEnter={() => setHoveredTech(tech)}
                onMouseLeave={() => { if (!dragging.current) setHoveredTech(null); }}
                style={{ cursor: interactive ? 'pointer' : 'default' }}
              >
                <text
                  x={lp.x} y={lp.y - 6}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize="10"
                  fill={isHov ? 'white' : 'rgba(255,255,255,0.65)'}
                  fontFamily="inherit"
                  fontWeight={isHov ? 'bold' : 'normal'}
                >
                  {TECH_ICONS[tech]} {t.tech[tech]}
                </text>
                <text
                  x={lp.x} y={lp.y + 8}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize="13"
                  fill={color}
                  fontWeight="bold"
                  fontFamily="inherit"
                >
                  {lvl}
                </text>
              </g>
            );
          })}

          {/* Center label */}
          <text
            x={cx} y={cy - 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="9"
            fill="rgba(255,255,255,0.3)"
            fontFamily="inherit"
          >
            {t.tech.sectionTitle}
          </text>
        </svg>

        {/* Tooltip overlay */}
        {hoveredTech && hoveredBenefits && (
          <div
            className="absolute pointer-events-none z-10 bg-game-surface/95 border border-border-subtle rounded-lg px-3 py-2 text-xs shadow-xl"
            style={{
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              minWidth: 180,
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span>{TECH_ICONS[hoveredTech]}</span>
              <span className="font-bold text-text-primary" style={{ color: TECH_COLORS[hoveredTech] }}>
                {t.tech[hoveredTech]}
              </span>
              <span className="text-text-muted ml-auto">{t.tech.level} {hoveredLevel}</span>
            </div>
            <div className="text-text-secondary mb-1">{t.tech.descriptions[hoveredTech]}</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-text-secondary">
                {hoveredBenefits.label}: <span className="text-text-primary font-bold">{hoveredBenefitValue}</span>
              </span>
              {previewCost > 0 ? (
                <span className="text-game-gold font-bold">+{previewCost} pts</span>
              ) : nextCost != null && (
                <span className="text-text-muted">{t.tech.nextLevelCost}: {nextCost}</span>
              )}
            </div>
            {hoveredBaseline > 0 && (
              <div className="text-[10px] text-game-gold/60 mt-0.5">
                ★ {t.era2.racialBonus}: {hoveredBaseline}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag hint */}
      {interactive && (
        <p className="text-[11px] text-text-muted text-center">
          {t.era2.dragHint ?? 'Drag the dots to allocate tech points'}
        </p>
      )}

      {/* Era3 upgrade buttons */}
      {onUpgrade && (
        <div className="grid grid-cols-5 gap-0.5 w-full">
          {TECH_TYPES.map(tech => {
            const cost = goldCost?.(tech) ?? 0;
            const able = canUpgrade?.(tech) ?? false;
            const affordable = goldCoins >= cost;
            const curLevel = techLevels[tech] ?? 0;
            const nextLevel = curLevel + 1;
            const benefits = TECH_BENEFITS[tech];
            const nextBenefitValue = benefits?.values[Math.min(nextLevel, benefits.values.length - 1)];
            const curBenefitValue = benefits?.values[Math.min(curLevel, benefits.values.length - 1)];
            const benefitDelta = nextBenefitValue !== undefined && curBenefitValue !== undefined
              ? nextBenefitValue - curBenefitValue
              : null;
            const tooltipBonus = benefitDelta !== null && benefitDelta > 0
              ? ` (+${benefitDelta} ${benefits?.label ?? ''})`
              : '';
            return (
              <button
                key={tech}
                type="button"
                disabled={!able}
                onClick={() => onUpgrade(tech)}
                title={`${t.tech[tech]} Lv${curLevel}→${nextLevel} · 💰${cost}${tooltipBonus}`}
                className={`flex flex-col items-center gap-0.5 rounded py-1 px-0.5 border text-[8px] font-bold transition-colors ${
                  able
                    ? 'border-game-gold/50 bg-game-gold/10 text-game-gold hover:bg-game-gold/20 cursor-pointer'
                    : affordable
                    ? 'border-border-subtle text-text-muted opacity-40 cursor-not-allowed'
                    : 'border-red-900/40 text-red-400/60 opacity-50 cursor-not-allowed'
                }`}
              >
                <span style={{ filter: 'grayscale(0.2)' }}>
                  {{ war: '⚔️', science: '🔬', resources: '🌾', economy: '💰', religion: '✨' }[tech]}
                </span>
                <span style={{ color: able ? undefined : affordable ? undefined : '#f87171' }}>
                  💰{cost}
                </span>
                {benefitDelta !== null && benefitDelta > 0 && (
                  <span className="text-emerald-400 text-[7px] leading-tight">+{benefitDelta}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
