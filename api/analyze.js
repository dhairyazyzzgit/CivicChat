import crypto from 'node:crypto';
import { requireUser, checkRateLimit } from './_lib/auth.js';
import { callGemini } from './_lib/gemini.js';

const PENDING = new Map();

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function allowCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-nocache');
}

const ANALYZE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_civic_issue: { type: 'BOOLEAN' },
    category: {
      type: 'STRING',
      enum: ['pothole', 'garbage', 'open_drain', 'waterlogging', 'electrical_hazard', 'streetlight', 'fallen_tree', 'other'],
    },
    severity: {
      type: 'STRING',
      enum: ['low', 'medium', 'high', 'hazard'],
    },
    confidence: { type: 'NUMBER' },
    description: { type: 'STRING' },
  },
  required: ['is_civic_issue', 'category', 'severity', 'confidence', 'description'],
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
    checkRateLimit(user.id, 6, 60_000);

    const body = req.body || {};
    const rawImage = typeof body.imageBase64 === 'string' ? body.imageBase64 : (typeof body.image === 'string' ? body.image : '');
    const cleanImageBase64 = rawImage.replace(/^data:image\/\w+;base64,/, '').trim();
    const mimeType = body.mimeType || 'image/jpeg';
    const userText = typeof body.userText === 'string' ? body.userText.trim() : (typeof body.prompt === 'string' ? body.prompt.trim() : '');

    if (userText.length > 300) {
      throw { status: 400, code: 'invalid_request', message: 'Text exceeds maximum length of 300 characters.' };
    }

    let imagePart = null;
    if (cleanImageBase64) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        throw { status: 400, code: 'invalid_request', message: 'Supported formats are jpeg, png, or webp.' };
      }
      const buffer = Buffer.from(cleanImageBase64, 'base64');
      if (buffer.byteLength > 300 * 1024) {
        throw { status: 400, code: 'invalid_request', message: 'Decoded image exceeds 300 KB limit.' };
      }
      imagePart = {
        inlineData: {
          mimeType,
          data: cleanImageBase64,
        },
      };
    }

    if (!imagePart && !userText) {
      throw { status: 400, code: 'invalid_request', message: 'Either an image or a text description is required.' };
    }

    // Token-optimized concise prompt
    const prompt = imagePart
      ? `Classify civic issue in photo. Valid categories: pothole, garbage, open_drain, waterlogging, electrical_hazard, streetlight, fallen_tree, other. Valid severity: low, medium, high, hazard.${userText ? ` Note: "${userText}"` : ''}`
      : `Classify civic issue description: "${userText}". Valid categories: pothole, garbage, open_drain, waterlogging, electrical_hazard, streetlight, fallen_tree, other. Valid severity: low, medium, high, hazard.`;

    const requestKey = crypto
      .createHash('sha256')
      .update(JSON.stringify({ userId: user.id, cleanImageBase64, mimeType, userText, prompt }))
      .digest('hex');

    let pendingPromise = PENDING.get(requestKey);
    if (!pendingPromise) {
      pendingPromise = callGemini({
        userId: user.id,
        prompt,
        imagePart,
        responseSchema: ANALYZE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 120, // Strict token limit for output JSON
      });
      PENDING.set(requestKey, pendingPromise);
    }

    try {
      const result = await pendingPromise;
      PENDING.delete(requestKey);
      return sendJson(res, 200, result);
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
