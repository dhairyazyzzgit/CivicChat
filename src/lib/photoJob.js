import imageCompression from 'browser-image-compression';
import * as exifrModule from 'exifr';
import { canLaunchAiAnalysis, markAiRequestStarted, markAiRequestUnavailable } from './aiGuard';
import { supabase } from './supabase';

const exifr = exifrModule?.default ?? exifrModule;

const MEMORY_AI_CACHE = new Map();
const AI_CACHE_TTL_MS = 30 * 60 * 1000;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createPhotoJob(file, { userId, getAccessToken }) {
  const id = crypto.randomUUID();
  const uuid = crypto.randomUUID();
  const objectUrl = typeof URL !== 'undefined' && file ? URL.createObjectURL(file) : '';

  let isDead = false;
  let objectUrlRevoked = false;
  let uploadController = null;
  let aiController = null;

  function revokeUrlOnce() {
    if (!objectUrlRevoked && objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrlRevoked = true;
    }
  }

  // (1) read EXIF GPS from original file first
  const exif = (async () => {
    try {
      if (!exifr || typeof exifr.gps !== 'function') return null;
      const gps = await exifr.gps(file);
      if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
        return { lat: gps.latitude, lng: gps.longitude };
      }
      return null;
    } catch {
      return null;
    }
  })();

  // (2) compress main, thumb, ai with Promise.all, all JPEG
  let blobsResolve;
  const blobsPromise = new Promise((resolve) => {
    blobsResolve = resolve;
  });

  const blobs = {
    main: null,
    thumb: null,
    ai: null,
    then(onFulfilled, onRejected) {
      return blobsPromise.then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return blobsPromise.catch(onRejected);
    },
  };

  (async () => {
    try {
      const [main, thumb, ai] = await Promise.all([
        imageCompression(file, {
          maxWidthOrHeight: 1280,
          maxSizeMB: 0.35,
          initialQuality: 0.8,
          fileType: 'image/jpeg',
          alwaysKeepResolution: false,
        }),
        imageCompression(file, {
          maxWidthOrHeight: 360,
          maxSizeMB: 0.04,
          initialQuality: 0.7,
          fileType: 'image/jpeg',
          alwaysKeepResolution: false,
        }),
        imageCompression(file, {
          maxWidthOrHeight: 640,
          maxSizeMB: 0.08,
          initialQuality: 0.7,
          fileType: 'image/jpeg',
          alwaysKeepResolution: false,
        }),
      ]);

      blobs.main = main;
      blobs.thumb = thumb;
      blobs.ai = ai;
      const result = { status: 'ok', main, thumb, ai };
      blobsResolve(result);
    } catch (err) {
      const result = { status: 'error', message: err?.message || 'Photo compression failed.' };
      blobsResolve(result);
    }
  })();

  // (3) upload main and thumb in parallel using same uuid
  async function performUpload() {
    if (isDead) return { status: 'error', message: 'Job was cancelled.' };

    const prep = await blobsPromise;
    if (isDead) return { status: 'error', message: 'Job was cancelled.' };
    if (prep.status !== 'ok') {
      return { status: 'error', message: prep.message };
    }

    let effectiveUserId = userId;
    if (!effectiveUserId || effectiveUserId === 'citizen') {
      const { data: sessionData } = await supabase.auth.getSession();
      effectiveUserId = sessionData?.session?.user?.id;
    }
    if (!effectiveUserId) {
      const { data: userData } = await supabase.auth.getUser();
      effectiveUserId = userData?.user?.id;
    }
    if (!effectiveUserId) {
      return { status: 'error', message: 'Please sign in to upload photos.' };
    }

    const mainPath = `${effectiveUserId}/${uuid}.jpg`;
    const thumbPath = `${effectiveUserId}/${uuid}_t.jpg`;

    const uploadOnce = async () => {
      const p1 = supabase.storage.from('report-images').upload(mainPath, prep.main, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });
      const p2 = supabase.storage.from('report-images').upload(thumbPath, prep.thumb, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      if (res1.error) throw res1.error;
      if (res2.error) throw res2.error;
    };

    try {
      await uploadOnce();
    } catch (firstErr) {
      if (isDead) return { status: 'error', message: 'Job was cancelled.' };
      // Retry once on network failure
      try {
        await uploadOnce();
      } catch (retryErr) {
        if (isDead) return { status: 'error', message: 'Job was cancelled.' };
        return { status: 'error', message: retryErr?.message || 'Upload failed. Please check your connection and retry.' };
      }
    }

    if (isDead) return { status: 'error', message: 'Job was cancelled.' };

    const { data: mainData } = supabase.storage.from('report-images').getPublicUrl(mainPath);
    const { data: thumbData } = supabase.storage.from('report-images').getPublicUrl(thumbPath);

    return {
      status: 'ok',
      mainUrl: mainData?.publicUrl || '',
      thumbUrl: thumbData?.publicUrl || '',
    };
  }

  let upload = performUpload();

  // (4) start AI analysis as soon as ai blob exists, without waiting for upload
  const analysis = (async () => {
    const prep = await blobsPromise;
    if (isDead) return { status: 'manual', reason: 'error' };
    if (prep.status !== 'ok' || !prep.ai) {
      return { status: 'manual', reason: 'error' };
    }

    const aiBlob = prep.ai;
    let arrayBuffer;
    try {
      arrayBuffer = await aiBlob.arrayBuffer();
    } catch {
      return { status: 'manual', reason: 'error' };
    }

    // Cache key = SHA-256 of the FULL ai blob bytes
    let hashHex = '';
    try {
      const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
      hashHex = bufferToHex(digest);
    } catch {
      hashHex = `${aiBlob.size}-${aiBlob.lastModified || 0}`;
    }

    const cacheKey = `civicchat:ai:${hashHex}`;

    // Support dev cache bypass (?nocache=1)
    const bypassCache = typeof window !== 'undefined' && window.location.search.includes('nocache');

    if (!bypassCache) {
      // Check memory cache
      const memCached = MEMORY_AI_CACHE.get(cacheKey);
      if (
        memCached &&
        Date.now() - memCached.ts < AI_CACHE_TTL_MS &&
        memCached.result &&
        memCached.result.category &&
        memCached.result.is_civic_issue !== undefined
      ) {
        return { status: 'ok', result: memCached.result };
      }

      // Check sessionStorage cache
      try {
        const stored = sessionStorage.getItem(cacheKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed?.ts &&
            Date.now() - parsed.ts < AI_CACHE_TTL_MS &&
            parsed.result &&
            parsed.result.category &&
            parsed.result.is_civic_issue !== undefined
          ) {
            MEMORY_AI_CACHE.set(cacheKey, parsed);
            return { status: 'ok', result: parsed.result };
          } else {
            sessionStorage.removeItem(cacheKey);
          }
        }
      } catch {
        // Ignore storage errors
      }
    }

    // Check aiGuard
    const guard = canLaunchAiAnalysis();
    if (!guard.allowed) {
      return { status: 'manual', reason: guard.reason === 'limit' ? 'limit' : 'busy' };
    }

    let token = '';
    try {
      token = typeof getAccessToken === 'function' ? await getAccessToken() : '';
    } catch {
      token = '';
    }

    if (!token) {
      const { data: sessionData } = await supabase.auth.getSession();
      token = sessionData?.session?.access_token || '';
    }
    if (!token) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      token = refreshData?.session?.access_token || '';
    }

    if (!token) {
      return { status: 'manual', reason: 'error' };
    }

    markAiRequestStarted();

    aiController = new AbortController();
    const timeoutId = setTimeout(() => aiController.abort(), 25_000);

    try {
      const imageBase64 = arrayBufferToBase64(arrayBuffer);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mimeType: 'image/jpeg',
          imageBase64,
        }),
        signal: aiController.signal,
      });

      clearTimeout(timeoutId);

      if (isDead) return { status: 'manual', reason: 'error' };

      if (!res.ok) {
        if (res.status === 429) {
          markAiRequestUnavailable();
          return { status: 'manual', reason: 'busy' };
        }
        return { status: 'manual', reason: 'error' };
      }

      const json = await res.json();
      if (isDead) return { status: 'manual', reason: 'error' };

      if (json?.is_civic_issue === false) {
        return { status: 'manual', reason: 'not_civic', result: json };
      }

      const cacheEntry = { ts: Date.now(), result: json };
      MEMORY_AI_CACHE.set(cacheKey, cacheEntry);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      } catch {
        // Ignore storage errors
      }

      return { status: 'ok', result: json };
    } catch (err) {
      clearTimeout(timeoutId);
      if (isDead) return { status: 'manual', reason: 'error' };
      if (err?.name === 'AbortError') {
        return { status: 'manual', reason: 'timeout' };
      }
      return { status: 'manual', reason: 'error' };
    }
  })();

  return {
    id,
    objectUrl,
    exif,
    blobs,
    upload,
    analysis,
    abort() {
      isDead = true;
      if (aiController) {
        aiController.abort();
      }
      if (uploadController) {
        uploadController.abort();
      }
      revokeUrlOnce();
    },
    retryUpload() {
      if (isDead) {
        return Promise.resolve({ status: 'error', message: 'Job was cancelled.' });
      }
      upload = performUpload();
      return upload;
    },
    get dead() {
      return isDead;
    },
  };
}
