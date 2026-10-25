function ChipsRow({ chips, onSelect }) {
  if (!chips || chips.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="rounded-full border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:border-primary/30 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

export default ChipsRow;
