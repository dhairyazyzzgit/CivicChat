import L from 'leaflet';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { STREET_TILES } from '../lib/mapTiles';
import { Link, useParams } from 'react-router-dom';
import { categoryIcon, categoryLabel, formatDate, relativeTime, statusStyle } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import ResolutionFeedback from '../components/common/ResolutionFeedback';

const PIN_ICON = L.divIcon({
  className: 'custom-map-pin',
  html: `
    <div style="position: relative; width: 18px; height: 18px;">
      <div style="position: absolute; left: 50%; top: 50%; width: 12px; height: 12px; background: #0f766e; border: 2px solid white; border-radius: 9999px; transform: translate(-50%, -50%); box-shadow: 0 3px 8px rgba(15,118,110,0.30);"></div>
      <div style="position: absolute; left: 50%; bottom: -7px; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid #0f766e; transform: translateX(-50%);"></div>
    </div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 18],
  popupAnchor: [0, -18],
});

function MapInvalidator({ lat, lng }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map]);

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], 16);
    }
  }, [map, lat, lng]);

  return null;
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-pulse">
      <div className="h-6 w-32 rounded bg-slate-200" />
      <div className="h-10 w-3/4 rounded bg-slate-200" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-72 w-full rounded-2xl bg-slate-200" />
        <div className="h-72 w-full rounded-2xl bg-slate-200" />
      </div>
    </div>
  );
}

function ReportDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [group, setGroup] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const loadReportData = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      // 1. Load the report by ID (RLS ensures citizen or admin access)
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('id, user_id, group_id, image_url, confirmed_category, address, note, created_at, ai_category, ai_severity, ai_description, ai_confidence')
        .eq('id', id)
        .maybeSingle();

      if (reportError) {
        throw reportError;
      }

      if (!reportData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setReport(reportData);

      // 2. Load the issue group from issue_groups_ranked (NEVER select location!)
      if (reportData.group_id) {
        const { data: groupData, error: groupError } = await supabase
          .from('issue_groups_ranked')
          .select('id, ticket_code, status, report_count, reporter_count, category, severity, address, ward, department_name, created_at, updated_at, resolved_at, resolution_proof_url, resolution_note, lat, lng, days_open, priority_score, reopen_count')
          .eq('id', reportData.group_id)
          .maybeSingle();

        if (!groupError && groupData) {
          setGroup(groupData);
        }

        // 3. Load status_logs for the group
        const { data: logsData } = await supabase
          .from('status_logs')
          .select('id, from_status, to_status, note, proof_url, created_at')
          .eq('group_id', reportData.group_id)
          .order('created_at', { ascending: true });

        if (Array.isArray(logsData)) {
          setLogs(logsData);
        }
      }
    } catch (err) {
      console.error('Failed to load report details:', err);
      setError('Unable to load report details. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let isMounted = true;
    loadReportData();
    return () => {
      isMounted = false;
    };
  }, [loadReportData]);

  // Determine timeline status milestones
  const timeline = useMemo(() => {
    const currentStatus = String(group?.status || 'submitted').toLowerCase();

    // Submitted timestamp
    const submittedTime = report?.created_at || group?.created_at;

    // Processing timestamp (from status_logs or group updated_at)
    const lastLog = (to) => [...logs].reverse().find((l) => l.to_status === to);
    const procLog = lastLog('processing');
    const processingTime =
      currentStatus === 'processing' || currentStatus === 'resolved' ? procLog?.created_at || group?.updated_at : null;

    // Resolved timestamp (from group resolved_at or status_logs)
    const resLog = lastLog('resolved');
    const resolvedTime = currentStatus === 'resolved' ? group?.resolved_at || resLog?.created_at || null : null;

    return [
      {
        id: 'submitted',
        label: 'Submitted',
        description: 'Issue reported and recorded in municipal system',
        timestamp: submittedTime,
        reached: true,
        current: currentStatus === 'submitted',
      },
      {
        id: 'processing',
        label: 'Processing',
        description: 'Assigned to field inspection team for resolution',
        timestamp: processingTime,
        reached: currentStatus === 'processing' || currentStatus === 'resolved',
        current: currentStatus === 'processing',
      },
      {
        id: 'resolved',
        label: 'Resolved',
        description: 'Work completed and verified by municipal supervisor',
        timestamp: resolvedTime,
        reached: currentStatus === 'resolved',
        current: currentStatus === 'resolved',
      },
    ];
  }, [report, group, logs]);

  // Loading state
  if (loading) {
    return (
      <main className="min-h-[calc(100vh-72px)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <DetailSkeleton />
      </main>
    );
  }

  // Not Found state
  if (notFound) {
    return (
      <main className="min-h-[calc(100vh-72px)] flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="flex max-w-md flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <AlertCircle size={28} />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">Report not found</h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
            This report does not exist or you do not have permission to view it.
          </p>
          <Link
            to="/reports"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-blue-800"
          >
            <ArrowLeft size={15} />
            <span>Back to My Reports</span>
          </Link>
        </div>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="min-h-[calc(100vh-72px)] flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="flex max-w-md flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-900">Something went wrong</h2>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
          <button
            type="button"
            onClick={loadReportData}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800"
          >
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
        </div>
      </main>
    );
  }

  const status = group?.status || 'submitted';
  const style = statusStyle(status);
  const cat = report?.confirmed_category || group?.category;
  const icon = categoryIcon(cat);
  const label = categoryLabel(cat);
  const ticketCode = group?.ticket_code || 'Pending';
  const hasCoords = Number.isFinite(group?.lat) && Number.isFinite(group?.lng);

  return (
    <main className="min-h-[calc(100vh-72px)] bg-slate-50 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-4xl space-y-10">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 transition hover:text-slate-900"
            aria-label="Back to My Reports"
          >
            <ArrowLeft size={16} />
            <span>My Reports</span>
          </Link>

          <span className="font-mono text-xs font-semibold text-slate-400">
            {ticketCode}
          </span>
        </div>

        {/* Hero Card */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display inline-flex items-center gap-1.5 text-2xl text-slate-900 sm:text-3xl">
                  <span>{icon}</span>
                  <span>{label}</span>
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style.pill}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  <span>{style.label}</span>
                </span>
                {group?.reopen_count > 0 && (
                  <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                    Reopened{group.reopen_count > 1 ? ` x${group.reopen_count}` : ''}
                  </span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Calendar size={13} className="text-slate-400" />
                <span>Reported on {formatDate(report?.created_at)} ({relativeTime(report?.created_at)})</span>
              </p>
            </div>

            {/* Duplicate Count Badge */}
            {group?.reporter_count > 1 && (
              <div className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 ring-1 ring-blue-600/20 self-start sm:self-auto">
                <Users size={15} className="text-blue-700" />
                <span>{group.reporter_count} people reported this issue</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
            {/* Left: Original Photo */}
            <div className="p-6 sm:p-8">
              <span className="block eyebrow mb-2">
                Citizen Photo
              </span>
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {report?.image_url ? (
                  <img
                    src={report.image_url}
                    alt={label}
                    className="h-64 sm:h-72 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-64 sm:h-72 w-full items-center justify-center text-slate-400">
                    <FileText size={32} />
                  </div>
                )}
              </div>
            </div>

            {/* Right: Vertical Timeline */}
            <div className="p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <span className="block eyebrow mb-4">
                  Status Progress
                </span>

                <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {timeline.map((step, idx) => {
                    const isPassed = step.reached;
                    const isCurrent = step.current;

                    return (
                      <div key={step.id} className="relative">
                        {/* Dot */}
                        <div
                          className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white transition-colors ${
                            isCurrent
                              ? 'border-blue-600 ring-4 ring-blue-50'
                              : isPassed
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 text-transparent'
                          }`}
                        >
                          {isPassed && !isCurrent && <CheckCircle2 size={12} className="text-white" />}
                          {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                        </div>

                        {/* Text */}
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h2
                              className={`text-xs sm:text-sm font-bold ${
                                isCurrent
                                  ? 'text-blue-900'
                                  : isPassed
                                    ? 'text-slate-800'
                                    : 'text-slate-400'
                              }`}
                            >
                              {step.label}
                            </h2>

                            {step.timestamp && (
                              <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                                <Clock size={11} />
                                {formatDate(step.timestamp)}
                              </span>
                            )}
                          </div>
                          <p className={`mt-0.5 text-[11px] ${isPassed ? 'text-slate-500' : 'text-slate-400'}`}>
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Department & Severity Row */}
              <div className="mt-8 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Building2 size={15} className="text-blue-700 flex-shrink-0" />
                  <div>
                    <span className="block eyebrow !text-[9.5px]">
                      Assigned Department
                    </span>
                    <span className="font-semibold text-slate-800">
                      {group?.department_name || 'Municipal Works'}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="block eyebrow !text-[9.5px]">
                    Severity
                  </span>
                  <span className="font-semibold capitalize text-slate-700">
                    {group?.severity || 'Medium'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Location & Map Card */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <div className="p-6 sm:p-8 border-b border-slate-100">
            <span className="block eyebrow mb-1">
              Location & Address
            </span>
            <p className="flex items-start gap-1.5 text-xs sm:text-sm font-medium text-slate-800">
              <MapPin size={16} className="mt-0.5 flex-shrink-0 text-blue-600" />
              <span>{report?.address || group?.address || 'Pinned location'}</span>
            </p>
          </div>

          {/* Mini Non-interactive Leaflet Map */}
          {hasCoords && (
            <div className="leaflet-map-shell relative h-48 w-full bg-slate-100 sm:h-56">
              <MapContainer
                center={[group.lat, group.lng]}
                zoom={16}
                scrollWheelZoom={false}
                dragging={false}
                zoomControl={false}
                doubleClickZoom={false}
                touchZoom={false}
                className="h-full w-full pointer-events-none"
              >
                <MapInvalidator lat={group.lat} lng={group.lng} />
                <TileLayer {...STREET_TILES} />
                <Marker position={[group.lat, group.lng]} icon={PIN_ICON} />
              </MapContainer>
            </div>
          )}
        </div>

        {/* AI & Citizen Notes Card */}
        {(report?.ai_description || report?.note) && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-md">
            <div className="flex items-center gap-2 text-blue-700 mb-4">
              <FileText size={16} />
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                Issue Analysis & Notes
              </h2>
            </div>

            {report?.ai_description && (
              <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-5 mb-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-800 mb-2">
                  Issue Detection
                </span>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {report.ai_description}
                </p>
              </div>
            )}

            {report?.note && (
              <div>
                <span className="block eyebrow !text-[9.5px] mb-1">
                  Citizen Notes
                </span>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {report.note}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Resolution Proof Section (Only when resolved) */}
        {status === 'resolved' && (
          <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/30 p-6 sm:p-8 shadow-md">
            <div className="flex items-center gap-2 text-emerald-800 mb-4">
              <CheckCircle2 size={18} />
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                Resolution Proof & Official Notes
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {group?.resolution_proof_url && (
                <div>
                  <span className="block eyebrow mb-2">
                    Supervisor Proof Photo
                  </span>
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xs">
                    <img
                      src={group.resolution_proof_url}
                      alt="Resolution proof"
                      className="h-56 sm:h-64 w-full object-cover"
                    />
                    <a
                      href={group.resolution_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white shadow-xs backdrop-blur-xs hover:bg-slate-900"
                    >
                      <ExternalLink size={11} />
                      <span>Full view</span>
                    </a>
                  </div>
                </div>
              )}

              <div className="flex flex-col justify-center">
                <span className="block eyebrow mb-1">
                  Department Resolution Note
                </span>
                <div className="rounded-2xl border border-emerald-200/80 bg-white p-4 text-xs sm:text-sm text-slate-700 shadow-xs">
                  <p>{group?.resolution_note || 'Issue inspected, repaired, and verified resolved.'}</p>
                  {group?.resolved_at && (
                    <p className="mt-3 text-[11px] text-slate-400">
                      Closed on {formatDate(group.resolved_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Citizen satisfaction check (only the person who reported, only while resolved) */}
        {status === 'resolved' && group && report?.user_id === user?.id && (
          <ResolutionFeedback group={group} userId={user?.id} onReopened={loadReportData} />
        )}
      </div>
    </main>
  );
}

export default ReportDetailPage;
