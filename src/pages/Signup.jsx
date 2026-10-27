import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AuthShell, inputClass } from '../components/common/AuthShell';
import { safeRedirect } from '../lib/useReportTarget';
import { useAuth } from '../context/AuthContext';

function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectParam = new URLSearchParams(location.search).get('redirect');
  const loginHref = redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login?redirect=%2Fchat';
  const [showPw, setShowPw] = useState(false);
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

    navigate(role === 'admin' ? '/admin' : safeRedirect(redirectParam), { replace: true });
  }, [navigate, redirectParam, role, user]);

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

  const field = (id, label, type, value, setter, placeholder, error, autoComplete) => (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => setter(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your free account"
      subtitle="Takes under a minute. You'll go straight to reporting."
      footer={
        <>
          Already have an account?{' '}
          <Link to={loginHref} className="font-semibold text-blue-700 underline decoration-blue-700/30 underline-offset-4 hover:decoration-blue-700">Log in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {field('signup-name', 'Full name', 'text', name, setName, 'Your name', errors.name, 'name')}
        {field('signup-email', 'Email', 'email', email, setEmail, 'you@example.com', errors.email, 'email')}

        <div>
          <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
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
          {loading ? 'Creating account…' : 'Create account & start reporting'}
        </button>
      </form>
    </AuthShell>
  );
}

export default SignupPage;
