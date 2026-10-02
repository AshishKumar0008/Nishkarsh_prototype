import { aiChallengeDraftSchema, applySchema, createChallengeSchema, getProblemTag, reviewDraftAgainstFinal } from '@nishkarsh/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { appendAudit } from '../core/auditChain';
import { forbidden, HttpError, notFound, param } from '../core/errors';
import { prisma } from '../core/prisma';
import { transition } from '../core/stateMachine';
import { actorOf, currentUser, requireAuth, requireRole, type AuthUser } from '../middleware/auth';
import { lookupDpiit } from '../mocks/dpiitRegistry';
import { screenApplication } from './eligibility.service';

export const challengesRouter = Router();
challengesRouter.use(requireAuth);

const PUBLIC_STATES = ['PUBLISHED', 'CLOSED', 'NO_ELIGIBLE_BIDS'] as const;

/** Drafts are visible only to their own department (plus finance/admin); published challenges to everyone. */
function visibilityFilter(user: AuthUser): Prisma.ChallengeWhereInput {
  if (user.role === 'ADMIN' || user.role === 'FINANCE') return {};
  if (user.role === 'DEPT_OFFICER') return { OR: [{ departmentId: user.departmentId ?? '' }, { state: { in: [...PUBLIC_STATES] } }] };
  return { state: { in: [...PUBLIC_STATES] } };
}

const canSeeAllApplications = (user: AuthUser, departmentId: string) =>
  user.role === 'ADMIN' || user.role === 'FINANCE' || (user.role === 'DEPT_OFFICER' && user.departmentId === departmentId);

/** Problem-tag clustering: other departments with an open challenge for the same problem type. */
function findClusterMatches(db: Prisma.TransactionClient | typeof prisma, c: { id: string; problemTag: string; departmentId: string }) {
  return db.challenge.findMany({
    where: { problemTag: c.problemTag, state: 'PUBLISHED', id: { not: c.id }, departmentId: { not: c.departmentId } },
    select: { id: true, title: true, district: true, budgetCeilingInr: true, department: { select: { name: true } } },
  });
}

challengesRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const challenges = await prisma.challenge.findMany({
    where: visibilityFilter(user),
    orderBy: { createdAt: 'desc' },
    include: {
      department: { select: { name: true, district: true } },
      _count: { select: { applications: true } },
      applications: user.startupId
        ? { where: { startupId: user.startupId }, select: { id: true, state: true } }
        : false,
    },
  });
  res.json(challenges);
});

challengesRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const challenge = await prisma.challenge.findFirst({
    where: { AND: [{ id: param(req, 'id') }, visibilityFilter(user)] },
    include: {
      department: { select: { name: true, district: true } },
      createdBy: { select: { name: true } },
      aiDraft: { select: { provider: true, model: true, promptVersion: true, createdAt: true, fieldReview: true, warnings: true } },
    },
  });
  if (!challenge) throw notFound('Challenge');
  // Everyone sees that AI helped draft it; only the owning department sees the per-field review.
  if (challenge.aiDraft && !canSeeAllApplications(user, challenge.departmentId)) {
    challenge.aiDraft = { ...challenge.aiDraft, fieldReview: null, warnings: [] };
  }

  const applications = await prisma.application.findMany({
    where: {
      challengeId: challenge.id,
      ...(canSeeAllApplications(user, challenge.departmentId) ? {} : { startupId: user.startupId ?? '__none__' }),
    },
    select: { id: true, state: true, createdAt: true, proposedPriceInr: true, startup: { select: { name: true, district: true } } },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ ...challenge, applications, clusterMatches: await findClusterMatches(prisma, challenge) });
});

// Stage 1 — author a challenge (saved as DRAFT). If the officer used the AI assistant, its provenance is sealed into the audit entry.
challengesRouter.post('/', requireRole('DEPT_OFFICER'), async (req, res) => {
  const user = currentUser(req);
  if (!user.departmentId) throw forbidden('Your account is not linked to a department');
  const { aiDraftId, ...input } = createChallengeSchema.parse(req.body);
  const tag = getProblemTag(input.problemTag)!;

  const challenge = await prisma.$transaction(async (tx) => {
    const created = await tx.challenge.create({
      data: { ...input, aiAssisted: Boolean(aiDraftId), sector: tag.sector, departmentId: user.departmentId!, createdById: user.id },
    });

    let aiProvenance: Record<string, unknown> | undefined;
    if (aiDraftId) {
      const draft = await tx.aiDraft.findUnique({ where: { id: aiDraftId } });
      if (!draft || draft.requestedById !== user.id) throw new HttpError(422, 'AI draft not found for your account');
      const fieldReview = reviewDraftAgainstFinal(aiChallengeDraftSchema.parse(draft.output), input);
      // guarded claim: a draft can back exactly one challenge
      const claimed = await tx.aiDraft.updateMany({
        where: { id: draft.id, challengeId: null },
        data: { challengeId: created.id, fieldReview },
      });
      if (claimed.count === 0) throw new HttpError(409, 'This AI draft was already used for another challenge');
      aiProvenance = {
        draftId: draft.id,
        provider: draft.provider,
        model: draft.model,
        promptVersion: draft.promptVersion,
        outputHash: draft.outputHash,
        unsupportedNumbers: draft.warnings,
        fieldReview,
        humanOnlyFields: 'baseline, target, adoption %, budget, duration and deadline entered by the officer',
      };
    }

    await appendAudit(tx, {
      entityType: 'CHALLENGE',
      entityId: created.id,
      action: 'CHALLENGE_CREATED',
      actor: actorOf(req),
      toState: 'DRAFT',
      payload: { ...input, sector: tag.sector, aiAssisted: Boolean(aiDraftId), ...(aiProvenance && { aiProvenance }) },
    });
    return created;
  });
  res.status(201).json(challenge);
});

