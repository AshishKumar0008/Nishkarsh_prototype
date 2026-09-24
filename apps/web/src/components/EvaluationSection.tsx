import {
  computeWeightedScore,
  RUBRIC_CRITERIA,
  SELECTION_THRESHOLD,
  type ApplicationState,
} from '@pragati/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import type { EvaluationOverview } from '../lib/types';
import { ErrorBox } from './Field';

interface Props {
  applicationId: string;
  state: ApplicationState;
  /** Officer of the owning department, or admin — may open and finalise the panel. */
  canManage: boolean;
}

export default function EvaluationSection({ applicationId, state, canManage }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['evaluation', applicationId],
    queryFn: () => api<EvaluationOverview>(`/applications/${applicationId}/evaluation`),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['evaluation', applicationId] });
    qc.invalidateQueries({ queryKey: ['application', applicationId] });
    qc.invalidateQueries({ queryKey: ['audit', 'APPLICATION', applicationId] });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  const openEvaluation = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/open-evaluation`, { method: 'POST' }),
    onSuccess: invalidateAll,
  });

  const finalizeConsensus = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/finalize-evaluation`, { method: 'POST' }),
    onSuccess: invalidateAll,
  });

  if (isLoading) {
    return (
      <section className="card">
        <h2 className="h2 mb-2">Stage 4 — Expert Evaluation</h2>
        <p className="muted">Loading panel evaluations…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="card">
        <h2 className="h2 mb-2">Stage 4 — Expert Evaluation</h2>
        <ErrorBox error={error} />
      </section>
    );
  }

  const { panel, coiDeclarations, scorecards, consensus, sealed, myCoi, myScorecard } = data;
  const isEvaluator = user?.role === 'EVALUATOR';
  const canOpen = canManage && state === 'ELIGIBLE';
  const canFinalize = canManage && state === 'UNDER_EVALUATION' && !!consensus?.hasQuorum;

  return (
    <section className="card space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="h2">Stage 4 — Expert Evaluation</h2>
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              Panel Review & Scoring
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Independent evaluation against a fixed 4-part weighted rubric: Technical Merit (35%), Feasibility (25%), Field Fit (25%), Cost (15%). Selection threshold: {SELECTION_THRESHOLD.toFixed(1)}/10.
          </p>
        </div>

        {/* State Banner / Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {canOpen && (
            <button
              className="btn-primary"
              disabled={openEvaluation.isPending}
              onClick={() => openEvaluation.mutate()}
            >
              {openEvaluation.isPending ? 'Opening…' : 'Open Evaluation Panel →'}
            </button>
          )}

          {canFinalize && (
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              disabled={finalizeConsensus.isPending}
              onClick={() => finalizeConsensus.mutate()}
            >
              {finalizeConsensus.isPending ? 'Finalizing…' : 'Finalize Consensus & Select →'}
            </button>
          )}
        </div>
      </div>

      {openEvaluation.error && <ErrorBox error={openEvaluation.error} />}
      {finalizeConsensus.error && <ErrorBox error={finalizeConsensus.error} />}

      {/* Eligible notice if panel not opened yet */}
      {state === 'ELIGIBLE' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          <p className="font-semibold">Application Cleared Eligibility Screen</p>
          <p className="mt-1 text-xs text-amber-800">
            The procurement/finance officer confirmed GFR eligibility. The department officer can now open the evaluation panel to start COI declarations and technical scoring.
          </p>
        </div>
      )}

      {/* Officer: what the panel still owes before finalisation is possible */}
      {canManage && state === 'UNDER_EVALUATION' && consensus && !consensus.hasQuorum && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Waiting on the panel: <strong>{consensus.pendingDeclarations}</strong> COI declaration(s) and{' '}
          <strong>{consensus.pendingScores}</strong> scorecard(s) outstanding. Finalisation needs every panel member to act
          and at least 2 non-recused scorecards.
        </div>
      )}

      {/* Evaluator Interactive Form (COI & Rubric) — only once the officer has opened the panel */}
      {isEvaluator && (state === 'UNDER_EVALUATION' || myCoi) && (
        <EvaluatorForm
          applicationId={applicationId}
          myCoi={myCoi}
          myScorecard={myScorecard}
          onSuccess={invalidateAll}
          isActive={state === 'UNDER_EVALUATION'}
        />
      )}

      {sealed && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
          🔒 Other evaluators' scores are sealed until you submit your own scorecard — so every score is independent.
        </div>
      )}

      {/* Panel Consensus & Scorecard Summary */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Panel Composition & Scorecards</h3>
          <div className="flex items-center gap-3 text-xs">
            {consensus && (
              <span className="text-slate-500">
                Scored: <strong className="text-slate-800">{consensus.scorecardsCount} / {consensus.eligibleEvaluatorsCount}</strong> non-recused panel members
              </span>
            )}
            {consensus && consensus.recusedCount > 0 && (
              <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-700 font-medium">
                {consensus.recusedCount} recused (COI)
              </span>
            )}
          </div>
        </div>

        {/* Outlier Warnings (Advisory Check) */}
        {consensus && consensus.outliers.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <span>⚠️ Rubric Consistency Advisory</span>
              <span className="font-normal text-amber-800">(flagged for human review — divergence ≥ 3.0 pts)</span>
            </div>
            {consensus.outliers.map((o, idx) => (
              <p key={idx} className="text-amber-800">
                • <strong>{o.evaluatorName}</strong> scored <em>{o.criterionLabel}</em> at <strong>{o.score}/10</strong> (panel average: {o.criterionAverage.toFixed(1)}, divergence: {o.difference.toFixed(1)}).
              </p>
            ))}
          </div>
        )}

        {/* Scorecard Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Evaluator</th>
                <th className="py-2.5 px-3">COI Status</th>
                <th className="py-2.5 px-3 text-center">Tech (35%)</th>
                <th className="py-2.5 px-3 text-center">Feas (25%)</th>
                <th className="py-2.5 px-3 text-center">Fit (25%)</th>
                <th className="py-2.5 px-3 text-center">Cost (15%)</th>
                <th className="py-2.5 px-3 text-right">Weighted Total</th>
                <th className="py-2.5 px-3">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {panel.map((evaluator) => {
                const coi = coiDeclarations.find((c) => c.evaluatorId === evaluator.id);
                const score = scorecards.find((s) => s.evaluatorId === evaluator.id);
                return (
                  <tr key={evaluator.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {evaluator.name}
                      {evaluator.id === user?.id && (
                        <span className="ml-1.5 rounded bg-indigo-100 px-1 py-0.5 text-[10px] text-indigo-800 font-semibold">
                          You
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {coi ? (
                        coi.hasConflict ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800" title={coi.details || ''}>
                            🚫 Recused (Conflict)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                            ✓ No Conflict
                          </span>
                        )
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          Pending Declaration
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      {score ? `${score.technicalMerit}/10` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      {score ? `${score.feasibility}/10` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      {score ? `${score.fieldFit}/10` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      {score ? `${score.cost}/10` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {score ? (
                        <span className="font-mono font-bold text-slate-900">
                          {score.weightedTotal.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 max-w-xs truncate text-slate-600" title={score?.comments || ''}>
                      {score?.comments || (coi?.hasConflict ? `Recused: ${coi.details}` : '—')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Panel Consensus Row */}
            {consensus && consensus.scorecardsCount > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium">
                <tr>
                  <td colSpan={2} className="py-2.5 px-3 text-slate-800">
                    Panel Consensus Average (n={consensus.scorecardsCount})
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                    {consensus.criterionAverages.technicalMerit.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                    {consensus.criterionAverages.feasibility.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                    {consensus.criterionAverages.fieldFit.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                    {consensus.criterionAverages.cost.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-base text-indigo-700">
                    {consensus.averageWeightedScore.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    {consensus.passedThreshold ? (
                      <span className="font-semibold text-emerald-700">✓ Qualifies (≥ {SELECTION_THRESHOLD.toFixed(1)})</span>
                    ) : (
                      <span className="font-semibold text-rose-700">✗ Below Threshold (&lt; {SELECTION_THRESHOLD.toFixed(1)})</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}

interface EvaluatorFormProps {
  applicationId: string;
  myCoi: { hasConflict: boolean; details: string | null } | null;
  myScorecard: {
    technicalMerit: number;
    feasibility: number;
    cost: number;
    fieldFit: number;
    comments: string | null;
    weightedTotal: number;
  } | null;
  onSuccess: () => void;
  isActive: boolean;
}

function EvaluatorForm({
  applicationId,
  myCoi,
  myScorecard,
  onSuccess,
  isActive,
}: EvaluatorFormProps) {
  // COI State
  const [hasConflict, setHasConflict] = useState<boolean>(myCoi?.hasConflict ?? false);
  const [coiDetails, setCoiDetails] = useState<string>(myCoi?.details ?? '');

  // Rubric Scores State
  const [scores, setScores] = useState({
    technicalMerit: myScorecard?.technicalMerit ?? 8,
    feasibility: myScorecard?.feasibility ?? 8,
    fieldFit: myScorecard?.fieldFit ?? 8,
    cost: myScorecard?.cost ?? 7,
  });
  const [comments, setComments] = useState(myScorecard?.comments ?? '');

  const liveWeightedScore = computeWeightedScore(scores);

  const coiMutation = useMutation({
    mutationFn: () =>
      api(`/applications/${applicationId}/coi`, {
        body: { hasConflict, details: coiDetails },
      }),
    onSuccess,
  });

  const scoreMutation = useMutation({
    mutationFn: () =>
      api(`/applications/${applicationId}/score`, {
        body: {
          technicalMerit: scores.technicalMerit,
          feasibility: scores.feasibility,
          cost: scores.cost,
          fieldFit: scores.fieldFit,
          comments: comments || undefined,
        },
      }),
    onSuccess,
  });

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white p-5 space-y-6">
      <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
        <div>
          <h3 className="font-bold text-slate-900">Evaluator Scoring Deck</h3>
          <p className="text-xs text-slate-600">
            Recorded in the immutable hash-chained audit log with your digital credentials.
          </p>
        </div>
        {myScorecard && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Scorecard on File: {myScorecard.weightedTotal.toFixed(2)}/10
          </span>
        )}
      </div>

      {/* Part 1: Conflict of Interest Declaration */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Step 1 · Conflict of Interest (COI) Declaration
          </h4>
          {myCoi && <span className="text-[11px] text-slate-500">Signed — declarations are final</span>}
        </div>

        {myCoi ? (
          <div
            className={`rounded-lg p-3 text-xs ${
              myCoi.hasConflict
                ? 'border border-rose-300 bg-rose-50 text-rose-900'
                : 'border border-emerald-300 bg-emerald-50 text-emerald-900'
            }`}
          >
            {myCoi.hasConflict ? (
              <div>
                <p className="font-semibold">⚠️ Conflict of Interest Declared (Recused)</p>
                <p className="mt-1">“{myCoi.details}”</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  You are recused from scoring this proposal in accordance with public procurement integrity regulations.
                </p>
              </div>
            ) : (
              <p className="font-semibold">
                ✓ No Conflict of Interest declared. You are cleared to evaluate and score this proposal.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs space-y-3">
            <p className="text-slate-600">
              This declaration is final once signed. Before scoring, declare whether you or your immediate family/firm have any commercial, financial, or personal interest in this applicant or competing candidates:
            </p>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="coi"
                  className="mt-0.5"
                  checked={!hasConflict}
                  onChange={() => setHasConflict(false)}
                />
                <div>
                  <span className="font-medium text-slate-800">
                    I declare that I have NO conflict of interest
                  </span>
                  <p className="text-slate-500">I can assess this proposal impartially and independently.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="coi"
                  className="mt-0.5"
                  checked={hasConflict}
                  onChange={() => setHasConflict(true)}
                />
                <div>
                  <span className="font-medium text-slate-800">
                    I have a potential or actual conflict of interest
                  </span>
                  <p className="text-slate-500">I will be recused from scoring this proposal.</p>
                </div>
              </label>
            </div>

            {hasConflict && (
              <div className="space-y-1 pt-1">
                <label className="font-medium text-slate-700">
                  Describe nature of conflict (required, min 10 characters):
                </label>
                <textarea
                  className="input text-xs min-h-16"
                  placeholder="e.g. Prior co-founder, advisory board member, or commercial relationship…"
                  value={coiDetails}
                  onChange={(e) => setCoiDetails(e.target.value)}
                />
              </div>
            )}

            {coiMutation.error && <ErrorBox error={coiMutation.error} />}

            <div className="pt-2 flex justify-end">
              <button
                className="btn-primary text-xs py-1.5 px-4"
                disabled={!isActive || coiMutation.isPending || (hasConflict && coiDetails.trim().length < 10)}
                onClick={() => coiMutation.mutate()}
              >
                {coiMutation.isPending ? 'Recording…' : 'Sign & Record COI Declaration'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Part 2: 4-Part Rubric Scoring (Unlocked if no conflict) */}
      {myCoi && !myCoi.hasConflict && (
        <div className="space-y-4 pt-2 border-t border-indigo-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Step 2 · 4-Part Weighted Scoring Rubric
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Live Calculated Score:</span>
              <span
                className={`rounded-lg px-2.5 py-1 font-mono font-bold text-sm ${
                  liveWeightedScore >= SELECTION_THRESHOLD
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {liveWeightedScore.toFixed(2)} / 10.0
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RUBRIC_CRITERIA.map((criterion) => {
              const val = scores[criterion.key];
              return (
                <div key={criterion.key} className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-xs text-slate-900">{criterion.label}</span>
                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {Math.round(criterion.weight * 100)}% weight
                      </span>
                    </div>
                    <span className="font-mono font-bold text-sm text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {val}/10
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500">{criterion.description}</p>

                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    className="w-full accent-indigo-600"
                    value={val}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [criterion.key]: parseInt(e.target.value, 10),
                      }))
                    }
                  />

                  <div className="text-[10px] text-slate-400 italic">
                    {val <= 3
                      ? criterion.guidance.min
                      : val <= 7
                        ? criterion.guidance.mid
                        : criterion.guidance.max}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Qualitative Comments */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Evaluator Comments & Technical Notes (Optional):
            </label>
            <textarea
              className="input text-xs min-h-20"
              placeholder="Detail technical merits, field risks, sensor durability, or recommended milestone conditions…"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>

          {scoreMutation.error && <ErrorBox error={scoreMutation.error} />}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-500">
              {myScorecard ? 'Update existing scorecard' : 'Submit initial scorecard'}
            </div>
            <button
              className="btn-primary text-xs py-2 px-5"
              disabled={scoreMutation.isPending || !isActive}
              onClick={() => scoreMutation.mutate()}
            >
              {scoreMutation.isPending
                ? 'Submitting Scorecard…'
                : myScorecard
                  ? 'Update Scorecard'
                  : 'Submit Scorecard (Signed & Audited)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
