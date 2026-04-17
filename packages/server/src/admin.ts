import type { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import {
  listCards,
  findCard,
  insertCard,
  updateCard,
  softDeleteCard,
  getCardStats,
} from './db/index.js';
import type { DbCard } from './db/index.js';

// GET /admin/cards — list all cards, optionally filtered by type
export function handleListCards(req: Request, res: Response): void {
  const type = req.query.type as string | undefined;
  const search = (req.query.search as string | undefined)?.toLowerCase();
  let cards = listCards(type || undefined);

  if (search) {
    cards = cards.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.name_en.toLowerCase().includes(search) ||
      c.id.toLowerCase().includes(search),
    );
  }

  res.json({ cards });
}

// GET /admin/cards/:id — single card
export function handleGetCard(req: Request, res: Response): void {
  const card = findCard(req.params.id);
  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }
  res.json({ card });
}

// POST /admin/cards — create new card
export function handleCreateCard(req: Request, res: Response): void {
  const body = req.body as Partial<DbCard>;
  if (!body.card_type || !body.name) {
    res.status(400).json({ error: 'card_type and name are required' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const card: DbCard = {
    id: body.id || uuid(),
    card_type: body.card_type,
    name: body.name,
    name_en: body.name_en ?? '',
    flavor_text: body.flavor_text ?? '',
    flavor_text_en: body.flavor_text_en ?? '',
    mechanical_text: body.mechanical_text ?? '',
    mechanical_text_en: body.mechanical_text_en ?? '',
    effects: body.effects ?? '[]',
    sort_order: body.sort_order ?? 0,
    active: body.active ?? 1,
    created_at: now,
    updated_at: now,
  };

  try {
    insertCard(card);
    res.status(201).json({ card });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Failed to create card' });
  }
}

// PUT /admin/cards/:id — update card
export function handleUpdateCard(req: Request, res: Response): void {
  const body = req.body as Partial<DbCard>;
  try {
    updateCard({ ...body, id: req.params.id });
    const card = findCard(req.params.id);
    res.json({ card });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Failed to update card' });
  }
}

// DELETE /admin/cards/:id — soft-delete (set active=0)
export function handleDeleteCard(req: Request, res: Response): void {
  const card = findCard(req.params.id);
  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }
  softDeleteCard(req.params.id);
  res.json({ ok: true });
}

// POST /admin/cards/:id/clone — duplicate a card
export function handleCloneCard(req: Request, res: Response): void {
  const original = findCard(req.params.id);
  if (!original) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const clone: DbCard = {
    ...original,
    id: uuid(),
    name: `${original.name} (copy)`,
    name_en: original.name_en ? `${original.name_en} (copy)` : '',
    created_at: now,
    updated_at: now,
  };

  insertCard(clone);
  res.status(201).json({ card: clone });
}

// GET /admin/stats — dashboard statistics
export function handleAdminStats(_req: Request, res: Response): void {
  const stats = getCardStats();
  res.json({ stats });
}
