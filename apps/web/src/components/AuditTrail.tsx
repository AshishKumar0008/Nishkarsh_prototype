import { ROLE_LABELS, type ActorRole } from '@nishkarsh/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateTime, humanize } from '../lib/format';
import type { AuditEntry, ChainVerification } from '../lib/types';

/** Timestamped, hash-chained trail for one challenge or application. */
export default function AuditTrail({ entityType, entityId }: { entityType: 'CHALLENGE' | 'APPLICATION'; entityId: string }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['audit', entityType, entityId],
    queryFn: () => api<AuditEntry[]>(`/audit?entityType=${entityType}&entityId=${entityId}`),
  });
  const verify = useMutation({ mutationFn: () => api<ChainVerification>('/audit/verify') });

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Audit trail</h2>
        <div className="flex items-center gap-3">
          {verify.data && (
            <span className={`text-sm font-medium ${verify.data.valid ? 'text-emerald-700' : 'text-rose-700'}`}>
              {verify.data.valid
                ? `✓ Chain intact — ${verify.data.entriesChecked} entries verified`
                : `✗ Tampering detected at entry #${verify.data.firstBrokenSeq}: ${verify.data.reason}`}
            </span>
          )}
          <button className="btn-secondary px-3 py-1.5" onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? 'Verifying…' : 'Verify hash chain'}
          </button>
        </div>
      </div>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.seq} className="border-l-2 border-indigo-200 pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{humanize(e.action)}</span>
                <span className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
              </div>
              <div className="text-sm text-slate-600">
                {e.actor?.name ?? 'System'} · {ROLE_LABELS[e.actorRole as ActorRole] ?? e.actorRole}
                {e.fromState && e.toState && ` · ${humanize(e.fromState)} → ${humanize(e.toState)}`}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400" title={e.hash}>
                #{e.seq} · hash {e.hash.slice(0, 16)}… ← prev {e.prevHash.slice(0, 8)}…
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
