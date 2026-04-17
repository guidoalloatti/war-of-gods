import type { GameState, GameConfig, RaceId } from '@war-of-gods/engine';
import { createGame, era1Reducer, getAllRaces } from '@war-of-gods/engine';
import type { GameAction } from '@war-of-gods/engine';
import { upsertRoom as dbUpsertRoom, deleteRoom as dbDeleteRoom, findAllActiveRooms, deleteStaleRooms } from '../db/index.js';

const VALID_RACE_IDS = new Set(getAllRaces().map(r => r.id));

export type Room = {
  code: string;
  hostSocketId: string;
  state: GameState;
  /** Map de socketId → playerId */
  socketToPlayer: Map<string, string>;
  createdAt: number;
};

const rooms = new Map<string, Room>();

const MAX_ROOMS = 500;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to generate unique room code');
}

/** Periodically clean up stale rooms */
function cleanupStaleRooms(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupStaleRooms, 10 * 60 * 1000);

/** Persist room state to the database */
function persistRoom(room: Room): void {
  try {
    // Convert socketToPlayer Map to a visitorId→playerId JSON object
    const playerMap: Record<string, string> = {};
    for (const [socketId, playerId] of room.socketToPlayer) {
      playerMap[socketId] = playerId;
    }
    dbUpsertRoom({
      code: room.code,
      host_user_id: null,
      game_state: JSON.stringify(room.state),
      player_map: JSON.stringify(playerMap),
      created_at: Math.floor(room.createdAt / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    console.error(`Failed to persist room ${room.code}:`, err);
  }
}

/** Restore rooms from the database on server startup */
export function restoreRooms(): void {
  deleteStaleRooms();
  const dbRooms = findAllActiveRooms();
  for (const dbRoom of dbRooms) {
    try {
      const state = JSON.parse(dbRoom.game_state) as GameState;
      // Mark all players as disconnected on restore
      const players = state.players.map(p => ({ ...p, connected: false }));
      const room: Room = {
        code: dbRoom.code,
        hostSocketId: '', // No socket on restore
        state: { ...state, players },
        socketToPlayer: new Map(), // Empty — clients must reconnect
        createdAt: dbRoom.created_at * 1000,
      };
      rooms.set(dbRoom.code, room);
    } catch (err) {
      console.error(`Failed to restore room ${dbRoom.code}:`, err);
    }
  }
  if (dbRooms.length > 0) {
    console.log(`Restored ${dbRooms.length} multiplayer room(s) from database`);
  }
}

/** Reconnect a player to an existing room */
export function reconnectToRoom(code: string, playerId: string, socketId: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;

  const player = room.state.players.find(p => p.id === playerId);
  if (!player) return null;

  // Map this socket to the player
  room.socketToPlayer.set(socketId, playerId);

  // Mark player as connected
  room.state = {
    ...room.state,
    players: room.state.players.map(p =>
      p.id === playerId ? { ...p, connected: true } : p,
    ),
  };

  // If this is the first reconnecting socket and host is empty, make them host
  if (!room.hostSocketId) {
    room.hostSocketId = socketId;
  }

  persistRoom(room);
  return room;
}

export function createRoom(socketId: string, config: GameConfig): Room {
  cleanupStaleRooms();
  if (rooms.size >= MAX_ROOMS) {
    throw new Error('Server is at room capacity');
  }

  const code = generateRoomCode();
  const state = createGame({ ...config, mode: 'multiplayer' });

  const room: Room = {
    code,
    hostSocketId: socketId,
    state: { ...state, roomCode: code },
    socketToPlayer: new Map([[socketId, state.players[0].id]]),
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  persistRoom(room);
  return room;
}

export type JoinRoomParams = {
  code: string;
  name?: string;
  raceId?: string;
};

export type JoinRoomError = 'room_not_found' | 'room_full' | 'race_taken' | 'invalid_race';

export function joinRoom(params: JoinRoomParams, socketId: string): { room: Room } | { error: JoinRoomError } {
  const room = rooms.get(params.code);
  if (!room) return { error: 'room_not_found' };

  // Max 6 players
  if (room.state.players.length >= 6) return { error: 'room_full' };

  // Validate raceId against known races
  const raceId = params.raceId || 'human';
  if (!VALID_RACE_IDS.has(raceId as RaceId)) {
    return { error: 'invalid_race' };
  }

  // Check if raceId is already taken
  if (params.raceId) {
    const raceTaken = room.state.players.some(p => p.raceId === params.raceId);
    if (raceTaken) return { error: 'race_taken' };
  }

  // Create a new player dynamically — use a unique counter
  const existingIds = new Set(room.state.players.map(p => p.id));
  let playerIndex = room.state.players.length + 1;
  while (existingIds.has(`player_${playerIndex}`)) {
    playerIndex++;
  }
  const newPlayerId = `player_${playerIndex}`;

  // Sanitize name: limit length, strip control chars
  const rawName = params.name || `Player ${playerIndex}`;
  const name = rawName.slice(0, 30).replace(/[\x00-\x1f]/g, '');

  const newPlayer = {
    id: newPlayerId,
    name,
    raceId: raceId as RaceId,
    isBot: false,
    botDifficulty: null,
    tiles: { plain: 0, mountain: 0, forest: 0, swamp: 0, road: 0 },
    eraCards: [],
    relic: null,
    score: null,
    hasTraded: false,
    hasPlaced: false,
    connected: true,
  };

  room.socketToPlayer.set(socketId, newPlayerId);
  room.state = {
    ...room.state,
    players: [...room.state.players, newPlayer],
  };

  persistRoom(room);
  return { room };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function applyAction(room: Room, action: GameAction): { state: GameState } | { error: string } {
  try {
    room.state = era1Reducer(room.state, action);
    persistRoom(room);
    return { state: room.state };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid action' };
  }
}

export function handleDisconnect(socketId: string): { room: Room; playerId: string } | null {
  for (const room of rooms.values()) {
    const playerId = room.socketToPlayer.get(socketId);
    if (playerId) {
      room.socketToPlayer.delete(socketId);
      room.state = {
        ...room.state,
        players: room.state.players.map(p =>
          p.id === playerId ? { ...p, connected: false } : p
        ),
      };

      // Delete room if nobody left
      if (room.socketToPlayer.size === 0) {
        rooms.delete(room.code);
        dbDeleteRoom(room.code);
      } else {
        persistRoom(room);
      }

      return { room, playerId };
    }
  }
  return null;
}

export function getPlayerIdForSocket(room: Room, socketId: string): string | undefined {
  return room.socketToPlayer.get(socketId);
}
