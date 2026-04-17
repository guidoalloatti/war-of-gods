import type { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getReqUser } from './auth.js';
import { upsertSavedGame, findSavedGames, findSavedGame, deleteSavedGame } from './db/index.js';

export function handleSaveGame(req: Request, res: Response) {
  const user = getReqUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const { gameState, gameMode, saveId } = req.body as {
    gameState?: unknown;
    gameMode?: string;
    saveId?: string;
  };

  if (!gameState || !gameMode) {
    res.status(400).json({ error: 'Missing gameState or gameMode' });
    return;
  }

  const id = saveId ?? uuid();
  const now = Math.floor(Date.now() / 1000);

  upsertSavedGame({
    id,
    user_id: user.id,
    game_mode: gameMode,
    game_state: JSON.stringify(gameState),
    created_at: now,
    updated_at: now,
  });

  res.json({ id });
}

export function handleListSaves(req: Request, res: Response) {
  const user = getReqUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const saves = findSavedGames(user.id).map(s => ({
    id: s.id,
    gameMode: s.game_mode,
    updatedAt: s.updated_at,
    createdAt: s.created_at,
  }));

  res.json({ saves });
}

export function handleLoadSave(req: Request, res: Response) {
  const user = getReqUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const save = findSavedGame(req.params.id, user.id);
  if (!save) {
    res.status(404).json({ error: 'Save not found' });
    return;
  }

  res.json({
    id: save.id,
    gameMode: save.game_mode,
    gameState: JSON.parse(save.game_state),
    updatedAt: save.updated_at,
    createdAt: save.created_at,
  });
}

export function handleDeleteSave(req: Request, res: Response) {
  const user = getReqUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  deleteSavedGame(req.params.id, user.id);
  res.json({ ok: true });
}
