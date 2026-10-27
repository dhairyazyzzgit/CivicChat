import { Bell, Check, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { relativeTime } from '../../lib/format';
import { formatBadgeCount, resolveCitizenNotificationPath } from '../../lib/notifications';

export function NotificationPanel({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  loading,
  error,
  onRetry,
  onMarkAllRead,
  onMarkOneRead,
  onSelectAdminIssue,
  userId,
  isAdmin,
}) {
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleItemActivate = async (notif) => {
    await onMarkOneRead(notif);
    onClose();

    if (isAdmin) {
      if (notif.group_id && onSelectAdminIssue) {
        onSelectAdminIssue(notif.group_id);
      } else {
        navigate('/admin');
      }
      return;
    }

    const path = await resolveCitizenNotificationPath(userId, notif.group_id);
    navigate(path);
  };

  return (
    <div
      ref={dropdownRef}
      role="dialog"
      aria-label="Notifications"
      className="fixed inset-x-3 top-[69px] z-50 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
    >
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">Notifications</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
              {formatBadgeCount(unreadCount)} unread
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 transition hover:text-teal-800"
            aria-label="Mark all as read"
          >
            <CheckCheck size={13} />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      <div className="max-h-[60vh] sm:max-h-80 divide-y divide-slate-100/80 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Loader2 size={20} className="mx-auto mb-2 animate-spin text-slate-300" />
            <p className="text-xs font-medium text-slate-500">Loading notifications…</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-xs font-medium text-rose-700">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell size={24} className="mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium text-slate-500">No notifications yet</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {isAdmin
                ? 'You will be notified when citizens submit new reports.'
                : 'You will be notified when your reports are updated.'}
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`flex items-start gap-2 p-3.5 ${!notif.read ? 'bg-teal-50/40' : 'bg-white'}`}
            >
              <button
                type="button"
                onClick={() => handleItemActivate(notif)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-90"
                aria-label={notif.message}
              >
                <span
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                    !notif.read ? 'bg-teal-600 ring-2 ring-teal-200' : 'bg-slate-200'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs leading-relaxed ${
                      !notif.read ? 'font-semibold text-slate-900' : 'font-normal text-slate-700'
                    }`}
                  >
                    {notif.message}
                  </p>
                  <span className="mt-1 block text-[10px] text-slate-400">{relativeTime(notif.created_at)}</span>
                </div>
              </button>
              {!notif.read && (
                <button
                  type="button"
                  onClick={() => onMarkOneRead(notif)}
                  className="mt-0.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-teal-700"
                  aria-label="Mark as read"
                  title="Mark as read"
                >
                  <Check size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function NotificationBellButton({ unreadCount, isOpen, onClick, compact = false }) {
  const badge = formatBadgeCount(unreadCount);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition ${
        isOpen
          ? 'border-teal-600 bg-teal-50 text-teal-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
      }`}
      aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
    >
      <Bell size={16} />
      {badge ? (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs">
          {badge}
        </span>
      ) : null}
      {compact ? <span className="sr-only">Notifications</span> : null}
    </button>
  );
}
