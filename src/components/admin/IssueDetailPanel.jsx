import {
  AlertCircle,
  Building2,
  Calendar,
  Clock,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { STREET_TILES } from '../../lib/mapTiles';
import { EvidenceLightbox } from '../common/EvidenceLightbox';
import { categoryIcon, categoryLabel, formatDate, relativeTime, statusStyle } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { ResolveForm } from './ResolveModal';

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

export function IssueDetailPanel({ issue, onClose, onUpdate }) {
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [lightbox, setLightbox] = useState({ open: false, index: 0, images: [] });
  const resolveSectionRef = useRef(null);
  const previousScrollRef = useRef(0);
  const scrollContainerRef = useRef(null);

  const loadDetails = useCallback(async () => {
    if (!issue?.id) return;

    setLoading(true);
    setError(null);

    try {
      const { data: reportsData, error: reportsError } = await supabase
        .from('reports')
        .select('id, image_url, ai_description, note, created_at')
        .eq('group_id', issue.id)
        .order('created_at', { ascending: false });

      if (reportsError) throw reportsError;
      setReports(reportsData || []);

      const { data: logsData, error: logsError } = await supabase
        .from('status_logs')
        .select('id, from_status, to_status, note, proof_url, created_at')
        .eq('group_id', issue.id)
        .order('created_at', { ascending: true });

      if (logsError) throw logsError;
      setLogs(logsData || []);
    } catch (err) {
      console.error('Failed to load issue details:', err);
      setError('Could not load issue details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [issue?.id]);

  useEffect(() => {
    loadDetails();
    setResolveOpen(false);
  }, [loadDetails]);

  const handleSetProcessing = async () => {
    if (!issue?.id || statusLoading) return;

    setStatusLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc('admin_update_status', {
        p_group_id: issue.id,
        p_new_status: 'processing',
        p_note: null,
      });

      if (rpcError) throw rpcError;
      onUpdate();
    } catch (err) {
      console.error('Failed to set processing:', err);
      setError('Could not mark this report as processing. Please try again.');
    } finally {
      setStatusLoading(false);
    }
  };

  const openResolve = () => {
    previousScrollRef.current = scrollContainerRef.current?.scrollTop || 0;
    setResolveOpen(true);
    requestAnimationFrame(() => {
      resolveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const closeResolve = () => {
    setResolveOpen(false);
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = previousScrollRef.current;
      }
    });
  };

  const handleResolveSuccess = () => {
    setResolveOpen(false);
    onUpdate();
    loadDetails();
  };

  const openEvidence = (index) => {
    const images = reports
      .filter((report) => report.image_url)
      .map((report, i) => ({
        src: report.image_url,
        alt: `Citizen photo evidence ${i + 1}`,
        caption: report.note || report.ai_description || relativeTime(report.created_at),
      }));
    setLightbox({ open: true, index, images });
  };

  if (!issue) return null;

  const style = statusStyle(issue.status);
  const hasCoords = Number.isFinite(issue.lat) && Number.isFinite(issue.lng);
  const evidenceImages = reports.filter((report) => report.image_url);

  return (
    <>
      <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:w-96 sm:rounded-l-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close issue details"
            >
              <X size={18} />
            </button>
            <span className="font-mono text-xs font-semibold text-slate-600">{issue.ticket_code}</span>
          </div>
          <button
            type="button"
            onClick={loadDetails}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Refresh issue details"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div ref={scrollContainerRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{categoryIcon(issue.category)}</span>
                <span className="font-bold text-slate-900">{categoryLabel(issue.category)}</span>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.pill}`}>{style.label}</span>
            </div>
            <div className="space-y-1 text-xs text-slate-600">
              <p className="flex items-center gap-1.5">
                <MapPin size={13} className="text-teal-600" />
                <span className="truncate">{issue.address || 'Location provided'}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Building2 size={13} className="text-teal-600" />
                <span>{issue.department_name || 'Municipal Works'}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Users size={13} className="text-teal-600" />
                <span>
                  {issue.reporter_count || issue.report_count} reporter
                  {(issue.reporter_count || issue.report_count) > 1 ? 's' : ''}
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <Calendar size={13} className="text-teal-600" />
                <span>Opened {formatDate(issue.created_at)}</span>
              </p>
            </div>
          </div>

          {hasCoords && !resolveOpen && (
            <div className="leaflet-map-shell h-40 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              <MapContainer
                center={[issue.lat, issue.lng]}
                zoom={16}
                scrollWheelZoom={false}
                dragging={false}
                zoomControl={false}
                className="h-full w-full"
              >
                <MapInvalidator lat={issue.lat} lng={issue.lng} />
                <TileLayer {...STREET_TILES} />
                <Marker position={[issue.lat, issue.lng]} icon={PIN_ICON} />
              </MapContainer>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Status control</h3>
            <div className="flex flex-wrap gap-2">
              {issue.status === 'submitted' && (
                <button
                  type="button"
                  onClick={handleSetProcessing}
                  disabled={statusLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {statusLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Marking as processing…</span>
                    </>
                  ) : (
                    <>
                      <Clock size={14} />
                      <span>Mark as processing</span>
                    </>
                  )}
                </button>
              )}
              {(issue.status === 'submitted' || issue.status === 'processing') && !resolveOpen && (
                <button
                  type="button"
                  onClick={openResolve}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
                >
                  <FileText size={14} />
                  <span>Resolve report</span>
                </button>
              )}
              {issue.status === 'resolved' && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <FileText size={14} />
                  This report is resolved
                </span>
              )}
            </div>
          </div>

          {resolveOpen && (
            <div ref={resolveSectionRef}>
              <ResolveForm groupId={issue.id} onCancel={closeResolve} onSuccess={handleResolveSuccess} />
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              Citizen reports ({reports.length})
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={20} className="animate-spin text-slate-400" />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-xs text-slate-500">No citizen reports yet.</p>
            ) : (
              <div className="space-y-3">
                {reports.map((report, index) => (
                  <div key={report.id} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                    {report.image_url ? (
                      <button
                        type="button"
                        onClick={() => openEvidence(evidenceImages.findIndex((item) => item.id === report.id) === -1 ? index : evidenceImages.findIndex((item) => item.id === report.id))}
                        className="flex-shrink-0"
                        aria-label="View photo evidence"
                        title="View photo evidence"
                      >
                        <img
                          src={report.image_url}
                          alt="Citizen photo evidence"
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      </button>
                    ) : (
                      <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-slate-200" />
                    )}
                    <div className="min-w-0 flex-1">
                      {report.ai_description && (
                        <p className="mb-1 line-clamp-2 text-xs text-slate-700">{report.ai_description}</p>
                      )}
                      {report.note && <p className="line-clamp-2 text-[10px] italic text-slate-500">"{report.note}"</p>}
                      <p className="mt-1 text-[10px] text-slate-400">{relativeTime(report.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {logs.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Status history</h3>
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs">
                    <div className="flex-1">
                      <span className="font-medium text-slate-700">
                        {log.from_status ? log.from_status : 'New'} → {log.to_status}
                      </span>
                      {log.note && <p className="mt-0.5 text-slate-500">{log.note}</p>}
                      {log.proof_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightbox({
                              open: true,
                              index: 0,
                              images: [{ src: log.proof_url, alt: 'Resolution proof', caption: log.note || 'Resolution proof' }],
                            })
                          }
                          className="mt-0.5 block text-teal-600 hover:underline"
                        >
                          View photo evidence
                        </button>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-slate-400">{formatDate(log.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-rose-700">
              <AlertCircle size={16} />
              <p className="text-xs">{error}</p>
            </div>
          )}
        </div>
      </div>

      <EvidenceLightbox
        isOpen={lightbox.open}
        images={lightbox.images}
        startIndex={lightbox.index}
        onClose={() => setLightbox({ open: false, index: 0, images: [] })}
        title="View photo evidence"
      />
    </>
  );
}
