const LIMIT_PER_SESSION = 20;
const MIN_INTERVAL_MS = 3000;
const SESSION_KEY = 'civicchat:aiGuard';

function readState() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : { count: 0, lastAt: 0 };
  } catch (_error) {
    return { count: 0, lastAt: 0 };
  }
}

function writeState(nextState) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextState));
  } catch (_error) {
    // Ignore storage issues so the chat keeps working.
  }
}

export function canLaunchAiAnalysis() {
  const now = Date.now();
  const state = readState();
  const elapsed = now - (state.lastAt || 0);

  if (state.count >= LIMIT_PER_SESSION) {
    return { allowed: false, reason: 'limit' };
  }

  if (elapsed < MIN_INTERVAL_MS) {
    return { allowed: false, reason: 'cooldown' };
  }

  return { allowed: true, reason: null };
}

export function markAiRequestStarted() {
  const state = readState();
  const now = Date.now();
  const next = {
    count: state.count + 1,
    lastAt: now,
  };
  writeState(next);
  return next;
}

export function markAiRequestUnavailable() {
  const state = readState();
  const next = {
    count: state.count + 1,
    lastAt: Date.now(),
  };
  writeState(next);
  return next;
}

export function resetAiSessionGuard() {
  writeState({ count: 0, lastAt: 0 });
}
