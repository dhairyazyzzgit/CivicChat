import imageCompression from 'browser-image-compression';
import * as exifrModule from 'exifr';
import { canLaunchAiAnalysis, markAiRequestStarted, markAiRequestUnavailable } from './aiGuard';
import { validateImageFile } from './imageFile';
import { supabase } from './supabase';
import {
  AI_MAX_DIMENSION,
  MAX_COMPRESSED_AI_MB,
  MAX_COMPRESSED_MAIN_MB,
  MAX_COMPRESSED_THUMB_MB,
  MAX_SOURCE_IMAGE_BYTES,
  MAIN_MAX_DIMENSION,
  THUMB_MAX_DIMENSION,
  sourceImageTooLargeMessage,
} from './uploadLimits';

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
  if (!file || typeof file !== 'object') {
    throw new Error('Invalid file provided');
  }
  const declaredType = String(file.type || '').toLowerCase();
  if (
    declaredType &&
    !['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(declaredType)
  ) {
    throw new Error('Please choose a JPG, PNG, or WebP photo.');
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(sourceImageTooLargeMessage());
  }

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
      const validation = await validateImageFile(file);
      if (!validation.ok) {
        blobsResolve({ status: 'error', message: validation.message });
        return;
      }

      const compressOptions = (maxWidthOrHeight, maxSizeMB, quality) => ({
        maxWidthOrHeight,
        maxSizeMB,
        initialQuality: quality,
        fileType: 'image/jpeg',
        alwaysKeepResolution: false,
        exifOrientation: true,
        useWebWorker: false,
      });

      const [main, thumb, ai] = await Promise.all([
        imageCompression(file, compressOptions(MAIN_MAX_DIMENSION, MAX_COMPRESSED_MAIN_MB, 0.82)),
        imageCompression(file, compressOptions(THUMB_MAX_DIMENSION, MAX_COMPRESSED_THUMB_MB, 0.7)),
        imageCompression(file, compressOptions(AI_MAX_DIMENSION, MAX_COMPRESSED_AI_MB, 0.7)),
      ]);

      blobs.main = main;
      blobs.thumb = thumb;
      blobs.ai = ai;
      const result = { status: 'ok', main, thumb, ai };
      blobsResolve(result);
    } catch (err) {
      const result = {
        status: 'error',
        message:
          err?.message ||
          'Photo compression failed. If this is a HEIC photo, save it as JPG and try again.',
      };
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
    if (!effectiveUserId || typeof effectiveUserId !== 'string') {
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

    if (!mainData?.publicUrl || !thumbData?.publicUrl) {
      return { status: 'error', message: 'Failed to generate public URLs for uploaded images.' };
    }

    return {
      status: 'ok',
      mainUrl: mainData.publicUrl,
      thumbUrl: thumbData.publicUrl,
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
    let guard = canLaunchAiAnalysis();
    if (!guard.allowed && guard.reason === 'cooldown') {
      await new Promise((r) => setTimeout(r, 3100));
      if (isDead) return { status: 'manual', reason: 'error' };
      guard = canLaunchAiAnalysis();
    }
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

      const callAnalyze = () =>
        fetch('/api/analyze', {
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
      let res = await callAnalyze();
      if (res.status >= 500 && !isDead) {
        await new Promise((r) => setTimeout(r, 1200));
        if (!isDead) res = await callAnalyze();
      }

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
