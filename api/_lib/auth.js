import { createClient } from '@supabase/supabase-js';

const requestBuckets = new Map();

export async function requireUser(req, res) {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'server_error' });
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }

    return data.user;
  } catch (_error) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
}

export function allowRequest(userId, limit = 10, windowMs = 60000) {
  const now = Date.now();
  const existing = requestBuckets.get(userId) || [];
  const recent = existing.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= limit) {
    return false;
  }

  recent.push(now);
  requestBuckets.set(userId, recent);
  return true;
}
