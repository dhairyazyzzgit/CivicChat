import { Link } from 'react-router-dom';

function LandingPage() {
  return (
    <main className="min-h-[calc(100vh-73px)] bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Civic issue reporting</p>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Report a public issue in 30 seconds.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">
            Just send a photo and let CivicChat help you flag potholes, garbage, waterlogging, and other public problems near you.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="rounded-xl bg-primary px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#0b5f5b]"
            >
              Get started
            </Link>
            <Link
              to="/login"
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[#0b1f33] p-6 text-white">
            <p className="text-sm uppercase tracking-[0.12em] text-white/80">Issue snapshot</p>
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-white/10 p-4">
                <div className="flex items-center justify-between text-sm text-white/80">
                  <span>Photo uploaded</span>
                  <span>9:41 AM</span>
                </div>
                <p className="mt-3 text-xl font-semibold">Pothole near main road</p>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/10 p-4 text-sm text-white/80">
                <span>Category</span>
                <span className="font-semibold text-white">Pothole</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/10 p-4 text-sm text-white/80">
                <span>Status</span>
                <span className="rounded-full bg-amber/20 px-2 py-1 text-xs font-semibold text-amber-100">Submitted</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default LandingPage;
