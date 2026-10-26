import crypto from 'node:crypto';

const CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shortUserId(userId) {
  if (!userId) return 'anon';
  return String(userId).slice(0, 6);
}

function hashKey(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export async function callGemini({
  userId,
  prompt,
  imagePart,
  imageParts,
  responseSchema,
  temperature = 0.1,
  maxOutputTokens = 300,
  responseMimeType = 'application/json',
}) {
  const apiKey = process.env.GEMINI_API_KEY || '';

  // AI_MOCK=1 support
  if (String(process.env.AI_MOCK || '').trim() === '1') {
    const isCompare = responseSchema?.properties?.same !== undefined;
    const mockResult = isCompare
      ? { same: false, confidence: 0.85, reason: 'Different issues detected (mocked).' }
      : {
          is_civic_issue: true,
          category: 'pothole',
          severity: 'high',
          confidence: 0.95,
          description: 'Pothole on the road surface (mocked).',
        };
    return mockResult;
  }

  // Normalize image parts
  let resolvedParts = [];
  if (Array.isArray(imageParts)) {
    resolvedParts = imageParts.filter(Boolean);
  } else if (imagePart) {
    resolvedParts = Array.isArray(imagePart) ? imagePart : [imagePart];
  }

  const cachePayload = { prompt, resolvedParts, responseSchema };
  const cacheKey = hashKey(cachePayload);
  const cached = CACHE.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.value && (cached.value.category || typeof cached.value.same === 'boolean')) {
    console.log(
      JSON.stringify({
        userId: shortUserId(userId),
        cacheHit: true,
        model: cached.model,
        status: 'ok',
        ms: 0,
        totalTokens: cached.totalTokens,
      }),
    );
    return cached.value;
  }

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL;
  const modelChain = [primaryModel];
  if (fallbackModel && fallbackModel !== primaryModel) {
    modelChain.push(fallbackModel);
  }

  let primaryError = null;

  for (let mIdx = 0; mIdx < modelChain.length; mIdx++) {
    const model = modelChain[mIdx];
    const isFallback = mIdx > 0;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    let attempt503Done = false;
    let attempt400Done = false;
    let withThinking = true;

    while (true) {
      const startTime = Date.now();
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, ...resolvedParts],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType,
          responseSchema,
          ...(withThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const ms = Date.now() - startTime;
        const text = await response.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!response.ok) {
          const status = response.status;
          const errorMsg = json?.error?.message || text || 'Gemini error';

          // On 503 retry the SAME model once after 1.5 s
          if (status === 503 && !attempt503Done) {
            attempt503Done = true;
            await sleep(1500);
            continue;
          }

          // On 400 mentioning thinkingConfig retry once without thinkingConfig
          if (status === 400 && !attempt400Done && /thinkingConfig|thinking_budget|thinking/i.test(errorMsg)) {
            attempt400Done = true;
            withThinking = false;
            continue;
          }

          // On 429 never retry the same model, go to fallback if any, else throw {code:'ai_busy', status:429}
          if (status === 429) {
            const errorObj = { code: 'ai_busy', status: 429, message: 'AI service busy. Please try again later.' };
            if (!isFallback) {
              primaryError = errorObj;
            }
            if (mIdx + 1 < modelChain.length) {
              // Try fallback model
              break;
            }
            throw errorObj;
          }

          // On 404 for the fallback model ignore it and report the primary error
          if (status === 404 && isFallback && primaryError) {
            throw primaryError;
          }

          const modelError = {
            code: 'ai_unavailable',
            status: status >= 500 ? 502 : status,
            message: errorMsg,
          };

          if (!isFallback) {
            primaryError = modelError;
          }

          // Try next model in chain if available
          if (mIdx + 1 < modelChain.length) {
            break;
          }
          throw isFallback && primaryError ? primaryError : modelError;
        }

        const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) {
          throw { code: 'ai_unavailable', status: 502, message: 'Empty response from AI.' };
        }

        let parsedResult;
        try {
          parsedResult = JSON.parse(candidateText);
        } catch {
          throw { code: 'ai_unavailable', status: 502, message: 'Invalid JSON returned by AI.' };
        }

        const totalTokens = Number(json?.usageMetadata?.totalTokenCount || 0);

        CACHE.set(cacheKey, {
          ts: Date.now(),
          model,
          totalTokens,
          value: parsedResult,
        });

        console.log(
          JSON.stringify({
            userId: shortUserId(userId),
            cacheHit: false,
            model,
            status: 'ok',
            ms,
            totalTokens,
          }),
        );

        return parsedResult;
      } catch (err) {
        clearTimeout(timeoutId);
        const ms = Date.now() - startTime;
        const isAbort = err?.name === 'AbortError';
        const errObj = isAbort
          ? { code: 'ai_unavailable', status: 502, message: 'AI request timed out.' }
          : err?.code
            ? err
            : { code: 'ai_unavailable', status: 502, message: err?.message || 'AI request failed.' };

        console.log(
          JSON.stringify({
            userId: shortUserId(userId),
            cacheHit: false,
            model,
            status: 'error',
            ms,
            totalTokens: 0,
          }),
        );

        if (!isFallback) {
          primaryError = errObj;
        }

        if (errObj.code === 'ai_busy' && mIdx + 1 >= modelChain.length) {
          throw errObj;
        }

        // Try next model if available
        if (mIdx + 1 < modelChain.length) {
          break;
        }
        throw isFallback && primaryError ? primaryError : errObj;
      }
    }
  }

  if (primaryError) {
    throw primaryError;
  }
  throw { code: 'ai_unavailable', status: 502, message: 'AI service unavailable.' };
}

export async function fetchPublicImagePart(url, maxBytes) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw { status: 400, code: 'invalid_request', message: 'Invalid image URL.' };
  }

  if (parsed.protocol !== 'https:') {
    throw { status: 400, code: 'invalid_request', message: 'HTTPS image URL is required.' };
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  if (!supabaseUrl) {
    throw { status: 500, code: 'server_error', message: 'SUPABASE_URL is not configured.' };
  }

  let allowedHost;
  try {
    allowedHost = new URL(supabaseUrl).host;
  } catch {
    throw { status: 500, code: 'server_error', message: 'Invalid SUPABASE_URL.' };
  }

  if (parsed.host !== allowedHost) {
    throw { status: 400, code: 'invalid_request', message: 'Image URL host is not permitted.' };
  }

  if (!parsed.pathname.startsWith('/storage/v1/object/public/report-images/')) {
    throw { status: 400, code: 'invalid_request', message: 'Image URL path is not permitted.' };
  }

  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw { status: 400, code: 'invalid_request', message: 'Could not fetch image.' };
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw { status: 400, code: 'invalid_request', message: 'Fetched content is not an image.' };
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw { status: 400, code: 'invalid_request', message: `Image exceeds maximum allowed size of ${maxBytes} bytes.` };
  }

  const base64Data = Buffer.from(arrayBuffer).toString('base64');
  return {
    inlineData: {
      mimeType: contentType,
      data: base64Data,
    },
  };
}
