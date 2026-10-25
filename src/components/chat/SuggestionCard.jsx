function getSeverityClasses(severity = 'medium') {
  if (severity === 'high') {
    return 'bg-danger/10 text-danger';
  }

  if (severity === 'medium') {
    return 'bg-amber/15 text-amber-700';
  }

  return 'bg-success/10 text-success';
}

function SuggestionCard({ category, severity, description, confidence }) {
  const label = category || 'Issue';
  const confidenceValue = typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'Low';

  return (
    <div className="w-full max-w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Suggested issue</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">{label}</h3>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getSeverityClasses(severity)}`}>
          {severity || 'medium'}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>Confidence</span>
        <span className="font-semibold text-slate-700">{confidenceValue}</span>
      </div>
    </div>
  );
}

export default SuggestionCard;
