import {
  assignValidatorSchema,
  commitmentScore,
  commitmentStanding,
  milestoneSignoffSchema,
  milestoneSubmitSchema,
  pilotRiskSchema,
  startPilotSchema,
  type CommitmentKind,
} from '@nishkarsh/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { appendAudit } from '../core/auditChain';
import { forbidden, HttpError, notFound, param } from '../core/errors';
import { prisma, type Tx } from '../core/prisma';
import { lockApplication, requireState, SYSTEM_ACTOR, transition } from '../core/stateMachine';
import { actorOf, currentUser, requireAuth, requireRole, type AuthUser } from '../middleware/auth';
import { applicationScope } from './applications.routes';

/**
 * Stage 6 — Milestone execution.
 *
 * Officer starts the pilot by naming the field-site supervisor (and the independent validator) → the startup submits
 * evidence per milestone, in order → the field supervisor AND the validator each approve or return it → when both
 * approve, the milestone completes and its tranche is released automatically (simulated; the final, outcome-linked
 * tranche waits for the Stage 7 validator report) → when every milestone is complete the pilot moves to validation.
 * The Commitment Card updates itself from these events, for the department exactly as for the startup.
 */
export const pilotRouter = Router();
pilotRouter.use(requireAuth);

const SIGNER_ROLES = ['FIELD_STAFF', 'VALIDATOR'] as const;
type SignerRole = (typeof SIGNER_ROLES)[number];

const pilotInclude = {
  challenge: { select: { departmentId: true, title: true, metricName: true } },
  startup: { select: { name: true } },
  agreement: {
    include: {
      fieldSupervisor: { select: { id: true, name: true } },
      validator: { select: { id: true, name: true } },
      milestones: {
        orderBy: { sequence: 'asc' },
        include: { signoffs: { include: { signer: { select: { name: true } } }, orderBy: { signedAt: 'asc' } } },
      },
      commitments: { orderBy: [{ party: 'asc' }, { dueDate: 'asc' }] },
    },
  },
} satisfies Prisma.ApplicationInclude;

async function loadPilot(db: Tx | typeof prisma, id: string) {
  const app = await db.application.findUnique({ where: { id }, include: pilotInclude });
  if (!app) throw notFound('Application');
  if (!app.agreement?.financeSignedAt) throw new HttpError(409, 'This application has no executed pilot agreement');
  return { ...app, agreement: app.agreement };
}
type Pilot = Awaited<ReturnType<typeof loadPilot>>;

function assertOfficerOwns(user: AuthUser, pilot: Pilot) {
  if (user.role === 'DEPT_OFFICER' && user.departmentId !== pilot.challenge.departmentId) {
    throw forbidden('This pilot belongs to another department');
  }
}

/** Only the people named on this pilot may sign its milestones or flag it. */
function assertAssigned(user: AuthUser, pilot: Pilot): SignerRole {
  const role = user.role as SignerRole;
  const assigned = role === 'FIELD_STAFF' ? pilot.agreement.fieldSupervisorId : pilot.agreement.validatorId;
  if (assigned !== user.id) throw forbidden(`You are not the ${role === 'FIELD_STAFF' ? 'field-site supervisor' : 'validator'} assigned to this pilot`);
  return role;
}

/** Field supervisors come from the pilot's own department; validators must belong to no department at all. */
async function checkAssignee(db: Tx, userId: string, role: SignerRole, departmentId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, departmentId: true } });
  if (!u || u.role !== role) throw new HttpError(422, `Selected user is not a ${role === 'FIELD_STAFF' ? 'field staff member' : 'validator'}`);
  if (role === 'FIELD_STAFF' && u.departmentId !== departmentId) throw new HttpError(422, 'The field-site supervisor must be from the pilot’s department');
  if (role === 'VALIDATOR' && u.departmentId) throw new HttpError(422, 'The validator must be independent of every department');
  return u;
}

/** Marks matching open commitments met. Returns their descriptions, for the audit payload. */
async function meetCommitments(tx: Tx, agreementId: string, kind: CommitmentKind, resolvedAt: Date, milestoneId?: string) {
  const open = await tx.commitment.findMany({
    where: { agreementId, kind, status: 'PENDING', ...(milestoneId && { milestoneId }) },
    select: { id: true, description: true, dueDate: true },
  });
  if (open.length) await tx.commitment.updateMany({ where: { id: { in: open.map((c) => c.id) } }, data: { status: 'MET', resolvedAt } });
  return open.map((c) => ({ description: c.description, dueDate: c.dueDate, onTime: resolvedAt <= c.dueDate }));
}

