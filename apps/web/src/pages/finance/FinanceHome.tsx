import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import StateBadge from '../../components/StateBadge';
import { api } from '../../lib/api';
import type { ApplicationListItem } from '../../lib/types';

export default function FinanceHome() {
  const { data = [], isLoading } = useQuery({ queryKey: ['applications'], queryFn: () => api<ApplicationListItem[]>('/applications') });
  const pending = data.filter((a) => a.state === 'ELIGIBILITY_PENDING');
  const decided = data.filter((a) => a.state !== 'ELIGIBILITY_PENDING');

  const table = (rows: ApplicationListItem[]) => (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500">
        <tr><th className="py-2">Startup</th><th>Challenge</th><th>System recommendation</th><th>State</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="py-2.5 pr-3"><Link className="font-medium text-indigo-700 hover:underline" to={`/applications/${a.id}`}>{a.startup.name}</Link></td>
            <td className="pr-3">{a.challenge.title}</td>
            <td className="pr-3">
              {a.eligibilityMemo?.autoEligible
                ? <span className="text-emerald-700">Eligible — {a.eligibilityMemo.clausesCited.join(', ')}</span>
                : <span className="text-rose-700">Not eligible</span>}
            </td>
            <td><StateBadge state={a.state} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Eligibility queue</h1>
        <p className="muted">The system screens every application and cites the GFR clause. You confirm or override — the final call is always yours.</p>
      </div>
      <section className="card overflow-x-auto">
        <h2 className="h2 mb-3">Awaiting your confirmation ({pending.length})</h2>
        {isLoading ? <p className="muted">Loading…</p> : pending.length ? table(pending) : <p className="muted">Nothing waiting.</p>}
      </section>
      {decided.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="h2 mb-3">Decided</h2>
          {table(decided)}
        </section>
      )}
    </div>
  );
}
