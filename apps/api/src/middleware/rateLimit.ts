import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../core/errors';

/**
 * Small in-memory fixed-window limiter (per client IP). Enough to blunt password guessing and request floods on a
 * single-instance deployment; a multi-instance deployment would need a shared store (e.g. Redis).
 */
export class WindowCounter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one hit; returns whether it is allowed and how long until the window resets. */
  hit(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    return { allowed: entry.count <= this.max, retryAfterSec: Math.ceil((entry.resetAt - t) / 1000) };
  }

  /** Drops expired windows so the map cannot grow without bound. */
  sweep() {
    const t = this.now();
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  if (process.env.RATE_LIMIT === 'off') return (_req: Request, _res: Response, next: NextFunction) => next();
  const counter = new WindowCounter(opts.windowMs, opts.max);
  setInterval(() => counter.sweep(), Math.max(opts.windowMs, 60_000)).unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const { allowed, retryAfterSec } = counter.hit(req.ip ?? 'unknown');
    if (allowed) return next();
    res.setHeader('Retry-After', String(retryAfterSec));
    next(new HttpError(429, opts.message ?? 'Too many requests — please slow down and try again shortly'));
  };
}