function findMilestone(pilot: Pilot, seqParam: string) {
  const m = pilot.agreement.milestones.find((x) => x.sequence === Number(seqParam));
  if (!m) throw notFound('Milestone');
  return m;
}

// Overview: assignments, milestones with sign-offs, and the live Commitment Card
pilotRouter.get('/:id/pilot', requireRole('DEPT_OFFICER', 'FINANCE', 'STARTUP', 'FIELD_STAFF', 'VALIDATOR', 'ADMIN'), async (req, res) => {
  const id = param(req, 'id');
  const user = currentUser(req);
  const visible = await prisma.application.count({ where: { AND: [{ id }, applicationScope(user)] } });
  if (!visible) throw notFound('Application');
  const pilot = await loadPilot(prisma, id);
  const now = new Date();

  const lastRisk = ['AT_RISK'].includes(pilot.state)
    ? await prisma.auditLog.findFirst({
        where: { entityType: 'APPLICATION', entityId: id, action: 'MILESTONE_AT_RISK' },
        orderBy: { seq: 'desc' },
        select: { payload: true, createdAt: true },
      })
    : null;

  const canAssign = user.role === 'ADMIN' || (user.role === 'DEPT_OFFICER' && user.departmentId === pilot.challenge.departmentId);
  const candidates = canAssign
    ? {
        fieldStaff: await prisma.user.findMany({ where: { role: 'FIELD_STAFF', departmentId: pilot.challenge.departmentId }, select: { id: true, name: true } }),
        validators: await prisma.user.findMany({ where: { role: 'VALIDATOR', departmentId: null }, select: { id: true, name: true } }),
      }
    : null;

  const { agreement: a } = pilot;
  res.json({
    state: pilot.state,
    pilotStartDate: a.pilotStartDate,
    pilotEndDate: a.pilotEndDate,
    pilotStartedAt: a.pilotStartedAt,
    fieldSupervisor: a.fieldSupervisor,
    validator: a.validator,
    milestones: a.milestones,
    commitments: a.commitments.map((c) => ({ ...c, standing: commitmentStanding(c, now) })),
    commitmentScore: commitmentScore(a.commitments, now),
    atRisk: lastRisk && { note: (lastRisk.payload as { note?: string }).note, since: lastRisk.createdAt },
    candidates,
  });
});

// 6a — officer starts the pilot: names the field-site supervisor (meets SITE_ACCESS) and optionally the validator
pilotRouter.post('/:id/pilot/start', requireRole('DEPT_OFFICER', 'ADMIN'), async (req, res) => {
  const id = param(req, 'id');
  const input = startPilotSchema.parse(req.body);
  const user = currentUser(req);

  await prisma.$transaction(async (tx) => {
    requireState(await lockApplication(tx, id), 'CONTRACTED', 'Starting the pilot');
    const pilot = await loadPilot(tx, id);
    assertOfficerOwns(user, pilot);
    const supervisor = await checkAssignee(tx, input.fieldSupervisorId, 'FIELD_STAFF', pilot.challenge.departmentId);
    const validator = input.validatorId ? await checkAssignee(tx, input.validatorId, 'VALIDATOR', pilot.challenge.departmentId) : null;

    const now = new Date();
    await tx.pilotAgreement.update({
      where: { id: pilot.agreement.id },
      data: { pilotStartedAt: now, fieldSupervisorId: supervisor.id, validatorId: validator?.id ?? null },
    });
    const met = [
      ...(await meetCommitments(tx, pilot.agreement.id, 'SITE_ACCESS', now)),
      ...(validator ? await meetCommitments(tx, pilot.agreement.id, 'VALIDATOR_DESIGNATION', now) : []),
    ];
    await transition(tx, {
      entity: 'APPLICATION',
      id,
      to: 'IN_PILOT',
      actor: actorOf(req),
      payload: { fieldSupervisor: supervisor.name, validator: validator?.name ?? null, commitmentsMet: met },
    });
  });
  res.json({ state: 'IN_PILOT' });
});

