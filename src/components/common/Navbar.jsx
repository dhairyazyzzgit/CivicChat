import { Camera, FileText, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationBellButton, NotificationPanel } from './NotificationBell';
import { BrandMark, BrandWord } from './BrandMark';

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { user, profile, signOut, role } = useAuth();
  const navigate = useNavigate();
  const notifications = useNotifications({ userId: user?.id, role });

  const handleLogout = async () => {
    try {
      navigate('/', { replace: true }); // leave protected routes first
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const navItems = [];

  if (user && role === 'admin') {
    navItems.push({ to: '/admin', label: 'Dashboard', icon: ShieldCheck });
  } else if (user) {
    navItems.push({ to: '/chat', label: 'Report issue', icon: Camera });
    navItems.push({ to: '/reports', label: 'My Reports', icon: FileText });
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900'
    }`;

  const notificationUi = user ? (
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
          navigate('/admin', { state: { selectedGroupId: groupId } });
        }}
        userId={user.id}
        isAdmin={role === 'admin'}
      />
    </div>
  ) : null;

  return (
    <header className="bg-white sticky top-0 z-40 h-[88px] border-b-2 border-slate-900">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-4" aria-label="SHIKAAYAT home">
          <BrandMark size={52} />
          <div className="flex flex-col leading-tight">
            <BrandWord className="text-[26px] leading-none" />
            <span className="text-[11px] font-black tracking-[0.2em] text-blue-700 uppercase leading-tight mt-1">Report it. Resolve it.</span>
          </div>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex" aria-label="Main">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {notificationUi}

          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <>
                <span className="max-w-[160px] truncate text-sm font-medium text-slate-600">
                  {profile?.name || user.email}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                  aria-label="Sign out"
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login?redirect=%2Fchat" className="px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900">
                  Log in
                </Link>
                <Link to="/signup?redirect=%2Fchat" className="btn btn-primary !min-h-10 !px-5 !text-sm">
                  Get started
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 md:hidden"
          >
            {isOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute inset-x-0 top-full border-b border-slate-200 bg-white px-4 pb-6 pt-4 shadow-lg md:hidden">
          <div className="flex flex-col gap-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass} onClick={() => setIsOpen(false)}>
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}

            {user ? (
              <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-4">
                <div className="px-1 text-xs text-slate-500">
                  Signed in as <span className="font-semibold text-slate-800">{profile?.name || user.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="btn btn-ghost"
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-4">
                <Link to="/signup?redirect=%2Fchat" className="btn btn-primary" onClick={() => setIsOpen(false)}>
                  Get started
                </Link>
                <Link to="/login?redirect=%2Fchat" className="btn btn-ghost" onClick={() => setIsOpen(false)}>
                  Log in
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
