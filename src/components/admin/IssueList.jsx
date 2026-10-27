import { useMemo, useState } from 'react';
import { ArrowUpDown, MapPin, Search } from 'lucide-react';
import { categoryIcon, categoryLabel, formatDate, priorityBucket, statusStyle } from '../../lib/format';

const SORT_OPTIONS = [
  { id: 'priority', label: 'Priority' },
  { id: 'newest', label: 'Newest' },
  { id: 'count', label: 'Report Count' },
];

const STATUS_FILTERS = ['all', 'submitted', 'processing', 'resolved'];
const CATEGORIES = ['all', 'pothole', 'garbage', 'open_drain', 'waterlogging', 'electrical_hazard', 'streetlight', 'fallen_tree', 'other'];

export function IssueList({ issues, selectedId, onSelect, departments }) {
  const [sortBy, setSortBy] = useState('priority');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort issues
  const filteredIssues = useMemo(() => {
    let result = [...issues];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((i) => i.category === categoryFilter);
    }

    // Department filter
    if (departmentFilter !== 'all') {
      result = result.filter((i) => i.department_id === departmentFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.ticket_code?.toLowerCase().includes(q) ||
          i.address?.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'priority') {
        const rank = (i) => {
          const label = priorityBucket(i.priority_score, i.severity).label;
          return label === 'Critical' ? 3 : label === 'High' ? 2 : label === 'Medium' ? 1 : 0;
        };
        return rank(b) - rank(a) || (b.priority_score || 0) - (a.priority_score || 0);
      }
      if (sortBy === 'newest') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortBy === 'count') {
        return (b.report_count || 0) - (a.report_count || 0);
      }
      return 0;
    });

    return result;
  }, [issues, sortBy, statusFilter, categoryFilter, departmentFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search and Sort */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket or address..."
            className="w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm shadow-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              Sort: {opt.label}
          </option>
          ))}
        </select>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c === 'all' ? 'All Categories' : categoryLabel(c)}
            </option>
          ))}
        </select>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="max-h-[28rem] overflow-y-auto space-y-2.5 pr-1">
        {filteredIssues.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-500">No issues match your filters</p>
          </div>
        ) : (
          filteredIssues.map((issue) => {
            const style = statusStyle(issue.status);
            const bucket = priorityBucket(issue.priority_score, issue.severity);
            const isSelected = issue.id === selectedId;

            return (
              <button
                key={issue.id}
                type="button"
                onClick={() => onSelect(issue.id)}
                className={`w-full text-left rounded-xl border p-4 transition ${
                  isSelected
                    ? 'border-blue-700 bg-blue-50/60 ring-1 ring-blue-700'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-semibold text-slate-600">
                        {issue.ticket_code}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bucket.className}`}>
                        {bucket.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 mb-1">
                      <span>{categoryIcon(issue.category)}</span>
                      <span className="font-medium">{categoryLabel(issue.category)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <MapPin size={11} />
                      <span className="truncate">{issue.address || 'Location provided'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.pill}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      <span>{style.label}</span>
                    </span>
                    <span className="text-[10px] text-slate-400">{issue.reporter_count || issue.report_count} reporter{issue.reporter_count > 1 || issue.report_count > 1 ? 's' : ''}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
