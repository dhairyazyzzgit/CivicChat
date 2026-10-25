import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function SignupPage() {
  const navigate = useNavigate();
  const { signUp, user, role } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    navigate(role === 'admin' ? '/admin' : '/chat', { replace: true });
  }, [navigate, role, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!name.trim()) {
      nextErrors.name = 'Please enter your name.';
    }

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
      await signUp(email.trim(), password, name.trim());
    } catch (error) {
      const message = error?.message || 'Unable to create your account.';
      const normalized = message.toLowerCase();

      if (normalized.includes('already registered') || normalized.includes('user already exists')) {
        setErrors({ form: 'This email is already registered. Please log in instead.' });
      } else if (normalized.includes('network')) {
        setErrors({ form: 'Network problem. Please check your connection and try again.' });
      } else {
        setErrors({ form: 'We could not create your account. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Get started</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Create account</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="signup-name" className="mb-2 block text-sm font-medium text-slate-700">Full name</label>
            <input
              id="signup-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
            />
            {errors.name && <p className="mt-2 text-sm text-danger">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
            />
            {errors.email && <p className="mt-2 text-sm text-danger">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <input
              id="signup-password"
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary hover:text-[#0b5f5b]">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default SignupPage;
