function ChipsRow({ options = [], chips = [], onSelect, disabled = false }) {
  const items = options.length > 0 ? options : chips;
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 pb-0.5">
      {items.map((item) => {
        const id = typeof item === 'string' ? item : item.id;
        const label = typeof item === 'string' ? item : (item.label || item.id);

        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (!disabled) {
                onSelect(id, label);
              }
            }}
            disabled={disabled}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-xs transition hover:border-blue-700/40 hover:bg-blue-50 hover:text-blue-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ChipsRow;
