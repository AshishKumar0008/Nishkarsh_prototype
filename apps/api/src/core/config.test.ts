import { describe, expect, it } from 'vitest';
import { productionConfigProblems } from './config';

const good = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u@h/db', JWT_SECRET: 'x'.repeat(40) };

describe('productionConfigProblems', () => {
  it('does not apply outside production', () => {
    expect(productionConfigProblems({ NODE_ENV: 'development' })).toEqual([]);
    expect(productionConfigProblems({})).toEqual([]);
  });

  it('accepts a complete production config', () => {
    expect(productionConfigProblems(good)).toEqual([]);
  });

  it('rejects a missing database URL, a short secret and the example placeholder', () => {
    expect(productionConfigProblems({ ...good, DATABASE_URL: undefined })).toHaveLength(1);
    expect(productionConfigProblems({ ...good, JWT_SECRET: 'short' })).toHaveLength(1);
    expect(productionConfigProblems({ ...good, JWT_SECRET: 'change-me-to-a-long-random-string-0000000' })).toHaveLength(1);
  });

  it('fails closed on demo mode unless explicitly confirmed', () => {
    expect(productionConfigProblems({ ...good, DEMO_MODE: 'true' })).toHaveLength(1);
    expect(productionConfigProblems({ ...good, DEMO_MODE: 'true', ALLOW_PUBLIC_DEMO: 'true' })).toEqual([]);
  });
});
