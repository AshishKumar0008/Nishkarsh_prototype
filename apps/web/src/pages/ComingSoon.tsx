import { ROLE_LABELS } from '@pragati/shared';
import { useAuth } from '../lib/auth';

const PLANNED: Record<string, { stage: string; week: string; does: string }> = {
  ADMIN: { stage: 'MSInS oversight', week: 'Week 4', does: 'Cross-department view: challenges, clusters, conversions to scale, failure registry.' },
};

export default function ComingSoon() {
  const { user } = useAuth();
  const plan = user ? PLANNED[user.role] : undefined;
  return (
    <div className="card mx-auto max-w-xl">
      <h1 className="h1">{user && ROLE_LABELS[user.role]} workspace</h1>
      {plan ? (
        <>
          <p className="mt-2 font-medium text-indigo-800">{plan.stage} · planned for {plan.week}</p>
          <p className="mt-2 text-slate-600">{plan.does}</p>
        </>
      ) : (
        <p className="mt-2 text-slate-600">Not built yet.</p>
      )}
    </div>
  );
}
