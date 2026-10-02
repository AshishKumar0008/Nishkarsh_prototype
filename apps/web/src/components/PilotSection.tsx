import type { ApplicationState, CommitmentStanding } from '@nishkarsh/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime, formatInr } from '../lib/format';
import type { PartyScore, PilotMilestone, PilotView } from '../lib/types';
import { ErrorBox } from './Field';

interface Props {
  applicationId: string;
  state: ApplicationState;
  /** Officer of the owning department (or admin) — starts the pilot and designates the validator. */
  canManage: boolean;
}

/** Stage 6 — milestone execution with dual sign-off, auto-released payments and the live Commitment Card. */
export default function PilotSection({ applicationId, state, canManage }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['pilot', applicationId],
    queryFn: () => api<PilotView>(`/applications/${applicationId}/pilot`),
  });

  const refresh = () => {
    for (const key of [['pilot', applicationId], ['application', applicationId], ['agreement', applicationId], ['audit', 'APPLICATION', applicationId], ['applications'], ['worklist']]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  if (isLoading) return <section className="card"><p className="muted">Loading pilot…</p></section>;
  if (!data) return <section className="card"><ErrorBox error={error} /></section>;

  const running = state === 'IN_PILOT' || state === 'AT_RISK';
  const isSupervisor = user?.role === 'FIELD_STAFF' && data.fieldSupervisor?.id === user.id;
  const isValidator = user?.role === 'VALIDATOR' && data.validator?.id === user.id;

  return (
    <section className="card space-y-5">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="h2">Stage 6 — Milestone Execution</h2>
        <p className="mt-1 text-xs text-slate-500">
          A milestone completes only when the field-site supervisor <em>and</em> the independent validator both sign off — never on the
          startup&apos;s word alone. Each tranche is then released automatically (simulated).
        </p>
      </div>

      {state === 'CONTRACTED' &&
        (canManage && data.candidates ? (
          <StartPilotForm applicationId={applicationId} candidates={data.candidates} pilotStartDate={data.pilotStartDate} onDone={refresh} />
        ) : (
          <p className="muted">Contract executed. Waiting for the department to start the pilot and name the field-site supervisor.</p>
        ))}

      {data.pilotStartedAt && (
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <Assignment label="Pilot started" value={formatDateTime(data.pilotStartedAt)} />
          <Assignment label="Field-site supervisor" value={data.fieldSupervisor?.name} />
          <Assignment
            label="Independent validator"
            value={data.validator?.name}
            missing="Not yet designated — department commitment"
          />
        </div>
      )}

      {running && !data.validator && canManage && data.candidates && (
        <AssignValidatorForm applicationId={applicationId} validators={data.candidates.validators} onDone={refresh} />
      )}

      {state === 'AT_RISK' && data.atRisk && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
          <strong>Pilot flagged at risk</strong> by the field-site supervisor on {formatDateTime(data.atRisk.since)}: “{data.atRisk.note}”
          <p className="mt-1 text-xs">Milestone sign-offs are paused until the supervisor confirms corrective action.</p>
        </div>
      )}
      {isSupervisor && running && <RiskControl applicationId={applicationId} atRisk={state === 'AT_RISK'} onDone={refresh} />}

      {data.pilotStartedAt && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Milestones</h3>
          {data.milestones.map((m, i) => (
            <MilestoneCard
              key={m.id}
              applicationId={applicationId}
              milestone={m}
              isFinal={i === data.milestones.length - 1}
              previousComplete={i === 0 || data.milestones[i - 1].status === 'COMPLETE'}
              pilotRunning={running}
              pilotAtRisk={state === 'AT_RISK'}
              canSubmit={user?.role === 'STARTUP'}
              signerRole={isSupervisor ? 'FIELD_STAFF' : isValidator ? 'VALIDATOR' : null}
              onDone={refresh}
            />
          ))}
        </div>
      )}

      <CommitmentTracker data={data} />
    </section>
  );
}

