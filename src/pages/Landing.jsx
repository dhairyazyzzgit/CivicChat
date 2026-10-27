import { ArrowRight, ArrowUpRight, Bell, Camera, ChevronDown, Layers, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import Reveal from '../components/common/Reveal';
import { BrandMark, BrandWord } from '../components/common/BrandMark';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES } from '../lib/categories';
import { useReportTarget } from '../lib/useReportTarget';

const STEPS = [
  { n: '01', icon: Camera, title: 'Take a photo', text: 'Point at the problem and snap. The system identifies the issue type automatically.' },
  { n: '02', icon: MapPin, title: 'Confirm location', text: 'Your location is pinned automatically. Adjust the pin if needed for accuracy.' },
  { n: '03', icon: Bell, title: 'Track progress', text: 'Receive a ticket number and status updates until the issue is resolved.' },
];

const FEATURES = [
  {
    icon: Zap,
    title: 'Priority escalates automatically',
    text: 'The more people report the same issue, the faster it moves to the top. Critical hazards like exposed wiring are flagged immediately.',
  },
  {
    icon: Layers,
    title: 'Smart duplicate detection',
    text: 'Multiple reports of the same problem are combined into one ticket. One strong signal reaches the department instead of noise.',
  },
  {
    icon: ShieldCheck,
    title: 'Direct department routing',
    text: 'Roads, water, electricity, sanitation—each report goes straight to the responsible government department.',
  },
];

