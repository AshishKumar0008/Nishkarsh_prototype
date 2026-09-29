import { createChallengeSchema, PROBLEM_TAGS, type AiDraftField } from '@pragati/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import AiDraftAssistant from '../../components/AiDraftAssistant';
import Field, { ErrorBox } from '../../components/Field';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { AiDraftResponse, Challenge } from '../../lib/types';

type FormState = Record<string, string>;
type Errors = Record<string, string | undefined>;

/** Stage 1 — the outcome-based problem-statement template. */
export default function NewChallenge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({
    title: '',
    problemStatement: '',
    problemTag: PROBLEM_TAGS[0].code,
    district: user?.department?.district ?? '',
    fieldSite: '',
    budgetHead: '',
    metricName: '',
    metricUnit: '',
    baselineValue: '',
    targetValue: '',
    minFieldAdoptionPct: '60',
    budgetCeilingInr: '',
    pilotDurationWeeks: '12',
    applicationDeadline: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [aiDraft, setAiDraft] = useState<AiDraftResponse | null>(null);
  const [aiFields, setAiFields] = useState<Set<AiDraftField>>(new Set());

  const applyAi = (draft: AiDraftResponse, fields: AiDraftField[]) => {
    // a redraft is a new provenance record; fields used from the old one no longer match it
    const fresh = draft.id !== aiDraft?.id;
    setAiDraft(draft);
    setAiFields((prev) => new Set([...(fresh ? [] : prev), ...fields]));
    setForm((f) => ({ ...f, ...Object.fromEntries(fields.map((k) => [k, draft.output[k]])) }));
  };

  /** Label suffix so the officer always sees which text came from the assistant. */
  const aiLabel = (k: string, label: string) => {
    if (!aiDraft || !aiFields.has(k as AiDraftField)) return label;
    return aiDraft.output[k as AiDraftField] === form[k] ? `${label} · ✦ AI suggested` : `${label} · ✦ AI, edited by you`;
  };

  const create = useMutation({
    mutationFn: (body: unknown) => api<Challenge>('/challenges', { body }),
    onSuccess: (c) => navigate(`/challenges/${c.id}`),
    onError: (e) => e instanceof ApiError && e.issues && setErrors(Object.fromEntries(Object.entries(e.issues).map(([k, v]) => [k, v?.[0]]))),
  });

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = createChallengeSchema.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      return setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0]])));
    }
    setErrors({});
    create.mutate({ ...parsed.data, aiDraftId: aiFields.size > 0 ? aiDraft?.id : undefined });
  };

  const input = (k: string, type = 'text', placeholder = '') => (
    <input className="input" type={type} value={form[k]} onChange={set(k)} placeholder={placeholder} />
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="h1">New challenge</h1>
        <p className="muted">
          Describe the outcome you need, not the product you want to buy. The baseline, target and adoption threshold you set
          here are what the independent validator and the scale decision are measured against later.
        </p>
      </div>
      <ErrorBox error={create.error} />

      <AiDraftAssistant onApply={applyAi} />

      <section className="card space-y-4">
        <h2 className="h2">1. The problem</h2>
        <Field label={aiLabel('title', 'Title')} error={errors.title}>{input('title', 'text', 'e.g. Real-time soil moisture monitoring for rabi irrigation')}</Field>
        <Field label={aiLabel('problemStatement', 'Problem statement')} error={errors.problemStatement} hint="What happens today, who is affected, and why it matters. Plain language.">
          <textarea className="input min-h-32" value={form.problemStatement} onChange={set('problemStatement')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={aiLabel('problemTag', 'Problem type')} error={errors.problemTag} hint="Used to find other districts with the same problem">
            <select className="input" value={form.problemTag} onChange={set('problemTag')}>
              {PROBLEM_TAGS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="District" error={errors.district}>{input('district')}</Field>
          <Field label={aiLabel('fieldSite', 'Pilot field site')} error={errors.fieldSite}>{input('fieldSite', 'text', 'e.g. Renapur taluka — 5 villages')}</Field>
          <Field label="Budget head" error={errors.budgetHead}>{input('budgetHead')}</Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="h2">2. The outcome (pre-agreed success thresholds)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={aiLabel('metricName', 'Outcome metric')} error={errors.metricName}>{input('metricName', 'text', 'e.g. Water used per hectare per season')}</Field>
          <Field label={aiLabel('metricUnit', 'Unit')} error={errors.metricUnit}>{input('metricUnit', 'text', 'e.g. m³/ha')}</Field>
          <Field label="Baseline (today)" error={errors.baselineValue} hint="From your own records — never AI-suggested">{input('baselineValue', 'number')}</Field>
          <Field label="Target (end of pilot)" error={errors.targetValue}>{input('targetValue', 'number')}</Field>
          <Field label="Min. field-staff adoption (%)" error={errors.minFieldAdoptionPct} hint="Pilot fails if frontline staff don't actually use it">
            {input('minFieldAdoptionPct', 'number')}
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="h2">3. Budget & timeline</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Budget ceiling (₹)" error={errors.budgetCeilingInr}>{input('budgetCeilingInr', 'number')}</Field>
          <Field label="Pilot duration (weeks)" error={errors.pilotDurationWeeks}>{input('pilotDurationWeeks', 'number')}</Field>
          <Field label="Application deadline" error={errors.applicationDeadline}>{input('applicationDeadline', 'date')}</Field>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        <button className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save as draft'}</button>
      </div>
    </form>
  );
}
