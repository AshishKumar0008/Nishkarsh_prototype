import { ROLE_LABELS } from '@pragati/shared';
import { useAuth } from '../lib/auth';

const PLANNED: Record<string, { stage: string; week: string; does: string }> = {
  EVALUATOR: { stage: 'Stage 4 — Expert Evaluation', week: 'Week 2', does: 'Declare conflict of interest, then score each eligible proposal on technical merit, feasibility, cost and field fit.' },
  FIELD_STAFF: { stage: 'Stage 6 — Milestone Execution', week: 'Week 3', does: 'Confirm each milestone on site (independently of the startup), or flag it at-risk.' },
  VALIDATOR: { stage: 'Stage 7 — Independent Validation', week: 'Week 3', does: 'Measure outcomes against the challenge baseline; discrepancies with vendor numbers are flagged automatically.' },
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
