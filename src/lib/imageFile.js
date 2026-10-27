import { ACCEPTED_IMAGE_MIME_TYPES, MAX_SOURCE_IMAGE_BYTES, sourceImageTooLargeMessage } from './uploadLimits';

const MIME_BY_SIGNATURE = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export async function sniffImageKind(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return { kind: 'unknown', mime: '' };
  }

  const slice = file.slice(0, 16);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'jpeg', mime: MIME_BY_SIGNATURE.jpeg };
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { kind: 'png', mime: MIME_BY_SIGNATURE.png };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { kind: 'webp', mime: MIME_BY_SIGNATURE.webp };
  }

  const ascii = String.fromCharCode(...bytes);
  if (ascii.includes('ftyp')) {
    return { kind: 'heic', mime: MIME_BY_SIGNATURE.heic };
  }

  return { kind: 'unknown', mime: '' };
}

export async function validateImageFile(file) {
  if (!file || typeof file !== 'object') {
    return { ok: false, message: 'Please choose a photo to continue.' };
  }

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { ok: false, message: sourceImageTooLargeMessage() };
  }

  const declaredType = String(file.type || '').toLowerCase();
  const sniffed = await sniffImageKind(file);

  if (sniffed.kind === 'unknown') {
    if (declaredType && ACCEPTED_IMAGE_MIME_TYPES.includes(declaredType)) {
      return {
        ok: false,
        message: 'That photo looks damaged or unreadable. Please take or choose another photo.',
      };
    }
    return {
      ok: false,
      message: 'Please choose a JPG, PNG, or WebP photo.',
    };
  }

  if (sniffed.kind === 'heic') {
    return {
      ok: true,
      mime: sniffed.mime,
      kind: sniffed.kind,
      warning:
        'HEIC photos are converted before upload. If conversion fails, save the photo as JPG and try again.',
    };
  }

  return { ok: true, mime: sniffed.mime, kind: sniffed.kind };
}