function Assignment({ label, value, missing = '—' }: { label: string; value?: string | null; missing?: string }) {
  return (
    <div className={`rounded-md border p-2.5 ${value ? 'border-slate-200 bg-slate-50' : 'border-amber-300 bg-amber-50'}`}>
      <div className="text-slate-500">{label}</div>
      <div className={`font-medium ${value ? 'text-slate-900' : 'text-amber-800'}`}>{value ?? missing}</div>
    </div>
  );
}

// ─── Officer: start pilot / designate validator ─────────────────────────────

function StartPilotForm({
  applicationId,
  candidates,
  pilotStartDate,
  onDone,
}: {
  applicationId: string;
  candidates: NonNullable<PilotView['candidates']>;
  pilotStartDate: string;
  onDone: () => void;
}) {
  const [fieldSupervisorId, setSupervisor] = useState(candidates.fieldStaff[0]?.id ?? '');
  const [validatorId, setValidator] = useState('');
  const start = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/pilot/start`, { body: { fieldSupervisorId, ...(validatorId && { validatorId }) } }),
    onSuccess: onDone,
  });

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
      <p className="text-sm">
        <strong>Start the pilot.</strong> Naming the field-site supervisor fulfils the department&apos;s first commitment (due{' '}
        {formatDate(pilotStartDate)}). The validator can be designated now or later — but milestones can&apos;t complete without one.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Field-site supervisor (signs off milestones on site)</label>
          <select className="input" value={fieldSupervisorId} onChange={(e) => setSupervisor(e.target.value)}>
            {candidates.fieldStaff.length === 0 && <option value="">No field staff in this department</option>}
            {candidates.fieldStaff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Independent validator (optional now)</label>
          <select className="input" value={validatorId} onChange={(e) => setValidator(e.target.value)}>
            <option value="">Designate later</option>
            {candidates.validators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>
      <ErrorBox error={start.error} />
      <button className="btn-primary" disabled={!fieldSupervisorId || start.isPending} onClick={() => start.mutate()}>
        {start.isPending ? 'Starting…' : 'Start pilot'}
      </button>
    </div>
  );
}

function AssignValidatorForm({ applicationId, validators, onDone }: { applicationId: string; validators: { id: string; name: string }[]; onDone: () => void }) {
  const [validatorId, setValidator] = useState(validators[0]?.id ?? '');
  const assign = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/pilot/validator`, { body: { validatorId } }),
    onSuccess: onDone,
  });
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="min-w-60 flex-1">
        <label className="label">Designate the independent validator (fixed once set)</label>
        <select className="input" value={validatorId} onChange={(e) => setValidator(e.target.value)}>
          {validators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <button className="btn-primary" disabled={!validatorId || assign.isPending} onClick={() => assign.mutate()}>Designate</button>
      <div className="w-full"><ErrorBox error={assign.error} /></div>
    </div>
  );
}

// ─── Field supervisor: risk flag ────────────────────────────────────────────

