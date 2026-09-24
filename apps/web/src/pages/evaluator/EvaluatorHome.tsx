import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import StateBadge from '../../components/StateBadge';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatInr } from '../../lib/format';
import type { ApplicationListItem } from '../../lib/types';

interface ExtendedAppItem extends ApplicationListItem {
  scorecards?: { evaluatorId: string; weightedTotal: number }[];
  coiDeclarations?: { evaluatorId: string; hasConflict: boolean }[];
}

export default function EvaluatorHome() {
  const { user } = useAuth();
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => api<ExtendedAppItem[]>('/applications'),
  });

  const getMyStatus = (app: ExtendedAppItem) => {
    if (!user) return { label: 'Pending', tone: 'bg-slate-100 text-slate-700' };
    const myCoi = app.coiDeclarations?.find((c) => c.evaluatorId === user.id);
    const myScore = app.scorecards?.find((s) => s.evaluatorId === user.id);

    if (myCoi?.hasConflict) {
      return { label: 'Recused (COI declared)', tone: 'bg-rose-100 text-rose-800' };
    }
    if (myScore) {
      return { label: `Scored (${myScore.weightedTotal.toFixed(1)}/10)`, tone: 'bg-emerald-100 text-emerald-800' };
    }
    if (myCoi) {
      return { label: 'COI cleared — score pending', tone: 'bg-amber-100 text-amber-800' };
    }
    return { label: 'COI declaration required', tone: 'bg-amber-100 text-amber-800' };
  };

  const pendingEvaluation = apps.filter((a) => {
    const myCoi = a.coiDeclarations?.find((c) => c.evaluatorId === user?.id);
    const myScore = a.scorecards?.find((s) => s.evaluatorId === user?.id);
    const isCompleted = myCoi?.hasConflict || myScore;
    return !isCompleted && a.state === 'UNDER_EVALUATION';
  });

  const completed = apps.filter((a) => {
    const myCoi = a.coiDeclarations?.find((c) => c.evaluatorId === user?.id);
    const myScore = a.scorecards?.find((s) => s.evaluatorId === user?.id);
    return !myCoi?.hasConflict && myScore;
  });

  const recused = apps.filter((a) => {
    const myCoi = a.coiDeclarations?.find((c) => c.evaluatorId === user?.id);
    return myCoi?.hasConflict;
  });

  const renderTable = (rows: ExtendedAppItem[], emptyMsg: string) => {
    if (isLoading) return <p className="muted p-4">Loading applications…</p>;
    if (!rows.length) return <p className="muted p-4">{emptyMsg}</p>;

    return (
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2.5">Startup</th>
            <th className="py-2.5">Challenge & Dept</th>
            <th className="py-2.5">Proposed Price</th>
            <th className="py-2.5">Workflow State</th>
            <th className="py-2.5">Your Status</th>
            <th className="py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((app) => {
            const status = getMyStatus(app);
            return (
              <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-3 pr-3">
                  <Link
                    to={`/applications/${app.id}`}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    {app.startup.name}
                  </Link>
                  <div className="text-xs text-slate-500">{app.startup.district}</div>
                </td>
                <td className="py-3 pr-3 max-w-xs">
                  <div className="line-clamp-1 font-medium text-slate-800">{app.challenge.title}</div>
                  <div className="text-xs text-slate-500">{app.challenge.department.name}</div>
                </td>
                <td className="py-3 pr-3 font-mono text-xs text-slate-700">
                  {formatInr(app.proposedPriceInr)}
                </td>
                <td className="py-3 pr-3">
                  <StateBadge state={app.state} />
                </td>
                <td className="py-3 pr-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                    {status.label}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <Link
                    to={`/applications/${app.id}`}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    Review & Score →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="h1">Evaluator Workspace</h1>
          <p className="muted">
            Independent expert evaluation panel. Declare conflict of interest upfront, then score proposals against the fixed 4-part weighted rubric.
          </p>
        </div>
        {user && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs">
            <span className="font-semibold text-indigo-900">{user.name}</span>
            <span className="ml-2 rounded bg-indigo-200/80 px-1.5 py-0.5 font-medium text-indigo-800">
              Evaluator Panel
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Awaiting Your Action</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{pendingEvaluation.length}</div>
          <div className="mt-1 text-xs text-slate-500">Proposals ready for COI or scoring</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Evaluations Completed</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{completed.length}</div>
          <div className="mt-1 text-xs text-slate-500">Rubric scorecards submitted</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Recused (COI)</div>
          <div className="mt-1 text-2xl font-bold text-slate-600">{recused.length}</div>
          <div className="mt-1 text-xs text-slate-500">Conflict of interest declared</div>
        </div>
      </div>

      <section className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Awaiting Your Evaluation ({pendingEvaluation.length})</h2>
          <span className="text-xs text-slate-500">
            Weighted rubric: Technical (35%), Feasibility (25%), Field Fit (25%), Cost (15%)
          </span>
        </div>
        {renderTable(pendingEvaluation, 'No proposals currently waiting for your evaluation.')}
      </section>

      {completed.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="h2 mb-3">Completed Scorecards ({completed.length})</h2>
          {renderTable(completed, 'No scorecards completed yet.')}
        </section>
      )}

      {recused.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="h2 mb-3">Recused Proposals ({recused.length})</h2>
          {renderTable(recused, 'No recused proposals.')}
        </section>
      )}
    </div>
  );
}
