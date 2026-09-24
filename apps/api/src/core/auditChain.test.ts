import { describe, expect, it } from 'vitest';
import { canonicalJson, computeHash, GENESIS_HASH } from './auditChain';

const entry = {
  entityType: 'APPLICATION',
  entityId: 'app1',
  action: 'ELIGIBILITY_CONFIRMED',
  actorId: 'u1',
  actorRole: 'FINANCE',
  fromState: 'ELIGIBILITY_PENDING',
  toState: 'ELIGIBLE',
  payload: { b: 1, a: { d: [1, 2], c: 'x' } },
  createdAt: '2026-09-24T10:00:00.000Z',
};

describe('canonicalJson', () => {
  it('is independent of key order (jsonb reorders keys)', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('computeHash', () => {
  it('is deterministic', () => {
    expect(computeHash(GENESIS_HASH, entry)).toBe(computeHash(GENESIS_HASH, { ...entry }));
  });

  it('changes if any field is tampered with', () => {
    const original = computeHash(GENESIS_HASH, entry);
    expect(computeHash(GENESIS_HASH, { ...entry, toState: 'INELIGIBLE' })).not.toBe(original);
    expect(computeHash(GENESIS_HASH, { ...entry, payload: { ...entry.payload, b: 2 } })).not.toBe(original);
  });

  it('chains: a different previous hash gives a different hash', () => {
    expect(computeHash('f'.repeat(64), entry)).not.toBe(computeHash(GENESIS_HASH, entry));
  });
});
