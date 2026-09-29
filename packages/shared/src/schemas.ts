import { z } from 'zod';
import { ROLES } from './enums';
import { DATA_SENSITIVITY, MAX_MILESTONES } from './agreement';
import { PROBLEM_TAG_CODES } from './problemTags';

/**
 * API contract, shared by the API (request validation) and the web app (form validation).
 * Change a field here and both sides see it.
 */

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const demoLoginSchema = z.object({
  role: z.enum(ROLES),
  email: z.string().email().optional(),
});

/** Stage 1 — outcome-based problem statement template. */
export const createChallengeSchema = z
  .object({
    title: z.string().trim().min(8).max(160),
    problemStatement: z.string().trim().min(50, 'Describe the operational problem in at least 50 characters'),
    problemTag: z.enum(PROBLEM_TAG_CODES),
    district: z.string().trim().min(2),
    fieldSite: z.string().trim().min(2),
    budgetHead: z.string().trim().min(2),
    metricName: z.string().trim().min(3),
    metricUnit: z.string().trim().min(1),
    baselineValue: z.coerce.number(),
    targetValue: z.coerce.number(),
    minFieldAdoptionPct: z.coerce.number().int().min(0).max(100),
    budgetCeilingInr: z.coerce.number().int().positive(),
    pilotDurationWeeks: z.coerce.number().int().min(1).max(52),
    applicationDeadline: z.coerce.date(),
    aiAssisted: z.boolean().default(false),
  })
  .refine((c) => c.targetValue !== c.baselineValue, {
    message: 'Target must differ from baseline — a challenge needs a measurable outcome',
    path: ['targetValue'],
  });
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;

/** Stage 2 — structured proposal. */
export const applySchema = z.object({
  solutionSummary: z.string().trim().min(30),
  approach: z.string().trim().min(30),
  pilotPlan: z.string().trim().min(30),
  teamSummary: z.string().trim().min(10),
  priorEvidence: z.string().trim().optional(),
  proposedPriceInr: z.coerce.number().int().positive(),
  declaredTurnoverInr: z.coerce.number().int().min(0),
  selfDeclarationAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the self-declaration' }),
  }),
});
export type ApplyInput = z.infer<typeof applySchema>;

/** Stage 3 — finance officer confirms or overrides the auto-generated memo. */
export const eligibilityDecisionSchema = z
  .object({
    decision: z.enum(['CONFIRM', 'OVERRIDE']),
    note: z.string().trim().default(''),
  })
  .refine((d) => d.decision === 'CONFIRM' || d.note.length >= 20, {
    message: 'An override needs a written reason of at least 20 characters (it goes into the audit record)',
    path: ['note'],
  });
export type EligibilityDecisionInput = z.infer<typeof eligibilityDecisionSchema>;

/** Stage 4 — Evaluator conflict of interest declaration. */
export const coiDeclarationSchema = z
  .object({
    hasConflict: z.boolean(),
    details: z.string().trim().default(''),
  })
  .refine((d) => !d.hasConflict || d.details.length >= 10, {
    message: 'If declaring a conflict of interest, please provide details (minimum 10 characters)',
    path: ['details'],
  });
export type COIDeclarationInput = z.infer<typeof coiDeclarationSchema>;

/** Stage 4 — Evaluator rubric scorecard. */
export const scorecardSchema = z.object({
  technicalMerit: z.coerce.number().int().min(1, 'Score must be at least 1').max(10, 'Score cannot exceed 10'),
  feasibility: z.coerce.number().int().min(1, 'Score must be at least 1').max(10, 'Score cannot exceed 10'),
  cost: z.coerce.number().int().min(1, 'Score must be at least 1').max(10, 'Score cannot exceed 10'),
  fieldFit: z.coerce.number().int().min(1, 'Score must be at least 1').max(10, 'Score cannot exceed 10'),
  comments: z.string().trim().max(1500).optional(),
});
export type ScorecardInput = z.infer<typeof scorecardSchema>;


/** Stage 5 — one milestone in the pilot agreement. Plan-level rules live in validateMilestonePlan(). */
export const milestonePlanItemSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(600),
  dueWeek: z.coerce.number().int().min(1),
  paymentTrancheInr: z.coerce.number().int().positive(),
});

/** Stage 5 — finance officer drafts (or revises) the agreement. */
export const agreementDraftSchema = z.object({
  pilotStartDate: z.coerce.date(),
  dataSensitivity: z.enum(DATA_SENSITIVITY),
  milestones: z.array(milestonePlanItemSchema).min(1).max(MAX_MILESTONES),
});
export type AgreementDraftInput = z.infer<typeof agreementDraftSchema>;

/** Stage 5 — a signature is over a specific document: the signer sends back the hash they were shown. */
export const signAgreementSchema = z.object({
  contentHash: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid document hash'),
});

/** Stage 6 — officer starts the pilot by naming who signs off in the field (and optionally the validator). */
export const startPilotSchema = z.object({
  fieldSupervisorId: z.string().min(1),
  validatorId: z.string().min(1).optional(),
});

export const assignValidatorSchema = z.object({ validatorId: z.string().min(1) });

/** Only http(s) links — a bare url() check also accepts javascript: URLs, which would be clickable in the UI. */
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Link must start with http:// or https://');

/** Stage 6 — startup submits evidence that a milestone is done. */
export const milestoneSubmitSchema = z.object({
  evidenceSummary: z.string().trim().min(20, 'Describe what was delivered in at least 20 characters').max(2000),
  evidenceUrl: httpUrl.optional().or(z.literal('').transform(() => undefined)),
});

/** Stage 6 — field supervisor / validator approve a submitted milestone or send it back. */
export const milestoneSignoffSchema = z
  .object({
    decision: z.enum(['APPROVE', 'RETURN']),
    note: z.string().trim().max(1000).default(''),
  })
  .refine((d) => d.decision === 'APPROVE' || d.note.length >= 10, {
    message: 'Say what needs fixing (at least 10 characters) — the startup sees this',
    path: ['note'],
  });

/** Stage 6 — field supervisor flags the pilot at risk, or resolves it after corrective action. */
export const pilotRiskSchema = z.object({
  note: z.string().trim().min(15, 'Explain in at least 15 characters').max(1000),
});
