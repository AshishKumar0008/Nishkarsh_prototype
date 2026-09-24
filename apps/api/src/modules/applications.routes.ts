import { eligibilityDecisionSchema } from '@pragati/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { notFound, param } from '../core/errors';
import { prisma } from '../core/prisma';
import { transition } from '../core/stateMachine';
import { actorOf, currentUser, requireAuth, requireRole, type AuthUser } from '../middleware/auth';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

/** Startups see only their own applications; officers only their department's; finance/admin see all. */
export function applicationScope(user: AuthUser): Prisma.ApplicationWhereInput {
  switch (user.role) {
    case 'ADMIN':
    case 'FINANCE':
      return {};
    case 'STARTUP':
      return { startupId: user.startupId ?? '__none__' };
    case 'DEPT_OFFICER':
      return { challenge: { departmentId: user.departmentId ?? '__none__' } };
    // TODO(week 2+): evaluators → assigned applications, field staff/validators → their pilots
    default:
      return { id: '__none__' };
  }
}

const listQuery = z.object({ state: z.string().optional() });

applicationsRouter.get('/', async (req, res) => {
  const { state } = listQuery.parse(req.query);
  const apps = await prisma.application.findMany({
    where: { AND: [applicationScope(currentUser(req)), state ? { state: state as never } : {}] },
    orderBy: { createdAt: 'desc' },
    include: {
      startup: { select: { name: true, district: true } },
      challenge: { select: { id: true, title: true, department: { select: { name: true } } } },
      eligibilityMemo: { select: { autoEligible: true, clausesCited: true, decision: true } },
    },
  });
  res.json(apps);
});

applicationsRouter.get('/:id', async (req, res) => {
  const app = await prisma.application.findFirst({
    where: { AND: [{ id: param(req, 'id') }, applicationScope(currentUser(req))] },
    include: {
      startup: true,
      challenge: { include: { department: { select: { name: true, district: true } } } },
      eligibilityMemo: { include: { decidedBy: { select: { name: true } } } },
    },
  });
  if (!app) throw notFound('Application');
  res.json(app);
});

// Stage 3b — finance officer confirms or overrides the auto-generated eligibility memo
applicationsRouter.post('/:id/eligibility', requireRole('FINANCE'), async (req, res) => {
  const { decision, note } = eligibilityDecisionSchema.parse(req.body);
  const memo = await prisma.eligibilityMemo.findUnique({ where: { applicationId: param(req, 'id') } });
  if (!memo) throw notFound('Eligibility memo');

  const finalEligible = decision === 'CONFIRM' ? memo.autoEligible : !memo.autoEligible;
  const actor = actorOf(req);

  await prisma.$transaction(async (tx) => {
    await tx.eligibilityMemo.update({
      where: { id: memo.id },
      data: {
        decision: decision === 'CONFIRM' ? 'CONFIRMED' : 'OVERRIDDEN',
        finalEligible,
        officerNote: note || null,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    });
    await transition(tx, {
      entity: 'APPLICATION',
      id: param(req, 'id'),
      to: finalEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      actor,
      payload: { memoId: memo.id, decision, autoEligible: memo.autoEligible, finalEligible, clausesCited: memo.clausesCited, note },
    });
  });

  res.json({ finalEligible });
});
