import { describe, expect, it } from 'vitest';
import { normaliseDatabaseUrl } from './dbUrl';

describe('normaliseDatabaseUrl', () => {
  it('leaves a direct or local URL alone', () => {
    const local = 'postgresql://u:p@localhost:5432/nishkarsh';
    expect(normaliseDatabaseUrl(local)).toBe(local);
    const direct = 'postgresql://u:p@ep-cool-123.ap-southeast-1.aws.neon.tech/db?sslmode=require';
    expect(normaliseDatabaseUrl(direct)).toBe(direct);
  });

  it('marks a pooled Neon URL for PgBouncer and caps the per-instance pool', () => {
    const out = new URL(normaliseDatabaseUrl('postgresql://u:p@ep-cool-123-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require')!);
    expect(out.searchParams.get('pgbouncer')).toBe('true');
    expect(out.searchParams.get('connection_limit')).toBe('5');
    expect(out.searchParams.get('sslmode')).toBe('require');
  });

  it('respects settings already present and tolerates missing or odd input', () => {
    const out = new URL(normaliseDatabaseUrl('postgresql://u:p@h-pooler.x/db?pgbouncer=true&connection_limit=2')!);
    expect(out.searchParams.get('connection_limit')).toBe('2');
    expect(normaliseDatabaseUrl(undefined)).toBeUndefined();
    expect(normaliseDatabaseUrl('not a url')).toBe('not a url');
  });
});