async function loadOwnChallenge(user: AuthUser, id: string) {
  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge) throw notFound('Challenge');
  if (challenge.departmentId !== user.departmentId) throw forbidden('This challenge belongs to another department');
  return challenge;
}

// Stage 1 exit — officer signs and publishes
challengesRouter.post('/:id/publish', requireRole('DEPT_OFFICER'), async (req, res) => {
  const challenge = await loadOwnChallenge(currentUser(req), param(req, 'id'));
  if (challenge.applicationDeadline <= new Date()) throw new HttpError(422, 'Application deadline must be in the future');

  const result = await prisma.$transaction(async (tx) => {
    const clusterMatches = await findClusterMatches(tx, challenge);
    await transition(tx, {
      entity: 'CHALLENGE',
      id: challenge.id,
      to: 'PUBLISHED',
      actor: actorOf(req),
      payload: { officerSignOff: true, clusterMatchIds: clusterMatches.map((m) => m.id) },
    });
    await tx.challenge.update({ where: { id: challenge.id }, data: { publishedAt: new Date() } });
    return { clusterMatches };
  });
  res.json(result);
});

// Close a challenge. With no eligible applicant it becomes an innovation-gap referral instead of silently closing.
challengesRouter.post('/:id/close', requireRole('DEPT_OFFICER'), async (req, res) => {
  const challenge = await loadOwnChallenge(currentUser(req), param(req, 'id'));
  const { reason } = z.object({ reason: z.string().trim().default('') }).parse(req.body ?? {});
  const eligibleCount = await prisma.application.count({
    where: { challengeId: challenge.id, state: { notIn: ['SUBMITTED', 'ELIGIBILITY_PENDING', 'INELIGIBLE'] } },
  });
  const to = eligibleCount === 0 ? 'NO_ELIGIBLE_BIDS' : 'CLOSED';
  await prisma.$transaction((tx) =>
    transition(tx, {
      entity: 'CHALLENGE',
      id: challenge.id,
      to,
      actor: actorOf(req),
      payload: {
        reason,
        eligibleCount,
        ...(to === 'NO_ELIGIBLE_BIDS' && { referral: ['AIM ARISE / Atal New India Challenges', 'MSInS Innovation & Technological Development Fund'] }),
      },
    }),
  );
  res.json({ state: to });
});

// Stage 2 — startup applies; Stage 3 auto-screen runs in the same transaction
challengesRouter.post('/:id/applications', requireRole('STARTUP'), async (req, res) => {
  const user = currentUser(req);
  if (!user.startupId) throw forbidden('Your account is not linked to a startup');
  const input = applySchema.parse(req.body);

  const challenge = await prisma.challenge.findUnique({ where: { id: param(req, 'id') } });
  if (!challenge || challenge.state !== 'PUBLISHED') throw new HttpError(422, 'This challenge is not open for applications');
  if (challenge.applicationDeadline <= new Date()) throw new HttpError(422, 'The application deadline has passed');
  const startup = await prisma.startup.findUniqueOrThrow({ where: { id: user.startupId } });
  const existing = await prisma.application.findUnique({
    where: { challengeId_startupId: { challengeId: challenge.id, startupId: startup.id } },
  });
  if (existing) throw new HttpError(409, 'You have already applied to this challenge', { applicationId: existing.id });

  const dpiit = await lookupDpiit(startup.dpiitNumber);

  const application = await prisma.$transaction(async (tx) => {
    const { selfDeclarationAccepted: _accepted, declaredTurnoverInr, ...proposal } = input;
    const created = await tx.application.create({
      data: {
        ...proposal,
        challengeId: challenge.id,
        startupId: startup.id,
        submittedById: user.id,
        declaredDpiitNumber: startup.dpiitNumber,
        declaredIncorporationDate: startup.incorporationDate,
        declaredTurnoverInr,
      },
    });
    await appendAudit(tx, {
      entityType: 'APPLICATION',
      entityId: created.id,
      action: 'APPLICATION_SUBMITTED',
      actor: actorOf(req),
      toState: 'SUBMITTED',
      payload: { challengeId: challenge.id, startupId: startup.id, proposedPriceInr: input.proposedPriceInr, selfDeclarationAccepted: true },
    });
    await screenApplication(tx, created.id, { dpiitVerified: dpiit.verified, registrySource: dpiit.source });
    return created;
  });

  res.status(201).json(await prisma.application.findUnique({ where: { id: application.id }, include: { eligibilityMemo: true } }));
});
