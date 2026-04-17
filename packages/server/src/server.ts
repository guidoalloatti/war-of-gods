import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerGameSocket } from './sockets/gameSocket.js';
import { restoreRooms } from './rooms/roomManager.js';
import {
  handleGoogleAuth,
  handleRegister,
  handleLogin,
  handleMe,
  handleLogout,
  authMiddleware,
} from './auth.js';
import { handleSaveGame, handleListSaves, handleLoadSave, handleDeleteSave } from './saves.js';
import { adminMiddleware } from './adminAuth.js';
import {
  handleListCards,
  handleGetCard,
  handleCreateCard,
  handleUpdateCard,
  handleDeleteCard,
  handleCloneCard,
  handleAdminStats,
} from './admin.js';

const PORT = process.env.PORT ?? 3001;

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim());

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());
app.use(authMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Auth routes
app.post('/auth/google', handleGoogleAuth);
app.post('/auth/register', handleRegister);
app.post('/auth/login', handleLogin);
app.get('/auth/me', handleMe);
app.post('/auth/logout', handleLogout);

// Game save routes
app.post('/games/save', handleSaveGame);
app.get('/games/saves', handleListSaves);
app.get('/games/saves/:id', handleLoadSave);
app.delete('/games/saves/:id', handleDeleteSave);

// Admin routes (require admin role)
app.get('/admin/cards', adminMiddleware, handleListCards);
app.get('/admin/cards/:id', adminMiddleware, handleGetCard);
app.post('/admin/cards', adminMiddleware, handleCreateCard);
app.put('/admin/cards/:id', adminMiddleware, handleUpdateCard);
app.delete('/admin/cards/:id', adminMiddleware, handleDeleteCard);
app.post('/admin/cards/:id/clone', adminMiddleware, handleCloneCard);
app.get('/admin/stats', adminMiddleware, handleAdminStats);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

registerGameSocket(io);

// Restore multiplayer rooms from DB before accepting connections
restoreRooms();

httpServer.listen(PORT, () => {
  console.log(`Servidor de War of Gods corriendo en puerto ${PORT}`);
});