// 6b — officer designates the validator later (meets VALIDATOR_DESIGNATION). Fixed once set: independence.
pilotRouter.post('/:id/pilot/validator', requireRole('DEPT_OFFICER', 'ADMIN'), async (req, res) => {
  const id = param(req, 'id');
  const { validatorId } = assignValidatorSchema.parse(req.body);
  const user = currentUser(req);

  await prisma.$transaction(async (tx) => {
    const state = await lockApplication(tx, id);
    if (state !== 'IN_PILOT' && state !== 'AT_RISK') throw new HttpError(409, `A validator can only be designated during the pilot (state is ${state})`);
    const pilot = await loadPilot(tx, id);
    assertOfficerOwns(user, pilot);
    if (pilot.agreement.validatorId) throw new HttpError(409, 'A validator is already designated for this pilot and cannot be replaced here');
    const validator = await checkAssignee(tx, validatorId, 'VALIDATOR', pilot.challenge.departmentId);

    const now = new Date();
    await tx.pilotAgreement.update({ where: { id: pilot.agreement.id }, data: { validatorId: validator.id } });
    const met = await meetCommitments(tx, pilot.agreement.id, 'VALIDATOR_DESIGNATION', now);
    await appendAudit(tx, { entityType: 'APPLICATION', entityId: id, action: 'VALIDATOR_DESIGNATED', actor: actorOf(req), payload: { validator: validator.name, commitmentsMet: met } });
  });
  res.json({ ok: true });
});

// 6c — startup submits evidence for the next milestone (strictly in order)
pilotRouter.post('/:id/milestones/:seq/submit', requireRole('STARTUP'), async (req, res) => {
  const id = param(req, 'id');
  const input = milestoneSubmitSchema.parse(req.body);
  const user = currentUser(req);
  const visible = await prisma.application.count({ where: { AND: [{ id }, applicationScope(user)] } });
  if (!visible) throw notFound('Application');

  await prisma.$transaction(async (tx) => {
    const state = await lockApplication(tx, id);
    if (state !== 'IN_PILOT' && state !== 'AT_RISK') throw new HttpError(409, `Milestones can only be submitted during the pilot (state is ${state})`);
    const pilot = await loadPilot(tx, id);
    const m = findMilestone(pilot, param(req, 'seq'));
    if (m.status !== 'PENDING') throw new HttpError(409, `Milestone ${m.sequence} is already ${m.status.toLowerCase()}`);
    const previous = pilot.agreement.milestones.find((x) => x.sequence === m.sequence - 1);
    if (previous && previous.status !== 'COMPLETE') throw new HttpError(409, `Milestone ${previous.sequence} must be complete first`);

    await tx.milestone.update({
      where: { id: m.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), evidenceSummary: input.evidenceSummary, evidenceUrl: input.evidenceUrl ?? null, returnNote: null },
    });
    await appendAudit(tx, {
      entityType: 'APPLICATION',
      entityId: id,
      action: 'MILESTONE_SUBMITTED',
      actor: actorOf(req),
      payload: { sequence: m.sequence, title: m.title, evidenceSummary: input.evidenceSummary, evidenceUrl: input.evidenceUrl ?? null, resubmission: !!m.returnNote },
    });
  });
  res.json({ status: 'SUBMITTED' });
});

