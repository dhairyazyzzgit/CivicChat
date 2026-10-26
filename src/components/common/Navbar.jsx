import {
  Bell,
  Check,
  CheckCheck,
  FileText,
  LogOut,
  Menu,
  MessageSquareText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { relativeTime } from '../../lib/format';
import { supabase } from '../../lib/supabase';

function NotificationDropdown({ user, isOpen, onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, group_id, message, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && Array.isArray(data)) {
        setNotifications(data);
      }
    } catch (_err) {
      // Quiet error handling - never break the navbar
    }
  }, [user?.id]);

  // Initial fetch and polling every 30 s + window focus
  useEffect(() => {
    if (!user?.id) return;

    fetchNotifications();

    let intervalId = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchNotifications();
        }
      }, 30_000);
    };

    startPolling();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };

    const onFocus = () => {
      fetchNotifications();
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, fetchNotifications]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
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

  const handleItemClick = async (notif) => {
    onClose();

    // Mark as read in Supabase
    if (!notif.read) {
      try {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
        await supabase.from('notifications').update({ read: true }).eq('id', notif.id);
      } catch (_err) {
        // Quiet
      }
    }

    // Navigate to user's report for this group
    try {
      if (notif.group_id) {
        const { data: repData } = await supabase
          .from('reports')
          .select('id')
          .eq('group_id', notif.group_id)
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (repData?.id) {
          navigate(`/reports/${repData.id}`);
          return;
        }
      }
      navigate('/reports');
    } catch (_err) {
      navigate('/reports');
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    // Optimistic UI update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
    } catch (_err) {
      // Quiet
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl ring-1 ring-slate-900/5 z-50 animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">Notifications</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
              {unreadCount} new
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:text-teal-800 transition"
            aria-label="Mark all notifications as read"
          >
            <CheckCheck size={13} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100/80">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell size={24} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-medium text-slate-500">No notifications yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              You will get notified when your reports are updated.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            return (
              <button
                key={notif.id}
                type="button"
                onClick={() => handleItemClick(notif)}
                className={`w-full flex items-start gap-3 p-3.5 text-left transition hover:bg-slate-50 ${
                  !notif.read ? 'bg-teal-50/40' : 'bg-white'
                }`}
                aria-label={notif.message}
              >
                <span
                  className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                    !notif.read ? 'bg-teal-600 ring-2 ring-teal-200' : 'bg-slate-200'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs leading-relaxed ${
                      !notif.read ? 'font-semibold text-slate-900' : 'font-normal text-slate-700'
                    }`}
                  >
                    {notif.message}
                  </p>
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {relativeTime(notif.created_at)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, profile, signOut, role } = useAuth();
  const navigate = useNavigate();

  // Keep unread count badge in sync for bell icon
  const fetchBadge = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (!error && typeof count === 'number') {
        setUnreadCount(count);
      }
    } catch (_err) {
      // Quiet
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchBadge();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchBadge();
      }
    }, 30_000);

    const onFocus = () => fetchBadge();
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, fetchBadge]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const navItems = [];

  if (user && role === 'admin') {
    navItems.push({ to: '/admin', label: 'Dashboard', icon: ShieldCheck });
  } else if (user) {
    navItems.push({ to: '/chat', label: 'Chat', icon: MessageSquareText });
    navItems.push({ to: '/reports', label: 'My Reports', icon: FileText });
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition ${
      isActive
        ? 'bg-teal-700 text-white shadow-xs'
        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="text-xl font-black tracking-tight text-teal-700 hover:text-teal-800 transition">
          CivicChat
        </Link>

        {/* Desktop Nav Items */}
        <div className="hidden items-center gap-1.5 md:flex">
          {navItems.length > 0
            ? navItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={linkClass}>
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              ))
            : null}
        </div>

        {/* Right Section */}
        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              {/* Notification Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                    notifOpen
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                <NotificationDropdown
                  user={user}
                  isOpen={notifOpen}
                  onClose={() => {
                    setNotifOpen(false);
                    fetchBadge();
                  }}
                />
              </div>

              <span className="text-xs sm:text-sm font-medium text-slate-700 max-w-[160px] truncate">
                {profile?.name || user.email}
              </span>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Logout"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-xs sm:text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-xl bg-teal-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800 active:scale-95"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        {/* Mobile Actions: Notifications + Menu toggle */}
        <div className="flex items-center gap-2 md:hidden">
          {user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                  notifOpen
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
                aria-label="Notifications"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <NotificationDropdown
                user={user}
                isOpen={notifOpen}
                onClose={() => {
                  setNotifOpen(false);
                  fetchBadge();
                }}
              />
            </div>
          )}

          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setIsOpen((value) => !value)}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-xs"
          >
            {isOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {navItems.length > 0
              ? navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={linkClass}
                    onClick={() => setIsOpen(false)}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </NavLink>
                ))
              : null}

            {user ? (
              <div className="border-t border-slate-100 pt-3 mt-1 flex flex-col gap-2">
                <div className="text-xs font-semibold text-slate-500 px-1">
                  Signed in as <span className="text-slate-800">{profile?.name || user.email}</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="border-t border-slate-100 pt-3 mt-1 flex flex-col gap-2">
                <Link
                  to="/login"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-700"
                  onClick={() => setIsOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="rounded-xl bg-teal-700 px-3 py-2 text-center text-xs font-semibold text-white shadow-xs"
                  onClick={() => setIsOpen(false)}
                >
                  Get started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
