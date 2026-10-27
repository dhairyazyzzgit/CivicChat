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

      const placeName =
        (payload?.name && payload.name !== road ? payload.name : '') ||
        addr.building || addr.amenity || addr.shop || addr.tourism || addr.house_name || '';
      const houseRoad = [addr.house_number, road].filter(Boolean).join(' ');
      const seen = new Set();
      let parts = [placeName, houseRoad, neighbourhood || suburb, city].filter((p) => {
        const k = String(p || '').trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (parts.length === 0 && payload?.display_name) {
        parts = String(payload.display_name).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4);
      }
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

// Forward geocode a typed address (India). Returns { lat, lng } or null.
export async function forwardGeocode(query, signal) {
  const q = String(query || '').trim();
  if (q.length < 3) return null;
  return enqueue(async () => {
    if (signal?.aborted) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'in');
      url.searchParams.set('q', q);
      const response = await fetch(url.toString(), { headers: { 'Accept-Language': 'en' }, signal: controller.signal });
      if (!response.ok) return null;
      const rows = await response.json();
      const lat = Number(rows?.[0]?.lat);
      const lng = Number(rows?.[0]?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  });
}
