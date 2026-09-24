import { describe, expect, it } from 'vitest';
import {
  computeConsensus,
  computeWeightedScore,
  RUBRIC_CRITERIA,
  SELECTION_THRESHOLD,
} from './evaluation';
import { coiDeclarationSchema, scorecardSchema } from './schemas';

describe('Stage 4 — evaluation scoring and weighting', () => {
  it('has rubric weights summing to exactly 1.0', () => {
    const sum = RUBRIC_CRITERIA.reduce((acc, c) => acc + c.weight, 0);
    expect(Math.round(sum * 100) / 100).toBe(1.0);
  });

  it('computes weighted score accurately', () => {
    // 8*0.35 (2.8) + 7*0.25 (1.75) + 9*0.25 (2.25) + 6*0.15 (0.9) = 7.7
    const score = computeWeightedScore({
      technicalMerit: 8,
      feasibility: 7,
      fieldFit: 9,
      cost: 6,
    });
    expect(score).toBe(7.7);
  });

  it('validates schema bounds (1 to 10)', () => {
    expect(() =>
      scorecardSchema.parse({
        technicalMerit: 11,
        feasibility: 5,
        cost: 5,
        fieldFit: 5,
      }),
    ).toThrow();

    expect(() =>
      scorecardSchema.parse({
        technicalMerit: 0,
        feasibility: 5,
        cost: 5,
        fieldFit: 5,
      }),
    ).toThrow();

    const valid = scorecardSchema.parse({
      technicalMerit: 8,
      feasibility: 9,
      cost: 7,
      fieldFit: 8,
      comments: 'Excellent field viability.',
    });
    expect(valid.technicalMerit).toBe(8);
  });
});

describe('Stage 4 — COI declaration validation', () => {
  it('allows no conflict without required long details', () => {
    const valid = coiDeclarationSchema.parse({ hasConflict: false, details: '' });
    expect(valid.hasConflict).toBe(false);
  });

  it('requires details of at least 10 characters if conflict is declared', () => {
    expect(() =>
      coiDeclarationSchema.parse({ hasConflict: true, details: 'Too short' }),
    ).toThrow();

    const valid = coiDeclarationSchema.parse({
      hasConflict: true,
      details: 'Previously consulted for this startup in 2024.',
    });
    expect(valid.hasConflict).toBe(true);
  });
});

describe('Stage 4 — consensus engine and outlier check', () => {
  const coiList = [
    { evaluatorId: 'eval-1', evaluatorName: 'Dr. Meera Kulkarni', hasConflict: false, declaredAt: new Date() },
    { evaluatorId: 'eval-2', evaluatorName: 'Arjun Rao', hasConflict: false, declaredAt: new Date() },
    { evaluatorId: 'eval-3', evaluatorName: 'Ganesh More', hasConflict: true, details: 'Advisory board member', declaredAt: new Date() },
  ];

  it('excludes recused evaluators from score calculations', () => {
    const scorecards = [
      {
        evaluatorId: 'eval-1',
        evaluatorName: 'Dr. Meera Kulkarni',
        technicalMerit: 8,
        feasibility: 8,
        fieldFit: 8,
        cost: 8,
        weightedTotal: 8.0,
        submittedAt: new Date(),
      },
      {
        evaluatorId: 'eval-2',
        evaluatorName: 'Arjun Rao',
        technicalMerit: 8,
        feasibility: 8,
        fieldFit: 8,
        cost: 8,
        weightedTotal: 8.0,
        submittedAt: new Date(),
      },
      // Even if eval-3 submitted a score, their COI should exclude it
      {
        evaluatorId: 'eval-3',
        evaluatorName: 'Ganesh More',
        technicalMerit: 2,
        feasibility: 2,
        fieldFit: 2,
        cost: 2,
        weightedTotal: 2.0,
        submittedAt: new Date(),
      },
    ];

    const result = computeConsensus(scorecards, coiList, { panelSize: 3 });
    expect(result.recusedCount).toBe(1);
    expect(result.scorecardsCount).toBe(2);
    expect(result.averageWeightedScore).toBe(8.0);
    expect(result.recommendation).toBe('SELECTED');
    expect(result.passedThreshold).toBe(true);
  });

  it('recommends REJECTED when scores are below threshold', () => {
    const scorecards = [
      {
        evaluatorId: 'eval-1',
        evaluatorName: 'Dr. Meera Kulkarni',
        technicalMerit: 5,
        feasibility: 5,
        fieldFit: 6,
        cost: 5,
        weightedTotal: 5.25,
        submittedAt: new Date(),
      },
      {
        evaluatorId: 'eval-2',
        evaluatorName: 'Arjun Rao',
        technicalMerit: 6,
        feasibility: 5,
        fieldFit: 5,
        cost: 6,
        weightedTotal: 5.5,
        submittedAt: new Date(),
      },
    ];

    const result = computeConsensus(scorecards, [coiList[0], coiList[1]], { panelSize: 2 });
    expect(result.averageWeightedScore).toBeLessThan(SELECTION_THRESHOLD);
    expect(result.recommendation).toBe('REJECTED');
    expect(result.passedThreshold).toBe(false);
  });

  it('flags outlier scores with >= 3.0 point discrepancy from average for advisory review', () => {
    const scorecards = [
      {
        evaluatorId: 'eval-1',
        evaluatorName: 'Dr. Meera Kulkarni',
        technicalMerit: 9,
        feasibility: 8,
        fieldFit: 8,
        cost: 7,
        weightedTotal: 8.2,
        submittedAt: new Date(),
      },
      {
        evaluatorId: 'eval-2',
        evaluatorName: 'Arjun Rao',
        technicalMerit: 3, // Outlier: average is (9+3)/2 = 6, difference = 3.0
        feasibility: 8,
        fieldFit: 8,
        cost: 7,
        weightedTotal: 6.1,
        submittedAt: new Date(),
      },
    ];

    const result = computeConsensus(scorecards, [coiList[0], coiList[1]], { panelSize: 2 });
    expect(result.outliers.length).toBeGreaterThan(0);
    const techOutlier = result.outliers.find((o) => o.criterionKey === 'technicalMerit');
    expect(techOutlier).toBeDefined();
    expect(techOutlier?.difference).toBeGreaterThanOrEqual(3.0);
  });

  const card = (evaluatorId: string, total: number) => ({
    evaluatorId,
    evaluatorName: evaluatorId,
    technicalMerit: total,
    feasibility: total,
    fieldFit: total,
    cost: total,
    weightedTotal: total,
    submittedAt: new Date(),
  });

  it('has no quorum until every panel member has declared COI', () => {
    const result = computeConsensus([card('eval-1', 8), card('eval-2', 8)], [coiList[0], coiList[1]], { panelSize: 3 });
    expect(result.pendingDeclarations).toBe(1);
    expect(result.hasQuorum).toBe(false);
    expect(result.recommendation).toBe('PENDING');
  });

  it('has no quorum while a non-recused evaluator has not scored', () => {
    const result = computeConsensus([card('eval-1', 9)], [coiList[0], coiList[1]], { panelSize: 2 });
    expect(result.pendingScores).toBe(1);
    expect(result.hasQuorum).toBe(false);
  });

  it('never decides on a single scorecard, even if everyone else recused', () => {
    const recusedBoth = [coiList[0], { ...coiList[1], hasConflict: true }, coiList[2]];
    const result = computeConsensus([card('eval-1', 9)], recusedBoth, { panelSize: 3 });
    expect(result.pendingScores).toBe(0);
    expect(result.hasQuorum).toBe(false);
  });
});
