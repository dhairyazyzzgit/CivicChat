function renderRichText(text = '') {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`} className="font-semibold">{part.slice(2, -2)}</strong>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function TextMessage({ text, isBot = false }) {
  return (
    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
      isBot
        ? 'bg-white text-slate-700 ring-1 ring-slate-200'
        : 'bg-primary text-white'
    }`}>
      {renderRichText(text)}
    </div>
  );
}

export default TextMessage;
