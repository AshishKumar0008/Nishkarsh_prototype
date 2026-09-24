import { humanize } from '../lib/format';

const TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-slate-200 text-slate-700',
  NO_ELIGIBLE_BIDS: 'bg-amber-100 text-amber-800',
  SUBMITTED: 'bg-sky-100 text-sky-800',
  ELIGIBILITY_PENDING: 'bg-amber-100 text-amber-800',
  ELIGIBLE: 'bg-emerald-100 text-emerald-800',
  INELIGIBLE: 'bg-rose-100 text-rose-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  TERMINATED: 'bg-rose-100 text-rose-800',
  AT_RISK: 'bg-orange-100 text-orange-800',
  SCALED: 'bg-indigo-100 text-indigo-800',
};

export default function StateBadge({ state }: { state: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[state] ?? 'bg-indigo-50 text-indigo-800'}`}>
      {humanize(state)}
    </span>
  );
}
