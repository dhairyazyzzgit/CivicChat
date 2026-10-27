import { Camera, FileText, Home } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Routes where the mobile bottom bar is shown.
export function bottomNavVisible(pathname, user, role) {
  if (user && role === 'admin') return false;
  if (pathname === '/') return true;
  if (!user) return false;
  return pathname === '/reports' || pathname.startsWith('/reports/');
}

export default function BottomNav() {
  const { user, role } = useAuth();
  const { pathname } = useLocation();
  if (!bottomNavVisible(pathname, user, role)) return null;

  // Guests on the landing page get one clear call to action.
  if (!user) {
    return (
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 px-4 pt-3 md:hidden glass border-t border-slate-200/70">
        <Link to="/signup?redirect=%2Fchat" className="btn btn-primary w-full">
          <Camera size={18} /> Report an issue
        </Link>
      </div>
    );
  }

  const tab = ({ isActive }) =>
    `flex flex-1 flex-col items-center gap-1 py-2 text-[10.5px] font-semibold transition ${
      isActive ? 'text-blue-800' : 'text-slate-400'
    }`;

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 px-6 pt-2 md:hidden glass" aria-label="Primary">
      <div className="mx-auto flex max-w-sm items-end justify-between">
        <NavLink to="/" end className={tab}>
          <Home size={21} />
          Home
        </NavLink>
        <Link
          to="/chat"
          aria-label="Report an issue"
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-blue-950/30 ring-4 ring-paper transition active:scale-95"
        >
          <Camera size={22} />
        </Link>
        <NavLink to="/reports" className={tab}>
          <FileText size={21} />
          My reports
        </NavLink>
      </div>
    </nav>
  );
}
