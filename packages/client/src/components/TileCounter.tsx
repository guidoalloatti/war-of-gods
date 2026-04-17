import type { TerrainType } from '@war-of-gods/engine';
import { useI18n } from '../i18n/index.js';

const TERRAIN_ICONS: Record<TerrainType, string> = {
  plain: '🌾',
  mountain: '⛰️',
  forest: '🌲',
  swamp: '🌿',
  road: '🛤️',
};

const TERRAIN_COLORS: Record<TerrainType, string> = {
  plain: 'bg-yellow-700',
  mountain: 'bg-gray-600',
  forest: 'bg-green-700',
  swamp: 'bg-teal-800',
  road: 'bg-amber-800',
};

type Props = {
  tiles: Record<TerrainType, number>;
};

export function TileCounter({ tiles }: Props) {
  const t = useI18n(s => s.t);
  const terrains: TerrainType[] = ['plain', 'mountain', 'forest', 'swamp', 'road'];

  return (
    <div className="grid grid-cols-5 gap-2">
      {terrains.map(terrain => (
        <div
          key={terrain}
          className={`${TERRAIN_COLORS[terrain]} rounded-lg p-2 text-center text-text-primary`}
        >
          <div className="text-2xl" aria-hidden="true">{TERRAIN_ICONS[terrain]}</div>
          <div className="text-xs mt-1">{t.terrain[terrain]}</div>
          <div className="text-lg font-bold">{tiles[terrain]}</div>
        </div>
      ))}
    </div>
  );
}
