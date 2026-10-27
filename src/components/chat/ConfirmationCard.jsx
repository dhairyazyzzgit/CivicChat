import { ArrowRight, Check, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_BY_ID } from '../../lib/categories';

function severityTone(severity = 'medium') {
  if (severity === 'hazard') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (severity === 'high') return 'bg-orange-50 text-orange-700 ring-orange-200';
  if (severity === 'medium') return 'bg-amber-50 text-amber-800 ring-amber-200';
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
}

function statusTone(status = 'submitted') {
  if (status === 'resolved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'processing') return 'bg-blue-50 text-blue-700 ring-blue-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <span className="eyebrow !text-[9.5px]">{label}</span>
      <div className="mt-1.5 text-sm font-medium text-slate-900">{children}</div>
    </div>
  );
}

function ConfirmationCard({ reportCode, category, severity, address, department, status, reportId }) {
  const catObj = CATEGORY_BY_ID[category];
  const categoryLabel = catObj?.label || category || 'Civic Issue';
  const categoryIcon = catObj?.icon || '📌';
  const severityLabel = severity === 'hazard' ? 'Critical hazard' : severity || 'medium';

  return (
    <div className="w-full max-w-[380px] overflow-hidden rounded-[24px] rounded-tl-md border border-slate-200 bg-white shadow-lg">
      {/* Success header */}
      <div className="dark-panel flex items-center gap-3 px-5 py-4 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-blue-100 ring-1 ring-white/20">
          <Check size={18} strokeWidth={2.6} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-none">Report submitted</p>
          <p className="mt-1.5 text-[11px] text-blue-100/70">We&apos;ve sent it to the right department</p>
        </div>
      </div>

      {/* Ticket */}
      <div className="border-b border-dashed border-slate-200 px-5 py-4">
        <span className="eyebrow !text-[9.5px]">Ticket number</span>
        <p className="mt-1.5 font-mono text-xl font-semibold tracking-tight text-slate-900">{reportCode}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4">
        <Field label="Category">
          <span className="inline-flex items-center gap-1.5"><span>{categoryIcon}</span>{categoryLabel}</span>
        </Field>
        <Field label="Priority">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ${severityTone(severity)}`}>
            {severityLabel}
          </span>
        </Field>
        <Field label="Department" className="col-span-2">{department}</Field>
        <Field label="Location" className="col-span-2">
          <span className="flex items-start gap-1.5 font-normal text-slate-700">
            <MapPin size={14} className="mt-0.5 flex-shrink-0 text-blue-700" />
            <span className="line-clamp-2">{address}</span>
          </span>
        </Field>
        <Field label="Status" className="col-span-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ${statusTone(status)}`}>
            {status || 'Submitted'}
          </span>
        </Field>
      </div>

      <div className="px-5 pb-5">
        <Link to={`/reports/${reportId}`} className="btn btn-primary group w-full">
          <span>Track this report</span>
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

export default ConfirmationCard;
