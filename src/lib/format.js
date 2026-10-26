import { CATEGORY_BY_ID } from './categories';

export function categoryLabel(category) {
  if (!category) return 'Issue';
  return CATEGORY_BY_ID[category]?.label || category.replace(/_/g, ' ');
}

export function categoryIcon(category) {
  if (!category) return '📌';
  return CATEGORY_BY_ID[category]?.icon || '📌';
}

export function statusStyle(status = 'submitted') {
  const norm = String(status || '').toLowerCase();
  if (norm === 'resolved') {
    return {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      dot: 'bg-emerald-500',
      label: 'Resolved',
    };
  }

  if (norm === 'processing') {
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      pill: 'bg-blue-50 text-blue-700 border border-blue-200',
      dot: 'bg-blue-500',
      label: 'Processing',
    };
  }

  return {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    pill: 'bg-slate-100 text-slate-700 border border-slate-200',
    dot: 'bg-slate-400',
    label: 'Submitted',
  };
}

export function priorityBucket(score = 0) {
  const num = Number(score || 0);
  if (num >= 25) {
    return { label: 'Critical', score: num, className: 'bg-rose-50 text-rose-800 border-rose-200' };
  }
  if (num >= 15) {
    return { label: 'High', score: num, className: 'bg-orange-50 text-orange-800 border-orange-200' };
  }
  if (num >= 8) {
    return { label: 'Medium', score: num, className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  return { label: 'Low', score: num, className: 'bg-slate-100 text-slate-700 border-slate-200' };
}

export function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

export function relativeTime(dateString) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (Number.isNaN(diffMs)) return '';

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    const diffWeek = Math.floor(diffDay / 7);
    if (diffWeek < 5) return `${diffWeek}w ago`;

    return formatDate(dateString);
  } catch {
    return '';
  }
}
