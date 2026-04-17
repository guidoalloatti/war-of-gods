import { OAuth2Client } from 'google-auth-library';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import {
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  insertUser,
  updateUserGoogle,
  createSession,
  findSession,
  deleteSession,
} from './db/index.js';
import type { DbUser } from './db/index.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── Helpers ─────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: string;
}

const ADMIN_EMAILS = new Set(['guidoalloatti@gmail.com']);

function toPublic(u: DbUser): PublicUser {
  const role = ADMIN_EMAILS.has(u.email) ? 'admin' : (u.role ?? 'user');
  return { id: u.id, email: u.email, name: u.name, picture: u.picture, role };
}

function generateToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function issueSession(userId: string): string {
  const token = generateToken();
  createSession(token, userId);
  return token;
}

// ── Google OAuth ────────────────────────────────────────────────

export async function handleGoogleAuth(req: Request, res: Response) {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: 'Missing credential' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name ?? email.split('@')[0];
    const picture = payload.picture ?? '';

    // Find or create user
    let user = findUserByGoogleId(googleId);
    if (user) {
      // Update name/picture from Google profile
      updateUserGoogle(user.id, name, picture);
      user = { ...user, name, picture };
    } else {
      // Check if email exists with password auth — link accounts
      const existing = findUserByEmail(email);
      if (existing) {
        // Link Google to existing email account — but we can't update google_id with our simple stmts
        // Just use that user
        user = existing;
      } else {
        user = {
          id: uuid(),
          email,
          name,
          picture,
          password_hash: null,
          google_id: googleId,
          role: 'user',
          created_at: Math.floor(Date.now() / 1000),
        };
        insertUser(user);
      }
    }

    const token = issueSession(user.id);
    res.json({ user: toPublic(user), token });
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ── Email + Password Register ───────────────────────────────────

export async function handleRegister(req: Request, res: Response) {
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };

  if (!email || !password || !name) {
    res.status(400).json({ error: 'Missing email, password, or name' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const emailLower = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }

  const existing = findUserByEmail(emailLower);
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const sanitizedName = name.trim().slice(0, 50);
  if (!sanitizedName) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user: DbUser = {
    id: uuid(),
    email: emailLower,
    name: sanitizedName,
    picture: '',
    password_hash: passwordHash,
    google_id: null,
    role: 'user',
    created_at: Math.floor(Date.now() / 1000),
  };

  try {
    insertUser(user);
  } catch {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const token = issueSession(user.id);
  res.status(201).json({ user: toPublic(user), token });
}

// ── Email + Password Login ──────────────────────────────────────

export async function handleLogin(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Missing email or password' });
    return;
  }

  const emailLower = email.toLowerCase().trim();
  const user = findUserByEmail(emailLower);
  if (!user || !user.password_hash) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = issueSession(user.id);
  res.json({ user: toPublic(user), token });
}

// ── Get current user ────────────────────────────────────────────

export function handleMe(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' });
    return;
  }

  const token = authHeader.slice(7);
  const session = findSession(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const user = findUserById(session.user_id);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  res.json({ user: toPublic(user) });
}

// ── Logout ──────────────────────────────────────────────────────

export function handleLogout(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    deleteSession(authHeader.slice(7));
  }
  res.json({ ok: true });
}

// ── Auth middleware ──────────────────────────────────────────────

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const session = findSession(authHeader.slice(7));
    if (session) {
      const user = findUserById(session.user_id);
      if (user) {
        (req as Request & { user?: PublicUser }).user = toPublic(user);
      }
    }
  }
  next();
}

/** Helper to get the authenticated user or null */
export function getReqUser(req: Request): PublicUser | undefined {
  return (req as Request & { user?: PublicUser }).user;
}
