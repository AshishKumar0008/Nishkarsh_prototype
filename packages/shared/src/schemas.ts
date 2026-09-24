import { z } from 'zod';
import { ROLES } from './enums';
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
