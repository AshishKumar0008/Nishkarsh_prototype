import { AI_DRAFT_FIELDS, getProblemTag, type AiDraftField } from '@pragati/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { AiDraftResponse } from '../lib/types';
import { ErrorBox } from './Field';

const FIELD_LABELS: Record<AiDraftField, string> = {
  title: 'Title',
  problemStatement: 'Problem statement',
  problemTag: 'Problem type',
  fieldSite: 'Pilot field site',
  metricName: 'Outcome metric',
  metricUnit: 'Unit',
};

/**
 * Stage 1 drafting assistant. Produces suggestions only — the officer applies them field by field
 * (or all at once), edits freely, and the thresholds stay blank until they type them in.
 */
export default function AiDraftAssistant({
  onApply,
}: {
  onApply: (draft: AiDraftResponse, fields: AiDraftField[]) => void;
}) {
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(true);
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<{ provider: string; model: string }>('/ai/status'),
    staleTime: Infinity,
  });
  const draft = useMutation({ mutationFn: () => api<AiDraftResponse>('/ai/challenge-draft', { body: { notes } }) });
  const d = draft.data;
  const offline = (d?.provider ?? status.data?.provider) === 'offline-rules';
  const shown = d ? AI_DRAFT_FIELDS.filter((f) => d.output[f]) : [];

  return (
    <section className="card space-y-4 border-violet-200 bg-violet-50/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="h2">✦ Drafting assistant <span className="text-xs font-normal text-slate-500">optional</span></h2>
          <p className="muted">
            Paste rough notes — a file noting, a WhatsApp summary, anything. You get a structured draft to review. You
            decide what goes in; the assistant can't save, publish or set any threshold.
          </p>
        </div>
        <button type="button" className="text-sm text-violet-700 hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <>
          <textarea
            className="input min-h-28"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Drinking water sources in Ausa block have high iron. Gram sevaks test twice a year with kits and results reach us after 3 months…"
          />
          <p className="text-xs text-slate-500">
            Don't paste names, phone or Aadhaar numbers of beneficiaries. Phone, Aadhaar and email patterns are removed on
            the server before anything is sent to the model.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={draft.isPending || notes.trim().length < 40}
              onClick={() => draft.mutate()}
            >
              {draft.isPending ? 'Drafting…' : d ? 'Redraft' : 'Draft with AI'}
            </button>
            {status.data && (
              <span className="text-xs text-slate-500">
                {offline ? 'Offline mode — keyword rules, no AI model configured' : `Model: ${status.data.model}`}
              </span>
            )}
          </div>
          <ErrorBox error={draft.error} />

          {d && (
            <div className="space-y-4 rounded-lg border border-violet-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Suggestions — review before using</p>
                <button type="button" className="btn-secondary" onClick={() => onApply(d, shown)}>
                  Use all suggestions
                </button>
              </div>

              {Object.keys(d.redactions).length > 0 && (
                <p className="text-xs text-slate-600">
                  Removed before sending: {Object.entries(d.redactions).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}.
                </p>
              )}
              {d.unsupportedNumbers.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <strong>Check these numbers:</strong> {d.unsupportedNumbers.join(', ')} appear in the draft but not in your
                  notes. They may be invented — remove or correct them.
                </div>
              )}

              {d.output.problemTag === null && (
                <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  <strong>No matching problem type.</strong> None of the fixed types fits these notes, so none is suggested.
                  Choose the closest one yourself, or ask the domain lead to add a new type — a forced match would link this
                  challenge to unrelated problems in other districts.
                </div>
              )}

              <dl className="divide-y divide-slate-100 text-sm">
                {shown.map((f) => (
                  <div key={f} className="flex items-start gap-3 py-2">
                    <dt className="w-36 shrink-0 text-slate-500">{FIELD_LABELS[f]}</dt>
                    <dd className="flex-1 whitespace-pre-line">
                      {f === 'problemTag' ? getProblemTag(d.output.problemTag ?? '')?.label : d.output[f]}
                    </dd>
                    <button type="button" className="text-xs text-violet-700 hover:underline" onClick={() => onApply(d, [f])}>
                      Use
                    </button>
                  </div>
                ))}
              </dl>

              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <strong>Not suggested, by design:</strong> baseline, target, adoption %, budget, duration and deadline. These
                become the pilot's pass/fail terms — enter them from your department's own records.
              </div>

              {d.output.clarifyingQuestions.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium">Worth adding before you publish</p>
                  <ul className="mt-1 list-disc pl-5 text-slate-700">
                    {d.output.clarifyingQuestions.map((q) => <li key={q}>{q}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs text-slate-400">
                {d.provider === 'offline-rules' ? 'Offline keyword rules' : d.model} · {d.promptVersion} · recorded for the audit trail
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
