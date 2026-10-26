import { ArrowRight, CheckCircle2, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_BY_ID } from '../../lib/categories';

function getSeverityClasses(severity = 'medium') {
  if (severity === 'high' || severity === 'hazard') {
    return 'bg-rose-50 text-rose-700 border border-rose-200/80';
  }

  if (severity === 'medium') {
    return 'bg-amber-50 text-amber-800 border border-amber-200/80';
  }

  return 'bg-emerald-50 text-emerald-700 border border-emerald-200/80';
}

function getStatusClasses(status = 'submitted') {
  if (status === 'resolved') {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200/80';
  }

  if (status === 'processing') {
    return 'bg-blue-50 text-blue-700 border border-blue-200/80';
  }

  return 'bg-slate-100 text-slate-700 border border-slate-200/80';
}

function ConfirmationCard({ reportCode, category, severity, address, department, status, reportId }) {
  const catObj = CATEGORY_BY_ID[category];
  const categoryLabel = catObj?.label || category || 'Civic Issue';
  const categoryIcon = catObj?.icon || '📌';

  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)]">
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <CheckCircle2 size={16} />
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Ticket Number
            </span>
            <span className="font-mono text-sm font-bold text-slate-900">{reportCode}</span>
          </div>
        </div>

        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${getStatusClasses(status)}`}>
          {status || 'Submitted'}
        </span>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 py-3 text-xs">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Category
          </span>
          <span className="mt-0.5 inline-flex items-center gap-1 font-medium text-slate-800">
            <span>{categoryIcon}</span>
            <span>{categoryLabel}</span>
          </span>
        </div>

        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Severity
          </span>
          <span className={`mt-0.5 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize ${getSeverityClasses(severity)}`}>
            {severity || 'Medium'}
          </span>
        </div>

        <div className="col-span-2">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Assigned Department
          </span>
          <p className="mt-0.5 font-medium text-slate-800">{department}</p>
        </div>

        <div className="col-span-2">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Location
          </span>
          <p className="mt-0.5 flex items-start gap-1 font-normal text-slate-700">
            <MapPin size={12} className="mt-0.5 flex-shrink-0 text-teal-600" />
            <span className="line-clamp-2">{address}</span>
          </p>
        </div>
      </div>

      {/* Action CTA */}
      <Link
        to={`/reports/${reportId}`}
        className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-teal-800 active:scale-[0.98]"
      >
        <span>Track Report Status</span>
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

export default ConfirmationCard;
