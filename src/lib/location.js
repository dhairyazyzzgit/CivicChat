export function isValidCoords(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function parseGeoOverride() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const geo = params.get('geo');
  if (!geo) return null;

  if (geo === 'denied' || geo === 'timeout' || geo === 'unsupported' || geo === 'unavailable') {
    return { error: geo };
  }

  const parts = geo.split(',').map((p) => Number(p.trim()));
  if (parts.length === 2 && isValidCoords(parts[0], parts[1])) {
    return { lat: parts[0], lng: parts[1], accuracy: 15, source: 'override' };
  }

  return null;
}

export function mapGeolocationError(error) {
  if (!error) return 'unavailable';
  if (error.code === 'denied' || error.code === 1) return 'denied';
  if (error.code === 'timeout' || error.code === 3) return 'timeout';
  if (error.code === 'unsupported') return 'unsupported';
  return 'unavailable';
}

export function locationStateMessage(state) {
  switch (state) {
    case 'initializing':
      return 'Preparing location access…';
    case 'prompt':
      return 'Allow location access to find your position. Your browser may ask for permission.';
    case 'fetching':
      return 'Fetching your location…';
    case 'denied':
      return 'Location access is blocked. Enable location permission in your browser settings to continue.';
    case 'timeout':
      return "Couldn't retrieve your location in time. Check that device location is on, then try again.";
    case 'unavailable':
      return "Couldn't retrieve your location. Check your device location settings, then try again.";
    case 'unsupported':
      return 'This browser cannot share location. Pin the spot on the map instead.';
    case 'success':
      return 'Location found.';
    default:
      return 'Preparing location access…';
  }
}

export async function queryGeolocationPermission() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status?.state === 'granted' || status?.state === 'denied' || status?.state === 'prompt') {
      return status.state;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function rejectWithCode(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export async function acquireBrowserPosition({ onState, signal } = {}) {
  const emit = (state) => {
    if (typeof onState === 'function') onState(state);
  };

  emit('initializing');

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    emit('unsupported');
    throw rejectWithCode('unsupported');
  }

  const override = parseGeoOverride();
  if (override) {
    if (override.error) {
      emit(override.error);
      throw rejectWithCode(override.error);
    }
    emit('success');
    return override;
  }

  const permission = await queryGeolocationPermission();
  if (signal?.aborted) throw rejectWithCode('unavailable');

  if (permission === 'denied') {
    emit('denied');
    throw rejectWithCode('denied');
  }

  if (permission === 'prompt' || permission === 'unknown') {
    emit('prompt');
  } else {
    emit('fetching');
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const finishReject = (code) => {
      if (settled) return;
      settled = true;
      emit(code);
      reject(rejectWithCode(code));
    };

    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      emit('success');
      resolve(value);
    };

    const onAbort = () => finishReject('unavailable');
    signal?.addEventListener?.('abort', onAbort, { once: true });

    const handleSuccess = (pos) => {
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      const accuracy = pos?.coords?.accuracy ?? 20;
      if (isValidCoords(lat, lng)) {
        finishResolve({ lat, lng, accuracy, source: 'browser' });
      } else {
        finishReject('unavailable');
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        emit('fetching');
        handleSuccess(pos);
      },
      (firstError) => {
        if (firstError?.code === 1) {
          finishReject('denied');
          return;
        }

        emit('fetching');
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (secondError) => {
            finishReject(mapGeolocationError(secondError || firstError));
          },
          {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60_000,
          },
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0,
      },
    );
  });
}

export function getBrowserPosition(options) {
  return acquireBrowserPosition(options);
}
