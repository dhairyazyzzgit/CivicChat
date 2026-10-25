function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-3xl font-bold text-primary">404</h1>
        <p className="mt-3 text-slate-600">Page not found.</p>
      </div>
    </main>
  );
}

export default NotFoundPage;
