import {
  addDays,
  buildCommitmentCard,
  DATA_SENSITIVITY,
  MAX_MILESTONES,
  planTotal,
  validateMilestonePlan,
  type ApplicationState,
  type DataSensitivity,
  type MilestonePlanItem,
} from '@pragati/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime, formatInr } from '../lib/format';
import type { AgreementView, PilotAgreement } from '../lib/types';
import { ErrorBox } from './Field';
import MarkdownDoc from './MarkdownDoc';

interface Props {
  applicationId: string;
  state: ApplicationState;
  /** Finance officer of the owning department — may draft, revise and countersign. */
  canContract: boolean;
}

const SENSITIVITY_LABEL: Record<DataSensitivity, string> = {
  STANDARD: 'Standard — no citizen personal data',
  SENSITIVE_PII: 'Personal data (DPDP Act clauses) — health, education, welfare',
};

/** Stage 5 — pilot agreement + Commitment Card. */
export default function AgreementSection({ applicationId, state, canContract }: Props) {
  const qc = useQueryClient();
  const [revising, setRevising] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['agreement', applicationId],
    queryFn: () => api<AgreementView>(`/applications/${applicationId}/agreement`),
  });

  const refresh = () => {
    setRevising(false);
    for (const key of [['agreement', applicationId], ['application', applicationId], ['audit', 'APPLICATION', applicationId], ['applications']]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  if (isLoading) return <section className="card"><p className="muted">Loading agreement…</p></section>;
  if (!data) return <section className="card"><ErrorBox error={error} /></section>;

  const { agreement, drafting } = data;
  const executed = !!agreement?.financeSignedAt;
  const showForm = canContract && state === 'SELECTED' && (!agreement || revising);

  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="h2">Stage 5 — Pilot Agreement &amp; Commitment Card</h2>
          <p className="mt-1 text-xs text-slate-500">
            Milestone-paid contract generated from the pre-cleared template. Both parties sign the exact same document hash.
          </p>
        </div>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Template: draft, pending legal review</span>
      </div>

      {showForm ? (
        <DraftForm
          applicationId={applicationId}
          drafting={drafting}
          existing={agreement}
          onDone={refresh}
          onCancel={agreement ? () => setRevising(false) : undefined}
        />
      ) : !agreement ? (
        <p className="muted">
          {state === 'SELECTED'
            ? 'Selected by the panel. Waiting for the procurement / finance officer to draft the pilot agreement.'
            : 'No agreement.'}
        </p>
      ) : (
        <>
          <SignaturePanel
            applicationId={applicationId}
            agreement={agreement}
            state={state}
            canContract={canContract}
            onRevise={() => setRevising(true)}
            onDone={refresh}
          />
          <AgreementBody agreement={agreement} executed={executed} />
        </>
      )}
    </section>
  );
}

// ─── Drafting ───────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Rebuild the editable plan from a saved agreement (due dates → week numbers). */
function planFromAgreement(a: PilotAgreement): MilestonePlanItem[] {
  const start = new Date(a.pilotStartDate).getTime();
  return a.milestones.map((m) => ({
    title: m.title,
    description: m.description,
    dueWeek: Math.round((new Date(m.dueDate).getTime() - start) / (7 * DAY)),
    paymentTrancheInr: m.paymentTrancheInr,
  }));
}

