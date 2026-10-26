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

  if (geo === 'denied' || geo === 'timeout') {
    return { error: geo };
  }

  const parts = geo.split(',').map((p) => Number(p.trim()));
  if (parts.length === 2 && isValidCoords(parts[0], parts[1])) {
    return { lat: parts[0], lng: parts[1], accuracy: 15, source: 'override' };
  }

  return null;
}

export function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      const err = new Error('unsupported');
      err.code = 'unsupported';
      return reject(err);
    }

    const override = parseGeoOverride();
    if (override) {
      if (override.error) {
        const err = new Error(override.error);
        err.code = override.error;
        return reject(err);
      }
      return resolve(override);
    }

    const mapGeolocError = (error) => {
      if (!error) return 'unavailable';
      if (error.code === 1) return 'denied';
      if (error.code === 3) return 'timeout';
      return 'unavailable';
    };

    // Attempt 1: high accuracy (10 s)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        const accuracy = pos?.coords?.accuracy ?? 20;
        if (isValidCoords(lat, lng)) {
          resolve({ lat, lng, accuracy, source: 'browser' });
        } else {
          const err = new Error('unavailable');
          err.code = 'unavailable';
          reject(err);
        }
      },
      (firstError) => {
        // If explicitly denied by the user, do not retry
        if (firstError?.code === 1) {
          const err = new Error('denied');
          err.code = 'denied';
          return reject(err);
        }

        // Attempt 2: retry once with low accuracy (8 s)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos?.coords?.latitude;
            const lng = pos?.coords?.longitude;
            const accuracy = pos?.coords?.accuracy ?? 150;
            if (isValidCoords(lat, lng)) {
              resolve({ lat, lng, accuracy, source: 'browser' });
            } else {
              const err = new Error('unavailable');
              err.code = 'unavailable';
              reject(err);
            }
          },
          (secondError) => {
            const code = mapGeolocError(secondError || firstError);
            const err = new Error(code);
            err.code = code;
            reject(err);
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
        timeout: 10_000,
        maximumAge: 0,
      },
    );
  });
}
