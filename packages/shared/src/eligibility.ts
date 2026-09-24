/**
 * Rule-citation engine (Stage 3).
 *
 * Pure function: applicant facts in → eligibility result with the exact GFR clauses invoked out.
 * The system only RECOMMENDS; the finance officer confirms or overrides (see stateMachine.ts).
 *
 * ⚠️ DRAFT — clause titles/summaries below are paraphrases pending review by the domain lead
 * against the GFR 2017 text and current DPIIT notification. Bump RULES_VERSION on every change:
 * each eligibility memo records the version it was produced under.
 */

export const RULES_VERSION = '2026.09-draft.1';

/** DPIIT startup definition thresholds (G.S.R. 127(E), 2019 — verify current notification). */
export const DPIIT_MAX_AGE_YEARS = 10;
export const DPIIT_MAX_TURNOVER_INR = 100 * 1_00_00_000; // ₹100 crore

export const GFR_CLAUSES = {
  GFR_173_i: {
    code: 'GFR 173(i)',
    title: 'Relaxation of prior turnover and prior experience for DPIIT-recognised startups',
    waives: ['Prior turnover requirement', 'Prior experience requirement'],
  },
  GFR_170_i: {
    code: 'GFR 170(i)',
    title: 'Exemption from Bid Security (EMD) for DPIIT-recognised startups',
    waives: ['Earnest Money Deposit / Bid Security'],
  },
} as const;
export type GfrClauseKey = keyof typeof GFR_CLAUSES;

export interface EligibilityInput {
  dpiitNumber: string | null;
  /** Result of the registry lookup (mocked in the MVP). */
  dpiitVerified: boolean;
  incorporationDate: Date | string;
  turnoverLatestFyInr: number;
  startupSectors: string[];
  challengeSector: string;
  /** Evaluation date; defaults to now. Pass explicitly in tests. */
  asOf?: Date;
}

export interface EligibilityCheck {
  code: 'DPIIT_RECOGNISED' | 'INCORPORATION_AGE' | 'TURNOVER_CEILING' | 'SECTOR_MATCH';
  label: string;
  passed: boolean;
  detail: string;
  /** Non-blocking checks are shown to the officer but don't decide eligibility. */
  blocking: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  clausesCited: string[];
  waived: string[];
  checks: EligibilityCheck[];
  rulesVersion: string;
  summary: string;
}

const formatCrore = (inr: number) => `₹${(inr / 1_00_00_000).toFixed(2)} crore`;

function addYears(d: Date, years: number) {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + years);
  return r;
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const asOf = input.asOf ?? new Date();
  const incorporated = new Date(input.incorporationDate);
  const ageLimit = addYears(incorporated, DPIIT_MAX_AGE_YEARS);
  const ageYears = (asOf.getTime() - incorporated.getTime()) / (365.25 * 24 * 3600 * 1000);

  const checks: EligibilityCheck[] = [
    {
      code: 'DPIIT_RECOGNISED',
      label: 'DPIIT startup recognition',
      passed: !!input.dpiitNumber && input.dpiitVerified,
      detail: !input.dpiitNumber
        ? 'No DPIIT recognition number declared.'
        : input.dpiitVerified
          ? `${input.dpiitNumber} found in DPIIT registry.`
          : `${input.dpiitNumber} NOT found in DPIIT registry.`,
      blocking: true,
    },
    {
      code: 'INCORPORATION_AGE',
      label: `Incorporated within last ${DPIIT_MAX_AGE_YEARS} years`,
      passed: asOf < ageLimit,
      detail: `Incorporated ${incorporated.toISOString().slice(0, 10)} (${ageYears.toFixed(1)} years ago).`,
      blocking: true,
    },
    {
      code: 'TURNOVER_CEILING',
      label: `Turnover not above ${formatCrore(DPIIT_MAX_TURNOVER_INR)}`,
      passed: input.turnoverLatestFyInr <= DPIIT_MAX_TURNOVER_INR,
      detail: `Self-declared latest-FY turnover: ${formatCrore(input.turnoverLatestFyInr)}.`,
      blocking: true,
    },
    {
      code: 'SECTOR_MATCH',
      label: 'Startup sector matches challenge sector',
      passed: input.startupSectors.includes(input.challengeSector),
      detail: `Challenge sector ${input.challengeSector}; startup sectors: ${input.startupSectors.join(', ') || 'none'}.`,
      blocking: false,
    },
  ];

  const failedBlocking = checks.filter((c) => c.blocking && !c.passed);
  const eligible = failedBlocking.length === 0;
  const clauses = eligible ? (['GFR_173_i', 'GFR_170_i'] as GfrClauseKey[]) : [];

  return {
    eligible,
    clausesCited: clauses.map((k) => GFR_CLAUSES[k].code),
    waived: clauses.flatMap((k) => [...GFR_CLAUSES[k].waives]),
    checks,
    rulesVersion: RULES_VERSION,
    summary: eligible
      ? `Eligible for startup relaxation under ${clauses.map((k) => GFR_CLAUSES[k].code).join(' and ')}. ` +
        `Waived: ${clauses.flatMap((k) => GFR_CLAUSES[k].waives).join('; ')}.`
      : `Not eligible for startup relaxation. Failed: ${failedBlocking.map((c) => c.label).join('; ')}.`,
  };
}
