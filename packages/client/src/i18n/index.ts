import { create } from 'zustand';
import { es } from './es.js';
import { en } from './en.js';
import type { Translations } from './es.js';

export type Locale = 'es' | 'en';
export type Theme = 'dark' | 'light';

const translations: Record<Locale, Translations> = { es, en };

// Read persisted locale from localStorage
function getPersistedLocale(): Locale {
  try {
    const stored = localStorage.getItem('wog-locale');
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    // localStorage may not be available
  }
  return 'en';
}

function getPersistedTheme(): Theme {
  try {
    const stored = localStorage.getItem('wog-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage may not be available
  }
  return 'dark';
}

const initialLocale = getPersistedLocale();
const initialTheme = getPersistedTheme();

// Set initial html attributes
document.documentElement.lang = initialLocale;
document.documentElement.setAttribute('data-theme', initialTheme);

// Map font scale: 1.0 = default, 0.5 = small, 2.0 = large
const DEFAULT_MAP_FONT_SCALE = 1.0;

function getPersistedMapFontScale(): number {
  try {
    const s = localStorage.getItem('wog-map-font-scale');
    if (s) { const n = parseFloat(s); if (n >= 0.5 && n <= 2.5) return n; }
  } catch { /* ignore */ }
  return DEFAULT_MAP_FONT_SCALE;
}

function applyMapFontScale(scale: number) {
  document.documentElement.style.setProperty('--map-font-scale', String(scale));
}

const initialMapFontScale = getPersistedMapFontScale();
applyMapFontScale(initialMapFontScale);

type I18nStore = {
  locale: Locale;
  theme: Theme;
  mapFontScale: number;
  t: Translations;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setMapFontScale: (scale: number) => void;
};

export const useI18n = create<I18nStore>((set) => ({
  locale: initialLocale,
  theme: initialTheme,
  mapFontScale: initialMapFontScale,
  t: translations[initialLocale],
  setLocale: (locale) => {
    document.documentElement.lang = locale;
    try { localStorage.setItem('wog-locale', locale); } catch { /* ignore */ }
    set({ locale, t: translations[locale] });
  },
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('wog-theme', theme); } catch { /* ignore */ }
    set({ theme });
  },
  setMapFontScale: (scale) => {
    applyMapFontScale(scale);
    try { localStorage.setItem('wog-map-font-scale', String(scale)); } catch { /* ignore */ }
    set({ mapFontScale: scale });
  },
}));

/** Shortcut para acceso fuera de componentes React (ej: constantes de módulo) */
export function getT(): Translations {
  return useI18n.getState().t;
}
