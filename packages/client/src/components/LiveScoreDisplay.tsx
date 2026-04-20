import { useState, useMemo } from 'react';
import { getRaceById, getRoadBonus, calculateScoreBreakdown } from '@war-of-gods/engine';
import type { TerrainType, RaceId, GameState } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';
import type { HexCell } from './HexBoard.js';

/** Axial hex neighbors (pointy-top) */
const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

/**
 * Calculate adjacency bonus from hex board positions.
 * +1 for each pair of adjacent favorable terrain tiles.
 * -1 for each pair of adjacent unfavorable terrain tiles.
 * Each edge counted once.
 */
export function calculateAdjacencyBonus(
  board: HexCell[],
  favorableTerrain: string,
  unfavorableTerrain: string,
): number {
  const cellMap = new Map<string, HexCell>();
  for (const cell of board) {
    cellMap.set(`${cell.coord.q},${cell.coord.r}`, cell);
  }

  let bonus = 0;

  for (const cell of board) {
    if (!cell.terrain) continue;

    for (let d = 0; d < 3; d++) {
      const dir = HEX_DIRECTIONS[d];
      const nq = cell.coord.q + dir.q;
      const nr = cell.coord.r + dir.r;
      const neighbor = cellMap.get(`${nq},${nr}`);
      if (!neighbor || !neighbor.terrain) continue;

      if (cell.terrain === favorableTerrain && neighbor.terrain === favorableTerrain) {
        bonus += 1;
      }
      if (cell.terrain === unfavorableTerrain && neighbor.terrain === unfavorableTerrain) {
        bonus -= 1;
      }
    }
  }

  return bonus;
}

// ── Scoring hint tooltips ────────────────────────────────────────

const SCORE_HINTS: Record<string, { en: string; es: string }> = {
  base: {
    en: 'Each tile scores its racial terrain value. Place tiles matching your race\'s strengths.',
    es: 'Cada ficha puntúa su valor racial de terreno. Coloca fichas que coincidan con las fortalezas de tu raza.',
  },
  terrainBonus: {
    en: 'Count of favorable terrain tiles minus unfavorable tiles. Focus on your race\'s preferred terrain.',
    es: 'Fichas de terreno favorable menos desfavorables. Enfócate en el terreno preferido de tu raza.',
  },
  roadBonus: {
    en: 'Based on total roads placed: 0=-9, 1=-6, 2=-3, 3=0, 4=+1, 5=+3, 6=+5, 7+=+6',
    es: 'Según total de rutas colocadas: 0=-9, 1=-6, 2=-3, 3=0, 4=+1, 5=+3, 6=+5, 7+=+6',
  },
  diversityBonus: {
    en: 'Having 4 terrain types gives +5, having 3 gives +2. Don\'t put all eggs in one basket.',
    es: 'Tener 4 tipos de terreno da +5, tener 3 da +2. No pongas todos los huevos en una canasta.',
  },
  concentrationPenalty: {
    en: '-1 for each tile beyond 8 of any single terrain type. Avoid over-concentrating.',
    es: '-1 por cada ficha más allá de 8 del mismo tipo de terreno. Evita sobre-concentrar.',
  },
  balanceBonus: {
    en: '+3 if all 4 terrain types have at least 2 tiles each. Balanced kingdoms prosper.',
    es: '+3 si los 4 tipos de terreno tienen al menos 2 fichas cada uno. Los reinos equilibrados prosperan.',
  },
  adjacencyBonus: {
    en: '+1 per pair of adjacent favorable tiles, -1 per pair of adjacent unfavorable tiles.',
    es: '+1 por par de fichas favorables adyacentes, -1 por par de fichas desfavorables adyacentes.',
  },
  cardEffects: {
    en: 'Bonus points from world cards, era cards, and relics applied at scoring.',
    es: 'Puntos bonus de cartas de mundo, era y reliquias aplicados al puntuar.',
  },
  raceAbilityBonus: {
    en: 'Bonus from your race\'s special ability (e.g. Dwarf mountain groups, Giant terrain bonus).',
    es: 'Bonus de la habilidad especial de tu raza (ej. grupos de montaña Enano, bonus de terreno Gigante).',
  },
};

function InfoTooltip({ hintKey }: { hintKey: string }) {
  const [show, setShow] = useState(false);
  const locale = useI18n(s => s.locale);
  const hint = SCORE_HINTS[hintKey];
  if (!hint) return null;
  const text = locale === 'es' ? hint.es : hint.en;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold text-text-muted hover:text-text-secondary border border-border-medium hover:border-text-muted transition-colors leading-none"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 p-2.5 bg-game-surface border border-border-medium rounded-lg shadow-2xl z-50 text-xs text-text-primary/80 leading-relaxed pointer-events-none animate-fade-in backdrop-blur-md">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-game-surface border-r border-b border-border-medium rotate-45 -mt-1" />
        </div>
      )}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────

