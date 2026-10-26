import L from 'leaflet';
import { Loader2, Locate, MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { reverseGeocode } from '../../lib/geocode';
import { getBrowserPosition, isValidCoords } from '../../lib/location';

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

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

function MapController({ coords, accuracy }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => map.invalidateSize(), 250);
    const container = map.getContainer();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(container);
    }
    return () => {
      clearTimeout(timer);
      ro?.disconnect();
    };
  }, [map]);

  useEffect(() => {
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      const zoom = accuracy !== undefined && accuracy < 100 ? 17 : 15;
      map.flyTo([coords.lat, coords.lng], zoom, { duration: 0.8 });
    }
  }, [map, coords?.lat, coords?.lng, accuracy]);

  return null;
}

function MapClickHandler({ onMapClick, enabled }) {
  useMapEvents({
    click(event) {
      if (enabled) {
        onMapClick(event.latlng.lat, event.latlng.lng);
      }
    },
  });
  return null;
}

function MapCard({
  latitude,
  longitude,
  address: initialAddress = '',
  ward: initialWard = null,
  source: initialSource = 'manual',
  accuracy: initialAccuracy = 20,
  manualMode = false,
  isSaving = false,
  onConfirm,
  onAdjust,
}) {
  const confirmedRef = useRef(false);
  const geocodeControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const initialHasCoords = isValidCoords(latitude, longitude);
  const [mode, setMode] = useState(manualMode ? 'manual' : (initialHasCoords ? 'confirm' : 'manual'));
  const [coords, setCoords] = useState(
    initialHasCoords ? { lat: latitude, lng: longitude } : INDIA_CENTER,
  );
  const [hasUserMovedPin, setHasUserMovedPin] = useState(initialHasCoords && !manualMode);
  const [source, setSource] = useState(initialSource);
  const [accuracy, setAccuracy] = useState(initialAccuracy);
  const [address, setAddress] = useState(initialAddress);
  const [ward, setWard] = useState(initialWard);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isGettingPosition, setIsGettingPosition] = useState(false);
  const [browserLocationUnavailable, setBrowserLocationUnavailable] = useState(false);

  useEffect(() => {
    if (initialAddress) {
      setAddress(initialAddress);
    }
    if (initialWard) {
      setWard(initialWard);
    }
  }, [initialAddress, initialWard]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (geocodeControllerRef.current) geocodeControllerRef.current.abort();
    };
  }, []);

  const triggerGeocode = (lat, lng) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (geocodeControllerRef.current) geocodeControllerRef.current.abort();

    setIsGeocoding(true);

    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      geocodeControllerRef.current = controller;

      try {
        const geoResult = await reverseGeocode(lat, lng, controller.signal);
        if (!controller.signal.aborted) {
          setAddress(geoResult.address);
          setWard(geoResult.ward);
        }
      } catch {
        // Fallback handled inside reverseGeocode
      } finally {
        if (!controller.signal.aborted) {
          setIsGeocoding(false);
        }
      }
    }, 600);
  };

  const handlePinMove = (nextLat, nextLng) => {
    setCoords({ lat: nextLat, lng: nextLng });
    setHasUserMovedPin(true);
    setSource('manual');
    triggerGeocode(nextLat, nextLng);
  };

  const handleUseCurrentLocation = async () => {
    setIsGettingPosition(true);
    try {
      const pos = await getBrowserPosition();
      setCoords({ lat: pos.lat, lng: pos.lng });
      setAccuracy(pos.accuracy);
      setSource('gps');
      setHasUserMovedPin(true);
      triggerGeocode(pos.lat, pos.lng);
    } catch (err) {
      if (err?.code === 'denied' || err?.code === 'unsupported') {
        setBrowserLocationUnavailable(true);
      }
    } finally {
      setIsGettingPosition(false);
    }
  };

  const handleConfirm = () => {
    if (confirmedRef.current || isSaving) return;
    if (mode === 'manual' && !hasUserMovedPin) return;

    confirmedRef.current = true;
    onConfirm?.({
      lat: coords.lat,
      lng: coords.lng,
      address: address || `Pinned location (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
      ward: ward || null,
      source,
    });
  };

  const handleSwitchToAdjust = () => {
    setMode('adjust');
    onAdjust?.();
  };

  const canConfirm = !isSaving && (mode !== 'manual' || hasUserMovedPin);
  const isAdjustOrManual = mode === 'adjust' || mode === 'manual';

  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
      <div className="h-[240px] w-full overflow-hidden rounded-t-[22px] border-b border-slate-200 bg-slate-100 relative">
        <MapContainer
          center={[coords.lat, coords.lng]}
          zoom={accuracy < 100 ? 17 : 15}
          scrollWheelZoom={false}
          zoomControl={false}
          className="h-[240px] w-full"
        >
          <MapController coords={coords} accuracy={accuracy} />
          <MapClickHandler onMapClick={handlePinMove} enabled={isAdjustOrManual} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={[coords.lat, coords.lng]}
            draggable={isAdjustOrManual}
            icon={PIN_ICON}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const pos = marker.getLatLng();
                handlePinMove(pos.lat, pos.lng);
              },
            }}
          />
        </MapContainer>

        {isAdjustOrManual && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[1000] flex justify-center">
            <span className="rounded-full bg-slate-900/75 px-3 py-1 text-[11px] font-medium text-white shadow backdrop-blur-xs">
              Tap or drag pin to adjust
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin size={13} className="text-primary flex-shrink-0" />
              <span className="font-semibold uppercase tracking-[0.1em] text-[10px] text-slate-500">
                {source === 'photo' ? 'Photo GPS' : source === 'gps' ? 'Device GPS' : 'Pinned Location'}
              </span>
              {accuracy > 100 && (
                <span className="rounded-full bg-amber/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
                  Approximate location
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {isGeocoding && <Loader2 size={13} className="animate-spin text-primary flex-shrink-0" />}
              <p className="text-xs font-medium text-slate-800 line-clamp-2">
                {isGeocoding ? 'Looking up address...' : address || 'Locating spot...'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {mode === 'confirm' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-1 rounded-full bg-primary px-3 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0b5f5b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes, that's right
              </button>
              <button
                type="button"
                onClick={handleSwitchToAdjust}
                disabled={isSaving}
                className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Adjust pin
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {!browserLocationUnavailable && (
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isSaving || isGettingPosition}
                  className="flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGettingPosition ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-primary" />
                      <span>Locating you...</span>
                    </>
                  ) : (
                    <>
                      <Locate size={13} className="text-primary" />
                      <span>Use my current location</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="w-full rounded-full bg-primary px-3 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0b5f5b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm location
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapCard;
