import { Camera, MapPin, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandMark, BrandWord } from './BrandMark';

export function AuthShell({ eyebrow, title, subtitle, children, footer }) {
  return (
    <main className="grid min-h-[calc(100dvh-72px)] lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside className="dark-panel grain relative hidden flex-col justify-between overflow-hidden p-14 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandMark size={34} className="!bg-white/10 ring-1 ring-white/20" />
          <div className="flex flex-col">
            <span className="font-display text-lg font-semibold tracking-tight">SHIKAAYAT</span>
            <span className="text-[11px] text-blue-200/70 tracking-wide">Report it. Resolve it.</span>
          </div>
        </div>

        <div>
          <h2 className="display text-[3.4rem] leading-[1.02]">
            Fix your<br />neighbourhood,<br />
            <span className="text-blue-200">one photo</span> at a time.
          </h2>
          <ul className="mt-12 space-y-4 text-[15px] text-blue-50/80">
            {[
              [Camera, 'Snap a photo. Issue detected automatically.'],
              [MapPin, 'Location pinned automatically.'],
              [Bell, 'Track until resolution.'],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-blue-200 ring-1 ring-white/10"><Icon size={16} /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-blue-100/50">In an emergency, call 112.</p>
      </aside>

      {/* Form panel */}
      <section className="hero-mesh flex items-start justify-center px-5 py-10 sm:items-center sm:px-8 lg:bg-none lg:bg-white">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={30} />
            <BrandWord />
          </div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display mt-3 text-[2.4rem] text-slate-900 sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-7 text-center text-sm text-slate-600">{footer}</div>}
          <p className="mt-10 text-center text-xs text-slate-400">
            <Link to="/" className="transition hover:text-slate-700">← Back to home</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-700 focus:ring-4 focus:ring-blue-700/10';
