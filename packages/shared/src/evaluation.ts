export interface RubricCriterion {
  key: 'technicalMerit' | 'feasibility' | 'cost' | 'fieldFit';
  label: string;
  weight: number; // e.g. 0.35 = 35%
  description: string;
  guidance: { min: string; mid: string; max: string };
}

export const RUBRIC_CRITERIA: RubricCriterion[] = [
  {
    key: 'technicalMerit',
    label: 'Technical Merit & Architecture',
    weight: 0.35,
    description: 'Soundness of technical approach, solution maturity, IP ownership defensibility and scalability.',
    guidance: {
      min: '1-3: Unproven concept, questionable IP ownership, generic or fragile architecture.',
      mid: '4-7: Functional architecture, clear technical approach, demonstrable prototype/MVP.',
      max: '8-10: Production-grade architecture, deep domain technology, clear IP defensibility.',
    },
  },
  {
    key: 'feasibility',
    label: 'Deployment Feasibility & Timeline',
    weight: 0.25,
    description: 'Viability of deploying the pilot within the challenge timeline and site constraints.',
    guidance: {
      min: '1-3: Unrealistic delivery schedule, dependencies unaddressed, unclear milestones.',
      mid: '4-7: Realistic timeline, dependencies identified, credible team and execution capacity.',
      max: '8-10: Thoroughly de-risked delivery schedule, agile milestone breakdown, proven team track record.',
    },
  },
  {
    key: 'fieldFit',
    label: 'Field Fit & User Adoption',
    weight: 0.25,
    description: 'Contextual fit for local field conditions (e.g. Marathi advisories, connectivity, field staff workload).',
    guidance: {
      min: '1-3: Poor contextual adaptation, high friction for field staff / farmers, connectivity barriers ignored.',
      mid: '4-7: Local language support, workable field workflows, manageable training requirement.',
      max: '8-10: Exceptional field alignment, intuitive for grass-roots workers, robust in offline/low-resource conditions.',
    },
  },
  {
    key: 'cost',
    label: 'Cost Realism & Value for Money',
    weight: 0.15,
    description: 'Price reasonableness relative to budget ceiling, transparency of cost breakdown, cost-effectiveness.',
    guidance: {
      min: '1-3: Inflated pricing near ceiling without justification, or unrealistically low (underbidding risk).',
      mid: '4-7: Transparent cost structure, fair value for money, realistic itemisation.',
      max: '8-10: Highly competitive unit economics, clear return on public investment, transparent margins.',
    },
  },
];

export interface RubricScores {
  technicalMerit: number;
  feasibility: number;
  cost: number;
  fieldFit: number;
}

/** Computes weighted score on a 1-10 scale, rounded to 2 decimal places. Weights come from RUBRIC_CRITERIA only. */
export function computeWeightedScore(scores: RubricScores): number {
  const sum = RUBRIC_CRITERIA.reduce((acc, c) => acc + scores[c.key] * c.weight, 0);
  return Math.round(sum * 100) / 100;
}

export const SELECTION_THRESHOLD = 7.0; // Minimum weighted average out of 10 to qualify for selection
/** A decision needs at least this many non-recused scorecards, however many evaluators recuse. */
export const MIN_ACTIVE_SCORECARDS = 2;

export interface EvaluatorScorecardSummary {
  evaluatorId: string;
  evaluatorName: string;
  technicalMerit: number;
  feasibility: number;
  cost: number;
  fieldFit: number;
  weightedTotal: number;
  comments?: string | null;
  submittedAt: string | Date;
}

export interface EvaluatorCOISummary {
  evaluatorId: string;
  evaluatorName: string;
  hasConflict: boolean;
  details?: string | null;
  declaredAt: string | Date;
}

export interface OutlierWarning {
  evaluatorId: string;
  evaluatorName: string;
  criterionKey: keyof RubricScores;
  criterionLabel: string;
  score: number;
  criterionAverage: number;
  difference: number;
}

export interface ConsensusResult {
  totalEvaluators: number;
  recusedCount: number;
  scorecardsCount: number;
  eligibleEvaluatorsCount: number;
  /** Every panel member has declared COI, every non-recused member has scored, and ≥ MIN_ACTIVE_SCORECARDS scored. */
  hasQuorum: boolean;
  panelSize: number;
  pendingDeclarations: number;
  pendingScores: number;
  averageWeightedScore: number;
  criterionAverages: RubricScores;
  outliers: OutlierWarning[];
  recommendation: 'SELECTED' | 'REJECTED' | 'PENDING';
  threshold: number;
  passedThreshold: boolean;
}

