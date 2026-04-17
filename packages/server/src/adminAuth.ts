import type { Request, Response, NextFunction } from 'express';
import { getReqUser } from './auth.js';

/** Middleware that requires the user to have admin role */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = getReqUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
