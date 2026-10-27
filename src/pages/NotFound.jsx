import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <main className="flex min-h-[calc(100vh-61px)] items-center justify-center bg-background p-6">
      <div className="max-w-sm rounded-[28px] bg-white p-10 text-center shadow-md ring-1 ring-slate-200">
        <p className="display text-7xl text-teal-800">404</p>
        <p className="mt-3 text-slate-600">We couldn't find that page.</p>
        <Link to="/" className="btn btn-primary mt-6">Back to home</Link>
      </div>
    </main>
  );
}

export default NotFoundPage;
