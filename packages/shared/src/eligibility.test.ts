import { describe, expect, it } from 'vitest';
import { evaluateEligibility } from './eligibility';

const asOf = new Date('2026-09-24');
const base = {
  dpiitNumber: 'DIPP145872',
  dpiitVerified: true,
  incorporationDate: '2021-03-15',
  turnoverLatestFyInr: 1_20_00_000,
  startupSectors: ['AGRICULTURE'],
  challengeSector: 'AGRICULTURE',
  asOf,
};

describe('evaluateEligibility', () => {
  it('cites GFR 173(i) and 170(i) for an eligible startup', () => {
    const r = evaluateEligibility(base);
    expect(r.eligible).toBe(true);
    expect(r.clausesCited).toEqual(['GFR 173(i)', 'GFR 170(i)']);
    expect(r.waived).toContain('Earnest Money Deposit / Bid Security');
  });

  it('fails a startup incorporated more than 10 years ago', () => {
    const r = evaluateEligibility({ ...base, incorporationDate: '2014-06-01' });
    expect(r.eligible).toBe(false);
    expect(r.clausesCited).toEqual([]);
    expect(r.checks.find((c) => c.code === 'INCORPORATION_AGE')?.passed).toBe(false);
  });

  it('fails when DPIIT number is not in the registry', () => {
    const r = evaluateEligibility({ ...base, dpiitVerified: false });
    expect(r.eligible).toBe(false);
  });

  it('fails above the ₹100 crore turnover ceiling', () => {
    const r = evaluateEligibility({ ...base, turnoverLatestFyInr: 101 * 1_00_00_000 });
    expect(r.eligible).toBe(false);
  });

  it('treats sector mismatch as advisory, not blocking', () => {
    const r = evaluateEligibility({ ...base, startupSectors: ['HEALTH'] });
    expect(r.eligible).toBe(true);
    expect(r.checks.find((c) => c.code === 'SECTOR_MATCH')?.passed).toBe(false);
  });
});
