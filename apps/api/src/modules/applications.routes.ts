import { eligibilityDecisionSchema } from '@nishkarsh/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { notFound, param } from '../core/errors';
import { prisma } from '../core/prisma';
import { transition } from '../core/stateMachine';
import { actorOf, currentUser, requireAuth, requireRole, type AuthUser } from '../middleware/auth';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

/**
 * Startups see only their own applications; officers only their department's; evaluators those at or past
 * the evaluation stage; field supervisors / validators only the pilots they are assigned to; finance/admin see all.
 * TODO: per-challenge panel assignment for evaluators.
 */
export function applicationScope(user: AuthUser): Prisma.ApplicationWhereInput {
  switch (user.role) {
    case 'ADMIN':
    case 'FINANCE':
      return {};
    case 'STARTUP':
      return { startupId: user.startupId ?? '__none__' };
    case 'DEPT_OFFICER':
      return { challenge: { departmentId: user.departmentId ?? '__none__' } };
    case 'FIELD_STAFF':
      return { agreement: { fieldSupervisorId: user.id } };
    case 'VALIDATOR':
      return { agreement: { validatorId: user.id } };
    case 'EVALUATOR':
      return { state: { in: ['ELIGIBLE', 'UNDER_EVALUATION', 'SELECTED', 'REJECTED'] } };
    default:
      return { id: '__none__' };
  }
}

const listQuery = z.object({ state: z.string().optional() });

applicationsRouter.get('/', async (req, res) => {
  const { state } = listQuery.parse(req.query);
  const user = currentUser(req);
  // Evaluators get their own COI/score status per row (for their worklist) — never other evaluators'
  const mine = user.role === 'EVALUATOR' ? { where: { evaluatorId: user.id } } : false;
  const apps = await prisma.application.findMany({
    where: { AND: [applicationScope(user), state ? { state: state as never } : {}] },
    orderBy: { createdAt: 'desc' },
    include: {
      startup: { select: { name: true, district: true } },
      challenge: { select: { id: true, title: true, department: { select: { name: true } } } },
      eligibilityMemo: { select: { autoEligible: true, clausesCited: true, decision: true } },
      scorecards: mine && { ...mine, select: { evaluatorId: true, weightedTotal: true } },
      coiDeclarations: mine && { ...mine, select: { evaluatorId: true, hasConflict: true } },
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