function RiskControl({ applicationId, atRisk, onDone }: { applicationId: string; atRisk: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const act = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/pilot/${atRisk ? 'resolve-risk' : 'at-risk'}`, { body: { note } }),
    onSuccess: () => {
      setOpen(false);
      setNote('');
      onDone();
    },
  });
  if (!open) {
    return (
      <button className={atRisk ? 'btn-primary' : 'btn-secondary'} onClick={() => setOpen(true)}>
        {atRisk ? 'Confirm corrective action & resume' : '⚠ Flag pilot at risk'}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <textarea
        className="input min-h-16 text-sm"
        placeholder={atRisk ? 'What was fixed, and how you verified it (min 15 characters)' : 'What is going wrong on site (min 15 characters)'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <ErrorBox error={act.error} />
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
        <button className={atRisk ? 'btn-primary' : 'btn-danger'} disabled={note.trim().length < 15 || act.isPending} onClick={() => act.mutate()}>
          {atRisk ? 'Resume pilot' : 'Flag at risk'}
        </button>
      </div>
    </div>
  );
}

// ─── Milestones ─────────────────────────────────────────────────────────────

const SIGNER_LABEL = { FIELD_STAFF: 'Field-site supervisor', VALIDATOR: 'Independent validator' } as const;

function MilestoneCard({
  applicationId,
  milestone: m,
  isFinal,
  previousComplete,
  pilotRunning,
  pilotAtRisk,
  canSubmit,
  signerRole,
  onDone,
}: {
  applicationId: string;
  milestone: PilotMilestone;
  isFinal: boolean;
  previousComplete: boolean;
  pilotRunning: boolean;
  pilotAtRisk: boolean;
  canSubmit: boolean;
  signerRole: 'FIELD_STAFF' | 'VALIDATOR' | null;
  onDone: () => void;
}) {
  const tone = { PENDING: 'bg-slate-100 text-slate-700', SUBMITTED: 'bg-amber-100 text-amber-800', COMPLETE: 'bg-emerald-100 text-emerald-800' }[m.status];
  const statusLabel = m.status === 'SUBMITTED' ? 'Awaiting sign-off' : m.status === 'COMPLETE' ? 'Complete' : m.returnNote ? 'Returned for rework' : 'Not submitted';
  const iSigned = signerRole && m.signoffs.some((s) => s.signerRole === signerRole);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">
            {m.sequence}. {m.title}
            {isFinal && <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">outcome-linked</span>}
          </div>
          <div className="text-xs text-slate-600">{m.description}</div>
          <div className="mt-1 text-xs text-slate-500">Due {formatDate(m.dueDate)} · tranche {formatInr(m.paymentTrancheInr)}</div>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{statusLabel}</span>
      </div>

      {m.status === 'PENDING' && m.returnNote && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">
          <strong>Returned:</strong> {m.returnNote}
        </div>
      )}

      {m.evidenceSummary && m.status !== 'PENDING' && (
        <div className="mt-3 rounded-md bg-slate-50 p-2.5 text-xs">
          <div className="text-slate-500">Evidence submitted {m.submittedAt && formatDateTime(m.submittedAt)}</div>
          <p className="mt-0.5 whitespace-pre-line">{m.evidenceSummary}</p>
          {m.evidenceUrl && (
            <a className="mt-1 inline-block break-all text-indigo-700 hover:underline" href={m.evidenceUrl} target="_blank" rel="noopener noreferrer nofollow">
              {m.evidenceUrl}
            </a>
          )}
        </div>
      )}

      {m.status !== 'PENDING' && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          {(['FIELD_STAFF', 'VALIDATOR'] as const).map((role) => {
            const s = m.signoffs.find((x) => x.signerRole === role);
            return (
              <div key={role} className={`rounded-md border p-2 ${s ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="text-slate-500">{SIGNER_LABEL[role]}</div>
                {s ? (
                  <div className="text-emerald-800">✓ {s.signer.name} · {formatDateTime(s.signedAt)}{s.note && <div className="text-slate-600">“{s.note}”</div>}</div>
                ) : (
                  <div className="text-slate-500">Pending</div>
                )}
              </div>
            );
          })}
          <div className={`rounded-md border p-2 ${m.paymentReleasedAt ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
            <div className="text-slate-500">Payment</div>
            {m.paymentReleasedAt ? (
              <div className="text-emerald-800">✓ {formatInr(m.paymentTrancheInr)} released {formatDateTime(m.paymentReleasedAt)} <span className="text-slate-500">(simulated)</span></div>
            ) : m.status === 'COMPLETE' && isFinal ? (
              <div className="text-indigo-800">Held until the validator&apos;s outcome report (Stage 7)</div>
            ) : (
              <div className="text-slate-500">Released automatically on both sign-offs</div>
            )}
          </div>
        </div>
      )}

      {canSubmit && m.status === 'PENDING' && previousComplete && pilotRunning && (
        <SubmitEvidence applicationId={applicationId} sequence={m.sequence} resubmission={!!m.returnNote} onDone={onDone} />
      )}
      {signerRole && m.status === 'SUBMITTED' && !iSigned && pilotRunning && (
        pilotAtRisk ? (
          <p className="mt-3 text-xs text-orange-800">Sign-off paused while the pilot is at risk.</p>
        ) : (
          <SignOff applicationId={applicationId} sequence={m.sequence} role={signerRole} onDone={onDone} />
        )
      )}
    </div>
  );
}

function SubmitEvidence({ applicationId, sequence, resubmission, onDone }: { applicationId: string; sequence: number; resubmission: boolean; onDone: () => void }) {
  const [evidenceSummary, setSummary] = useState('');
  const [evidenceUrl, setUrl] = useState('');
  const submit = useMutation({
    mutationFn: () => api(`/applications/${applicationId}/milestones/${sequence}/submit`, { body: { evidenceSummary, evidenceUrl } }),
    onSuccess: onDone,
  });
  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <textarea
        className="input min-h-20 text-sm"
        placeholder="What was delivered, where, and how it can be checked on site (min 20 characters)"
        value={evidenceSummary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <input className="input text-sm" placeholder="Link to evidence (optional, https://…)" value={evidenceUrl} onChange={(e) => setUrl(e.target.value)} />
      <ErrorBox error={submit.error} />
      <button className="btn-primary" disabled={evidenceSummary.trim().length < 20 || submit.isPending} onClick={() => submit.mutate()}>
        {resubmission ? 'Resubmit milestone' : 'Submit milestone for sign-off'}
      </button>
    </div>
  );
}

function SignOff({ applicationId, sequence, role, onDone }: { applicationId: string; sequence: number; role: 'FIELD_STAFF' | 'VALIDATOR'; onDone: () => void }) {
  const [note, setNote] = useState('');
  const sign = useMutation({
    mutationFn: (decision: 'APPROVE' | 'RETURN') => api(`/applications/${applicationId}/milestones/${sequence}/signoff`, { body: { decision, note } }),
    onSuccess: onDone,
  });
  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-600">
        Sign off as <strong>{SIGNER_LABEL[role]}</strong>. Approve only what you have checked yourself; returning it voids any approval
        already given, and the startup sees your reason.
      </p>
      <textarea className="input min-h-16 text-sm" placeholder="Note (required to return, min 10 characters)" value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorBox error={sign.error} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={sign.isPending} onClick={() => sign.mutate('APPROVE')}>Approve</button>
        <button className="btn-secondary" disabled={sign.isPending || note.trim().length < 10} onClick={() => sign.mutate('RETURN')}>Return for rework</button>
      </div>
    </div>
  );
}

// ─── Commitment Card tracker ────────────────────────────────────────────────

const STANDING: Record<CommitmentStanding, { label: string; tone: string }> = {
  MET_ON_TIME: { label: 'Met on time', tone: 'bg-emerald-100 text-emerald-800' },
  MET_LATE: { label: 'Met late', tone: 'bg-amber-100 text-amber-800' },
  OVERDUE: { label: 'Overdue', tone: 'bg-rose-100 text-rose-800' },
  OPEN: { label: 'Open', tone: 'bg-slate-100 text-slate-600' },
};

function ScoreCard({ party, score }: { party: string; score: PartyScore }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs font-semibold text-slate-700">{party}</div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
        <span className="text-emerald-700"><strong className="text-base">{score.metOnTime}</strong> on time</span>
        <span className="text-amber-700"><strong className="text-base">{score.metLate}</strong> late</span>
        <span className="text-rose-700"><strong className="text-base">{score.overdue}</strong> overdue</span>
        <span className="text-slate-500">of {score.total}</span>
      </div>
    </div>
  );
}

function CommitmentTracker({ data }: { data: PilotView }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Commitment Card — live</h3>
        <p className="text-xs text-slate-500">Updated automatically from pilot events. The department is held to the same dates as the startup.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ScoreCard party="Department" score={data.commitmentScore.DEPARTMENT} />
        <ScoreCard party="Startup" score={data.commitmentScore.STARTUP} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-3 py-2">Party</th><th className="px-3 py-2">Commitment</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Standing</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.commitments.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">{c.party === 'DEPARTMENT' ? 'Department' : 'Startup'}</td>
                <td className="px-3 py-2">{c.description}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(c.dueDate)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${STANDING[c.standing].tone}`}>{STANDING[c.standing].label}</span>
                  {c.resolvedAt && <span className="ml-1 text-slate-500">{formatDate(c.resolvedAt)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
