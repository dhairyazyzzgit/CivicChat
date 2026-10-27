import { LogOut, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationBellButton, NotificationPanel } from '../common/NotificationBell';
import { BrandMark } from '../common/BrandMark';

export function AdminNavbar({ onRefresh, loading, onSelectIssue }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const { user, signOut, role } = useAuth();
  const navigate = useNavigate();
  const notifications = useNotifications({ userId: user?.id, role: role || 'admin' });

  const handleLogout = async () => {
    try {
      navigate('/', { replace: true }); // leave protected routes first
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="glass sticky top-0 z-40 border-b border-slate-200/70">
      <div className="mx-auto flex h-[61px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <BrandMark size={32} />
          <div>
            <h1 className="font-display text-[17px] leading-none text-slate-900">Operations</h1>
            <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">Civic issue management</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            <NotificationBellButton
              unreadCount={notifications.unreadCount}
              isOpen={notifOpen}
              onClick={() => setNotifOpen((value) => !value)}
            />
            <NotificationPanel
              isOpen={notifOpen}
              onClose={() => setNotifOpen(false)}
              notifications={notifications.notifications}
              unreadCount={notifications.unreadCount}
              loading={notifications.loading}
              error={notifications.error}
              onRetry={notifications.refresh}
              onMarkAllRead={notifications.markAllRead}
              onMarkOneRead={notifications.markOneRead}
              onSelectAdminIssue={(groupId) => {
                setNotifOpen(false);
                onSelectIssue?.(groupId);
              }}
              userId={user?.id}
              isAdmin
            />
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 disabled:opacity-50 sm:px-4"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 sm:px-4"
            aria-label="Sign out"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
