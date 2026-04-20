import type { Server, Socket } from 'socket.io';
import type { GameConfig, GameAction, GameState } from '@war-of-gods/engine';
import {
  createRoom,
  joinRoom,
  getRoom,
  applyAction,
  handleDisconnect,
  getPlayerIdForSocket,
  reconnectToRoom,
} from '../rooms/roomManager.js';
import type { JoinRoomParams } from '../rooms/roomManager.js';

/** Simple per-socket rate limiter */
function createRateLimiter(maxPerWindow: number, windowMs: number) {
  const counts = new Map<string, { count: number; resetAt: number }>();

  return (socketId: string): boolean => {
    const now = Date.now();
    const entry = counts.get(socketId);
    if (!entry || now >= entry.resetAt) {
      counts.set(socketId, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= maxPerWindow;
  };
}

const actionLimiter = createRateLimiter(30, 10_000); // 30 actions per 10s
const joinLimiter = createRateLimiter(5, 60_000); // 5 joins per minute

function safeCallback<T>(callback: unknown, data: T): void {
  if (typeof callback === 'function') {
    callback(data);
  }
}

/** Debounced state broadcaster — coalesces rapid updates per room into one emission */
function createStateBroadcaster(io: Server, delayMs = 50) {
  const pending = new Map<string, { state: GameState; timer: ReturnType<typeof setTimeout> }>();

  return (roomCode: string, state: GameState) => {
    const existing = pending.get(roomCode);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const timer = setTimeout(() => {
      io.to(roomCode).emit('state_update', state);
      pending.delete(roomCode);
    }, delayMs);
    pending.set(roomCode, { state, timer });
  };
}

export function registerGameSocket(io: Server): void {
  const broadcastState = createStateBroadcaster(io, 50);

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create room
    socket.on('create_room', (config: GameConfig, callback: unknown) => {
      if (!joinLimiter(socket.id)) {
        safeCallback(callback, { error: 'Rate limit exceeded' });
        return;
      }

      try {
        const room = createRoom(socket.id, config);
        socket.join(room.code);
        safeCallback(callback, { code: room.code, state: room.state });
      } catch (err) {
        safeCallback(callback, { error: err instanceof Error ? err.message : 'Error creating room' });
      }
    });

    // Join room — accepts { code, name?, raceId? }
    socket.on('join_room', (data: JoinRoomParams, callback: unknown) => {
      if (!joinLimiter(socket.id)) {
        safeCallback(callback, { error: 'Rate limit exceeded' });
        return;
      }

      if (!data || typeof data.code !== 'string') {
        safeCallback(callback, { error: 'Invalid request' });
        return;
      }

      const result = joinRoom(data, socket.id);
      if ('error' in result) {
        const messages: Record<string, string> = {
          room_not_found: 'Room not found',
          room_full: 'Room is full',
          race_taken: 'Race already taken',
          invalid_race: 'Invalid race selection',
        };
        safeCallback(callback, { error: messages[result.error] ?? 'Error joining room' });
        return;
      }

      const { room } = result;
      const playerId = getPlayerIdForSocket(room, socket.id);
      socket.join(data.code);
      // Immediate broadcast for join — players need to see each other right away
      io.to(data.code).emit('state_update', room.state);
      safeCallback(callback, { state: room.state, playerId });
    });

    // Reconnect to existing room
    socket.on('reconnect_room', (data: { code: string; playerId: string }, callback: unknown) => {
      if (!data || typeof data.code !== 'string' || typeof data.playerId !== 'string') {
        safeCallback(callback, { error: 'Invalid request' });
        return;
      }

      const room = reconnectToRoom(data.code, data.playerId, socket.id);
      if (!room) {
        safeCallback(callback, { error: 'Room not found or player not in room' });
        return;
      }

      socket.join(data.code);
      // Immediate broadcast for reconnect — restoring session is time-sensitive
      io.to(data.code).emit('state_update', room.state);
      safeCallback(callback, { state: room.state, playerId: data.playerId });
    });

    // Player action — with authorization and debounced broadcast
    socket.on('player_action', (data: { roomCode: string; action: GameAction }) => {
      if (!actionLimiter(socket.id)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }

      if (!data || typeof data.roomCode !== 'string' || !data.action) {
        socket.emit('error', { message: 'Invalid request' });
        return;
      }

      const room = getRoom(data.roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const socketPlayerId = getPlayerIdForSocket(room, socket.id);
      if (!socketPlayerId) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }

      const action = data.action;
      if ('playerId' in action && action.playerId !== socketPlayerId) {
        socket.emit('error', { message: 'Cannot perform actions for other players' });
        return;
      }
      if ('fromPlayerId' in action && action.fromPlayerId !== socketPlayerId) {
        socket.emit('error', { message: 'Cannot perform actions for other players' });
        return;
      }

      const result = applyAction(room, action);
      if ('error' in result) {
        socket.emit('error', { message: result.error });
        return;
      }

      broadcastState(data.roomCode, result.state);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      const result = handleDisconnect(socket.id);
      if (result) {
        io.to(result.room.code).emit('player_disconnect', {
          playerId: result.playerId,
          state: result.room.state,
        });
      }
    });
  });
}
