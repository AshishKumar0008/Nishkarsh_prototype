import { createHash } from 'node:crypto';
import type { ActorRole, EntityType } from '@nishkarsh/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Tx } from './prisma';

/**
 * Append-only, hash-chained audit log.
 *
 * Every entry stores the previous entry's hash, and its own hash covers that plus its contents.
 * Editing or deleting any past row breaks every hash after it — verifyChain() detects this.
 */

export const GENESIS_HASH = '0'.repeat(64);
/** Arbitrary constant; serialises appends so two concurrent writers can't fork the chain. */
const AUDIT_LOCK_KEY = 26136;

export interface AuditEntryInput {
  entityType: EntityType;
  entityId: string;
  action: string;
  actor: { id: string | null; role: ActorRole };
  fromState?: string | null;
  toState?: string | null;
  payload?: Record<string, unknown>;
}

/** Deterministic JSON: object keys sorted at every level, so jsonb key reordering can't change the hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

interface HashableEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorRole: string;
  fromState: string | null;
  toState: string | null;
  payload: unknown;
  createdAt: string;
}

export function computeHash(prevHash: string, entry: HashableEntry): string {
  return createHash('sha256').update(prevHash).update(canonicalJson(entry)).digest('hex');
}

export async function appendAudit(tx: Tx, input: AuditEntryInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
  const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS_HASH;

  const createdAt = new Date();
  // Round-trip through JSON so what we hash is exactly what Postgres stores (Dates → strings, undefined dropped)
  const payload = JSON.parse(JSON.stringify(input.payload ?? {}));
  const entry: HashableEntry = {
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    fromState: input.fromState ?? null,
    toState: input.toState ?? null,
    payload,
    createdAt: createdAt.toISOString(),
  };

  return tx.auditLog.create({
    data: {
      ...entry,
      payload: payload as Prisma.InputJsonValue,
      createdAt,
      prevHash,
      hash: computeHash(prevHash, entry),
    },
  });
}

export interface ChainVerification {
  valid: boolean;
  entriesChecked: number;
  headHash: string;
  firstBrokenSeq?: number;
  reason?: string;
}

export async function verifyChain(db: PrismaClient | Tx): Promise<ChainVerification> {
  const rows = await db.auditLog.findMany({ orderBy: { seq: 'asc' } });
  let prevHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== prevHash) {
      return { valid: false, entriesChecked: rows.length, headHash: prevHash, firstBrokenSeq: row.seq, reason: 'prevHash link broken (row deleted or reordered)' };
    }
    const expected = computeHash(prevHash, {
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      actorId: row.actorId,
      actorRole: row.actorRole,
      fromState: row.fromState,
      toState: row.toState,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    });
    if (expected !== row.hash) {
      return { valid: false, entriesChecked: rows.length, headHash: prevHash, firstBrokenSeq: row.seq, reason: 'content hash mismatch (row edited)' };
    }
    prevHash = row.hash;
  }
  return { valid: true, entriesChecked: rows.length, headHash: prevHash };
}
