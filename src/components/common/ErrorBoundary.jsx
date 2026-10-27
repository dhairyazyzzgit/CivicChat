import { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-slate-50/70 px-4 py-12">
          <div className="flex max-w-md flex-col items-center justify-center rounded-3xl border border-rose-200/90 bg-white p-8 text-center shadow-xs">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
              <AlertCircle size={28} />
            </div>
            <h1 className="mt-4 text-lg font-bold text-slate-900">Something went wrong</h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary mt-5"
            >
              <RefreshCw size={14} />
              <span>Refresh Page</span>
            </button>
            <Link
              to="/"
              className="mt-3 text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2"
            >
              Go to Home
            </Link>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
