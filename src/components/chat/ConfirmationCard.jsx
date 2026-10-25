import { Link } from 'react-router-dom';

function getSeverityClasses(severity = 'medium') {
  if (severity === 'high') {
    return 'bg-danger/10 text-danger';
  }

  if (severity === 'medium') {
    return 'bg-amber/15 text-amber-700';
  }

  return 'bg-success/10 text-success';
}

function getStatusClasses(status = 'submitted') {
  if (status === 'resolved') {
    return 'bg-success/10 text-success';
  }

  if (status === 'processing') {
    return 'bg-processing/10 text-processing';
  }

  return 'bg-slate-100 text-slate-600';
}

function ConfirmationCard({ reportCode, category, severity, address, department, status, reportId }) {
  const categoryLabel = category || 'Issue';

  return (
    <div className="w-full max-w-[340px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Report created</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-slate-900">{reportCode}</h3>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getStatusClasses(status)}`}>
          {status || 'submitted'}
        </span>
      </div>

      <div className="mt-4 space-y-3 text-sm text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <span>Category</span>
          <span className="font-semibold text-slate-800">{categoryLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Severity</span>
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getSeverityClasses(severity)}`}>
            {severity || 'medium'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Department</span>
          <span className="font-semibold text-slate-800">{department}</span>
        </div>
        <div className="pt-2">
          <span className="text-slate-500">Address</span>
          <p className="mt-1 text-slate-800">{address}</p>
        </div>
      </div>

      <Link
        to={`/reports/${reportId}`}
        className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5f5b]"
      >
        Track this report
      </Link>
    </div>
  );
}

export default ConfirmationCard;
