import { useAuth } from '../../context/AuthContext';

function AdminRoute({ children }) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-700" />
          Checking access…
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="max-w-md rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-md">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-danger">Access denied</p>
          <h1 className="display mt-4 text-5xl text-slate-900">403</h1>
          <p className="mt-3 text-slate-600">
            This dashboard is restricted to admin users only.
          </p>
          <a href="/chat" className="btn btn-primary mt-6">Go to reporting</a>
        </div>
      </main>
    );
  }

  return children;
}

export default AdminRoute;
