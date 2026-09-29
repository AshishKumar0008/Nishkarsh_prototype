import { z } from 'zod';
import { PROBLEM_TAG_CODES, type ProblemTagCode } from './problemTags';

/**
 * Stage 1 AI drafting assistant — the contract.
 *
 * AI drafts, the officer decides. The assistant may only suggest the *wording* fields below.
 * It never suggests baseline, target, adoption %, budget, duration or deadline: those become the
 * contract's pass/fail thresholds (agreement clause 4) and must come from the department's own records.
 * Nothing AI-generated calls transition() — the officer still saves the draft and signs to publish.
 */

/** Bump whenever the system prompt or output schema changes — recorded on every draft for provenance. */
export const AI_PROMPT_VERSION = 'challenge-draft/v1';

export const AI_DRAFT_FIELDS = ['title', 'problemStatement', 'problemTag', 'fieldSite', 'metricName', 'metricUnit'] as const;
export type AiDraftField = (typeof AI_DRAFT_FIELDS)[number];

/** Fields the assistant is never allowed to fill. Shown in the UI so the officer knows why they stay blank. */
export const HUMAN_ONLY_FIELDS = [
  'baselineValue',
  'targetValue',
  'minFieldAdoptionPct',
  'budgetCeilingInr',
  'pilotDurationWeeks',
  'applicationDeadline',
] as const;

export const aiDraftRequestSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(40, 'Write at least a few sentences about the problem (40+ characters)')
    .max(4000, 'Keep notes under 4000 characters'),
});
export type AiDraftRequest = z.infer<typeof aiDraftRequestSchema>;

/** What the model must return. `.strict()` rejects any extra key — e.g. a smuggled baselineValue. */
export const aiChallengeDraftSchema = z
  .object({
    title: z.string().trim().min(8).max(160),
    problemStatement: z.string().trim().min(50).max(2000),
    problemTag: z.enum(PROBLEM_TAG_CODES),
    fieldSite: z.string().trim().max(160).default(''),
    metricName: z.string().trim().min(3).max(120),
    metricUnit: z.string().trim().min(1).max(30),
    clarifyingQuestions: z.array(z.string().trim().min(5).max(300)).max(5).default([]),
  })
  .strict();
export type AiChallengeDraft = z.infer<typeof aiChallengeDraftSchema>;

// ─── Deterministic guardrails (no AI involved) ──────────────────────────────

