function ChipsRow({ options = [], chips = [], onSelect, disabled = false }) {
  const items = options.length > 0 ? options : chips;
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1 pb-0.5">
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
            className="group inline-flex items-center gap-1.5 rounded-full border border-teal-600/25 bg-teal-50/60 px-3.5 py-2 text-xs font-semibold text-teal-800 shadow-[0_1px_2px_rgba(15,118,110,0.06)] transition-all duration-150 hover:border-teal-600/50 hover:bg-teal-100/70 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-600/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ChipsRow;
