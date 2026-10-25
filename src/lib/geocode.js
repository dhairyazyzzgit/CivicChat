const lastRequestAt = { current: 0 };

const WAIT_MS = 1000;

function toKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return {
      address: `${lat}, ${lng} (address unavailable)`,
      ward: null,
    };
  }

  const key = toKey(lat, lng);

  try {
    const cached = sessionStorage.getItem(`geocode:${key}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (_error) {
    // Ignore storage failures and fall through to live lookup.
  }

  const now = Date.now();
  const elapsed = now - lastRequestAt.current;
  if (elapsed < WAIT_MS) {
    await sleep(WAIT_MS - elapsed);
  }
  lastRequestAt.current = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', '18');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept-Language': 'en',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('Reverse geocode request failed');
    }

    const payload = await response.json();
    const address = payload?.address ?? {};
    const road = address.road || '';
    const suburb = address.suburb || address.city_district || '';
    const city = address.city || address.town || address.village || '';
    const ward = address.suburb || address.neighbourhood || address.city_district || null;

    const readableAddress = [road, suburb, city].filter(Boolean).slice(0, 3).join(', ') || `${lat}, ${lng}`;
    const result = {
      address: readableAddress,
      ward,
    };

    try {
      sessionStorage.setItem(`geocode:${key}`, JSON.stringify(result));
    } catch (_error) {
      // Ignore storage failures and continue.
    }

    return result;
  } catch (_error) {
    const fallback = {
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)} (address unavailable)`,
      ward: null,
    };

    try {
      sessionStorage.setItem(`geocode:${key}`, JSON.stringify(fallback));
    } catch (_error) {
      // Ignore storage failures and continue.
    }

    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}
