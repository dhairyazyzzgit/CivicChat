import { CheckCircle2, Loader2, RotateCcw, Star, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REASONS = [
  'Problem is still there',
  'Only partly fixed',
  'Fixed, but it came back',
  'Wrong spot was worked on',
  'Something else',
];

function Stars({ value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rate the fix">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled || !onChange}
          onClick={() => onChange?.(value === n ? 0 : n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className="rounded p-0.5 transition active:scale-90 disabled:cursor-default"
        >
          <Star size={22} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
        </button>
      ))}
    </div>
  );
}

function ResolutionFeedback({ group, userId, onReopened }) {
  const cycle = Number(group?.reopen_count || 0);
  const [existing, setExisting] = useState(undefined); // undefined = loading, null = none
  const [choice, setChoice] = useState(null); // 'yes' | 'no'
  const [rating, setRating] = useState(0);
  const [reasonType, setReasonType] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setExisting(undefined);
    setChoice(null);
    setError('');
    if (!group?.id || !userId) return undefined;
    supabase
      .from('resolution_feedback')
      .select('satisfied, rating, created_at')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .eq('cycle', cycle)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setExisting(data || null);
      });
    return () => {
      alive = false;
    };
  }, [group?.id, userId, cycle]);

  if (existing === undefined) return null;

  if (existing) {
    return (
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 size={18} />
          <h2 className="text-sm font-bold text-slate-900">Thanks for your feedback</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">You confirmed this issue as fixed.</p>
        {existing.rating > 0 && <div className="mt-2"><Stars value={existing.rating} /></div>}
      </div>
    );
  }

  const resolvedAt = group?.resolved_at ? new Date(group.resolved_at).getTime() : null;
  if (resolvedAt && Date.now() - resolvedAt > WINDOW_MS) return null;
  const daysLeft = resolvedAt ? Math.max(1, Math.ceil((resolvedAt + WINDOW_MS - Date.now()) / 86400000)) : 7;
  const detailsOk = details.trim().length >= 10;

  const submit = async (satisfied) => {
    if (submitting) return;
    if (!satisfied && !detailsOk) {
      setError('Please tell us what is still wrong (at least 10 characters).');
      return;
    }
    setSubmitting(true);
    setError('');
    const reason = satisfied ? null : `${reasonType ? `${reasonType}: ` : ''}${details.trim()}`.slice(0, 500);
    const { data, error: rpcError } = await supabase.rpc('submit_resolution_feedback', {
      p_group_id: group.id,
      p_satisfied: satisfied,
      p_rating: rating || null,
      p_reason: reason,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message || 'Could not send your feedback. Please try again.');
      return;
    }
    if (data?.reopened) {
      onReopened?.();
    } else {
      setExisting({ satisfied: true, rating });
    }
  };

  return (
    <div className="rounded-3xl border border-teal-200/80 bg-white p-5 shadow-xs sm:p-6">
      <h2 className="text-sm font-bold text-slate-900">Is this issue really fixed?</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Your feedback helps the department. You can respond for the next {daysLeft} day{daysLeft > 1 ? 's' : ''}.
      </p>

      <div className="mt-3">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Rate the work (optional)
        </span>
        <Stars value={rating} onChange={setRating} disabled={submitting} />
      </div>

      {choice !== 'no' ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit(true)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
            Yes, it's fixed
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setChoice('no')}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            No, still a problem
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              What went wrong?
            </span>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReasonType(reasonType === r ? '' : r)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                    reasonType === r
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <textarea
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                if (error) setError('');
              }}
              maxLength={400}
              rows={3}
              placeholder="Describe what is still wrong, for example: the pothole was patched but has cracked again."
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            />
            <div className="mt-0.5 text-right text-[10px] text-slate-400">{details.length}/400</div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setChoice(null);
                setError('');
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={submitting || !detailsOk}
              onClick={() => submit(false)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reopen ticket
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

export default ResolutionFeedback;
