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

type I18nStore = {
  locale: Locale;
  theme: Theme;
  t: Translations;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
};

export const useI18n = create<I18nStore>((set) => ({
  locale: initialLocale,
  theme: initialTheme,
  t: translations[initialLocale],
  setLocale: (locale) => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem('wog-locale', locale);
    } catch {
      // ignore
    }
    set({ locale, t: translations[locale] });
  },
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('wog-theme', theme);
    } catch {
      // ignore
    }
    set({ theme });
  },
}));

/** Shortcut para acceso fuera de componentes React (ej: constantes de módulo) */
export function getT(): Translations {
  return useI18n.getState().t;
}
