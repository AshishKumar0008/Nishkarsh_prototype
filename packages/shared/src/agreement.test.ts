import { describe, expect, it } from 'vitest';
import {
  buildCommitmentCard,
  defaultDataSensitivity,
  planTotal,
  suggestMilestones,
  validateMilestonePlan,
  type MilestonePlanItem,
} from './agreement';

const limits = { pilotDurationWeeks: 16, maxValueInr: 11_00_000 };
const m = (dueWeek: number, paymentTrancheInr: number): MilestonePlanItem => ({
  title: `M${dueWeek}`,
  description: 'Milestone description',
  dueWeek,
  paymentTrancheInr,
});

describe('suggestMilestones', () => {
  it('produces a valid 30/40/30 plan that sums exactly to the value', () => {
    const plan = suggestMilestones(16, 11_00_001);
    expect(plan.map((p) => p.dueWeek)).toEqual([4, 10, 16]);
    expect(planTotal(plan)).toBe(11_00_001);
    expect(validateMilestonePlan(plan, { pilotDurationWeeks: 16, maxValueInr: 11_00_001 })).toEqual([]);
  });

  it('falls back to a single milestone for very short pilots', () => {
    const plan = suggestMilestones(2, 5_00_000);
    expect(plan).toHaveLength(1);
    expect(validateMilestonePlan(plan, { pilotDurationWeeks: 2, maxValueInr: 5_00_000 })).toEqual([]);
  });
});

describe('validateMilestonePlan', () => {
  it('rejects a plan over the maximum contract value', () => {
    expect(validateMilestonePlan([m(8, 6_00_000), m(16, 6_00_000)], limits).join()).toMatch(/exceeds the maximum/);
  });

  it('rejects milestones out of order or outside the pilot', () => {
    const errs = validateMilestonePlan([m(10, 3_00_000), m(8, 3_00_000), m(17, 3_00_000)], limits).join('|');
    expect(errs).toMatch(/must be due after milestone 1/);
    expect(errs).toMatch(/outside the 16-week pilot/);
  });

  it('requires the final milestone at the end of the pilot', () => {
    expect(validateMilestonePlan([m(4, 5_00_000), m(12, 5_00_000)], limits).join()).toMatch(/end of the pilot \(week 16\)/);
  });

  it('requires a meaningful outcome-linked final tranche', () => {
    expect(validateMilestonePlan([m(4, 9_00_000), m(16, 1_00_000)], limits).join()).toMatch(/at least 20%/);
  });
});

describe('buildCommitmentCard', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  const card = buildCommitmentCard(suggestMilestones(16, 11_00_000), start, 16);

  it('binds the department as well as the startup', () => {
    expect(card.filter((c) => c.party === 'DEPARTMENT').length).toBeGreaterThanOrEqual(3);
    expect(card.some((c) => c.party === 'DEPARTMENT' && /Release tranche 1/.test(c.description))).toBe(true);
  });

  it('dates each payment commitment 15 days after its milestone', () => {
    const pay1 = card.find((c) => /Release tranche 1/.test(c.description))!;
    const deliver1 = card.find((c) => /Deliver milestone 1/.test(c.description))!;
    expect((pay1.dueDate.getTime() - deliver1.dueDate.getTime()) / 86_400_000).toBe(15);
  });
});

describe('defaultDataSensitivity', () => {
  it('uses the personal-data clause set for health and education', () => {
    expect(defaultDataSensitivity('HEALTH')).toBe('SENSITIVE_PII');
    expect(defaultDataSensitivity('AGRICULTURE')).toBe('STANDARD');
  });
});
