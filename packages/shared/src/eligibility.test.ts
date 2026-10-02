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

  it('applies the 2026 ₹200 crore turnover ceiling', () => {
    expect(evaluateEligibility({ ...base, turnoverLatestFyInr: 150 * 1_00_00_000 }).eligible).toBe(true);
    const r = evaluateEligibility({ ...base, turnoverLatestFyInr: 201 * 1_00_00_000 });
    expect(r.eligible).toBe(false);
    expect(r.checks.find((c) => c.code === 'TURNOVER_CEILING')?.label).toBe('Turnover not above ₹200.00 crore');
  });

  it('gives deep-tech startups 20 years and a ₹300 crore ceiling', () => {
    const old = { ...base, incorporationDate: '2010-01-01', turnoverLatestFyInr: 250 * 1_00_00_000 };
    expect(evaluateEligibility(old).eligible).toBe(false);
    expect(evaluateEligibility({ ...old, deepTech: true }).eligible).toBe(true);
    expect(evaluateEligibility({ ...old, deepTech: true, turnoverLatestFyInr: 301 * 1_00_00_000 }).eligible).toBe(false);
  });

  it('treats sector mismatch as advisory, not blocking', () => {
    const r = evaluateEligibility({ ...base, startupSectors: ['HEALTH'] });
    expect(r.eligible).toBe(true);
    expect(r.checks.find((c) => c.code === 'SECTOR_MATCH')?.passed).toBe(false);
  });
});
