let lastRequestTime = 0;
let queuePromise = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function enqueue(fn) {
  const next = queuePromise.then(async () => {
    const now = Date.now();
    const waitTime = Math.max(0, 1100 - (now - lastRequestTime));
    if (waitTime > 0) {
      await sleep(waitTime);
    }
    lastRequestTime = Date.now();
    return fn();
  });
  // Prevent unhandled rejections on the chain
  queuePromise = next.catch(() => {});
  return next;
}

export async function reverseGeocode(lat, lng, signal) {
  const fallbackAddress = `Pinned location (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`;
  const fallbackResult = { address: fallbackAddress, ward: null };

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return fallbackResult;
  }

  const cacheKey = `civicchat:geocode:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;

  // Check sessionStorage cache for SUCCESS
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.address === 'string' && parsed.address !== fallbackAddress) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage issues
  }

  return enqueue(async () => {
    if (signal?.aborted) {
      return fallbackResult;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const onAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('zoom', '18');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept-Language': 'en',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return fallbackResult;
      }

      const payload = await response.json();
      const addr = payload?.address || {};

      const road = addr.road || addr.pedestrian || addr.street || '';
      const neighbourhood = addr.neighbourhood || addr.suburb || addr.residential || '';
      const suburb = addr.suburb || addr.neighbourhood || '';
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';

      const parts = [road, neighbourhood || suburb, city].filter(Boolean);
      const formattedAddress = parts.length > 0 ? parts.join(', ') : fallbackAddress;
      const ward = addr.suburb || addr.neighbourhood || addr.city_district || null;

      const result = { address: formattedAddress, ward };

      // Cache SUCCESS only
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(result));
      } catch {
        // Ignore storage issues
      }

      return result;
    } catch {
      return fallbackResult;
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  });
}
