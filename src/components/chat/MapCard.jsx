import L from 'leaflet';
import { Layers, Loader2, Locate, MapPin, Pencil, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { forwardGeocode, reverseGeocode } from '../../lib/geocode';
import { SATELLITE_TILES, STREET_TILES } from '../../lib/mapTiles';
import { acquireBrowserPosition, isValidCoords, locationStateMessage } from '../../lib/location';

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
  const [locationHint, setLocationHint] = useState('');
  const [browserLocationUnavailable, setBrowserLocationUnavailable] = useState(false);
  const [typedAddress, setTypedAddress] = useState('');
  const [showTyped, setShowTyped] = useState(!initialHasCoords || manualMode);
  const [isFinding, setIsFinding] = useState(false);
  const [findHint, setFindHint] = useState('');
  const [satellite, setSatellite] = useState(false);
  // who placed the pin: 'none' (auto GPS/photo), 'find' (from typed address), 'drag' (user placed it)
  const [pinSetBy, setPinSetBy] = useState('none');

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
    setPinSetBy('drag');
    setSource('manual');
    triggerGeocode(nextLat, nextLng);
  };

  const handleUseCurrentLocation = async () => {
    setIsGettingPosition(true);
    setLocationHint(locationStateMessage('initializing'));
    try {
      const pos = await acquireBrowserPosition({
        onState: (phase) => setLocationHint(locationStateMessage(phase)),
      });
      setCoords({ lat: pos.lat, lng: pos.lng });
      setAccuracy(pos.accuracy);
      setSource('gps');
      setHasUserMovedPin(true);
      setPinSetBy('drag');
      triggerGeocode(pos.lat, pos.lng);
      setLocationHint('');
    } catch (err) {
      setLocationHint(locationStateMessage(err?.code || 'unavailable'));
      if (err?.code === 'denied' || err?.code === 'unsupported') {
        setBrowserLocationUnavailable(true);
      }
    } finally {
      setIsGettingPosition(false);
    }
  };

  const needsFind = typedAddress.trim().length > 0 && pinSetBy === 'none';

  const handleConfirm = async () => {
    if (confirmedRef.current || isSaving || isFinding) return;
    // A typed address means "this is the location": move the pin there first, then let the user confirm
    if (needsFind) {
      const ok = await handleFindTyped();
      if (ok) {
        setShowTyped(true);
        setMode('adjust');
      }
      return;
    }
    if (mode === 'manual' && !hasUserMovedPin) return;

    confirmedRef.current = true;
    onConfirm?.({
      lat: coords.lat,
      lng: coords.lng,
      address:
        typedAddress.trim().slice(0, 200) ||
        address ||
        `Pinned location (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
      ward: ward || null,
      source,
    });
  };

  // Drop the pin near the typed address (user can fine-tune, then confirm)
  const handleFindTyped = async () => {
    const q = typedAddress.trim();
    if (q.length < 3 || isFinding || isSaving) return false;
    setIsFinding(true);
    setFindHint('');
    const found = await forwardGeocode(q);
    setIsFinding(false);
    if (!found) {
      setFindHint("Couldn't find that on the map. Add the area or city, or switch to 'Adjust pin' and tap the map.");
      return false;
    }
    setCoords(found);
    setAccuracy(30);
    setSource('manual');
    setHasUserMovedPin(true);
    setPinSetBy('find');
    setFindHint('Pin placed near this address. Drag it to fine-tune, then confirm.');
    return true;
  };

  const handleSwitchToAdjust = () => {
    setShowTyped(true);
    setMode('adjust');
    onAdjust?.();
  };

  const canConfirm = !isSaving && !isFinding && (needsFind || mode !== 'manual' || hasUserMovedPin);
  const isAdjustOrManual = mode === 'adjust' || mode === 'manual';

  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-[22px] rounded-tl-md border border-slate-200 bg-white shadow-md">
      <div className="leaflet-map-shell relative h-[240px] w-full overflow-hidden rounded-t-[22px] border-b border-slate-200 bg-slate-100">
        <MapContainer
          center={[coords.lat, coords.lng]}
          zoom={accuracy < 100 ? 17 : 15}
          scrollWheelZoom={false}
          zoomControl={false}
          maxZoom={20}
          className="h-[240px] w-full"
        >
          <ZoomControl position="bottomright" />
          <MapController coords={coords} accuracy={accuracy} />
          <MapClickHandler onMapClick={handlePinMove} enabled={isAdjustOrManual} />
          <TileLayer key={satellite ? 'sat' : 'street'} {...(satellite ? SATELLITE_TILES : STREET_TILES)} />
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

        <button
          type="button"
          onClick={() => setSatellite((v) => !v)}
          title={satellite ? 'Show map' : 'Show satellite'}
          aria-label={satellite ? 'Show map view' : 'Show satellite view'}
          className="absolute bottom-2 left-2 z-50 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow ring-1 ring-slate-200 transition hover:bg-white active:scale-95"
        >
          <Layers size={13} className="text-primary" />
          {satellite ? 'Map' : 'Satellite'}
        </button>

        {isAdjustOrManual && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-50 flex justify-center">
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

        {showTyped ? (
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <Pencil size={11} className="text-primary" />
              Or type the address / landmark
            </label>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1 transition focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-600/15">
              <input
                type="text"
                value={typedAddress}
                maxLength={200}
                disabled={isSaving}
                onChange={(e) => {
                  setTypedAddress(e.target.value);
                  setPinSetBy((p) => (p === 'find' ? 'none' : p));
                  if (findHint) setFindHint('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (mode !== 'confirm') handleFindTyped();
                  }
                }}
                placeholder="e.g. Near City Mall, 5th Cross, Indiranagar"
                className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
              />
              {mode !== 'confirm' && (
                <button
                  type="button"
                  onClick={handleFindTyped}
                  disabled={isSaving || isFinding || typedAddress.trim().length < 3}
                  title="Find on map"
                  aria-label="Find on map"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isFinding ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
              )}
            </div>
            {findHint && <p className="text-[11px] leading-snug text-slate-500">{findHint}</p>}
            {needsFind && (
              <p className="text-[11px] leading-snug text-slate-500">I'll place the pin at this address; you can fine-tune it before confirming.</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTyped(true)}
            disabled={isSaving}
            className="flex items-center gap-1.5 text-[11px] font-medium text-blue-700 transition hover:text-blue-800 disabled:opacity-50"
          >
            <Pencil size={11} />
            Type the address instead
          </button>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {mode === 'confirm' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="btn btn-primary flex-1 !min-h-11 !text-xs"
              >
                {isFinding ? 'Finding…' : needsFind ? 'Find on map' : "Yes, that's right"}
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
                      <span>{locationHint || 'Fetching your location…'}</span>
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
                className="btn btn-primary w-full !text-sm"
              >
                {isFinding ? 'Finding…' : needsFind ? 'Find on map' : 'Confirm location'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapCard;