const FAQ = [
  { q: 'Do I need an account to report?', a: 'Yes. A free account lets us send you status updates and prevents spam. It takes under a minute to sign up.' },
  { q: 'What happens after I submit?', a: 'Your report is routed to the responsible government department. Nearby reports of the same issue are merged, so priority grows as more people flag it.' },
  { q: 'Is this for emergencies?', a: 'No. If someone is in immediate danger, call 112. This platform is for civic issues like potholes, garbage, and broken streetlights. Hazards like exposed wiring are flagged as Critical immediately.' },
];

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[272px] sm:w-[300px]">
      <div className="absolute -inset-10 rounded-full bg-blue-400/20 blur-3xl" aria-hidden="true" />
      <div className="animate-floaty relative rounded-[2.6rem] bg-slate-900 p-[9px] shadow-2xl ring-1 ring-black/20">
        <div className="absolute left-1/2 top-[14px] z-10 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-slate-900" aria-hidden="true" />
        <div className="overflow-hidden rounded-[2.1rem] bg-[#f1f5f9]">
          <div className="flex items-center gap-2.5 border-b border-slate-200/70 bg-white px-4 pb-3 pt-9">
            <BrandMark size={28} />
            <div>
              <p className="text-[12px] font-semibold leading-none text-slate-900">SHIKAAYAT</p>
              <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
              </p>
            </div>
          </div>
          <div className="space-y-2.5 px-3 py-4 text-[11px]">
            <div className="ml-auto w-[9.5rem] rounded-2xl rounded-br-md bg-brand p-1 shadow-sm">
              <div className="flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 text-4xl">🕳️</div>
            </div>
            <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-3 py-2.5 leading-snug text-slate-700 shadow-xs">
              This appears to be a <b className="text-blue-700">pothole</b>. Is that correct?
            </div>
            <div className="flex gap-1.5">
              <span className="rounded-full bg-brand px-3.5 py-2 font-semibold text-white">Yes, correct</span>
              <span className="rounded-full border border-slate-200 bg-white px-3.5 py-2 font-semibold text-slate-700">Change</span>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
              <p className="eyebrow !text-[8.5px]">Ticket</p>
              <p className="mt-1.5 font-mono text-[12px] font-semibold text-slate-900">CC-2026-00142</p>
              <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
                <span>Roads Department</span>
                <span className="rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-orange-700">High</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingPage() {
  const target = useReportTarget();
  const { user } = useAuth();

  return (
    <main>
      {/* ───────── Hero ───────── */}
      <section className="bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-slate-900/40 animate-gradient-shift"></div>
        </div>
        <div className="mx-auto grid max-w-7xl items-center gap-20 px-5 pb-32 pt-24 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8 lg:pb-40 lg:pt-36 relative">
          <div className="rise-in">
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-blue-500/30 bg-blue-500/10 py-2.5 pl-3 pr-5 text-xs font-bold text-blue-300 uppercase tracking-widest">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white"><ShieldCheck size={12} /></span>
              Report it. Resolve it.
            </span>

            <h1 className="display mt-12 text-[4rem] text-white sm:text-7xl lg:text-[7.5rem] leading-[1.02]">
              Report it.<br />
              <span className="text-blue-400">Resolve it.</span>
            </h1>

            <p className="text-lead mt-12 max-w-lg text-slate-300">
              One photo reports the issue. We detect the location, route it to the right department, and keep you updated until it's resolved.
            </p>

            <div className="mt-14 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link to={target.to} className="btn btn-primary pulse-ring !min-h-16 !px-10 !text-lg bg-blue-600 hover:bg-blue-500">
                <Camera size={20} />
                {target.label}
                <ArrowRight size={18} />
              </Link>
              {user ? (
                <Link to="/reports" className="btn btn-ghost !min-h-16 !px-8 !text-lg bg-white/10 text-white hover:bg-white/20 border-white/30">Track my complaints</Link>
              ) : (
                <Link to="/login?redirect=%2Fchat" className="btn btn-ghost !min-h-16 !px-8 !text-lg bg-white/10 text-white hover:bg-white/20 border-white/30">Log in</Link>
              )}
            </div>

            <div className="mt-12 flex items-center gap-8 text-sm font-medium text-slate-400">
              <span>Free</span>
              <span className="text-slate-600">·</span>
              <span>Takes 30 seconds</span>
              <span className="text-slate-600">·</span>
              <span>Works on any device</span>
            </div>
          </div>

          <div className="rise-in lg:justify-self-end" style={{ animationDelay: '180ms' }}>
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* ───────── Categories ───────── */}
      <section className="bg-slate-50 border-y border-slate-200 overflow-hidden">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="relative">
            <div className="flex animate-marquee gap-4 whitespace-nowrap">
              {[...CATEGORIES, ...CATEGORIES, ...CATEGORIES].map((c, i) => (
                <Link
                  key={`${c.id}-${i}`}
                  to={target.to}
                  className="flex flex-shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-600 hover:text-blue-700 hover:shadow-md active:scale-95"
                >
                  <span className="text-lg">{c.icon}</span>
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section className="bg-white mx-auto max-w-7xl px-5 py-32 sm:px-6 lg:px-8 lg:py-40">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-4 text-4xl text-slate-900 sm:text-5xl">
            From street to ticket in <span className="text-blue-700">three steps.</span>
          </h2>
        </Reveal>

        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ n, icon: Icon, title, text }, i) => (
            <Reveal key={n} delay={i * 90} className="rounded-2xl border border-slate-200 bg-slate-50 p-12 sm:p-14 hover:border-blue-300 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-slate-400">{n}</span>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white"><Icon size={24} /></span>
              </div>
              <h3 className="font-display mt-14 text-2xl font-bold text-slate-900">{title}</h3>
              <p className="text-lead mt-5 font-medium">{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section className="bg-slate-50 px-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl px-6 py-32 sm:px-8 sm:py-36 lg:py-40">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Built for public service</p>
            <h2 className="display mt-4 text-4xl sm:text-5xl text-slate-900">
              The right problem, <span className="text-blue-700">in front of the right people.</span>
            </h2>
          </Reveal>
          <div className="mt-24 grid gap-6 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 90} className="rounded-2xl border border-slate-200 bg-white p-12 hover:border-blue-300 hover:shadow-lg transition-all">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Icon size={24} /></span>
                <h3 className="font-display mt-10 text-xl font-bold text-slate-900">{title}</h3>
                <p className="text-lead mt-5 text-slate-600 font-medium">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="bg-white mx-auto max-w-3xl px-5 py-32 sm:px-6 lg:py-40">
        <Reveal>
          <p className="eyebrow text-center">Questions</p>
          <h2 className="display mx-auto mt-4 text-3xl text-slate-900 sm:text-4xl">Common questions</h2>
        </Reveal>
        <div className="mt-20 space-y-4">
          {FAQ.map(({ q, a }, i) => (
            <Reveal key={q} delay={i * 70}>
              <details className="group rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all">
                <summary className="cursor-pointer px-6 py-6 font-bold text-slate-900 outline-none transition hover:bg-slate-50">
                  {q}
                </summary>
                <p className="text-lead mt-0 max-w-2xl px-6 pb-6 font-medium">{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="bg-slate-900 px-3 pb-32 sm:px-6 lg:px-8 lg:pb-40">
        <Reveal className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-32 text-center sm:py-40 relative">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 via-transparent to-slate-900/50 animate-gradient-shift"></div>
          </div>
          <div className="relative">
            <h2 className="display mx-auto max-w-2xl text-4xl text-white sm:text-6xl">
              Report it.<span className="text-blue-400">Resolve it.</span>
            </h2>
            <p className="text-lead mx-auto mt-10 max-w-md text-slate-300 font-medium">One photo is all it takes to get started.</p>
            <Link to={target.to} className="btn btn-primary !min-h-16 !px-10 !text-lg mt-14 bg-blue-600 hover:bg-blue-500">
              <Camera size={20} /> {target.label} <ArrowUpRight size={18} />
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-slate-200/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <BrandWord />
          </div>
          <p>In an emergency, call <b className="font-semibold text-slate-800">112</b></p>
          <p className="text-xs">© {new Date().getFullYear()} CivicChat</p>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;
