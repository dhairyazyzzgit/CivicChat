import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { STREET_TILES } from '../../lib/mapTiles';
import { priorityBucket } from '../../lib/format';

const PIN_ICON = L.divIcon({
  className: 'custom-map-pin',
  html: `
    <div style="position: relative; width: 20px; height: 20px;">
      <div style="position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; background: #0f766e; border: 2px solid white; border-radius: 9999px; transform: translate(-50%, -50%); box-shadow: 0 3px 8px rgba(15,118,110,0.30);"></div>
      <div style="position: absolute; left: 50%; bottom: -8px; width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-top: 11px solid #0f766e; transform: translateX(-50%);"></div>
    </div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 20],
  popupAnchor: [0, -20],
});

function MapBounds({ issues }) {
  const map = useMap();

  // Fit bounds when issues change
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only re-run when issues change
  useEffect(() => {
    if (issues && issues.length > 0) {
      const bounds = L.latLngBounds(
        issues
          .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
          .map((i) => [i.lat, i.lng])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [issues, map]);

  return null;
}

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export function IssueMap({ issues, selectedId, onSelect }) {
  const validIssues = issues.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng));

  return (
    <div className="leaflet-map-shell h-72 w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 sm:h-[28rem]">
      {validIssues.length > 0 ? (
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={5}
          className="h-full w-full"
        >
          <MapInvalidator />
          <MapBounds issues={validIssues} />
          <TileLayer {...STREET_TILES} />
          {validIssues.map((issue) => {
            const bucket = priorityBucket(issue.priority_score, issue.severity);
            const isSelected = issue.id === selectedId;
            const isResolved = issue.status === 'resolved';

            // Color by priority, green if resolved
            let color = '#64748b'; // slate
            if (isResolved) color = '#16a34a'; // green
            else if (bucket.label === 'Critical') color = '#dc2626'; // red
            else if (bucket.label === 'High') color = '#f97316'; // orange
            else if (bucket.label === 'Medium') color = '#f59e0b'; // amber
            else if (bucket.label === 'Low') color = '#64748b'; // slate

            // Radius grows with reporter_count
            const baseRadius = 8;
            const radius = isResolved ? baseRadius : baseRadius + Math.min((issue.reporter_count || issue.report_count) - 1, 6) * 2;

            const icon = L.divIcon({
              className: 'custom-map-marker',
              html: `
                <div style="
                  position: relative;
                  width: ${radius * 2}px;
                  height: ${radius * 2}px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                ">
                  <div style="
                    width: ${radius * 2}px;
                    height: ${radius * 2}px;
                    background: ${color};
                    border: ${isSelected ? '3px solid #0f766e' : '2px solid white'};
                    border-radius: 9999px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    ${isSelected ? 'transform: scale(1.1);' : ''}
                    transition: transform 0.2s;
                  "></div>
                  ${isSelected ? `
                    <div style="
                      position: absolute;
                      width: 8px;
                      height: 8px;
                      background: white;
                      border-radius: 9999px;
                    "></div>
                  ` : ''}
                </div>
              `,
              iconSize: [radius * 2, radius * 2],
              iconAnchor: [radius, radius],
            });

            return (
              <Marker
                key={issue.id}
                position={[issue.lat, issue.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onSelect(issue.id),
                }}
              />
            );
          })}
        </MapContainer>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <p className="text-sm">No issues with location data</p>
        </div>
      )}
    </div>
  );
}
