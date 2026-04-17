import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: string;
}

type AuthStore = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (credential: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
};

const API_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,

  // Google OAuth login
  login: async (credential: string) => {
    set({ error: null });
    const res = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Authentication failed' }));
      set({ error: data.error });
      throw new Error(data.error);
    }
    const { user, token } = (await res.json()) as { user: User; token: string };
    localStorage.setItem('wog-token', token);
    set({ user, error: null });
  },

  // Email + password login
  loginWithEmail: async (email: string, password: string) => {
    set({ error: null });
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Login failed' }));
      set({ error: data.error });
      throw new Error(data.error);
    }
    const { user, token } = (await res.json()) as { user: User; token: string };
    localStorage.setItem('wog-token', token);
    set({ user, error: null });
  },

  // Register with email + password
  register: async (name: string, email: string, password: string) => {
    set({ error: null });
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Registration failed' }));
      set({ error: data.error });
      throw new Error(data.error);
    }
    const { user, token } = (await res.json()) as { user: User; token: string };
    localStorage.setItem('wog-token', token);
    set({ user, error: null });
  },

  logout: async () => {
    const token = localStorage.getItem('wog-token');
    if (token) {
      fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('wog-token');
    set({ user: null });
  },

  restoreSession: async () => {
    const token = localStorage.getItem('wog-token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Invalid session');
      const { user } = (await res.json()) as { user: User };
      set({ user, loading: false });
    } catch {
      localStorage.removeItem('wog-token');
      set({ user: null, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
