import { isHighPriority } from '../../lib/format';

function StatCard({ label, count, hint, tone = 'neutral', dot }) {
  const urgent = tone === 'urgent';
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${
        urgent ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-white' : 'border-slate-200 bg-white'
      } shadow-xs`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className={`display mt-3 text-4xl sm:text-5xl ${urgent && count > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{count}</p>
      {hint && <p className="mt-1.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function StatCards({ issues }) {
  const submitted = issues.filter((i) => i.status === 'submitted').length;
  const processing = issues.filter((i) => i.status === 'processing').length;
  const resolved = issues.filter((i) => i.status === 'resolved').length;
  // Open issues that are High or Critical (score 15+, or hazard severity)
  const highPriority = issues.filter((i) => i.status !== 'resolved' && isHighPriority(i)).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <StatCard label="Submitted" count={submitted} dot="bg-slate-400" />
      <StatCard label="Processing" count={processing} dot="bg-blue-500" />
      <StatCard label="Resolved" count={resolved} dot="bg-emerald-500" />
      <StatCard label="High priority" count={highPriority} hint="High + Critical, open" tone="urgent" dot="bg-rose-500" />
    </div>
  );
}
