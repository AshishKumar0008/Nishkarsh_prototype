import { APPLICATION_STAGE } from '@nishkarsh/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import AgreementSection from '../components/AgreementSection';
import AuditTrail from '../components/AuditTrail';
import PilotSection from '../components/PilotSection';
import EvaluationSection from '../components/EvaluationSection';
import { ErrorBox } from '../components/Field';
import StageTimeline from '../components/StageTimeline';
import StateBadge from '../components/StateBadge';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime, formatInr } from '../lib/format';
import type { ApplicationDetail as Detail, EligibilityMemo } from '../lib/types';

export default function ApplicationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: a, error, isLoading } = useQuery({ queryKey: ['application', id], queryFn: () => api<Detail>(`/applications/${id}`) });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (!a) return <ErrorBox error={error} />;

  // Same roles the evaluation API allows: startups, field staff and validators never see the panel's scorecards
  const showEvaluation =
    ['DEPT_OFFICER', 'FINANCE', 'EVALUATOR', 'ADMIN'].includes(user?.role ?? '') && (a.state === 'ELIGIBLE' || APPLICATION_STAGE[a.state] >= 4);
  const canManagePanel = user?.role === 'ADMIN' || (user?.role === 'DEPT_OFFICER' && user.departmentId === a.challenge.departmentId);
  const showAgreement = user?.role !== 'EVALUATOR' && (a.state === 'SELECTED' || APPLICATION_STAGE[a.state] >= 6);
  const showPilot = user?.role !== 'EVALUATOR' && APPLICATION_STAGE[a.state] >= 6;
  const canContract = user?.role === 'FINANCE' && (!user.departmentId || user.departmentId === a.challenge.departmentId);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={a.state} />
          <span className="text-xs text-slate-500">Submitted {formatDate(a.createdAt)}</span>
        </div>
        <h1 className="h1 mt-2">{a.startup.name}</h1>
        <p className="muted">
          Applying to <Link className="text-indigo-700 hover:underline" to={`/challenges/${a.challenge.id}`}>{a.challenge.title}</Link> ·{' '}
          {a.challenge.department.name}
        </p>
      </div>

      <StageTimeline state={a.state} />

      {a.eligibilityMemo && <EligibilityMemoCard applicationId={a.id} memo={a.eligibilityMemo} state={a.state} />}

      {showEvaluation && <EvaluationSection applicationId={a.id} state={a.state} canManage={canManagePanel} />}

      {showAgreement && <AgreementSection applicationId={a.id} state={a.state} canContract={canContract} />}

      {showPilot && <PilotSection applicationId={a.id} state={a.state} canManage={canManagePanel} />}

      <section className="card">
        <h2 className="h2 mb-3">Proposal</h2>
        <dl className="space-y-3 text-sm">
          {(
            [
              ['Solution', a.solutionSummary],
              ['Approach', a.approach],
              ['Pilot plan', a.pilotPlan],
              ['Team', a.teamSummary],
              ['Prior evidence', a.priorEvidence],
            ] as const
          ).map(([k, v]) =>
            v ? (
              <div key={k}>
                <dt className="font-medium text-slate-500">{k}</dt>
                <dd className="whitespace-pre-line">{v}</dd>
              </div>
            ) : null,
          )}
          <div>
            <dt className="font-medium text-slate-500">Proposed price</dt>
            <dd>{formatInr(a.proposedPriceInr)} (ceiling {formatInr(a.challenge.budgetCeilingInr)})</dd>
          </div>
        </dl>
      </section>

      <AuditTrail entityType="APPLICATION" entityId={a.id} />
    </div>
  );
}

function EligibilityMemoCard({ applicationId, memo, state }: { applicationId: string; memo: EligibilityMemo; state: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [overriding, setOverriding] = useState(false);

  const decide = useMutation({
    mutationFn: (decision: 'CONFIRM' | 'OVERRIDE') => api(`/applications/${applicationId}/eligibility`, { body: { decision, note } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['application', applicationId] });
      qc.invalidateQueries({ queryKey: ['audit', 'APPLICATION', applicationId] });
      qc.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const canDecide = user?.role === 'FINANCE' && state === 'ELIGIBILITY_PENDING';

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="h2">Eligibility memo</h2>
          <p className="text-xs text-slate-500">Auto-generated {formatDateTime(memo.createdAt)} · rules version {memo.rulesVersion}</p>
        </div>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Clause text: draft, pending legal review</span>
      </div>

      <div className={`mt-4 rounded-md p-4 ${memo.autoEligible ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
        <p className="font-semibold">System recommendation: {memo.autoEligible ? 'Eligible' : 'Not eligible'}</p>
        <p className="mt-1 text-sm">{memo.summary}</p>
        {memo.clausesCited.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {memo.clausesCited.map((c) => (
              <span key={c} className="rounded border border-emerald-300 bg-white px-2 py-0.5 font-mono text-xs">{c}</span>
            ))}
          </div>
        )}
      </div>

      <table className="mt-4 w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {memo.checks.map((c) => (
            <tr key={c.code}>
              <td className="w-8 py-2 text-center">{c.passed ? '✅' : c.blocking ? '❌' : '⚠️'}</td>
              <td className="py-2 pr-3 font-medium">
                {c.label}
                {!c.blocking && <span className="ml-1 text-xs font-normal text-slate-500">(advisory)</span>}
              </td>
              <td className="py-2 text-slate-600">{c.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {memo.decision !== 'PENDING' ? (
        <div className="mt-4 rounded-md border border-slate-200 p-4 text-sm">
          <p>
            <strong>{memo.decision === 'CONFIRMED' ? 'Confirmed' : 'Overridden'}</strong> by {memo.decidedBy?.name} on{' '}
            {memo.decidedAt && formatDateTime(memo.decidedAt)} — final: <strong>{memo.finalEligible ? 'Eligible' : 'Not eligible'}</strong>
          </p>
          {memo.officerNote && <p className="mt-1 text-slate-600">“{memo.officerNote}”</p>}
        </div>
      ) : canDecide ? (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <ErrorBox error={decide.error} />
          <textarea
            className="input min-h-20"
            placeholder={overriding ? 'Reason for override (required, min 20 characters — recorded permanently)' : 'Note (optional)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={decide.isPending} onClick={() => decide.mutate('CONFIRM')}>
              Confirm memo ({memo.autoEligible ? 'eligible' : 'not eligible'})
            </button>
            {overriding ? (
              <button className="btn-danger" disabled={decide.isPending} onClick={() => decide.mutate('OVERRIDE')}>
                Override → mark {memo.autoEligible ? 'not eligible' : 'eligible'}
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => setOverriding(true)}>Override…</button>
            )}
          </div>
        </div>
      ) : (
        <p className="muted mt-4">Awaiting confirmation by the procurement / finance officer.</p>
      )}
    </section>
  );
}
