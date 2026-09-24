import {
  coiDeclarationSchema,
  computeConsensus,
  computeWeightedScore,
  MIN_ACTIVE_SCORECARDS,
  scorecardSchema,
  type ConsensusResult,
} from '@pragati/shared';
import { Router } from 'express';
import { appendAudit } from '../core/auditChain';
import { forbidden, HttpError, notFound, param } from '../core/errors';
import { prisma, type Tx } from '../core/prisma';
import { SYSTEM_ACTOR, transition } from '../core/stateMachine';
import { actorOf, currentUser, requireAuth, requireRole, type AuthUser } from '../middleware/auth';
import { applicationScope } from './applications.routes';

/**
 * Stage 4 — Expert evaluation.
 *
 * Officer opens the panel → each evaluator declares COI (final, can't be edited) → non-recused evaluators score
 * against the fixed rubric → once every panel member has acted, the officer triggers finalisation and the SYSTEM
 * applies the consensus threshold. No human picks the winner by hand; no AI touches the scores.
 */
export const evaluationRouter = Router();
evaluationRouter.use(requireAuth);

const evaluatorSelect = { id: true, name: true } as const;

/** The evaluation panel. MVP: every EVALUATOR user. TODO: per-challenge panel assignment (domain + technical + field rep). */
function loadPanel(db: Tx | typeof prisma) {
  return db.user.findMany({ where: { role: 'EVALUATOR' }, select: evaluatorSelect, orderBy: { name: 'asc' } });
}

/**
 * Locks the application row for the rest of the transaction and returns its state, so a scorecard can't land
 * while finalisation is computing consensus (and vice versa).
 */
async function lockApplication(tx: Tx, id: string): Promise<string> {
  const rows = await tx.$queryRaw<{ state: string }[]>`SELECT state::text AS state FROM "Application" WHERE id = ${id} FOR UPDATE`;
  if (!rows[0]) throw notFound('Application');
  return rows[0].state;
}

function requireState(state: string, expected: string, what: string) {
  if (state !== expected) throw new HttpError(409, `${what} is only possible while the application is ${expected} (it is ${state})`);
}

async function computePanelConsensus(db: Tx | typeof prisma, applicationId: string): Promise<ConsensusResult> {
  const [panel, cois, cards] = await Promise.all([
    loadPanel(db),
    db.cOIDeclaration.findMany({ where: { applicationId }, include: { evaluator: { select: evaluatorSelect } } }),
    db.scorecard.findMany({ where: { applicationId }, include: { evaluator: { select: evaluatorSelect } } }),
  ]);
  return computeConsensus(
    cards.map((s) => ({ ...s, evaluatorName: s.evaluator.name })),
    cois.map((c) => ({ ...c, evaluatorName: c.evaluator.name })),
    { panelSize: panel.length },
  );
}

/** Department officers may only run the panel for their own department's challenges. */
async function assertOwnsApplication(user: AuthUser, applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { challenge: { select: { departmentId: true } } },
  });
  if (!app) throw notFound('Application');
  if (user.role === 'DEPT_OFFICER' && app.challenge.departmentId !== user.departmentId) {
    throw forbidden('This application belongs to another department');
  }
}

// 4a — department officer opens the evaluation panel
evaluationRouter.post('/:id/open-evaluation', requireRole('DEPT_OFFICER', 'ADMIN'), async (req, res) => {
  const id = param(req, 'id');
  await assertOwnsApplication(currentUser(req), id);
  const panel = await loadPanel(prisma);
  await prisma.$transaction((tx) =>
    transition(tx, {
      entity: 'APPLICATION',
      id,
      to: 'UNDER_EVALUATION',
      actor: actorOf(req),
      payload: { panel: panel.map((p) => ({ id: p.id, name: p.name })) },
    }),
  );
  res.json({ state: 'UNDER_EVALUATION' });
});

// 4b — evaluation overview. Startups never see it; an evaluator sees others' scores only after submitting their own.
evaluationRouter.get('/:id/evaluation', requireRole('DEPT_OFFICER', 'FINANCE', 'EVALUATOR', 'ADMIN'), async (req, res) => {
  const id = param(req, 'id');
  const user = currentUser(req);
  const app = await prisma.application.findFirst({
    where: { AND: [{ id }, applicationScope(user)] },
    select: { id: true, state: true },
  });
  if (!app) throw notFound('Application');

  const [panel, coiDeclarations, scorecards, consensus] = await Promise.all([
    loadPanel(prisma),
    prisma.cOIDeclaration.findMany({ where: { applicationId: id }, include: { evaluator: { select: evaluatorSelect } }, orderBy: { declaredAt: 'asc' } }),
    prisma.scorecard.findMany({ where: { applicationId: id }, include: { evaluator: { select: evaluatorSelect } }, orderBy: { submittedAt: 'asc' } }),
    computePanelConsensus(prisma, id),
  ]);

  const myCoi = coiDeclarations.find((c) => c.evaluatorId === user.id) ?? null;
  const myScorecard = scorecards.find((s) => s.evaluatorId === user.id) ?? null;
  // Independent scoring: until you've scored (or recused), you can't see anyone else's numbers
  const sealed = user.role === 'EVALUATOR' && app.state === 'UNDER_EVALUATION' && !myScorecard && !myCoi?.hasConflict;

  res.json({
    applicationId: id,
    state: app.state,
    panel,
    coiDeclarations,
    scorecards: sealed ? [] : scorecards,
    consensus: sealed ? null : consensus,
    sealed,
    myCoi,
    myScorecard,
  });
});

