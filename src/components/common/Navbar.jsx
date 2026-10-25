import { Menu, LogOut, MessageSquareText, ShieldCheck, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, profile, signOut, role } = useAuth();
  const navigate = useNavigate();

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
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="text-xl font-bold tracking-tight text-primary">
          CivicChat
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          {navItems.length > 0 ? (
            navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon size={16} />
                {label}
              </NavLink>
            ))
          ) : null}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <span className="text-sm font-medium text-slate-700">{profile?.name || user.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              >
                <LogOut size={16} />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900">Login</Link>
              <Link
                to="/signup"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b5f5b]"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setIsOpen((value) => !value)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 md:hidden"
        >
          <Menu size={18} />
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {navItems.length > 0 ? (
              navItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={linkClass} onClick={() => setIsOpen(false)}>
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))
            ) : null}

            {user ? (
              <>
                <div className="border-t border-slate-200 pt-2 text-sm font-medium text-slate-700">
                  {profile?.name || user.email}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700" onClick={() => setIsOpen(false)}>
                  Login
                </Link>
                <Link to="/signup" className="rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-white" onClick={() => setIsOpen(false)}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
