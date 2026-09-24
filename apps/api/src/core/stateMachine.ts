import { findTransition, type ActorRole, type EntityType } from '@pragati/shared';
import type { ApplicationState, ChallengeState } from '@prisma/client';
import { appendAudit } from './auditChain';
import { HttpError, notFound } from './errors';
import type { Tx } from './prisma';

export interface Actor {
  id: string | null;
  role: ActorRole;
}

export const SYSTEM_ACTOR: Actor = { id: null, role: 'SYSTEM' };

interface TransitionArgs {
  entity: EntityType;
  id: string;
  to: string;
  actor: Actor;
  payload?: Record<string, unknown>;
}

/**
 * THE only way to change a challenge's or application's state.
 *
 * 1. checks the move is in the transition table (packages/shared/src/stateMachine.ts) for this role
 * 2. updates the state, guarded against a concurrent change
 * 3. appends a hash-chained audit entry
 *
 * Always call inside prisma.$transaction so the stage record, the state change and
 * the audit entry commit together or not at all.
 */
export async function transition(tx: Tx, { entity, id, to, actor, payload }: TransitionArgs) {
  const current =
    entity === 'CHALLENGE'
      ? await tx.challenge.findUnique({ where: { id }, select: { state: true } })
      : await tx.application.findUnique({ where: { id }, select: { state: true } });
  if (!current) throw new HttpError(404, `${entity.toLowerCase()} not found`);

  const from = current.state;
  const rule = findTransition(entity, from, to, actor.role);
  if (!rule) {
    throw new HttpError(409, `Transition ${from} → ${to} is not allowed for role ${actor.role}`);
  }

  const { count } =
    entity === 'CHALLENGE'
      ? await tx.challenge.updateMany({ where: { id, state: from as ChallengeState }, data: { state: to as ChallengeState } })
      : await tx.application.updateMany({ where: { id, state: from as ApplicationState }, data: { state: to as ApplicationState } });
  if (count !== 1) throw new HttpError(409, 'State was changed by someone else — reload and try again');

  await appendAudit(tx, { entityType: entity, entityId: id, action: rule.action, actor, fromState: from, toState: to, payload });
  return { from, to, action: rule.action };
}

/**
 * Locks the application row until the transaction ends and returns its current state. Use it in any step whose
 * rules depend on the state (scoring, signing…), so a concurrent transition can't slip in between check and write.
 */
export async function lockApplication(tx: Tx, id: string): Promise<string> {
  const rows = await tx.$queryRaw<{ state: string }[]>`SELECT state::text AS state FROM "Application" WHERE id = ${id} FOR UPDATE`;
  if (!rows[0]) throw notFound('Application');
  return rows[0].state;
}

export function requireState(state: string, expected: string, what: string) {
  if (state !== expected) throw new HttpError(409, `${what} is only possible while the application is ${expected} (it is ${state})`);
}
