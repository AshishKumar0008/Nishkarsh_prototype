import { applySchema } from '@pragati/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import Field, { ErrorBox } from '../../components/Field';
import { api, ApiError } from '../../lib/api';
import { formatInr } from '../../lib/format';
import type { ChallengeDetail } from '../../lib/types';

type Errors = Record<string, string | undefined>;

/** Stage 2 — structured proposal. Submitting also triggers the automatic eligibility screen. */
export default function ApplyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: c } = useQuery({ queryKey: ['challenge', id], queryFn: () => api<ChallengeDetail>(`/challenges/${id}`) });
  const [form, setForm] = useState({
    solutionSummary: '',
    approach: '',
    pilotPlan: '',
    teamSummary: '',
    priorEvidence: '',
    proposedPriceInr: '',
    declaredTurnoverInr: '',
    selfDeclarationAccepted: false,
  });
  const [errors, setErrors] = useState<Errors>({});

  const apply = useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>(`/challenges/${id}/applications`, { body }),
    onSuccess: (a) => navigate(`/applications/${a.id}`),
    onError: (e) => e instanceof ApiError && e.issues && setErrors(Object.fromEntries(Object.entries(e.issues).map(([k, v]) => [k, v?.[0]]))),
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = applySchema.safeParse({ ...form, priorEvidence: form.priorEvidence || undefined });
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      return setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0]])));
    }
    setErrors({});
    apply.mutate(parsed.data);
  };

  const area = (k: keyof typeof form, hint?: string) => (
    <textarea className="input min-h-24" value={form[k] as string} onChange={set(k)} placeholder={hint} />
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="h1">Apply</h1>
        {c && <p className="muted">{c.title} · {c.department.name} · ceiling {formatInr(c.budgetCeilingInr)}</p>}
      </div>
      <ErrorBox error={apply.error} />

      <section className="card space-y-4">
        <h2 className="h2">Proposal</h2>
        <Field label="Solution summary" error={errors.solutionSummary}>{area('solutionSummary', 'What your product does for this specific problem')}</Field>
        <Field label="Approach" error={errors.approach}>{area('approach', 'How it will be deployed at the field site')}</Field>
        <Field label="Pilot plan & milestones" error={errors.pilotPlan}>{area('pilotPlan', 'Proposed milestones within the pilot duration')}</Field>
        <Field label="Team" error={errors.teamSummary}>{area('teamSummary')}</Field>
        <Field label="Prior evidence (optional)" error={errors.priorEvidence}>{area('priorEvidence', 'Previous pilots, customers, results')}</Field>
        <Field label="Proposed pilot price (₹)" error={errors.proposedPriceInr}>
          <input className="input" type="number" value={form.proposedPriceInr} onChange={set('proposedPriceInr')} />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="h2">Self-declaration (used for the GFR eligibility screen)</h2>
        <Field label="Turnover in latest financial year (₹)" error={errors.declaredTurnoverInr}>
          <input className="input" type="number" value={form.declaredTurnoverInr} onChange={set('declaredTurnoverInr')} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.selfDeclarationAccepted}
            onChange={(e) => setForm((f) => ({ ...f, selfDeclarationAccepted: e.target.checked }))}
          />
          <span>
            I declare that the DPIIT recognition, incorporation date and turnover on record for my startup are true. I understand
            they will be checked automatically and recorded in a permanent audit trail.
          </span>
        </label>
        {errors.selfDeclarationAccepted && <p className="text-xs text-rose-700">{errors.selfDeclarationAccepted}</p>}
      </section>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        <button className="btn-primary" disabled={apply.isPending}>{apply.isPending ? 'Submitting…' : 'Submit application'}</button>
      </div>
    </form>
  );
}