// 6d — field supervisor / validator approve or return a submitted milestone. Both approvals → complete + payment.
pilotRouter.post('/:id/milestones/:seq/signoff', requireRole(...SIGNER_ROLES), async (req, res) => {
  const id = param(req, 'id');
  const { decision, note } = milestoneSignoffSchema.parse(req.body);
  const user = currentUser(req);
  const actor = actorOf(req);

  const result = await prisma.$transaction(async (tx) => {
    const state = await lockApplication(tx, id);
    if (state === 'AT_RISK') throw new HttpError(409, 'Sign-offs are paused while the pilot is flagged at risk — resolve it first');
    requireState(state, 'IN_PILOT', 'Signing off a milestone');
    const pilot = await loadPilot(tx, id);
    const role = assertAssigned(user, pilot);
    const m = findMilestone(pilot, param(req, 'seq'));
    if (m.status !== 'SUBMITTED') throw new HttpError(409, `Milestone ${m.sequence} is not awaiting sign-off (it is ${m.status.toLowerCase()})`);
    if (m.signoffs.some((s) => s.signerRole === role)) throw new HttpError(409, 'You have already approved this submission');

    if (decision === 'RETURN') {
      // The other party's approval was of evidence that is now being reworked — it no longer stands
      await tx.milestoneSignoff.deleteMany({ where: { milestoneId: m.id } });
      await tx.milestone.update({ where: { id: m.id }, data: { status: 'PENDING', returnNote: note } });
      await appendAudit(tx, {
        entityType: 'APPLICATION',
        entityId: id,
        action: 'MILESTONE_RETURNED',
        actor,
        payload: { sequence: m.sequence, note, voidedApprovals: m.signoffs.map((s) => s.signerRole) },
      });
      return { status: 'PENDING' as const };
    }

    await tx.milestoneSignoff.create({ data: { milestoneId: m.id, signerId: user.id, signerRole: role, note: note || null } });
    await appendAudit(tx, { entityType: 'APPLICATION', entityId: id, action: 'MILESTONE_APPROVED', actor, payload: { sequence: m.sequence, role, note: note || null } });

    const approvedBy = new Set([...m.signoffs.map((s) => s.signerRole), role]);
    if (!SIGNER_ROLES.every((r) => approvedBy.has(r))) return { status: 'SUBMITTED' as const };

    // Both signed → complete. Delivery counts from when the accepted evidence was submitted, not from sign-off lag.
    const now = new Date();
    const isFinal = m.sequence === Math.max(...pilot.agreement.milestones.map((x) => x.sequence));
    await tx.milestone.update({ where: { id: m.id }, data: { status: 'COMPLETE', completedAt: now, ...(!isFinal && { paymentReleasedAt: now }) } });
    const delivered = await meetCommitments(tx, pilot.agreement.id, 'MILESTONE_DELIVERY', m.submittedAt ?? now, m.id);
    const paid = isFinal ? [] : await meetCommitments(tx, pilot.agreement.id, 'TRANCHE_PAYMENT', now, m.id);

    await appendAudit(tx, {
      entityType: 'APPLICATION',
      entityId: id,
      action: isFinal ? 'FINAL_MILESTONE_COMPLETE_TRANCHE_HELD' : 'PAYMENT_RELEASED',
      actor: SYSTEM_ACTOR,
      payload: {
        sequence: m.sequence,
        amountInr: m.paymentTrancheInr,
        simulated: true,
        ...(isFinal && { heldUntil: 'Stage 7 independent validator report (clause 5.3)' }),
        commitmentsMet: [...delivered, ...paid],
      },
    });

    const allComplete = pilot.agreement.milestones.every((x) => x.id === m.id || x.status === 'COMPLETE');
    if (allComplete) {
      await transition(tx, {
        entity: 'APPLICATION',
        id,
        to: 'UNDER_VALIDATION',
        actor: SYSTEM_ACTOR,
        payload: { milestonesComplete: pilot.agreement.milestones.length, finalTrancheHeldInr: isFinal ? m.paymentTrancheInr : null },
      });
    }
    return { status: 'COMPLETE' as const, paymentReleased: !isFinal, pilotComplete: allComplete };
  });
  res.json(result);
});

// 6e — the field supervisor (never the startup) flags the pilot at risk, and resolves it after corrective action
for (const [path, to, label] of [
  ['at-risk', 'AT_RISK', 'Flagging the pilot at risk'],
  ['resolve-risk', 'IN_PILOT', 'Resolving the risk flag'],
] as const) {
  pilotRouter.post(`/:id/pilot/${path}`, requireRole('FIELD_STAFF'), async (req, res) => {
    const id = param(req, 'id');
    const { note } = pilotRiskSchema.parse(req.body);
    const user = currentUser(req);
    await prisma.$transaction(async (tx) => {
      requireState(await lockApplication(tx, id), to === 'AT_RISK' ? 'IN_PILOT' : 'AT_RISK', label);
      assertAssigned(user, await loadPilot(tx, id));
      await transition(tx, { entity: 'APPLICATION', id, to, actor: actorOf(req), payload: { note } });
    });
    res.json({ state: to });
  });
}

/** Worklist for field supervisors and validators: their pilots and what is waiting on them. */
export const pilotWorklistRouter = Router();
pilotWorklistRouter.use(requireAuth);

pilotWorklistRouter.get('/worklist', requireRole(...SIGNER_ROLES), async (req, res) => {
  const user = currentUser(req);
  const role = user.role as SignerRole;
  const apps = await prisma.application.findMany({
    where: applicationScope(user),
    orderBy: { updatedAt: 'desc' },
    include: {
      startup: { select: { name: true } },
      challenge: { select: { title: true, fieldSite: true, department: { select: { name: true } } } },
      agreement: {
        select: {
          pilotEndDate: true,
          milestones: {
            orderBy: { sequence: 'asc' },
            select: { sequence: true, title: true, status: true, dueDate: true, signoffs: { select: { signerRole: true } } },
          },
        },
      },
    },
  });
  res.json(
    apps.map(({ agreement, ...a }) => ({
      ...a,
      pilotEndDate: agreement?.pilotEndDate,
      milestones: agreement?.milestones ?? [],
      awaitingMe: (agreement?.milestones ?? []).filter((m) => m.status === 'SUBMITTED' && !m.signoffs.some((s) => s.signerRole === role)).length,
    })),
  );
});
