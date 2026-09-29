import { getProblemTag } from '@pragati/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import AuditTrail from '../components/AuditTrail';
import { ErrorBox } from '../components/Field';
import StateBadge from '../components/StateBadge';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatInr } from '../lib/format';
import type { ChallengeDetail as Detail } from '../lib/types';

export default function ChallengeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: c, error, isLoading } = useQuery({ queryKey: ['challenge', id], queryFn: () => api<Detail>(`/challenges/${id}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['challenge', id] });
    qc.invalidateQueries({ queryKey: ['audit', 'CHALLENGE', id] });
    qc.invalidateQueries({ queryKey: ['challenges'] });
  };
  const publish = useMutation({ mutationFn: () => api(`/challenges/${id}/publish`, { method: 'POST' }), onSuccess: refresh });
  const close = useMutation({ mutationFn: () => api(`/challenges/${id}/close`, { body: {} }), onSuccess: refresh });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (!c) return <ErrorBox error={error} />;

  const isOwner = user?.role === 'DEPT_OFFICER' && user.departmentId === c.departmentId;
  const myApplication = user?.role === 'STARTUP' ? c.applications[0] : undefined;
  const improvementPct = Math.abs(((c.targetValue - c.baselineValue) / c.baselineValue) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={c.state} />
            <span className="text-xs text-slate-500">{getProblemTag(c.problemTag)?.label}</span>
            {c.aiAssisted && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800" title="Wording drafted with the AI assistant, reviewed and signed by the officer">
                ✦ AI-assisted draft · officer reviewed
              </span>
            )}
          </div>
          <h1 className="h1 mt-2">{c.title}</h1>
          <p className="muted">{c.department.name} · authored by {c.createdBy.name}</p>
        </div>
        <div className="flex gap-2">
          {isOwner && c.state === 'DRAFT' && (
            <button className="btn-primary" onClick={() => publish.mutate()} disabled={publish.isPending}>
              {publish.isPending ? 'Publishing…' : 'Sign & publish'}
            </button>
          )}
          {isOwner && c.state === 'PUBLISHED' && (
            <button className="btn-secondary" onClick={() => confirm('Close this challenge to new applications?') && close.mutate()}>
              Close challenge
            </button>
          )}
          {user?.role === 'STARTUP' && c.state === 'PUBLISHED' && !myApplication && (
            <Link className="btn-primary" to={`/challenges/${c.id}/apply`}>Apply to this challenge</Link>
          )}
          {myApplication && <Link className="btn-secondary" to={`/applications/${myApplication.id}`}>View my application</Link>}
        </div>
      </div>
      <ErrorBox error={publish.error ?? close.error} />

      {c.state === 'NO_ELIGIBLE_BIDS' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Innovation gap flagged.</strong> No eligible startup applied — this may be a problem with no market-ready
          solution yet. Suggested routes: AIM ARISE / Atal New India Challenges, or the MSInS Innovation &amp; Technological
          Development Fund.
        </div>
      )}

      {c.clusterMatches.length > 0 && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          <strong>{c.clusterMatches.length} other district{c.clusterMatches.length > 1 ? 's have' : ' has'} an open challenge for the same problem.</strong>{' '}
          A combined challenge would give startups a larger, more attractive contract.
          <ul className="mt-2 list-disc pl-5">
            {c.clusterMatches.map((m) => (
              <li key={m.id}>
                <Link className="underline" to={`/challenges/${m.id}`}>{m.title}</Link> — {m.department.name} ({formatInr(m.budgetCeilingInr)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="h2 mb-2">Problem</h2>
          <p className="whitespace-pre-line text-slate-700">{c.problemStatement}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Field site</dt><dd>{c.fieldSite}</dd></div>
            <div><dt className="text-slate-500">District</dt><dd>{c.district}</dd></div>
            <div><dt className="text-slate-500">Budget head</dt><dd>{c.budgetHead}</dd></div>
            <div><dt className="text-slate-500">Sector</dt><dd>{c.sector}</dd></div>
          </dl>
        </section>
        <section className="card">
          <h2 className="h2 mb-3">Success thresholds</h2>
          <p className="text-sm text-slate-500">{c.metricName}</p>
          <p className="mt-1 text-lg font-semibold">
            {c.baselineValue} → {c.targetValue} <span className="text-sm font-normal text-slate-500">{c.metricUnit}</span>
          </p>
          <p className="text-sm text-slate-600">{improvementPct.toFixed(1)}% improvement required</p>
          <p className="mt-3 text-sm">Field adoption ≥ <strong>{c.minFieldAdoptionPct}%</strong></p>
          <hr className="my-4 border-slate-100" />
          <p className="text-sm">Budget ceiling: <strong>{formatInr(c.budgetCeilingInr)}</strong></p>
          <p className="text-sm">Pilot: <strong>{c.pilotDurationWeeks} weeks</strong></p>
          <p className="text-sm">Apply by: <strong>{formatDate(c.applicationDeadline)}</strong></p>
        </section>
      </div>

      {c.aiDraft?.fieldReview && (
        <section className="card text-sm">
          <h2 className="h2 mb-1">AI drafting record</h2>
          <p className="muted mb-3">
            {c.aiDraft.provider === 'offline-rules' ? 'Offline keyword rules' : c.aiDraft.model} · {c.aiDraft.promptVersion} ·{' '}
            {formatDate(c.aiDraft.createdAt)}. Sealed into the audit chain when the challenge was saved.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(c.aiDraft.fieldReview).map(([field, verdict]) => (
              <span
                key={field}
                className={`rounded-full px-2 py-0.5 text-xs ${verdict === 'ACCEPTED' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}
              >
                {field}: {verdict === 'ACCEPTED' ? 'kept as suggested' : 'changed by officer'}
              </span>
            ))}
          </div>
          {c.aiDraft.warnings.length > 0 && (
            <p className="mt-2 text-amber-800">Numbers flagged as not in the officer's notes: {c.aiDraft.warnings.join(', ')}</p>
          )}
          <p className="mt-2 text-slate-500">Baseline, target, adoption %, budget and deadline were entered by the officer.</p>
        </section>
      )}

      {user?.role !== 'STARTUP' && (
        <section className="card overflow-x-auto">
          <h2 className="h2 mb-3">Applications ({c.applications.length})</h2>
          {c.applications.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {c.applications.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5"><Link className="font-medium text-indigo-700 hover:underline" to={`/applications/${a.id}`}>{a.startup.name}</Link></td>
                    <td>{a.startup.district}</td>
                    <td>{formatInr(a.proposedPriceInr)}</td>
                    <td><StateBadge state={a.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <AuditTrail entityType="CHALLENGE" entityId={c.id} />
    </div>
  );
}
