import { getProblemTag } from '@nishkarsh/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import StateBadge from '../../components/StateBadge';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatInr } from '../../lib/format';
import type { ApplicationListItem, ChallengeListItem } from '../../lib/types';

export default function StartupHome() {
  const { user } = useAuth();
  const challenges = useQuery({ queryKey: ['challenges'], queryFn: () => api<ChallengeListItem[]>('/challenges') });
  const applications = useQuery({ queryKey: ['applications'], queryFn: () => api<ApplicationListItem[]>('/applications') });
  const open = (challenges.data ?? []).filter((c) => c.state === 'PUBLISHED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">{user?.startup?.name}</h1>
        <p className="muted">Live problem statements from Maharashtra departments, open year-round</p>
      </div>

      <section className="space-y-3">
        <h2 className="h2">Open challenges ({open.length})</h2>
        {open.map((c) => {
          const applied = c.applications?.[0];
          return (
            <div key={c.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{c.department.name} · {getProblemTag(c.problemTag)?.label}</p>
                <Link to={`/challenges/${c.id}`} className="mt-1 block font-semibold text-indigo-800 hover:underline">{c.title}</Link>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.problemStatement}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Up to {formatInr(c.budgetCeilingInr)} · {c.pilotDurationWeeks}-week pilot · apply by {formatDate(c.applicationDeadline)}
                </p>
              </div>
              {applied ? (
                <Link to={`/applications/${applied.id}`} className="flex flex-col items-end gap-1 text-sm">
                  <StateBadge state={applied.state} />
                  <span className="text-indigo-700 hover:underline">View application</span>
                </Link>
              ) : (
                <Link to={`/challenges/${c.id}/apply`} className="btn-primary">Apply</Link>
              )}
            </div>
          );
        })}
        {!challenges.isLoading && open.length === 0 && <p className="muted">No open challenges right now.</p>}
      </section>

      <section className="card">
        <h2 className="h2 mb-3">My applications</h2>
        {!applications.data?.length ? (
          <p className="muted">You haven't applied to anything yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {applications.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link className="text-sm font-medium text-indigo-700 hover:underline" to={`/applications/${a.id}`}>{a.challenge.title}</Link>
                <StateBadge state={a.state} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
