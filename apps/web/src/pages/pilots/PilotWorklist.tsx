import { ROLE_LABELS } from '@nishkarsh/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import StateBadge from '../../components/StateBadge';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import type { WorklistItem } from '../../lib/types';

/** Home for field-site supervisors and independent validators: the pilots they're named on and what awaits them. */
export default function PilotWorklist() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({ queryKey: ['worklist'], queryFn: () => api<WorklistItem[]>('/pilots/worklist') });
  const waiting = data.reduce((n, p) => n + p.awaitingMe, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">{user && ROLE_LABELS[user.role]} — my pilots</h1>
        <p className="muted">
          {user?.role === 'VALIDATOR'
            ? 'You are independent of both the department and the startup. Verify each milestone yourself before approving.'
            : 'You confirm on site that each milestone was really delivered. The startup cannot complete a milestone without you.'}
        </p>
      </div>

      <div className="card">
        <div className="text-xs font-medium tracking-wider text-slate-500 uppercase">Milestones awaiting your sign-off</div>
        <div className={`mt-1 text-3xl font-bold ${waiting ? 'text-amber-600' : 'text-slate-400'}`}>{waiting}</div>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : data.length === 0 ? (
        <div className="card muted">No pilots are assigned to you yet. The department names you when it starts a pilot.</div>
      ) : (
        <div className="space-y-3">
          {data.map((p) => (
            <Link key={p.id} to={`/applications/${p.id}`} className="card block transition hover:border-indigo-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">{p.challenge.department.name} · {p.challenge.fieldSite}</div>
                  <div className="mt-0.5 font-semibold text-indigo-800">{p.startup.name}</div>
                  <div className="text-sm text-slate-600">{p.challenge.title}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StateBadge state={p.state} />
                  {p.awaitingMe > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{p.awaitingMe} awaiting you</span>}
                </div>
              </div>
              <ol className="mt-3 flex flex-wrap gap-2 text-xs">
                {p.milestones.map((m) => (
                  <li
                    key={m.sequence}
                    className={`rounded border px-2 py-1 ${
                      m.status === 'COMPLETE' ? 'border-emerald-300 bg-emerald-50' : m.status === 'SUBMITTED' ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                    }`}
                  >
                    {m.sequence}. {m.title} · due {formatDate(m.dueDate)}
                  </li>
                ))}
              </ol>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
