import type { GameState, GameMode } from '@war-of-gods/engine';

const API_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('wog-token');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

export interface SaveSummary {
  id: string;
  gameMode: string;
  updatedAt: number;
  createdAt: number;
}

export interface SaveDetail extends SaveSummary {
  gameState: GameState;
}

export async function saveGame(
  gameState: GameState,
  gameMode: GameMode,
  saveId?: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/games/save`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ gameState, gameMode, saveId }),
  });
  if (!res.ok) throw new Error('Failed to save game');
  const { id } = (await res.json()) as { id: string };
  return id;
}

export async function listSaves(): Promise<SaveSummary[]> {
  const res = await fetch(`${API_URL}/games/saves`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const { saves } = (await res.json()) as { saves: SaveSummary[] };
  return saves;
}

export async function loadSave(id: string): Promise<SaveDetail | null> {
  const res = await fetch(`${API_URL}/games/saves/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  return (await res.json()) as SaveDetail;
}

export async function deleteSave(id: string): Promise<void> {
  await fetch(`${API_URL}/games/saves/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
