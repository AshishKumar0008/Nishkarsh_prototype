import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './core/errors';
import { aiRouter } from './modules/ai.routes';
import { agreementRouter } from './modules/agreement.routes';
import { applicationsRouter } from './modules/applications.routes';
import { auditRouter } from './modules/audit.routes';
import { authRouter } from './modules/auth.routes';
import { challengesRouter } from './modules/challenges.routes';
import { evaluationRouter } from './modules/evaluation.routes';
import { metaRouter } from './modules/meta.routes';
import { pilotRouter, pilotWorklistRouter } from './modules/pilot.routes';
import { rateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/security';

export function createApp() {
  const app = express();
  // Behind a platform proxy the client IP (needed by the rate limiter and req.secure) comes from X-Forwarded-For
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // The web app calls /api on its own origin (Vite proxy in dev, this server in production), so CORS is off unless
  // an explicit allow-list is configured for a split deployment.
  const allowedOrigins = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (allowedOrigins.length) app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', rateLimit({ windowMs: 10 * 60_000, max: 1500 }));
  // Password guessing: tight limit on the real login, a looser one on the demo role switcher
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Too many sign-in attempts — try again in a few minutes' }));
  app.use('/api/auth/demo-login', rateLimit({ windowMs: 10 * 60_000, max: 200 }));
  app.use('/api/auth', authRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/challenges', challengesRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/applications', evaluationRouter);
  app.use('/api/applications', agreementRouter);
  app.use('/api/applications', pilotRouter);
  app.use('/api/pilots', pilotWorklistRouter);
  app.use('/api/audit', auditRouter);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route not found')));

  // Production: serve the built web app from this server, so one URL carries the UI and the API
  const webDist = process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(join(webDist, 'index.html'))) {
    app.use('/assets', express.static(join(webDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(webDist, { index: false, maxAge: 0 }));
    // Any other GET is a client-side route (React Router); the browser gets the app shell
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDist, 'index.html'));
    });
  }

  // Express 5 forwards rejected async handlers here automatically
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Validation failed', issues: err.flatten().fieldErrors });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
