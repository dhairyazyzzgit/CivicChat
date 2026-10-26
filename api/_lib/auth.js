import { createClient } from '@supabase/supabase-js';

const rateLimitBuckets = new Map();

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw { status: 500, code: 'server_error', message: 'Missing Supabase environment variables.' };
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function requireUser(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    throw { status: 401, code: 'unauthorized', message: 'Missing authentication token.' };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    throw { status: 401, code: 'unauthorized', message: 'Invalid or expired authentication token.' };
  }

  return data.user;
}

export function checkRateLimit(userId, limit = 6, windowMs = 60_000) {
  const now = Date.now();
  const existing = rateLimitBuckets.get(userId) || [];
  const recent = existing.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= limit) {
    throw { status: 429, code: 'ai_busy', message: 'Rate limit exceeded. Please wait a moment.' };
  }

  recent.push(now);
  rateLimitBuckets.set(userId, recent);
}
