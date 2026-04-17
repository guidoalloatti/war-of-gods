import { create } from 'zustand';
import type { GameState, GameConfig, GameAction, GameMode } from '@war-of-gods/engine';
import { createGame, era1Reducer } from '@war-of-gods/engine';
import { EasyBot, createRng } from '@war-of-gods/engine';
import { io, Socket } from 'socket.io-client';
import { saveGame as apiSaveGame, loadSave, listSaves, deleteSave as apiDeleteSave } from '../api/saves.js';
import type { SaveSummary } from '../api/saves.js';

type Screen = 'menu' | 'race_selection' | 'lobby' | 'era1' | 'scoring' | 'admin';

type GameStore = {
  screen: Screen;
  gameState: GameState | null;
  localPlayerId: string | null;
  gameMode: GameMode | null;
  error: string | null;

  // Multiplayer
  socket: Socket | null;
  roomCode: string | null;
  isHost: boolean;

  // Join flow: player picks race/name before joining
  isJoining: boolean;
  pendingJoinCode: string | null;

  // Navigation
  setScreen: (screen: Screen) => void;
  setGameMode: (mode: GameMode) => void;

  // Local game (solo / solo_bots)
  startLocalGame: (config: GameConfig) => void;
  dispatch: (action: GameAction) => void;
  runBots: () => void;

  // Multiplayer
  connectSocket: () => Socket;
  createRoom: (config: GameConfig) => void;
  joinWithRace: (code: string, name: string, raceId: string) => void;
  startJoinFlow: (code: string) => void;
  sendAction: (action: GameAction) => void;
  disconnectSocket: () => void;

  // Reconnection
  attemptReconnect: () => void;

  // Save / Load
  currentSaveId: string | null;
  saves: SaveSummary[];
  savesLoading: boolean;
  autoSave: () => Promise<void>;
  fetchSaves: () => Promise<void>;
  loadGame: (saveId: string) => Promise<void>;
  deleteGame: (saveId: string) => Promise<void>;

  // Shared setters
  setGameState: (state: GameState) => void;
  setLocalPlayerId: (id: string) => void;
  setError: (error: string | null) => void;
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  gameState: null,
  localPlayerId: null,
  gameMode: null,
  error: null,
  socket: null,
  roomCode: null,
  isHost: false,
  isJoining: false,
  pendingJoinCode: null,
  currentSaveId: null,
  saves: [],
  savesLoading: false,

  setScreen: (screen) => set({ screen }),
  setGameMode: (mode) => set({ gameMode: mode }),

  startLocalGame: (config) => {
    const state = createGame(config);
    set({
      gameState: state,
      localPlayerId: state.players[0].id,
      screen: 'era1',
      currentSaveId: null,
      error: null,
    });
  },

  dispatch: (action) => {
    const { gameState, gameMode, socket, roomCode } = get();
    if (!gameState) return;

    // In multiplayer, send action via socket
    if (gameMode === 'multiplayer' && socket && roomCode) {
      socket.emit('player_action', { roomCode, action });
      return;
    }

    // Local game: apply directly
    try {
      const newState = era1Reducer(gameState, action);
      set({ gameState: newState, error: null });
      // Auto-save after phase changes
      if (newState.era1Phase !== gameState.era1Phase) {
        get().autoSave();
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  runBots: () => {
    const { gameState, dispatch } = get();
    if (!gameState) return;

    const bots = gameState.players.filter(p => p.isBot);
    for (const botPlayer of bots) {
      const rng = createRng(gameState.seed + botPlayer.id.charCodeAt(botPlayer.id.length - 1));
      const bot = new EasyBot(rng);
      const action = bot.decideAction(gameState, botPlayer.id);
      if (action) {
        dispatch(action);
      }
    }
  },

  connectSocket: () => {
    const existing = get().socket;
    if (existing?.connected) return existing;

    // Clean up old socket if it exists but is disconnected
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }

    const socket = io(SERVER_URL, { transports: ['websocket'] });

    socket.on('state_update', (state: GameState) => {
      const { screen } = get();
      set({ gameState: state, error: null });
      // Auto-navigate to era1 when game starts (phase moves past setup)
      if (screen === 'lobby' && state.era1Phase !== 'setup') {
        set({ screen: 'era1' });
      }
    });

    socket.on('error', (data: { message: string }) => {
      set({ error: data.message });
    });

    socket.on('player_disconnect', (data: { playerId: string; state: GameState }) => {
      set({ gameState: data.state });
    });

    socket.on('disconnect', () => {
      set({ error: 'Disconnected from server' });
    });

    set({ socket });
    return socket;
  },

  createRoom: (config) => {
    const socket = get().connectSocket();

    socket.emit('create_room', config, (response: { code: string; state: GameState } | { error: string }) => {
      if ('error' in response) {
        set({ error: response.error });
        return;
      }
      set({
        roomCode: response.code,
        gameState: response.state as GameState,
        localPlayerId: response.state.players[0].id,
        isHost: true,
        screen: 'lobby',
        error: null,
      });
      // Save for reconnection
      localStorage.setItem('wog-room-code', response.code);
      localStorage.setItem('wog-player-id', response.state.players[0].id);
    });
  },

  startJoinFlow: (code) => {
    set({
      pendingJoinCode: code.toUpperCase(),
      isJoining: true,
      gameMode: 'multiplayer',
      screen: 'race_selection',
      error: null,
    });
  },

  joinWithRace: (code, name, raceId) => {
    const socket = get().connectSocket();

    socket.emit('join_room', { code: code.toUpperCase(), name, raceId }, (response: { state: GameState; playerId: string } | { error: string }) => {
      if ('error' in response) {
        set({ error: response.error });
        return;
      }
      set({
        roomCode: code.toUpperCase(),
        gameState: response.state as GameState,
        localPlayerId: response.playerId,
        isHost: false,
        isJoining: false,
        pendingJoinCode: null,
        screen: 'lobby',
        error: null,
      });
      // Save for reconnection
      localStorage.setItem('wog-room-code', code.toUpperCase());
      localStorage.setItem('wog-player-id', response.playerId);
    });
  },

  sendAction: (action) => {
    const { socket, roomCode } = get();
    if (socket && roomCode) {
      socket.emit('player_action', { roomCode, action });
    }
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      set({
        socket: null,
        roomCode: null,
        isHost: false,
        isJoining: false,
        pendingJoinCode: null,
        gameMode: null,
        error: null,
      });
    }
    localStorage.removeItem('wog-room-code');
    localStorage.removeItem('wog-player-id');
  },

  attemptReconnect: () => {
    const roomCode = localStorage.getItem('wog-room-code');
    const playerId = localStorage.getItem('wog-player-id');
    if (!roomCode || !playerId) return;

    const socket = get().connectSocket();

    socket.emit('reconnect_room', { code: roomCode, playerId }, (response: { state: GameState; playerId: string } | { error: string }) => {
      if ('error' in response) {
        // Clear stale reconnection data
        localStorage.removeItem('wog-room-code');
        localStorage.removeItem('wog-player-id');
        return;
      }

      const state = response.state as GameState;
      const screen = state.era1Phase === 'setup' || state.era1Phase === 'world_card_reveal'
        ? 'lobby' as Screen
        : 'era1' as Screen;

      set({
        roomCode,
        gameState: state,
        localPlayerId: response.playerId,
        gameMode: 'multiplayer',
        isHost: false,
        screen,
        error: null,
      });
    });
  },

  autoSave: async () => {
    const { gameState, gameMode, currentSaveId } = get();
    if (!gameState || !gameMode) return;
    // Only auto-save local games for logged-in users
    if (gameMode === 'multiplayer') return;
    const token = localStorage.getItem('wog-token');
    if (!token) return;
    try {
      const id = await apiSaveGame(gameState, gameMode, currentSaveId ?? undefined);
      set({ currentSaveId: id });
    } catch {
      // Silent fail for auto-save
    }
  },

  fetchSaves: async () => {
    const token = localStorage.getItem('wog-token');
    if (!token) { set({ saves: [] }); return; }
    set({ savesLoading: true });
    try {
      const saves = await listSaves();
      set({ saves, savesLoading: false });
    } catch {
      set({ saves: [], savesLoading: false });
    }
  },

  loadGame: async (saveId: string) => {
    try {
      const save = await loadSave(saveId);
      if (!save) {
        set({ error: 'Save not found' });
        return;
      }
      set({
        gameState: save.gameState,
        localPlayerId: save.gameState.players[0].id,
        gameMode: save.gameMode as GameMode,
        currentSaveId: save.id,
        screen: 'era1',
        error: null,
      });
    } catch {
      set({ error: 'Failed to load save' });
    }
  },

  deleteGame: async (saveId: string) => {
    try {
      await apiDeleteSave(saveId);
      set(s => ({ saves: s.saves.filter(sv => sv.id !== saveId) }));
    } catch {
      // Silent fail
    }
  },

  setGameState: (state) => set({ gameState: state }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setError: (error) => set({ error }),
}));