/**
 * Computes panel consensus, identifying outliers for human advisory review.
 */
export function computeConsensus(
  scorecards: EvaluatorScorecardSummary[],
  coiDeclarations: EvaluatorCOISummary[],
  { panelSize, threshold = SELECTION_THRESHOLD }: { panelSize: number; threshold?: number },
): ConsensusResult {
  const recusedEvaluatorIds = new Set(
    coiDeclarations.filter((c) => c.hasConflict).map((c) => c.evaluatorId),
  );

  // Filter out any scorecard from a recused evaluator
  const activeScorecards = scorecards.filter((s) => !recusedEvaluatorIds.has(s.evaluatorId));

  const totalEvaluators = coiDeclarations.length;
  const recusedCount = recusedEvaluatorIds.size;
  const scorecardsCount = activeScorecards.length;
  const eligibleEvaluatorsCount = Math.max(0, panelSize - recusedCount);
  const pendingDeclarations = Math.max(0, panelSize - totalEvaluators);
  const pendingScores = Math.max(0, eligibleEvaluatorsCount - scorecardsCount);
  const quorumFields = { panelSize, pendingDeclarations, pendingScores };

  if (activeScorecards.length === 0) {
    return {
      totalEvaluators,
      recusedCount,
      scorecardsCount: 0,
      eligibleEvaluatorsCount,
      ...quorumFields,
      hasQuorum: false,
      averageWeightedScore: 0,
      criterionAverages: { technicalMerit: 0, feasibility: 0, cost: 0, fieldFit: 0 },
      outliers: [],
      recommendation: 'PENDING',
      threshold,
      passedThreshold: false,
    };
  }

  // Calculate criterion averages
  const totals = activeScorecards.reduce(
    (acc, s) => {
      acc.technicalMerit += s.technicalMerit;
      acc.feasibility += s.feasibility;
      acc.cost += s.cost;
      acc.fieldFit += s.fieldFit;
      acc.weightedTotal += s.weightedTotal;
      return acc;
    },
    { technicalMerit: 0, feasibility: 0, cost: 0, fieldFit: 0, weightedTotal: 0 },
  );

  const n = activeScorecards.length;
  const criterionAverages: RubricScores = {
    technicalMerit: Math.round((totals.technicalMerit / n) * 10) / 10,
    feasibility: Math.round((totals.feasibility / n) * 10) / 10,
    cost: Math.round((totals.cost / n) * 10) / 10,
    fieldFit: Math.round((totals.fieldFit / n) * 10) / 10,
  };

  const averageWeightedScore = Math.round((totals.weightedTotal / n) * 100) / 100;

  // Identify outlier scores (deviation >= 3.0 points from criterion average)
  const outliers: OutlierWarning[] = [];
  for (const s of activeScorecards) {
    for (const c of RUBRIC_CRITERIA) {
      const score = s[c.key];
      const avg = criterionAverages[c.key];
      const diff = Math.round(Math.abs(score - avg) * 10) / 10;
      if (diff >= 3.0) {
        outliers.push({
          evaluatorId: s.evaluatorId,
          evaluatorName: s.evaluatorName,
          criterionKey: c.key,
          criterionLabel: c.label,
          score,
          criterionAverage: avg,
          difference: diff,
        });
      }
    }
  }

  const hasQuorum = pendingDeclarations === 0 && pendingScores === 0 && scorecardsCount >= MIN_ACTIVE_SCORECARDS;
  const passedThreshold = averageWeightedScore >= threshold;

  let recommendation: 'SELECTED' | 'REJECTED' | 'PENDING' = 'PENDING';
  if (hasQuorum) {
    recommendation = passedThreshold ? 'SELECTED' : 'REJECTED';
  }

  return {
    totalEvaluators,
    recusedCount,
    scorecardsCount,
    eligibleEvaluatorsCount,
    ...quorumFields,
    hasQuorum,
    averageWeightedScore,
    criterionAverages,
    outliers,
    recommendation,
    threshold,
    passedThreshold,
  };
}
