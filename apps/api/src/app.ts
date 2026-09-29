import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './core/errors';
import { agreementRouter } from './modules/agreement.routes';
import { applicationsRouter } from './modules/applications.routes';
import { auditRouter } from './modules/audit.routes';
import { authRouter } from './modules/auth.routes';
import { challengesRouter } from './modules/challenges.routes';
import { evaluationRouter } from './modules/evaluation.routes';
import { metaRouter } from './modules/meta.routes';
import { pilotRouter, pilotWorklistRouter } from './modules/pilot.routes';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/challenges', challengesRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/applications', evaluationRouter);
  app.use('/api/applications', agreementRouter);
  app.use('/api/applications', pilotRouter);
  app.use('/api/pilots', pilotWorklistRouter);
  app.use('/api/audit', auditRouter);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route not found')));

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
