import crypto from 'node:crypto';
import { requireUser, checkRateLimit } from './_lib/auth.js';
import { callGemini, fetchPublicImagePart } from './_lib/gemini.js';

const PENDING = new Map();

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function allowCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const COMPARE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    same: { type: 'BOOLEAN' },
    confidence: { type: 'NUMBER' },
    reason: { type: 'STRING' },
  },
  required: ['same', 'confidence', 'reason'],
};

export default async function handler(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'POST only.' } });
  }

  try {
    const user = await requireUser(req);
    checkRateLimit(user.id, 10, 60_000);

    const body = req.body || {};
    const { newImageBase64, mimeType = 'image/jpeg', candidateImageUrl, category } = body;

    if (!newImageBase64 || !candidateImageUrl || !category) {
      throw {
        status: 400,
        code: 'invalid_request',
        message: 'newImageBase64, candidateImageUrl, and category are required.',
      };
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw { status: 400, code: 'invalid_request', message: 'Supported mimeTypes are jpeg, png, or webp.' };
    }

    const cleanBase64 = String(newImageBase64).replace(/^data:image\/\w+;base64,/, '').trim();
    const newImageBuffer = Buffer.from(cleanBase64, 'base64');
    if (newImageBuffer.byteLength > 300 * 1024) {
      throw { status: 400, code: 'invalid_request', message: 'newImageBase64 exceeds maximum allowed size.' };
    }

    const candidateImagePart = await fetchPublicImagePart(candidateImageUrl, 150 * 1024);
    const newImagePart = {
      inlineData: {
        mimeType,
        data: cleanBase64,
      },
    };

    const prompt = `Compare these two images of a reported "${category}" issue. Determine whether both images show the exact SAME physical issue at the SAME place. Different camera angles, distances, or lighting conditions are allowed. However, two different defects on the same street or in the same area are NOT the same issue. Return whether they are the same (boolean), confidence (0.0 to 1.0), and a concise reason (maximum 120 characters).`;

    const requestKey = crypto
      .createHash('sha256')
      .update(JSON.stringify({ userId: user.id, cleanBase64, candidateImageUrl, category }))
      .digest('hex');

    let pendingPromise = PENDING.get(requestKey);
    if (!pendingPromise) {
      pendingPromise = callGemini({
        userId: user.id,
        prompt,
        imageParts: [candidateImagePart, newImagePart],
        responseSchema: COMPARE_SCHEMA,
      });
      PENDING.set(requestKey, pendingPromise);
    }

    try {
      const result = await pendingPromise;
      PENDING.delete(requestKey);

      // Validate result shape
      if (typeof result?.same !== 'boolean') {
        throw { status: 502, code: 'ai_unavailable', message: 'Invalid comparison result from AI.' };
      }

      return sendJson(res, 200, {
        same: result.same,
        confidence: Number(result.confidence || 0),
        reason: String(result.reason || '').slice(0, 120),
      });
    } catch (err) {
      PENDING.delete(requestKey);
      throw err;
    }
  } catch (error) {
    const status = error?.status || 500;
    const code = error?.code || 'internal_error';
    const message = error?.message || 'Request failed.';

    if (status === 401 || code === 'unauthorized') {
      return sendJson(res, 401, { error: { code: 'unauthorized', message } });
    }
    if (status === 400 || code === 'invalid_request') {
      return sendJson(res, 400, { error: { code: 'invalid_request', message } });
    }
    if (status === 405 || code === 'method_not_allowed') {
      return sendJson(res, 405, { error: { code: 'method_not_allowed', message } });
    }
    if (status === 429 || code === 'ai_busy') {
      return sendJson(res, 429, { error: { code: 'ai_busy', message } });
    }
    if (status === 502 || code === 'ai_unavailable') {
      return sendJson(res, 502, { error: { code: 'ai_unavailable', message } });
    }

    return sendJson(res, 500, { error: { code, message } });
  }
}
