import imageCompression from 'browser-image-compression';
import exifr from 'exifr';

import { supabase } from './supabase';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const categoryMap = {
  pothole: { label: 'Pothole', severity: 'high', description: 'A broken road surface has been detected.' },
  garbage: { label: 'Garbage', severity: 'medium', description: 'Improper waste accumulation is visible.' },
  open_drain: { label: 'Open drain', severity: 'high', description: 'An exposed drainage point is visible.' },
  waterlogging: { label: 'Waterlogging', severity: 'high', description: 'Standing water has collected in the area.' },
  electrical_hazard: { label: 'Electrical hazard', severity: 'high', description: 'Loose or exposed electrical wiring is visible.' },
  streetlight: { label: 'Streetlight', severity: 'medium', description: 'A streetlight issue is visible.' },
  fallen_tree: { label: 'Fallen tree', severity: 'high', description: 'A fallen tree or obstructing branch is visible.' },
  other: { label: 'Other', severity: 'medium', description: 'Another civic issue is visible.' },
};

const departmentMap = {
  pothole: 'Roads & Infrastructure',
  garbage: 'Solid Waste Management',
  open_drain: 'Storm Water Department',
  waterlogging: 'Storm Water Department',
  electrical_hazard: 'Electrical Maintenance',
  streetlight: 'Public Lighting',
  fallen_tree: 'Urban Forest & Parks',
  other: 'General Grievance Cell',
};

const DEFAULT_LOCATION = {
  lat: 12.9716,
  lng: 77.5946,
  address: '22 MG Road, Bengaluru, Karnataka',
};

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    throw new Error('You need to sign in before uploading a photo.');
  }

  return user.id;
}

function buildStoragePath(userId) {
  return `${userId}/${crypto.randomUUID()}.jpg`;
}

export async function uploadPhoto(file, onProgress) {
  if (!file) {
    throw new Error('No photo was provided.');
  }

  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Images must be 5 MB or smaller.');
  }

  const originalFile = file;
  let compressedFile = file;

  try {
    onProgress?.('Preparing photo…', 10);
    const gps = await exifr.gps(originalFile);
    const gpsCandidate =
      gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)
        ? { lat: gps.latitude, lng: gps.longitude }
        : null;

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      onProgress?.('Compressing photo…', 25);
      compressedFile = await imageCompression(originalFile, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        initialQuality: 0.8,
        useWebWorker: true,
        alwaysKeepResolution: false,
      });
    }

    onProgress?.('Uploading photo…', 55);
    const userId = await getCurrentUserId();
    const filePath = buildStoragePath(userId);
    const { error: uploadError } = await supabase.storage.from('report-images').upload(filePath, compressedFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: compressedFile.type || 'image/jpeg',
    });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage.from('report-images').getPublicUrl(filePath);
    onProgress?.('Finishing upload…', 100);

    return {
      url: publicUrlData?.publicUrl || '',
      fileName: compressedFile.name || originalFile.name,
      size: compressedFile.size || originalFile.size,
      gps: gpsCandidate,
    };
  } catch (error) {
    if (error?.message?.includes('already exists')) {
      throw new Error('This photo is already being uploaded. Please wait a moment and try again.');
    }

    throw new Error(error?.message || 'Photo upload failed. Please try again.');
  }
}

export async function getLocation(file) {
  if (!file) {
    throw new Error('No photo was provided.');
  }

  try {
    const gps = await exifr.gps(file);
    const lat = Number(gps?.latitude);
    const lng = Number(gps?.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        lat,
        lng,
        address: 'Photo GPS location',
      };
    }
  } catch (_error) {
    // Some mobile photos do not include EXIF GPS data, so we fall back to browser geolocation later.
  }

  if (navigator && navigator.geolocation) {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 300000,
      });
    }).catch(() => null);

    if (position?.coords) {
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        address: 'Current location',
      };
    }
  }

  await wait(400);
  return DEFAULT_LOCATION;
}

export async function analyzePhoto(imageUrl) {
  await wait(1200);

  const keys = Object.keys(categoryMap);
  const chosenKey = keys[Math.floor(Math.random() * keys.length)];
  const category = categoryMap[chosenKey];
  const lowConfidence = Math.random() < 0.33;
  const confidence = lowConfidence ? 0.4 : 0.9;

  const alternatives = keys
    .filter((key) => key !== chosenKey)
    .slice(0, 2)
    .map((key) => ({
      category: key,
      label: categoryMap[key].label,
      severity: categoryMap[key].severity,
      description: categoryMap[key].description,
    }));

  return {
    ai: {
      category: chosenKey,
      label: category.label,
      severity: category.severity,
      description: category.description,
      confidence,
      alternatives,
    },
    imageUrl,
  };
}

export async function findDuplicates(draft) {
  await wait(800);

  const duplicates = Math.random() < 0.35;

  return {
    duplicates,
    groupId: duplicates ? 'a1b2c3d4-e5f6-7890-1234-567890abcdef' : null,
    message: duplicates
      ? 'A similar issue was reported nearby. We are merging this report into the active ticket.'
      : 'No nearby duplicate reports were found.',
  };
}

export async function submitReport(draft) {
  await wait(1000);

  const department = departmentMap[draft.category || 'other'];
  const reportCode = `CC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  return {
    id: `report-${Math.random().toString(36).slice(2, 10)}`,
    reportCode,
    category: draft.category || 'pothole',
    status: 'submitted',
    department,
    address: draft.address || '22 MG Road, Bengaluru, Karnataka',
    severity: draft.ai?.severity || 'high',
  };
}
