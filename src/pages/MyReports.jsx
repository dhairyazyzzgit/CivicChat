import { AlertCircle, FileText, Filter, MapPin, Plus, RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryIcon, categoryLabel, formatDate, relativeTime, statusStyle } from '../lib/format';
import { supabase } from '../lib/supabase';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'processing', label: 'Processing' },
  { id: 'resolved', label: 'Resolved' },
];

function ReportCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs animate-pulse">
      <div className="h-44 w-full bg-slate-200" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 rounded-full bg-slate-200" />
          <div className="h-5 w-16 rounded-full bg-slate-200" />
        </div>
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
      </div>
    </div>
  );
}

function MyReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch user's reports (RLS ensures user's reports only)
      const { data: userReports, error: repError } = await supabase
        .from('reports')
        .select('id, image_url, confirmed_category, address, created_at, group_id')
        .order('created_at', { ascending: false });

      if (repError) {
        throw repError;
      }

      if (!userReports || userReports.length === 0) {
        setReports([]);
        setLoading(false);
        return;
      }

      // 2. Extract unique group IDs and query issue_groups_ranked
      // NEVER select the 'location' column; lat and lng are already projected in the view
      const groupIds = [...new Set(userReports.map((r) => r.group_id).filter(Boolean))];

      let groupsMap = new Map();
      if (groupIds.length > 0) {
        const { data: groupRows, error: grpError } = await supabase
          .from('issue_groups_ranked')
          .select('id, ticket_code, status, report_count, category, severity, address, department_name, created_at, lat, lng')
          .in('id', groupIds);

        if (!grpError && Array.isArray(groupRows)) {
          groupRows.forEach((grp) => groupsMap.set(grp.id, grp));
        }
      }

      // 3. Merge report with issue group details
      const combined = userReports.map((report) => {
        const group = groupsMap.get(report.group_id) || null;
        return {
          ...report,
          group,
          status: group?.status || 'submitted',
          ticketCode: group?.ticket_code || 'Pending',
          reportCount: group?.report_count || 1,
        };
      });

      setReports(combined);
    } catch (err) {
      console.error('Failed to load reports:', err);
      setError('Unable to load your reports right now. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchReports();

    return () => {
      isMounted = false;
    };
  }, [fetchReports]);

  // Filter reports by status
  const filteredReports = useMemo(() => {
    if (activeFilter === 'all') return reports;
    return reports.filter((r) => String(r.status).toLowerCase() === activeFilter);
  }, [reports, activeFilter]);

  return (
    <main className="min-h-[calc(100vh-73px)] bg-slate-50/70 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">My Reports</h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Track the progress of civic issues you've reported in your neighborhood.
            </p>
          </div>

          <Link
            to="/chat"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800 active:scale-95 self-start sm:self-auto"
            aria-label="Report a new civic issue"
          >
            <Plus size={16} />
            <span>Report an issue</span>
          </Link>
        </div>

        {/* Filter Chips Bar */}
        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <Filter size={14} className="text-slate-400 mr-1 flex-shrink-0" />
          {FILTERS.map((f) => {
            const isActive = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  isActive
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100/60'
                }`}
                aria-label={`Filter by ${f.label}`}
              >
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="mt-6">
          {/* Loading Skeletons */}
          {loading && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <ReportCardSkeleton key={key} />
              ))}
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center sm:p-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <AlertCircle size={24} />
              </div>
              <h2 className="mt-4 text-base font-bold text-slate-900">Failed to load reports</h2>
              <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-600">{error}</p>
              <button
                type="button"
                onClick={fetchReports}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800"
                aria-label="Retry loading reports"
              >
                <RefreshCw size={14} />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Empty State - No reports at all */}
          {!loading && !error && reports.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200/90 bg-white p-8 text-center shadow-xs sm:p-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-600/20">
                <FileText size={26} />
              </div>
              <h2 className="mt-4 text-base sm:text-lg font-bold text-slate-900">No reports submitted yet</h2>
              <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-slate-500">
                See a broken streetlight, open pothole, or garbage pile? Report it through CivicBot in seconds.
              </p>
              <Link
                to="/chat"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800 active:scale-95"
                aria-label="Report your first issue"
              >
                <Plus size={16} />
                <span>Report an issue</span>
              </Link>
            </div>
          )}

          {/* Empty State - Filter returned 0 */}
          {!loading && !error && reports.length > 0 && filteredReports.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-xs">
              <p className="text-sm font-medium text-slate-700">No {activeFilter} reports found.</p>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="mt-3 text-xs font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2"
                aria-label="Clear active filter"
              >
                Show all reports
              </button>
            </div>
          )}

          {/* Reports Grid */}
          {!loading && !error && filteredReports.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReports.map((report) => {
                const thumbUrl = report.image_url ? report.image_url.replace(/\.jpg$/, '_t.jpg') : '';
                const style = statusStyle(report.status);
                const icon = categoryIcon(report.confirmed_category);
                const label = categoryLabel(report.confirmed_category);

                return (
                  <Link
                    key={report.id}
                    to={`/reports/${report.id}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    aria-label={`View report for ${label} - ticket ${report.ticketCode}`}
                  >
                    {/* Thumbnail Image */}
                    <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                      {report.image_url ? (
                        <img
                          src={thumbUrl}
                          alt={label}
                          onError={(e) => {
                            // Fallback to original image if thumbnail fails
                            if (e.target.src !== report.image_url) {
                              e.target.src = report.image_url;
                            }
                          }}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                          <FileText size={32} />
                        </div>
                      )}

                      {/* Status Pill Badge */}
                      <div className="absolute top-3 right-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-xs shadow-xs ${style.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          <span>{style.label}</span>
                        </span>
                      </div>

                      {/* Community Duplicate Badge */}
                      {report.reportCount > 1 && (
                        <div className="absolute bottom-3 left-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white shadow-xs backdrop-blur-xs">
                            <Users size={12} className="text-teal-300" />
                            <span>{report.reportCount} people reported</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        {/* Ticket & Category header */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            {report.ticketCode}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {relativeTime(report.created_at)}
                          </span>
                        </div>

                        <h2 className="mt-1.5 text-base font-bold text-slate-900 line-clamp-1 group-hover:text-teal-700 transition-colors">
                          <span className="mr-1.5">{icon}</span>
                          <span>{label}</span>
                        </h2>

                        {/* Address */}
                        <p className="mt-2 flex items-start gap-1 text-xs text-slate-600 line-clamp-2">
                          <MapPin size={13} className="mt-0.5 flex-shrink-0 text-teal-600" />
                          <span>{report.address || 'Location provided'}</span>
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                        <span>Reported on {formatDate(report.created_at)}</span>
                        <span className="font-semibold text-teal-700 group-hover:translate-x-0.5 transition-transform">
                          View details →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default MyReportsPage;
