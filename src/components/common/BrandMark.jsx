export function BrandMark({ size = 32, className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-2xl bg-brand text-white shadow-lg ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <path d="M12 21s7-5.6 7-11.2A7 7 0 0 0 5 9.8C5 15.4 12 21 12 21Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="m8.8 10 2.2 2.2 4.2-4.4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function BrandWord({ className = '' }) {
  return (
    <span className={`font-display text-[17px] font-black text-slate-900 tracking-tight ${className}`}>
      SHIKAAYAT
    </span>
  );
}
