import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { safeRedirect } from '../lib/useReportTarget';
import { AuthShell, inputClass } from '../components/common/AuthShell';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const redirectParam = new URLSearchParams(location.search).get('redirect');
  const signupHref = redirectParam ? `/signup?redirect=${encodeURIComponent(redirectParam)}` : '/signup?redirect=%2Fchat';

  useEffect(() => {
    if (!user) {
      return;
    }

    navigate(role === 'admin' ? '/admin' : safeRedirect(redirectParam), { replace: true });
  }, [redirectParam, navigate, role, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters long.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // 1. Perform sign in
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;

      // 2. Query the profile role directly to avoid state lag
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      // 3. Immediate redirect based on fetched role
      if (profile?.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate(safeRedirect(redirectParam), { replace: true });
      }
    } catch (error) {
      const message = error?.message || 'Unable to sign in right now.';
      const normalized = message.toLowerCase();

      if (normalized.includes('invalid login credentials') || normalized.includes('wrong')) {
        setErrors({ form: 'Incorrect email or password. Please try again.' });
      } else if (normalized.includes('network')) {
        setErrors({ form: 'Network problem. Please check your connection and try again.' });
      } else {
        setErrors({ form: 'We could not sign you in. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in to report"
      subtitle="Pick up where you left off and track your reports."
      footer={
        <>
          New here?{' '}
          <Link to={signupHref} className="font-semibold text-blue-700 underline decoration-blue-700/30 underline-offset-4 hover:decoration-blue-700">
            Create a free account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
          {errors.email && <p className="mt-2 text-sm text-danger">{errors.email}</p>}
        </div>

        <div>
          <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
          <div className="relative">
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <p className="mt-2 text-sm text-danger">{errors.password}</p>}
        </div>

        {errors.form && (
          <div role="alert" className="rounded-xl border border-rose-200/20 bg-rose-50/60 px-3 py-2.5 text-sm text-rose-700">
            {errors.form}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full !min-h-14 !text-base"
        >
          {loading && <Loader2 size={18} className="animate-spin" />}
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </AuthShell>
  );
}

export default LoginPage;
