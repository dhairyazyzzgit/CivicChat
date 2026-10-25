import { useAuth } from '../../context/AuthContext';

function AdminRoute({ children }) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600">
          Loading access...
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-danger">Access denied</p>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">403</h1>
          <p className="mt-3 text-slate-600">
            This dashboard is restricted to admin users only.
          </p>
        </div>
      </main>
    );
  }

  return children;
}

export default AdminRoute;
