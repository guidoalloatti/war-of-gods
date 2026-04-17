const API_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('wog-token');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

export interface AdminCard {
  id: string;
  card_type: string;
  name: string;
  name_en: string;
  flavor_text: string;
  flavor_text_en: string;
  mechanical_text: string;
  mechanical_text_en: string;
  effects: string;
  sort_order: number;
  active: number;
  created_at: number;
  updated_at: number;
}

export async function fetchCards(type?: string, search?: string): Promise<AdminCard[]> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (search) params.set('search', search);
  const qs = params.toString();
  const res = await fetch(`${API_URL}/admin/cards${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch cards');
  const { cards } = (await res.json()) as { cards: AdminCard[] };
  return cards;
}

export async function fetchCard(id: string): Promise<AdminCard> {
  const res = await fetch(`${API_URL}/admin/cards/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Card not found');
  const { card } = (await res.json()) as { card: AdminCard };
  return card;
}

export async function createCard(card: Partial<AdminCard>): Promise<AdminCard> {
  const res = await fetch(`${API_URL}/admin/cards`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to create card' }));
    throw new Error(data.error);
  }
  const { card: created } = (await res.json()) as { card: AdminCard };
  return created;
}

export async function updateCard(id: string, card: Partial<AdminCard>): Promise<AdminCard> {
  const res = await fetch(`${API_URL}/admin/cards/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(card),
  });
  if (!res.ok) throw new Error('Failed to update card');
  const { card: updated } = (await res.json()) as { card: AdminCard };
  return updated;
}

export async function deleteCard(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/cards/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete card');
}

export async function cloneCard(id: string): Promise<AdminCard> {
  const res = await fetch(`${API_URL}/admin/cards/${id}/clone`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to clone card');
  const { card } = (await res.json()) as { card: AdminCard };
  return card;
}

export async function fetchStats(): Promise<Record<string, number>> {
  const res = await fetch(`${API_URL}/admin/stats`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  const { stats } = (await res.json()) as { stats: Record<string, number> };
  return stats;
}
