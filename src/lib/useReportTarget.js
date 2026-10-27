import { useAuth } from '../context/AuthContext';

// Where primary "Report an issue" buttons should go.
// Admins -> dashboard, citizens -> chat, guests -> signup (which returns them to /chat).
export function useReportTarget() {
  const { user, role } = useAuth();
  if (user && role === 'admin') return { to: '/admin', label: 'Open dashboard' };
  if (user) return { to: '/chat', label: 'Report an issue' };
  return { to: '/signup?redirect=%2Fchat', label: 'Report an issue' };
}

// Only allow same-site relative redirects.
export function safeRedirect(value, fallback = '/chat') {
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value === '/admin' || value.startsWith('/admin/') || value.startsWith('/admin?')) return fallback;
  return value;
}