function DraftForm({
  applicationId,
  drafting,
  existing,
  onDone,
  onCancel,
}: {
  applicationId: string;
  drafting: AgreementView['drafting'];
  existing: PilotAgreement | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [pilotStartDate, setPilotStartDate] = useState(
    existing ? isoDate(new Date(existing.pilotStartDate)) : isoDate(addDays(new Date(), 7)),
  );
  const [dataSensitivity, setDataSensitivity] = useState<DataSensitivity>(existing?.dataSensitivity ?? drafting.defaultDataSensitivity);
  const [milestones, setMilestones] = useState<MilestonePlanItem[]>(existing ? planFromAgreement(existing) : drafting.suggestedMilestones);

  const save = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/agreement`, { method: 'PUT', body: { pilotStartDate, dataSensitivity, milestones } }),
    onSuccess: onDone,
  });

  const limits = { pilotDurationWeeks: drafting.pilotDurationWeeks, maxValueInr: drafting.maxValueInr };
  const problems = validateMilestonePlan(milestones, limits);
  const total = planTotal(milestones);
  const start = new Date(pilotStartDate);
  const preview = !Number.isNaN(start.getTime()) ? buildCommitmentCard(milestones, start, drafting.pilotDurationWeeks) : [];

  const update = (i: number, patch: Partial<MilestonePlanItem>) =>
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-5">
      {existing?.startupSignedAt && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          The startup has already signed revision {existing.revision}. Saving a new revision <strong>voids their signature</strong> — they
          will need to review and sign again. This is recorded in the audit trail.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Pilot start date</label>
          <input className="input" type="date" value={pilotStartDate} onChange={(e) => setPilotStartDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Data &amp; IP clause set</label>
          <select className="input" value={dataSensitivity} onChange={(e) => setDataSensitivity(e.target.value as DataSensitivity)}>
            {DATA_SENSITIVITY.map((d) => <option key={d} value={d}>{SENSITIVITY_LABEL[d]}</option>)}
          </select>
        </div>
      </div>

      <div className="text-xs text-slate-600">
        Maximum contract value <strong>{formatInr(drafting.maxValueInr)}</strong> (lower of proposed price {formatInr(drafting.proposedPriceInr)} and
        budget ceiling {formatInr(drafting.budgetCeilingInr)}) · pilot {drafting.pilotDurationWeeks} weeks · final tranche ≥{' '}
        {drafting.finalTrancheMinPct}% and due in the last week.
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Milestone</th>
              <th className="px-2 py-2">Acceptance description</th>
              <th className="w-20 px-2 py-2">Due week</th>
              <th className="w-32 px-2 py-2">Tranche (₹)</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {milestones.map((m, i) => (
              <tr key={i}>
                <td className="px-2 py-2 align-top font-medium">{i + 1}</td>
                <td className="px-2 py-2 align-top"><input className="input text-xs" value={m.title} onChange={(e) => update(i, { title: e.target.value })} /></td>
                <td className="px-2 py-2 align-top"><input className="input text-xs" value={m.description} onChange={(e) => update(i, { description: e.target.value })} /></td>
                <td className="px-2 py-2 align-top">
                  <input className="input text-xs" type="number" min={1} max={drafting.pilotDurationWeeks} value={m.dueWeek} onChange={(e) => update(i, { dueWeek: Number(e.target.value) })} />
                </td>
                <td className="px-2 py-2 align-top">
                  <input className="input text-xs" type="number" min={1} value={m.paymentTrancheInr} onChange={(e) => update(i, { paymentTrancheInr: Number(e.target.value) })} />
                </td>
                <td className="px-2 py-2 align-top">
                  {milestones.length > 1 && (
                    <button className="text-rose-700 hover:underline" onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-medium">
            <tr>
              <td colSpan={4} className="px-2 py-2">
                {milestones.length < MAX_MILESTONES && (
                  <button
                    className="text-indigo-700 hover:underline"
                    onClick={() =>
                      setMilestones((ms) => [
                        ...ms.slice(0, -1),
                        { title: '', description: '', dueWeek: Math.max(1, drafting.pilotDurationWeeks - 1), paymentTrancheInr: 0 },
                        ms[ms.length - 1],
                      ])
                    }
                  >
                    + Add milestone before the final one
                  </button>
                )}
              </td>
              <td className={`px-2 py-2 ${total > drafting.maxValueInr ? 'text-rose-700' : ''}`}>{formatInr(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md border border-rose-200 bg-rose-50 py-2 pr-3 pl-7 text-xs text-rose-800">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Commitment Card preview</h3>
        <CommitmentTable rows={preview.map((c) => ({ ...c, dueDate: c.dueDate.toISOString(), status: 'PENDING' as const }))} />
      </div>

      <ErrorBox error={save.error} />
      <div className="flex justify-end gap-2">
        {onCancel && <button className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary" disabled={save.isPending || problems.length > 0} onClick={() => save.mutate()}>
          {save.isPending ? 'Generating…' : existing ? `Save as revision ${existing.revision + 1}` : 'Generate agreement'}
        </button>
      </div>
    </div>
  );
}

// ─── Signing ────────────────────────────────────────────────────────────────

function SignaturePanel({
  applicationId,
  agreement,
  state,
  canContract,
  onRevise,
  onDone,
}: {
  applicationId: string;
  agreement: PilotAgreement;
  state: ApplicationState;
  canContract: boolean;
  onRevise: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [ack, setAck] = useState(false);
  const sign = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/agreement/sign`, { body: { contentHash: agreement.contentHash } }),
    onSuccess: () => {
      setAck(false);
      onDone();
    },
  });

  const open = state === 'SELECTED';
  const startupCanSign = open && user?.role === 'STARTUP' && !agreement.startupSignedAt;
  const financeCanSign = open && canContract && !!agreement.startupSignedAt && !agreement.financeSignedAt;
  const canSign = startupCanSign || financeCanSign;

  const sig = (label: string, at: string | null, by: { name: string } | null) => (
    <div className={`rounded-md border p-3 text-xs ${at ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="font-semibold">{label}</div>
      {at ? (
        <div className="mt-0.5 text-emerald-800">✓ Signed by {by?.name} · {formatDateTime(at)}</div>
      ) : (
        <div className="mt-0.5 text-slate-500">Awaiting signature</div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>Revision <strong>{agreement.revision}</strong></span>
        <span>{formatInr(agreement.totalValueInr)}</span>
        <span>{formatDate(agreement.pilotStartDate)} → {formatDate(agreement.pilotEndDate)}</span>
        <span>{agreement.dataSensitivity === 'SENSITIVE_PII' ? 'Personal-data clauses' : 'Standard data clauses'}</span>
        <span className="font-mono" title={agreement.contentHash}>SHA-256 {agreement.contentHash.slice(0, 16)}…</span>
        {!agreement.integrityOk && <span className="font-semibold text-rose-700">✗ Stored text does not match its hash</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sig('1 · Startup', agreement.startupSignedAt, agreement.startupSigner)}
        {sig('2 · Procurement / Finance Officer (executes)', agreement.financeSignedAt, agreement.financeSigner)}
      </div>

      {canSign && (
        <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              I have read revision {agreement.revision} in full (document hash <span className="font-mono">{agreement.contentHash.slice(0, 16)}…</span>)
              and sign it {startupCanSign ? `on behalf of the startup` : 'on behalf of the Department, executing the contract'}.
            </span>
          </label>
          <ErrorBox error={sign.error} />
          <button className="btn-primary" disabled={!ack || sign.isPending} onClick={() => sign.mutate()}>
            {sign.isPending ? 'Signing…' : startupCanSign ? 'Sign agreement' : 'Countersign & execute contract'}
          </button>
        </div>
      )}

      {open && canContract && !agreement.financeSignedAt && (
        <button className="text-xs text-indigo-700 hover:underline" onClick={onRevise}>
          Revise agreement{agreement.startupSignedAt ? ' (voids the startup’s signature)' : ''}
        </button>
      )}
    </div>
  );
}

// ─── Document ───────────────────────────────────────────────────────────────

function CommitmentTable({ rows }: { rows: { party: 'DEPARTMENT' | 'STARTUP'; description: string; dueDate: string; status: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr><th className="px-3 py-2">Party</th><th className="px-3 py-2">Commitment</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c, i) => (
            <tr key={i}>
              <td className="px-3 py-2">
                <span className={`rounded px-2 py-0.5 font-medium ${c.party === 'DEPARTMENT' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}`}>
                  {c.party === 'DEPARTMENT' ? 'Department' : 'Startup'}
                </span>
              </td>
              <td className="px-3 py-2">{c.description}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(c.dueDate)}</td>
              <td className="px-3 py-2 text-slate-500">{c.status.toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgreementBody({ agreement, executed }: { agreement: PilotAgreement; executed: boolean }) {
  const [showDoc, setShowDoc] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Milestones &amp; payment tranches</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Milestone</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Tranche</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agreement.milestones.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">{m.sequence}</td>
                  <td className="px-3 py-2"><span className="font-medium">{m.title}</span> — <span className="text-slate-600">{m.description}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.dueDate)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatInr(m.paymentTrancheInr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">Commitment Card</h3>
        <p className="mb-2 text-xs text-slate-500">Both sides are held to dates. {executed ? 'Tracked from pilot start (Stage 6).' : 'Becomes binding on execution.'}</p>
        <CommitmentTable rows={agreement.commitments} />
      </div>

      <div>
        <button className="text-sm font-medium text-indigo-700 hover:underline" onClick={() => setShowDoc((v) => !v)}>
          {showDoc ? '▾ Hide' : '▸ Read'} full agreement text (revision {agreement.revision})
        </button>
        {showDoc && (
          <div className="mt-3 max-h-[36rem] overflow-y-auto rounded-lg border border-slate-200 bg-white p-5">
            <MarkdownDoc source={agreement.renderedText} />
            <p className="mt-4 border-t border-slate-100 pt-2 font-mono text-[11px] text-slate-400">
              {agreement.templateVersion} · SHA-256 {agreement.contentHash}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