const REDACTORS: { kind: string; pattern: RegExp; replacement: string }[] = [
  { kind: 'EMAIL', pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '[email]' },
  { kind: 'AADHAAR', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[aadhaar]' },
  { kind: 'PHONE', pattern: /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/g, replacement: '[phone]' },
];

/**
 * Strip obvious personal identifiers before notes leave the server for an external model (DPDP Act).
 * Best-effort pattern matching — the UI also tells officers not to paste beneficiary data.
 */
export function redactPersonalData(text: string): { text: string; redactions: Record<string, number> } {
  const redactions: Record<string, number> = {};
  let out = text;
  for (const r of REDACTORS) {
    out = out.replace(r.pattern, () => {
      redactions[r.kind] = (redactions[r.kind] ?? 0) + 1;
      return r.replacement;
    });
  }
  return { text: out, redactions };
}

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
const normaliseNumber = (n: string) => n.replace(/,/g, '').replace(/\.0+$/, '');

/**
 * Numbers that appear in the AI draft but not in the officer's own notes — likely invented.
 * Surfaced as warnings; the officer must check each one before saving.
 */
export function findUnsupportedNumbers(notes: string, draft: Pick<AiChallengeDraft, AiDraftField>): string[] {
  const known = new Set((notes.match(NUMBER_RE) ?? []).map(normaliseNumber));
  const found = new Set<string>();
  for (const field of AI_DRAFT_FIELDS) {
    if (field === 'problemTag') continue;
    for (const n of String(draft[field] ?? '').match(NUMBER_RE) ?? []) {
      if (!known.has(normaliseNumber(n))) found.add(n);
    }
  }
  return [...found];
}

export type FieldReview = Record<AiDraftField, 'ACCEPTED' | 'CHANGED'>;

/** Per field: did the officer keep the AI suggestion verbatim, or change it? Recorded in the audit trail. */
export function reviewDraftAgainstFinal(draft: Pick<AiChallengeDraft, AiDraftField>, final: Record<AiDraftField, string>): FieldReview {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
  return Object.fromEntries(
    AI_DRAFT_FIELDS.map((f) => [f, norm(String(draft[f] ?? '')) === norm(String(final[f] ?? '')) ? 'ACCEPTED' : 'CHANGED']),
  ) as FieldReview;
}

// ─── Offline fallback (no API key): keyword rules, clearly labelled as such ──

const TAG_KEYWORDS: Record<ProblemTagCode, string[]> = {
  SOIL_HEALTH: ['soil', 'moisture', 'nutrient', 'fertili'],
  IRRIGATION_MONITORING: ['irrigation', 'canal', 'drip', 'sprinkler'],
  CROP_ADVISORY: ['crop', 'pest', 'advisory', 'disease', 'yield'],
  GROUNDWATER_MONITORING: ['groundwater', 'borewell', 'water table', 'aquifer', 'well'],
  WATER_QUALITY: ['drinking water', 'water quality', 'contamina', 'fluoride', 'iron', 'arsenic', 'tds'],
  WASTE_SEGREGATION: ['waste', 'garbage', 'segregat', 'landfill', 'collection'],
  GRIEVANCE_TRACKING: ['grievance', 'complaint', 'citizen'],
  PHC_INVENTORY: ['phc', 'medicine', 'stock', 'inventory', 'health centre', 'health center'],
  SCHOOL_ATTENDANCE: ['school', 'attendance', 'student', 'teacher', 'learning'],
  ROAD_ASSET_MONITORING: ['road', 'bridge', 'pothole', 'culvert'],
};

/** Metric *names and units* only — never values. */
const TAG_METRICS: Record<ProblemTagCode, { metricName: string; metricUnit: string }> = {
  SOIL_HEALTH: { metricName: 'Irrigation water used per hectare per season', metricUnit: 'm³/ha' },
  IRRIGATION_MONITORING: { metricName: 'Share of command area receiving scheduled water', metricUnit: '%' },
  CROP_ADVISORY: { metricName: 'Crop area lost to pest or disease', metricUnit: '% of sown area' },
  GROUNDWATER_MONITORING: { metricName: 'Monitoring wells reporting on schedule', metricUnit: '% of wells' },
  WATER_QUALITY: { metricName: 'Sources tested within the required interval', metricUnit: '% of sources' },
  WASTE_SEGREGATION: { metricName: 'Households segregating waste at source', metricUnit: '% of households' },
  GRIEVANCE_TRACKING: { metricName: 'Median grievance resolution time', metricUnit: 'days' },
  PHC_INVENTORY: { metricName: 'Essential-medicine stock-out days per PHC per month', metricUnit: 'days' },
  SCHOOL_ATTENDANCE: { metricName: 'Average daily student attendance', metricUnit: '%' },
  ROAD_ASSET_MONITORING: { metricName: 'Reported defects repaired within SLA', metricUnit: '%' },
};

export function suggestProblemTag(notes: string): ProblemTagCode {
  const text = notes.toLowerCase();
  let best: ProblemTagCode = PROBLEM_TAG_CODES[0];
  let bestScore = 0;
  for (const code of PROBLEM_TAG_CODES) {
    const score = TAG_KEYWORDS[code].reduce((s, kw) => s + (text.split(kw).length - 1), 0);
    if (score > bestScore) [best, bestScore] = [code, score];
  }
  return best;
}

export function offlineChallengeDraft(notes: string): AiChallengeDraft {
  const clean = notes.trim().replace(/\s+/g, ' ');
  const tag = suggestProblemTag(clean);
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '');
  const title = firstSentence.length > 100 ? `${firstSentence.slice(0, 97).trimEnd()}…` : firstSentence;
  const site = clean.match(/\b([A-Z][a-z]+ (?:taluka|block|tehsil|village|ward))\b/)?.[1] ?? '';
  return aiChallengeDraftSchema.parse({
    title: title.length >= 8 ? title : `Operational challenge: ${title}`,
    problemStatement: clean.length >= 50 ? clean : `${clean} (expand: who is affected and why it matters)`,
    problemTag: tag,
    fieldSite: site,
    ...TAG_METRICS[tag],
    clarifyingQuestions: [
      'What is today’s measured baseline for this metric, and which record is it taken from?',
      'Which villages / facilities will host the pilot, and how many?',
      'Which frontline staff role will use the solution day to day?',
    ],
  });
}
