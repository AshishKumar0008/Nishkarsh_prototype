/**
 * Stage 5 — pilot agreement rules and the two-sided Commitment Card.
 * Pure functions: the API uses them to validate/generate, the web app to preview live.
 */

export const DATA_SENSITIVITY = ['STANDARD', 'SENSITIVE_PII'] as const;
export type DataSensitivity = (typeof DATA_SENSITIVITY)[number];

/** Sectors whose pilots default to the personal-data clause set (patients, schoolchildren). */
export const SENSITIVE_SECTORS = ['HEALTH', 'EDUCATION'];

export const defaultDataSensitivity = (sector: string): DataSensitivity =>
  SENSITIVE_SECTORS.includes(sector) ? 'SENSITIVE_PII' : 'STANDARD';

/** Department must release a tranche within this many days of dual sign-off. */
export const PAYMENT_RELEASE_DAYS = 15;
/** The final, outcome-linked tranche is held until the validator signs — it must be meaningful. */
export const FINAL_TRANCHE_MIN_PCT = 20;
export const MAX_MILESTONES = 6;

export interface MilestonePlanItem {
  title: string;
  description: string;
  /** Week of the pilot (1-based) by which the milestone is due. */
  dueWeek: number;
  paymentTrancheInr: number;
}

export interface PlanLimits {
  pilotDurationWeeks: number;
  /** Contract value may not exceed the lower of the startup's proposed price and the challenge budget ceiling. */
  maxValueInr: number;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatInrPlain = (n: number) => inr.format(n);

export const planTotal = (milestones: Pick<MilestonePlanItem, 'paymentTrancheInr'>[]) =>
  milestones.reduce((s, m) => s + m.paymentTrancheInr, 0);

/** Returns human-readable problems with a milestone plan; empty array = valid. */
export function validateMilestonePlan(milestones: MilestonePlanItem[], limits: PlanLimits): string[] {
  const errors: string[] = [];
  if (milestones.length === 0) return ['At least one milestone is required'];
  if (milestones.length > MAX_MILESTONES) errors.push(`At most ${MAX_MILESTONES} milestones`);

  milestones.forEach((m, i) => {
    if (m.dueWeek < 1 || m.dueWeek > limits.pilotDurationWeeks) {
      errors.push(`Milestone ${i + 1} is due in week ${m.dueWeek}, outside the ${limits.pilotDurationWeeks}-week pilot`);
    }
    if (i > 0 && m.dueWeek <= milestones[i - 1].dueWeek) {
      errors.push(`Milestone ${i + 1} must be due after milestone ${i}`);
    }
  });

  const last = milestones[milestones.length - 1];
  if (last.dueWeek !== limits.pilotDurationWeeks) {
    errors.push(`The final milestone must fall at the end of the pilot (week ${limits.pilotDurationWeeks}) — it is the validated-outcome milestone`);
  }

  const total = planTotal(milestones);
  if (total > limits.maxValueInr) {
    errors.push(`Total ${formatInrPlain(total)} exceeds the maximum contract value of ${formatInrPlain(limits.maxValueInr)}`);
  }
  if (total > 0 && (last.paymentTrancheInr / total) * 100 < FINAL_TRANCHE_MIN_PCT) {
    errors.push(`The final (outcome-linked) tranche must be at least ${FINAL_TRANCHE_MIN_PCT}% of the contract value`);
  }
  return errors;
}

/** A sensible starting plan the finance officer can edit: deploy → field adoption → validated outcome (30/40/30). */
export function suggestMilestones(pilotDurationWeeks: number, valueInr: number): MilestonePlanItem[] {
  if (pilotDurationWeeks < 3) {
    return [{ title: 'Validated outcome', description: 'Solution deployed and outcome verified by the independent validator.', dueWeek: pilotDurationWeeks, paymentTrancheInr: valueInr }];
  }
  const t1 = Math.round(valueInr * 0.3);
  const t2 = Math.round(valueInr * 0.4);
  return [
    {
      title: 'Deployment complete',
      description: 'Solution installed and working at the field site; field staff trained.',
      dueWeek: Math.max(1, Math.ceil(pilotDurationWeeks / 4)),
      paymentTrancheInr: t1,
    },
    {
      title: 'Field adoption',
      description: 'Solution in routine daily use by field staff at the agreed adoption level.',
      dueWeek: Math.max(2, Math.ceil(pilotDurationWeeks * 0.6)),
      paymentTrancheInr: t2,
    },
    {
      title: 'Validated outcome',
      description: 'Outcome measured against baseline and signed off by the independent validator.',
      dueWeek: pilotDurationWeeks,
      paymentTrancheInr: valueInr - t1 - t2,
    },
  ];
}

const DAY = 24 * 3600 * 1000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
export const milestoneDueDate = (pilotStart: Date, dueWeek: number) => addDays(pilotStart, dueWeek * 7);
export const pilotEndDate = (pilotStart: Date, pilotDurationWeeks: number) => addDays(pilotStart, pilotDurationWeeks * 7);

export interface CommitmentItem {
  party: 'DEPARTMENT' | 'STARTUP';
  description: string;
  dueDate: Date;
}

/**
 * The two-sided Commitment Card. Department obligations are listed first on purpose: department non-performance
 * (late payment, no site access) is the more common real-world failure and is invisible in most designs.
 * OWNER: domain lead — wording is documented in templates/commitment-card.md.
 */
export function buildCommitmentCard(milestones: MilestonePlanItem[], pilotStart: Date, pilotDurationWeeks: number): CommitmentItem[] {
  const end = pilotEndDate(pilotStart, pilotDurationWeeks);
  const dept: CommitmentItem[] = [
    { party: 'DEPARTMENT', description: 'Give the Startup access to the field site and name a field-site supervisor', dueDate: pilotStart },
    { party: 'DEPARTMENT', description: 'Designate the independent validator for this pilot', dueDate: addDays(pilotStart, 14) },
    ...milestones.map((m, i) => ({
      party: 'DEPARTMENT' as const,
      description: `Release tranche ${i + 1} (${formatInrPlain(m.paymentTrancheInr)}) within ${PAYMENT_RELEASE_DAYS} days of both sign-offs on "${m.title}"`,
      dueDate: addDays(milestoneDueDate(pilotStart, m.dueWeek), PAYMENT_RELEASE_DAYS),
    })),
  ];
  const startup: CommitmentItem[] = [
    ...milestones.map((m, i) => ({
      party: 'STARTUP' as const,
      description: `Deliver milestone ${i + 1}: ${m.title}`,
      dueDate: milestoneDueDate(pilotStart, m.dueWeek),
    })),
    { party: 'STARTUP', description: 'Respond to field-site issues within 48 hours throughout the pilot', dueDate: end },
    { party: 'STARTUP', description: 'Hand over Pilot Data in an open format (clause 7)', dueDate: addDays(end, 14) },
  ];
  return [...dept, ...startup];
}
