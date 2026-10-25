import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import { reverseGeocode } from '../../lib/geocode';

const DEFAULT_CENTER = [20.5937, 78.9629];

function tealPinIcon() {
  return L.divIcon({
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
}

function UpdateMapCenter({ position, mapRef }) {
  const map = useMap();
  mapRef.current = map;

  useEffect(() => {
    if (!position || !Array.isArray(position) || position.length !== 2) {
      return;
    }

    map.setView(position, 12);
    setTimeout(() => map.invalidateSize(), 60);
  }, [map, position]);

  return null;
}

function MapCard({
  address,
  latitude,
  longitude,
  onConfirm,
  onAdjust,
  eventType,
  manualMode = false,
  onPositionChange,
}) {
  const mapRef = useRef(null);
  const [position, setPosition] = useState(
    Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : DEFAULT_CENTER,
  );
  const [pinAddress, setPinAddress] = useState(address || 'Loading address...');
  const [typedAddress, setTypedAddress] = useState(address || '');
  const [isAdjusting, setIsAdjusting] = useState(Boolean(manualMode));
  const [locationConfirmed, setLocationConfirmed] = useState(false);

  useEffect(() => {
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      setPosition([latitude, longitude]);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    if (address) {
      setPinAddress(address);
      setTypedAddress((current) => (current && current.trim() ? current : address));
    }
  }, [address]);

  useEffect(() => {
    const center = Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : DEFAULT_CENTER;
    setPosition(center);
  }, [latitude, longitude]);

  useEffect(() => {
    setIsAdjusting(Boolean(manualMode));
  }, [manualMode]);

  const confirmLocation = (nextAddress) => {
    const resolvedAddress = (nextAddress || typedAddress || pinAddress || address || 'Location unavailable').trim();
    const nextPosition = position?.length === 2 ? position : [latitude, longitude];

    setPinAddress(resolvedAddress);
    setTypedAddress(resolvedAddress);
    setLocationConfirmed(true);
    onConfirm?.({
      lat: nextPosition[0],
      lng: nextPosition[1],
      address: resolvedAddress,
    });
  };

  const handleDragEnd = async (event) => {
    const nextLat = Number(event.target.getLatLng().lat);
    const nextLng = Number(event.target.getLatLng().lng);
    const nextPoint = [nextLat, nextLng];
    setPosition(nextPoint);

    if (typeof onPositionChange === 'function') {
      onPositionChange(nextPoint);
    }

    const geocode = await reverseGeocode(nextLat, nextLng);
    const resolvedAddress = geocode.address || `${nextLat}, ${nextLng}`;
    setPinAddress(resolvedAddress);
    setTypedAddress(resolvedAddress);
  };

  const handleAdjustPin = () => {
    setIsAdjusting(true);
    setLocationConfirmed(false);
    onAdjust?.();
  };

  const statusText = useMemo(() => `📍 ${pinAddress || 'Location unavailable'}`, [pinAddress]);

  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
      <div className="h-[220px] w-full overflow-hidden rounded-t-[22px] border-b border-slate-200 bg-slate-100">
        <MapContainer
          center={position}
          zoom={12}
          scrollWheelZoom={false}
          zoomControl={false}
          style={{ height: '220px', width: '100%' }}
          whenReady={() => {
            if (mapRef.current) {
              setTimeout(() => mapRef.current.invalidateSize(), 0);
            }
          }}
        >
          <UpdateMapCenter position={position} mapRef={mapRef} />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={position}
            draggable={isAdjusting}
            icon={tealPinIcon()}
            eventHandlers={{
              dragend: handleDragEnd,
            }}
          />
        </MapContainer>
      </div>

      <div className="space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">{statusText}</p>
          <span className="rounded-full border border-primary/15 bg-primary/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            Location
          </span>
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Exact location (optional)
        </label>
        <input
          type="text"
          value={typedAddress}
          onChange={(event) => setTypedAddress(event.target.value)}
          placeholder="Enter a landmark or exact address"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 shadow-inner shadow-slate-200/50 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        />

        {!locationConfirmed && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {!isAdjusting ? (
              <>
                <button
                  type="button"
                  onClick={() => confirmLocation()}
                  className="flex-1 rounded-full bg-primary px-3 py-2.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,118,110,0.25)] transition hover:bg-[#0b5f5b]"
                >
                  Yes, that's right
                </button>
                <button
                  type="button"
                  onClick={handleAdjustPin}
                  className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Adjust pin
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsAdjusting(false);
                  confirmLocation();
                }}
                className="w-full rounded-full bg-primary px-3 py-2.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(15,118,110,0.25)] transition hover:bg-[#0b5f5b]"
              >
                Confirm Adjusted Pin
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MapCard;
