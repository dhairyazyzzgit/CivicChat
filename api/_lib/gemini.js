import { GoogleGenAI } from '@google/genai';

const AI_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logGeminiError(stage, error, context = {}) {
  console.error(`[Gemini:${stage}]`, {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    status: error?.status,
    ...context,
  });
}

function getModelName() {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

export async function callGemini({ parts, schema }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error('Missing Gemini API key');
    error.code = 'ai_unavailable';
    throw error;
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = getModelName();
  const body = {
    model,
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  let attempt = 0;

  while (attempt < 2) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          const timeoutError = new Error('AI request timed out');
          timeoutError.name = 'AbortError';
          timeoutError.code = 'ai_timeout';
          reject(timeoutError);
        }, AI_TIMEOUT_MS);
      });

      const response = await Promise.race([
        ai.models.generateContent(body),
        timeoutPromise,
      ]);

      const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        const error = new Error('Gemini returned no usable output');
        error.code = 'ai_bad_output';
        throw error;
      }

      try {
        return JSON.parse(text);
      } catch (_parseError) {
        const error = new Error('Gemini returned malformed JSON');
        error.code = 'ai_bad_output';
        throw error;
      }
    } catch (error) {
      const retryableStatus = error?.status === 429 || error?.status === 503;
      const retryableMessage = /429|503|rate limit|temporar|network|timeout/i.test(String(error?.message || ''));

      logGeminiError('generateContent', error, { attempt, model, retryableStatus, retryableMessage });

      if (error?.name === 'AbortError' || error?.code === 'ai_timeout') {
        const timeoutError = new Error('AI request timed out');
        timeoutError.code = 'ai_timeout';
        throw timeoutError;
      }

      if (attempt === 0 && (retryableStatus || retryableMessage)) {
        attempt += 1;
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      if (error?.code) {
        throw error;
      }

      const wrapped = new Error('AI request failed');
      wrapped.code = 'ai_unavailable';
      throw wrapped;
    }
  }

  const exhaustiveError = new Error('AI request failed after retry');
  exhaustiveError.code = 'ai_unavailable';
  throw exhaustiveError;
}

export async function fetchImageAsPart(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Image URL missing');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_error) {
    throw new Error('Invalid image URL');
  }

  const allowedBase = process.env.SUPABASE_URL;
  if (!allowedBase) {
    throw new Error('Supabase URL missing');
  }

  const allowedOrigin = new URL(allowedBase).origin;

  if (parsedUrl.origin !== allowedOrigin) {
    throw new Error('Image URL origin not allowed');
  }

  if (!parsedUrl.pathname.startsWith('/storage/v1/object/public/')) {
    throw new Error('Image URL path not allowed');
  }

  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error('Image download failed');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Image content type invalid');
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = Number(contentLengthHeader || '0');
  if (contentLength > 6 * 1024 * 1024) {
    throw new Error('Image too large');
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > 6 * 1024 * 1024) {
    throw new Error('Image too large');
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return {
    inlineData: {
      mimeType: contentType,
      data: base64,
    },
  };
}
