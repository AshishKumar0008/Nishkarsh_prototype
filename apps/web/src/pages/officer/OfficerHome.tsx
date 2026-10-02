import { getProblemTag } from '@nishkarsh/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import StateBadge from '../../components/StateBadge';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatInr } from '../../lib/format';
import type { ApplicationListItem, ChallengeListItem } from '../../lib/types';

export default function OfficerHome() {
  const { user } = useAuth();
  const challenges = useQuery({ queryKey: ['challenges'], queryFn: () => api<ChallengeListItem[]>('/challenges') });
  const applications = useQuery({ queryKey: ['applications'], queryFn: () => api<ApplicationListItem[]>('/applications') });
  const mine = (challenges.data ?? []).filter((c) => c.departmentId === user?.departmentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">{user?.department?.name}</h1>
          <p className="muted">Your department's challenges and incoming applications</p>
        </div>
        <Link to="/officer/challenges/new" className="btn-primary">+ New challenge</Link>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="h2 mb-3">Challenges</h2>
        {mine.length === 0 ? (
          <p className="muted">No challenges yet. Turn an operational pain point into your first outcome-based challenge.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-2">Title</th><th>Problem type</th><th>Budget ceiling</th><th>Deadline</th><th>Applications</th><th>State</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mine.map((c) => (
                <tr key={c.id}>
                  <td className="py-2.5 pr-3"><Link className="font-medium text-indigo-700 hover:underline" to={`/challenges/${c.id}`}>{c.title}</Link></td>
                  <td className="pr-3">{getProblemTag(c.problemTag)?.label}</td>
                  <td className="pr-3">{formatInr(c.budgetCeilingInr)}</td>
                  <td className="pr-3">{formatDate(c.applicationDeadline)}</td>
                  <td className="pr-3">{c._count.applications}</td>
                  <td><StateBadge state={c.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="h2 mb-3">Applications</h2>
        {!applications.data?.length ? (
          <p className="muted">No applications yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-2">Startup</th><th>Challenge</th><th>Price</th><th>State</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.data.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 pr-3"><Link className="font-medium text-indigo-700 hover:underline" to={`/applications/${a.id}`}>{a.startup.name}</Link></td>
                  <td className="pr-3">{a.challenge.title}</td>
                  <td className="pr-3">{formatInr(a.proposedPriceInr)}</td>
                  <td><StateBadge state={a.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
