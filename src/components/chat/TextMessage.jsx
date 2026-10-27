function renderRichText(text = '', isBot = false) {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2);
      return (
        <strong
          key={index}
          className={`font-semibold ${isBot ? 'text-blue-700' : 'text-white'}`}
        >
          {content}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function TextMessage({ text, isBot = false }) {
  if (isBot) {
    return (
      <div className="max-w-full rounded-[20px] rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-xs sm:max-w-[92%]">
        {renderRichText(text, true)}
      </div>
    );
  }

  return (
    <div className="max-w-[86%] rounded-[20px] rounded-br-md bg-brand px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm sm:max-w-[80%]">
      {renderRichText(text, false)}
    </div>
  );
}

export default TextMessage;
