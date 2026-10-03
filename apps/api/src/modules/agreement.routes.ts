import {
  agreementDraftSchema,
  buildCommitmentCard,
  defaultDataSensitivity,
  formatInrPlain,
  milestoneDueDate,
  pilotEndDate,
  planTotal,
  SELECTION_THRESHOLD,
  FINAL_TRANCHE_MIN_PCT,
  PAYMENT_RELEASE_DAYS,
  signAgreementSchema,
  suggestMilestones,
  validateMilestonePlan,
  type AgreementDraftInput,
} from '@nishkarsh/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { appendAudit } from '../core/auditChain';
import { forbidden, HttpError, notFound, param } from '../core/errors';
import { prisma, type Tx } from '../core/prisma';
import { lockApplication, requireState, transition } from '../core/stateMachine';
import { loadTemplate, renderTemplate, selectVariant, sha256 } from '../core/templates';
import { actorOf, currentUser, requireAuth, requireRole, type AuthUser } from '../middleware/auth';
import { applicationScope } from './applications.routes';
import { computePanelConsensus } from './evaluation.routes';

/**
 * Stage 5 — Pilot agreement + Commitment Card.
 *
 * Finance drafts from the pre-cleared template (milestones, tranches, data-clause variant) → the platform renders the
 * full document and hashes it → the startup signs that hash → finance countersigns the same hash, which executes
 * the contract (SELECTED → CONTRACTED). Redrafting before execution bumps the revision and voids the startup's
 * signature, so nobody can sign one text and be bound by another.
 */
export const agreementRouter = Router();
agreementRouter.use(requireAuth);

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Text typed by users goes into markdown table cells — keep it on one line and free of column separators. */
const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();

const agreementInclude = {
  milestones: { orderBy: { sequence: 'asc' } },
  commitments: { orderBy: [{ party: 'asc' }, { dueDate: 'asc' }] },
  draftedBy: { select: { name: true } },
  startupSigner: { select: { name: true } },
  financeSigner: { select: { name: true } },
} satisfies Prisma.PilotAgreementInclude;

async function loadApplicationForAgreement(db: Tx | typeof prisma, id: string) {
  const app = await db.application.findUnique({
    where: { id },
    include: {
      startup: true,
      challenge: { include: { department: true } },
      eligibilityMemo: { select: { id: true, clausesCited: true, finalEligible: true } },
    },
  });
  if (!app) throw notFound('Application');
  return app;
}
type AppForAgreement = Awaited<ReturnType<typeof loadApplicationForAgreement>>;

const contractLimits = (app: AppForAgreement) => ({
  pilotDurationWeeks: app.challenge.pilotDurationWeeks,
  maxValueInr: Math.min(app.proposedPriceInr, app.challenge.budgetCeilingInr),
});

/** Finance officers bound to a department may only contract for that department. */
function assertFinanceOwns(user: AuthUser, app: AppForAgreement) {
  if (user.role === 'FINANCE' && user.departmentId && user.departmentId !== app.challenge.departmentId) {
    throw forbidden('This application belongs to another department');
  }
}

