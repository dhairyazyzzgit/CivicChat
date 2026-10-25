import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const redirectTo = params.get('redirect') || '/chat';

    navigate(role === 'admin' ? '/admin' : redirectTo.startsWith('/') ? redirectTo : '/chat', {
      replace: true,
    });
  }, [location.search, navigate, role, user]);

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
        const params = new URLSearchParams(location.search);
        const redirectTo = params.get('redirect') || '/chat';
        navigate(redirectTo, { replace: true });
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
    <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Welcome back</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Login</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
            />
            {errors.email && <p className="mt-2 text-sm text-danger">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
            />
            {errors.password && <p className="mt-2 text-sm text-danger">{errors.password}</p>}
          </div>

          {errors.form && (
            <div className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {errors.form}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5f5b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Need an account?{' '}
          <Link to="/signup" className="font-semibold text-primary hover:text-[#0b5f5b]">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default LoginPage;