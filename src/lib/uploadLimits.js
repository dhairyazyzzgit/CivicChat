/** Source photo size cap before client compression. Compressed uploads stay well under storage limits. */
export const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_MB = 50;
export const MAX_COMPRESSED_MAIN_MB = 0.6;
export const MAX_COMPRESSED_THUMB_MB = 0.04;
export const MAX_COMPRESSED_AI_MB = 0.08;
export const MAIN_MAX_DIMENSION = 1920;
export const THUMB_MAX_DIMENSION = 360;
export const AI_MAX_DIMENSION = 640;

export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const ACCEPT_IMAGE_INPUT = ACCEPTED_IMAGE_MIME_TYPES.join(',');

export function formatBytesAsMb(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function sourceImageTooLargeMessage() {
  return `Photo is too large. Choose a photo up to ${MAX_SOURCE_IMAGE_MB} MB.`;
}
