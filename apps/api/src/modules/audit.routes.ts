import { Router } from 'express';
import { z } from 'zod';
import { verifyChain } from '../core/auditChain';
import { notFound } from '../core/errors';
import { prisma } from '../core/prisma';
import { currentUser, requireAuth } from '../middleware/auth';
import { applicationScope } from './applications.routes';

export const auditRouter = Router();
auditRouter.use(requireAuth);

const query = z.object({ entityType: z.enum(['CHALLENGE', 'APPLICATION']), entityId: z.string().min(1) });

auditRouter.get('/', async (req, res) => {
  const { entityType, entityId } = query.parse(req.query);
  if (entityType === 'APPLICATION') {
    const visible = await prisma.application.count({ where: { AND: [{ id: entityId }, applicationScope(currentUser(req))] } });
    if (!visible) throw notFound('Application');
  }
  const entries = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { seq: 'asc' },
    include: { actor: { select: { name: true } } },
  });
  res.json(entries);
});

/** Recomputes every hash in the chain. Tamper with any row in the DB and this reports where. */
auditRouter.get('/verify', async (_req, res) => {
  res.json(await verifyChain(prisma));
});
