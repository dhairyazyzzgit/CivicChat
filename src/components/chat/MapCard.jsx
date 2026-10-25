function MapCard({ address }) {
  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-28 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 p-3">
        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          Map preview
        </div>
      </div>
      <div className="p-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Location</p>
        <p className="mt-1">{address || 'Getting your location...'}</p>
      </div>
    </div>
  );
}

export default MapCard;
