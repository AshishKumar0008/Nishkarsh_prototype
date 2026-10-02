import { APPLICATION_STAGE, STAGES, type ApplicationState } from '@nishkarsh/shared';

const STOPPED: ApplicationState[] = ['INELIGIBLE', 'REJECTED', 'TERMINATED'];

/** The 9-stage pathway, with the application's current position highlighted. */
export default function StageTimeline({ state }: { state: ApplicationState }) {
  const current = APPLICATION_STAGE[state];
  const stopped = STOPPED.includes(state);

  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-9">
      {STAGES.map((s) => {
        const done = s.n < current || state === 'SCALED';
        const active = s.n === current && state !== 'SCALED';
        const tone = active
          ? stopped
            ? 'border-rose-400 bg-rose-50 text-rose-800'
            : 'border-indigo-500 bg-indigo-50 text-indigo-900'
          : done
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-slate-200 bg-white text-slate-400';
        return (
          <li key={s.n} className={`rounded-md border px-2 py-2 text-center text-xs ${tone}`}>
            <div className="font-semibold">{done ? '✓' : s.n}</div>
            <div className="leading-tight">{s.name}</div>
          </li>
        );
      })}
    </ol>
  );
}
