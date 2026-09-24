import type { Role } from '@pragati/shared';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { forbidden, HttpError } from '../core/errors';
import type { Actor } from '../core/stateMachine';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  departmentId: string | null;
  startupId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
};

export function signToken(user: AuthUser) {
  return jwt.sign(user, secret(), { expiresIn: '12h' });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'Not signed in'));
  try {
    const { iat: _iat, exp: _exp, ...user } = jwt.verify(header.slice(7), secret()) as AuthUser & { iat: number; exp: number };
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Session expired — sign in again'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Not signed in'));
    if (!roles.includes(req.user.role)) return next(forbidden(`Only ${roles.join(' / ')} can do this`));
    next();
  };
}

/** The signed-in user; only call behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Not signed in');
  return req.user;
}

export function actorOf(req: Request): Actor {
  const u = currentUser(req);
  return { id: u.id, role: u.role };
}