/** Renders the full agreement text from templates/ — this exact string is what gets hashed and signed. */
async function renderAgreement(db: Tx, app: AppForAgreement, input: AgreementDraftInput, revision: number) {
  const [agreementTpl, clausesTpl, consensus] = await Promise.all([
    loadTemplate('pilot-agreement'),
    loadTemplate('ip-data-clauses'),
    computePanelConsensus(db, app.id),
  ]);
  const start = input.pilotStartDate;
  const end = pilotEndDate(start, app.challenge.pilotDurationWeeks);
  const total = planTotal(input.milestones);
  const commitments = buildCommitmentCard(input.milestones, start, app.challenge.pilotDurationWeeks);
  const last = input.milestones.length - 1;

  const milestoneTable = [
    '| # | Milestone | Due | Tranche | Acceptance |',
    '|---|---|---|---|---|',
    ...input.milestones.map(
      (m, i) =>
        `| ${i + 1} | **${cell(m.title)}** — ${cell(m.description)} | Week ${m.dueWeek} (${fmtDate(milestoneDueDate(start, m.dueWeek))}) | ` +
        `${formatInrPlain(m.paymentTrancheInr)} | Field-site supervisor + validator sign-off${i === last ? ' + signed validator report' : ''} |`,
    ),
  ].join('\n');

  const commitmentTable = [
    '| Party | Commitment | Due |',
    '|---|---|---|',
    ...commitments.map((c) => `| ${c.party === 'DEPARTMENT' ? 'Department' : 'Startup'} | ${cell(c.description)} | ${fmtDate(c.dueDate)} |`),
  ].join('\n');

  const c = app.challenge;
  const renderedText = renderTemplate(agreementTpl.body, {
    agreementRef: `NSK/${start.getUTCFullYear()}/${app.id.slice(-8).toUpperCase()}/R${revision}`,
    templateVersion: agreementTpl.version,
    departmentName: c.department.name,
    district: c.district,
    startupName: app.startup.name,
    dpiitNumber: app.declaredDpiitNumber ?? '—',
    challengeTitle: c.title,
    gfrClauses: app.eligibilityMemo?.clausesCited.join(' and ') || '—',
    eligibilityMemoRef: app.eligibilityMemo?.id ?? '—',
    consensusScore: consensus.averageWeightedScore.toFixed(2),
    selectionThreshold: SELECTION_THRESHOLD.toFixed(1),
    fieldSite: c.fieldSite,
    pilotDurationWeeks: c.pilotDurationWeeks,
    pilotStartDate: fmtDate(start),
    pilotEndDate: fmtDate(end),
    budgetHead: c.budgetHead,
    metricName: c.metricName,
    baselineValue: c.baselineValue,
    targetValue: c.targetValue,
    metricUnit: c.metricUnit,
    minFieldAdoptionPct: c.minFieldAdoptionPct,
    totalValue: formatInrPlain(total),
    milestoneTable,
    paymentDays: PAYMENT_RELEASE_DAYS,
    finalTranchePct: Math.round((input.milestones[last].paymentTrancheInr / total) * 100),
    commitmentTable,
    dataClauses: selectVariant(clausesTpl.body, input.dataSensitivity),
  });

  return {
    renderedText,
    contentHash: sha256(renderedText),
    templateVersion: `pilot-agreement@${agreementTpl.version}+ip-data-clauses@${clausesTpl.version}`,
    totalValueInr: total,
    pilotEndDate: end,
    commitments,
  };
}

// View the agreement (or, before one exists, what finance needs to draft it)
agreementRouter.get('/:id/agreement', requireRole('FINANCE', 'DEPT_OFFICER', 'STARTUP', 'FIELD_STAFF', 'VALIDATOR', 'ADMIN'), async (req, res) => {
  const id = param(req, 'id');
  const visible = await prisma.application.count({ where: { AND: [{ id }, applicationScope(currentUser(req))] } });
  if (!visible) throw notFound('Application');

  const app = await loadApplicationForAgreement(prisma, id);
  const agreement = await prisma.pilotAgreement.findUnique({ where: { applicationId: id }, include: agreementInclude });
  const limits = contractLimits(app);

  res.json({
    agreement: agreement && { ...agreement, integrityOk: sha256(agreement.renderedText) === agreement.contentHash },
    drafting: {
      ...limits,
      proposedPriceInr: app.proposedPriceInr,
      budgetCeilingInr: app.challenge.budgetCeilingInr,
      defaultDataSensitivity: defaultDataSensitivity(app.challenge.sector),
      suggestedMilestones: suggestMilestones(limits.pilotDurationWeeks, limits.maxValueInr),
      finalTrancheMinPct: FINAL_TRANCHE_MIN_PCT,
    },
  });
});

