import { create } from 'zustand';
import type { GameState, GameConfig, GameAction, GameMode } from '@war-of-gods/engine';
import { createGame, gameReducer } from '@war-of-gods/engine';
import { EasyBot, createRng } from '@war-of-gods/engine';
import { io, Socket } from 'socket.io-client';
import { saveGame as apiSaveGame, loadSave, listSaves, deleteSave as apiDeleteSave } from '../api/saves.js';
import type { SaveSummary } from '../api/saves.js';

type Screen = 'menu' | 'race_selection' | 'lobby' | 'era1' | 'scoring' | 'era2' | 'era2_scoring' | 'era3' | 'admin';

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
  localAutosaveExists: boolean;
  autoSave: () => Promise<void>;
  fetchSaves: () => Promise<void>;
  loadGame: (saveId: string) => Promise<void>;
  deleteGame: (saveId: string) => Promise<void>;
  restoreLocalSave: () => boolean;
  clearLocalSave: () => void;

  // Shared setters
  setGameState: (state: GameState) => void;
  setLocalPlayerId: (id: string) => void;
  setError: (error: string | null) => void;
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRemoteSave(fn: () => Promise<void>) {
  if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(() => {
    remoteSaveTimer = null;
    void fn();
  }, 500);
}

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
  localAutosaveExists: !!localStorage.getItem('wog-local-autosave'),

  setScreen: (screen) => set({ screen }),
  setGameMode: (mode) => set({ gameMode: mode }),

  startLocalGame: (config) => {
    const state = createGame(config);
    localStorage.removeItem('wog-local-autosave');
    set({
      gameState: state,
      localPlayerId: state.players[0].id,
      screen: 'era1',
      currentSaveId: null,
      localAutosaveExists: false,
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
      const newState = gameReducer(gameState, action);
      set({ gameState: newState, error: null });
      // Auto-save on every action so mid-phase state (stacks, HP, wins, gold)
      // survives a reload. autoSave is debounced/coalesced internally.
      get().autoSave();
      // Auto-navigate on top-level phase transitions
      const { screen } = get();
      if (newState.phase === 'era2' && screen === 'era1') {
        set({ screen: 'era2' });
      } else if (newState.phase === 'era3' && (screen === 'era2' || screen === 'era2_scoring')) {
        set({ screen: 'era3' });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  runBots: () => {
    const { gameState } = get();
    if (!gameState) return;

    const bots = gameState.players.filter(p => p.isBot);
    const MAX_ITERATIONS = 50; // safety cap per bot

    for (const botPlayer of bots) {
      const rng = createRng(gameState.seed + botPlayer.id.charCodeAt(botPlayer.id.length - 1));
      const bot = new EasyBot(rng);

      // Era II bots often need multiple actions per phase (e.g. set tech, confirm,
      // mark kings-table ready). Loop until the bot yields null or we hit the cap.
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const current = get().gameState;
        if (!current) break;
        const action = bot.decideAction(current, botPlayer.id);
        if (!action) break;
        get().dispatch(action);
        // Loop only in Era II and Era III; Era I keeps one-action-per-invocation.
        if (current.phase !== 'era2' && current.phase !== 'era3') break;
        // If dispatch rejected the action (reducer threw), state ref is unchanged.
        // Bailing out prevents the bot from spinning on the same bad action.
        if (get().gameState === current) break;
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
      // Auto-navigate on top-level phase transitions
      if (state.phase === 'era2' && screen === 'era1') {
        set({ screen: 'era2' });
      } else if (state.phase === 'era3' && (screen === 'era2' || screen === 'era2_scoring')) {
        set({ screen: 'era3' });
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
      let screen: Screen;
      if (state.phase === 'era3') screen = 'era3';
      else if (state.phase === 'era2') screen = 'era2';
      else if (state.era1Phase === 'setup' || state.era1Phase === 'world_card_reveal') screen = 'lobby';
      else screen = 'era1';

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
    if (gameMode === 'multiplayer') return;

    // Always keep a local snapshot first — synchronous and cheap. This ensures
    // mid-phase state (stacks, HP, wins, gold, hand) survives a reload even if
    // the server round-trip below is slow or fails.
    try {
      localStorage.setItem(
        'wog-local-autosave',
        JSON.stringify({ gameState, gameMode, savedAt: Date.now() }),
      );
      // Keep the flag fresh so the menu banner can offer "Continue" if the
      // player navigates back to it.
      set({ localAutosaveExists: true });
    } catch {
      // Quota exceeded — ignore
    }

    // Debounce the server save to avoid hammering the API on every dispatch.
    // Coalesced via a module-level timer (see scheduleRemoteSave below).
    const token = localStorage.getItem('wog-token');
    if (token) {
      scheduleRemoteSave(async () => {
        try {
          const state = get().gameState;
          const mode = get().gameMode;
          if (!state || !mode || mode === 'multiplayer') return;
          const id = await apiSaveGame(state, mode, currentSaveId ?? undefined);
          set({ currentSaveId: id });
        } catch {
          // Silent fail — localStorage already has it.
        }
      });
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
      const gs = save.gameState;
      const screen: Screen =
        gs.phase === 'era3' ? 'era3' : gs.phase === 'era2' ? 'era2' : 'era1';
      set({
        gameState: gs,
        localPlayerId: gs.players[0].id,
        gameMode: save.gameMode as GameMode,
        currentSaveId: save.id,
        screen,
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

  restoreLocalSave: () => {
    try {
      const raw = localStorage.getItem('wog-local-autosave');
      if (!raw) return false;
      const { gameState, gameMode } = JSON.parse(raw) as { gameState: GameState; gameMode: GameMode; savedAt: number };
      if (!gameState || !gameMode) return false;
      const screen: Screen =
        gameState.phase === 'era3' ? 'era3' : gameState.phase === 'era2' ? 'era2' : 'era1';
      set({
        gameState,
        localPlayerId: gameState.players[0].id,
        gameMode: gameMode as GameMode,
        currentSaveId: null,
        screen,
        error: null,
      });
      return true;
    } catch {
      localStorage.removeItem('wog-local-autosave');
      return false;
    }
  },

  clearLocalSave: () => {
    localStorage.removeItem('wog-local-autosave');
    set({ localAutosaveExists: false });
  },

  setGameState: (state) => set({ gameState: state }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setError: (error) => set({ error }),
}));