type Props = {
  raceId: RaceId;
  placedCounts: Record<TerrainType, number>;
  cardBonusPoints: number;
  board?: HexCell[];
  gameState?: GameState;
  playerId?: string;
};

export function LiveScoreDisplay({ raceId, placedCounts, cardBonusPoints, board, gameState, playerId }: Props) {
  const t = useI18n(s => s.t);
  const race = getRaceById(raceId);

  const breakdown = useMemo(() => {
    // If we have gameState + playerId, build a synthetic state with the current board placement counts
    // so that the engine formula is used exactly (race abilities, card modifiers, etc.)
    if (gameState && playerId) {
      // Clone state with current tile counts from board (placed tiles during live preview)
      const syntheticState: GameState = {
        ...gameState,
        players: gameState.players.map(p =>
          p.id === playerId
            ? { ...p, tiles: { ...placedCounts } }
            : p,
        ),
      };

      // Get engine breakdown (without adjacency — that's board-position only)
      const engineBreakdown = calculateScoreBreakdown(syntheticState, playerId);

      // Compute adjacency from actual board layout
      const adjacencyBonus = board
        ? calculateAdjacencyBonus(board, race.favorableTerrain, race.unfavorableTerrain)
        : 0;

      const total = engineBreakdown.total + adjacencyBonus;

      return {
        base: engineBreakdown.base,
        terrainBonus: engineBreakdown.terrainBonus,
        roadBonus: engineBreakdown.roadBonus,
        diversityBonus: engineBreakdown.diversityBonus,
        concentrationPenalty: engineBreakdown.concentrationPenalty,
        balanceBonus: engineBreakdown.balanceBonus,
        adjacencyBonus,
        cardEffects: engineBreakdown.cardEffects,
        raceAbilityBonus: engineBreakdown.raceAbilityBonus,
        total,
      };
    }

    // Fallback: compute manually (same formula as engine, but without race ability edge cases)
    const TERRAIN_TYPES = ['plain', 'mountain', 'forest', 'swamp'] as const;

    // Base — apply terrain_value_bonus (Giant) and terrain_value_override (Half-orc)
    let base = 0;
    for (const tt of TERRAIN_TYPES) {
      let value = race.terrainValues[tt];
      if (race.era1Advantage.effectType === 'terrain_value_bonus' &&
          race.era1Advantage.params.terrain === tt) {
        value += race.era1Advantage.params.bonus as number;
      }
      if (race.era1Disadvantage.effectType === 'terrain_value_override' &&
          race.era1Disadvantage.params.terrain === tt) {
        value = race.era1Disadvantage.params.value as number;
      }
      base += placedCounts[tt] * value;
    }

    // Terrain bonus — half-elf dual_favorable
    let favorableCount = placedCounts[race.favorableTerrain as TerrainType] ?? 0;
    if (race.era1Advantage.effectType === 'dual_favorable') {
      const secondFav = race.era1Advantage.params.secondFavorable as string;
      if (secondFav !== race.favorableTerrain) {
        favorableCount += placedCounts[secondFav as TerrainType] ?? 0;
      }
    }
    const unfavorableCount = placedCounts[race.unfavorableTerrain as TerrainType] ?? 0;
    const terrainBonus = favorableCount - unfavorableCount;

    // Road bonus — orc halved
    let roadBonus = getRoadBonus(placedCounts.road);
    if (race.era1Disadvantage.effectType === 'halved_road_bonus') {
      roadBonus = Math.floor(roadBonus / 2);
    }

    // Diversity — terrain_ignores_diversity, double_diversity_bonus
    const ignoredTerrain = race.era1Disadvantage.effectType === 'terrain_ignores_diversity'
      ? race.era1Disadvantage.params.terrain as string
      : null;
    const typesPresent = TERRAIN_TYPES.filter(tt => tt !== ignoredTerrain && placedCounts[tt] > 0).length;
    let diversityBonus = typesPresent >= 4 ? 5 : typesPresent >= 3 ? 2 : 0;
    if (race.era1Advantage.effectType === 'double_diversity_bonus') diversityBonus *= 2;

    // Concentration — concentration_threshold_reduction, no_concentration_penalty
    const threshold = race.era1Disadvantage.effectType === 'concentration_threshold_reduction'
      ? (race.era1Disadvantage.params.threshold as number)
      : 8;
    const exemptTerrain = race.era1Advantage.effectType === 'no_concentration_penalty'
      ? race.era1Advantage.params.terrain as string
      : null;
    let concentrationPenalty = 0;
    for (const tt of TERRAIN_TYPES) {
      if (tt === exemptTerrain) continue;
      if (placedCounts[tt] > threshold) concentrationPenalty -= (placedCounts[tt] - threshold);
    }

    // Balance — no_balance_bonus, enhanced_balance_bonus
    let balanceBonus = 0;
    if (race.era1Disadvantage.effectType !== 'no_balance_bonus') {
      const allBalanced = TERRAIN_TYPES.every(tt => placedCounts[tt] >= 2);
      if (allBalanced) {
        balanceBonus = race.era1Advantage.effectType === 'enhanced_balance_bonus'
          ? (race.era1Advantage.params.bonus as number)
          : 3;
      }
    }

    // Adjacency (board-position)
    const adjacencyBonus = board
      ? calculateAdjacencyBonus(board, race.favorableTerrain, race.unfavorableTerrain)
      : 0;

    // Card effects
    const cardEffects = cardBonusPoints;

    // Race ability bonus
    let raceAbilityBonus = 0;
    if (race.era1Advantage.effectType === 'group_bonus') {
      const terrain = race.era1Advantage.params.terrain as string;
      const groupSize = race.era1Advantage.params.groupSize as number;
      const bonusPerGroup = race.era1Advantage.params.bonusPerGroup as number;
      const count = placedCounts[terrain as TerrainType] ?? 0;
      raceAbilityBonus += Math.floor(count / groupSize) * bonusPerGroup;
    }
    if (race.era1Disadvantage.effectType === 'terrain_penalty') {
      const terrain = race.era1Disadvantage.params.terrain as string;
      const penaltyPerTile = race.era1Disadvantage.params.penaltyPerTile as number;
      const count = placedCounts[terrain as TerrainType] ?? 0;
      raceAbilityBonus += count * penaltyPerTile;
    }

    const total = base + terrainBonus + roadBonus + diversityBonus + concentrationPenalty + balanceBonus + adjacencyBonus + cardEffects + raceAbilityBonus;

    return { base, terrainBonus, roadBonus, diversityBonus, concentrationPenalty, balanceBonus, adjacencyBonus, cardEffects, raceAbilityBonus, total };
  }, [placedCounts, race, cardBonusPoints, board, gameState, playerId]);

  const totalPlaced = Object.values(placedCounts).reduce((a, b) => a + b, 0);

  const rows = [
    { label: t.scoring.base, value: breakdown.base, hintKey: 'base' },
    { label: t.scoring.terrainBonus, value: breakdown.terrainBonus, hintKey: 'terrainBonus' },
    { label: t.scoring.roadBonus, value: breakdown.roadBonus, hintKey: 'roadBonus' },
    { label: t.scoring.diversityBonus, value: breakdown.diversityBonus, hintKey: 'diversityBonus' },
    { label: t.scoring.concentrationPenalty, value: breakdown.concentrationPenalty, hintKey: 'concentrationPenalty' },
    { label: t.scoring.balanceBonus, value: breakdown.balanceBonus, hintKey: 'balanceBonus' },
    { label: t.scoring.adjacencyBonus, value: breakdown.adjacencyBonus, hintKey: 'adjacencyBonus' },
    { label: t.scoring.cardEffects, value: breakdown.cardEffects, hintKey: 'cardEffects' },
    { label: t.scoring.raceAbilityBonus, value: breakdown.raceAbilityBonus, hintKey: 'raceAbilityBonus' },
  ];

  return (
    <div id="live-score" className="bg-game-surface/80 backdrop-blur-sm rounded-xl border border-border-subtle p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-game-gold text-xs uppercase tracking-wider font-bold">
            {t.hexBoard.liveScore}
          </span>
        </div>
        <span className="text-text-secondary text-xs">{totalPlaced}/37</span>
      </div>

      <div className="space-y-0.5 text-sm">
        {rows.map(row => (
          <div key={row.hintKey} className="flex justify-between items-center py-0.5">
            <span className="text-text-primary/80 flex items-center gap-1">
              {row.label}
              <InfoTooltip hintKey={row.hintKey} />
            </span>
            <span className={`font-mono font-bold ${
              row.value > 0 ? 'text-emerald-400' : row.value < 0 ? 'text-red-400' : 'text-text-muted'
            }`}>
              {row.value > 0 ? '+' : ''}{row.value}
            </span>
          </div>
        ))}

        <div className="border-t border-border-medium/50 pt-1.5 mt-1.5 flex justify-between items-center">
          <span className="text-game-gold font-bold text-sm">{t.scoring.total}</span>
          <span className="text-game-gold font-bold text-xl font-mono tabular-nums">
            {breakdown.total}
          </span>
        </div>
      </div>
    </div>
  );
}
