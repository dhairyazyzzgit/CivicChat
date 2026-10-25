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
          className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary/10"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

export default ChipsRow;
