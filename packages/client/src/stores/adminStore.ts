import { create } from 'zustand';
import type { AdminCard } from '../api/admin.js';
import {
  fetchCards,
  fetchCard,
  createCard as apiCreateCard,
  updateCard as apiUpdateCard,
  deleteCard as apiDeleteCard,
  cloneCard as apiCloneCard,
  fetchStats,
} from '../api/admin.js';

type AdminView = 'dashboard' | 'list' | 'editor';

type AdminStore = {
  view: AdminView;
  cards: AdminCard[];
  stats: Record<string, number>;
  loading: boolean;
  error: string | null;
  success: string | null;

  // Filters
  typeFilter: string | null;
  searchQuery: string;

  // Editor state
  editingCard: AdminCard | null;
  isNewCard: boolean;

  // Navigation
  setView: (view: AdminView) => void;
  setTypeFilter: (type: string | null) => void;
  setSearchQuery: (query: string) => void;

  // Data operations
  loadCards: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadCard: (id: string) => Promise<void>;
  saveCard: (card: Partial<AdminCard>) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  duplicateCard: (id: string) => Promise<void>;

  // Editor
  startNewCard: () => void;
  startEditCard: (card: AdminCard) => void;
  clearEditor: () => void;
  clearMessages: () => void;
};

function emptyCard(): Partial<AdminCard> {
  return {
    card_type: 'era1',
    name: '',
    name_en: '',
    flavor_text: '',
    flavor_text_en: '',
    mechanical_text: '',
    mechanical_text_en: '',
    effects: '[]',
    sort_order: 0,
    active: 1,
  };
}

export const useAdminStore = create<AdminStore>((set, get) => ({
  view: 'dashboard',
  cards: [],
  stats: {},
  loading: false,
  error: null,
  success: null,
  typeFilter: null,
  searchQuery: '',
  editingCard: null,
  isNewCard: false,

  setView: (view) => set({ view, error: null, success: null }),
  setTypeFilter: (type) => {
    set({ typeFilter: type });
    get().loadCards();
  },
  setSearchQuery: (query) => set({ searchQuery: query }),

  loadCards: async () => {
    set({ loading: true, error: null });
    try {
      const { typeFilter, searchQuery } = get();
      const cards = await fetchCards(typeFilter ?? undefined, searchQuery || undefined);
      set({ cards, loading: false });
    } catch {
      set({ error: 'Failed to load cards', loading: false });
    }
  },

  loadStats: async () => {
    try {
      const stats = await fetchStats();
      set({ stats });
    } catch {
      // Silent fail for stats
    }
  },

  loadCard: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const card = await fetchCard(id);
      set({ editingCard: card, isNewCard: false, view: 'editor', loading: false });
    } catch {
      set({ error: 'Card not found', loading: false });
    }
  },

  saveCard: async (card: Partial<AdminCard>) => {
    set({ loading: true, error: null, success: null });
    try {
      const { isNewCard, editingCard } = get();
      if (isNewCard) {
        await apiCreateCard(card);
        set({ success: 'cardCreated', loading: false });
      } else if (editingCard) {
        await apiUpdateCard(editingCard.id, card);
        set({ success: 'cardUpdated', loading: false });
      }
      // Reload cards list
      get().loadCards();
      get().loadStats();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to save card', loading: false });
    }
  },

  removeCard: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await apiDeleteCard(id);
      set({ success: 'cardDeleted', loading: false });
      get().loadCards();
      get().loadStats();
    } catch {
      set({ error: 'Failed to delete card', loading: false });
    }
  },

  duplicateCard: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const clone = await apiCloneCard(id);
      set({ success: 'cardCloned', loading: false, editingCard: clone, isNewCard: false, view: 'editor' });
      get().loadCards();
    } catch {
      set({ error: 'Failed to clone card', loading: false });
    }
  },

  startNewCard: () => {
    set({
      editingCard: emptyCard() as AdminCard,
      isNewCard: true,
      view: 'editor',
      error: null,
      success: null,
    });
  },

  startEditCard: (card) => {
    set({
      editingCard: { ...card },
      isNewCard: false,
      view: 'editor',
      error: null,
      success: null,
    });
  },

  clearEditor: () => {
    set({ editingCard: null, isNewCard: false, view: 'list' });
  },

  clearMessages: () => set({ error: null, success: null }),
}));