// Finance drafts, or redrafts before execution
agreementRouter.put('/:id/agreement', requireRole('FINANCE'), async (req, res) => {
  const id = param(req, 'id');
  const input = agreementDraftSchema.parse(req.body);
  const user = currentUser(req);

  const today = new Date(new Date().toISOString().slice(0, 10));
  if (input.pilotStartDate < today) throw new HttpError(422, 'Pilot start date cannot be in the past');

  const agreement = await prisma.$transaction(async (tx) => {
    requireState(await lockApplication(tx, id), 'SELECTED', 'Drafting the pilot agreement');
    const app = await loadApplicationForAgreement(tx, id);
    assertFinanceOwns(user, app);

    const problems = validateMilestonePlan(input.milestones, contractLimits(app));
    if (problems.length) throw new HttpError(422, problems.join('. '), { milestones: problems });

    const existing = await tx.pilotAgreement.findUnique({ where: { applicationId: id } });
    const revision = (existing?.revision ?? 0) + 1;
    const doc = await renderAgreement(tx, app, input, revision);

    const data = {
      templateVersion: doc.templateVersion,
      dataSensitivity: input.dataSensitivity,
      pilotStartDate: input.pilotStartDate,
      pilotEndDate: doc.pilotEndDate,
      totalValueInr: doc.totalValueInr,
      renderedText: doc.renderedText,
      contentHash: doc.contentHash,
      revision,
      draftedById: user.id,
    };

    let agreementId: string;
    if (existing) {
      await tx.milestone.deleteMany({ where: { agreementId: existing.id } });
      await tx.commitment.deleteMany({ where: { agreementId: existing.id } });
      // A redraft voids any startup signature: they signed the old text, not this one
      await tx.pilotAgreement.update({ where: { id: existing.id }, data: { ...data, startupSignedAt: null, startupSignerId: null } });
      agreementId = existing.id;
    } else {
      agreementId = (await tx.pilotAgreement.create({ data: { ...data, applicationId: id } })).id;
    }

    const validItems = input.milestones.map((item) => ({
      ...item,
      paymentTrancheInr: item.paymentTrancheInr ?? 0, // default to 0 if undefined
    }));

    await tx.milestone.createMany({
      data: validItems.map((m, i) => ({
        agreementId,
        sequence: i + 1,
        title: m.title,
        description: m.description,
        dueDate: milestoneDueDate(input.pilotStartDate, m.dueWeek),
        paymentTrancheInr: m.paymentTrancheInr,
      })),
    });
    const milestoneIds = new Map(
      (await tx.milestone.findMany({ where: { agreementId }, select: { id: true, sequence: true } })).map((m) => [m.sequence, m.id]),
    );
    await tx.commitment.createMany({
      data: doc.commitments.map(({ milestoneSequence, ...c }) => ({
        ...c,
        agreementId,
        milestoneId: milestoneSequence ? milestoneIds.get(milestoneSequence) : null,
      })),
    });

    await appendAudit(tx, {
      entityType: 'APPLICATION',
      entityId: id,
      action: existing ? 'AGREEMENT_REVISED' : 'AGREEMENT_DRAFTED',
      actor: actorOf(req),
      payload: {
        revision,
        contentHash: doc.contentHash,
        templateVersion: doc.templateVersion,
        dataSensitivity: input.dataSensitivity,
        totalValueInr: doc.totalValueInr,
        milestones: validItems.map((m) => ({ title: m.title, dueWeek: m.dueWeek, paymentTrancheInr: m.paymentTrancheInr })),
        ...(existing?.startupSignedAt && { voidedStartupSignature: true }),
      },
    });
    return tx.pilotAgreement.findUniqueOrThrow({ where: { id: agreementId }, include: agreementInclude });
  });

  res.json(agreement);
});

// Startup signs first; finance countersigns, which executes the contract (SELECTED → CONTRACTED)
agreementRouter.post('/:id/agreement/sign', requireRole('STARTUP', 'FINANCE'), async (req, res) => {
  const id = param(req, 'id');
  const { contentHash } = signAgreementSchema.parse(req.body);
  const user = currentUser(req);
  const actor = actorOf(req);

  const visible = await prisma.application.count({ where: { AND: [{ id }, applicationScope(user)] } });
  if (!visible) throw notFound('Application');

  const result = await prisma.$transaction(async (tx) => {
    requireState(await lockApplication(tx, id), 'SELECTED', 'Signing the pilot agreement');
    const app = await loadApplicationForAgreement(tx, id);
    assertFinanceOwns(user, app);

    const agreement = await tx.pilotAgreement.findUnique({ where: { applicationId: id } });
    if (!agreement) throw new HttpError(409, 'No agreement has been drafted yet');
    if (sha256(agreement.renderedText) !== agreement.contentHash) {
      throw new HttpError(500, 'Stored agreement text does not match its hash — refusing to sign');
    }
    if (contentHash !== agreement.contentHash) {
      throw new HttpError(409, 'The agreement changed since you opened it — reload and review the new revision before signing');
    }
    const signed = { contentHash, revision: agreement.revision, templateVersion: agreement.templateVersion };

    if (user.role === 'STARTUP') {
      if (agreement.startupSignedAt) throw new HttpError(409, 'You have already signed this revision');
      await tx.pilotAgreement.update({ where: { id: agreement.id }, data: { startupSignedAt: new Date(), startupSignerId: user.id } });
      await appendAudit(tx, { entityType: 'APPLICATION', entityId: id, action: 'AGREEMENT_SIGNED_BY_STARTUP', actor, payload: signed });
      return { executed: false };
    }

    if (!agreement.startupSignedAt) throw new HttpError(409, 'The startup must sign before the finance officer countersigns');
    await tx.pilotAgreement.update({ where: { id: agreement.id }, data: { financeSignedAt: new Date(), financeSignerId: user.id } });
    await transition(tx, {
      entity: 'APPLICATION',
      id,
      to: 'CONTRACTED',
      actor,
      payload: { ...signed, totalValueInr: agreement.totalValueInr, startupSignedAt: agreement.startupSignedAt },
    });
    return { executed: true };
  });

  res.json(result);
});