// 4c — evaluator declares conflict of interest. One-time and final: it is a signed declaration.
evaluationRouter.post('/:id/coi', requireRole('EVALUATOR'), async (req, res) => {
  const id = param(req, 'id');
  const input = coiDeclarationSchema.parse(req.body);
  const user = currentUser(req);

  await prisma.$transaction(async (tx) => {
    requireState(await lockApplication(tx, id), 'UNDER_EVALUATION', 'Declaring conflict of interest');
    const existing = await tx.cOIDeclaration.findUnique({ where: { applicationId_evaluatorId: { applicationId: id, evaluatorId: user.id } } });
    if (existing) throw new HttpError(409, 'You have already declared for this application; declarations cannot be changed');

    await tx.cOIDeclaration.create({
      data: { applicationId: id, evaluatorId: user.id, hasConflict: input.hasConflict, details: input.details || null },
    });
    await appendAudit(tx, {
      entityType: 'APPLICATION',
      entityId: id,
      action: input.hasConflict ? 'EVALUATOR_RECUSED' : 'COI_DECLARED_NONE',
      actor: actorOf(req),
      payload: { hasConflict: input.hasConflict, details: input.details || null },
    });
  });
  res.status(201).json({ hasConflict: input.hasConflict });
});

// 4d — evaluator scores the proposal. Revisions are allowed until finalisation; every version is in the audit log.
evaluationRouter.post('/:id/score', requireRole('EVALUATOR'), async (req, res) => {
  const id = param(req, 'id');
  const input = scorecardSchema.parse(req.body);
  const user = currentUser(req);
  const weightedTotal = computeWeightedScore(input);
  const key = { applicationId_evaluatorId: { applicationId: id, evaluatorId: user.id } };

  await prisma.$transaction(async (tx) => {
    requireState(await lockApplication(tx, id), 'UNDER_EVALUATION', 'Scoring');
    const coi = await tx.cOIDeclaration.findUnique({ where: key });
    if (!coi) throw new HttpError(422, 'Declare conflict of interest before scoring');
    if (coi.hasConflict) throw forbidden('You declared a conflict of interest and are recused from scoring this application');

    const existing = await tx.scorecard.findUnique({ where: key, select: { id: true } });
    const data = { ...input, comments: input.comments || null, weightedTotal };
    await tx.scorecard.upsert({
      where: key,
      create: { ...data, applicationId: id, evaluatorId: user.id },
      update: { ...data, submittedAt: new Date() },
    });
    await appendAudit(tx, {
      entityType: 'APPLICATION',
      entityId: id,
      action: existing ? 'SCORECARD_REVISED' : 'SCORECARD_SUBMITTED',
      actor: actorOf(req),
      payload: data,
    });
  });
  res.json({ weightedTotal });
});

// 4e — officer triggers finalisation; the SYSTEM applies the pre-set threshold to the panel consensus.
evaluationRouter.post('/:id/finalize-evaluation', requireRole('DEPT_OFFICER', 'ADMIN'), async (req, res) => {
  const id = param(req, 'id');
  await assertOwnsApplication(currentUser(req), id);

  const result = await prisma.$transaction(async (tx) => {
    requireState(await lockApplication(tx, id), 'UNDER_EVALUATION', 'Finalising evaluation');
    const consensus = await computePanelConsensus(tx, id);
    if (!consensus.hasQuorum) {
      const { pendingDeclarations, pendingScores, scorecardsCount } = consensus;
      throw new HttpError(
        422,
        pendingDeclarations || pendingScores
          ? `Panel has not finished: ${pendingDeclarations} COI declaration(s) and ${pendingScores} scorecard(s) outstanding`
          : `Only ${scorecardsCount} non-recused scorecard(s) — at least ${MIN_ACTIVE_SCORECARDS} are needed; add a panel member`,
        { pendingDeclarations, pendingScores },
      );
    }
    const to = consensus.recommendation === 'SELECTED' ? 'SELECTED' : 'REJECTED';
    await transition(tx, {
      entity: 'APPLICATION',
      id,
      to,
      actor: SYSTEM_ACTOR,
      payload: { consensus, triggeredBy: currentUser(req).id },
    });
    return { state: to, consensus };
  });
  res.json(result);
});
