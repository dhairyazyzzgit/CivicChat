function renderRichText(text = '', isBot = false) {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2);
      return (
        <strong
          key={index}
          className={`font-semibold ${
            isBot ? 'text-teal-900 bg-teal-50/80 px-1.5 py-0.5 rounded-md inline-block my-0.5' : 'text-white underline underline-offset-2'
          }`}
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
      <div className="max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-bl-xs border border-slate-200/90 bg-white px-4 py-3 text-[13.5px] sm:text-[14px] leading-relaxed text-slate-800 shadow-[0_2px_6px_-1px_rgba(15,23,42,0.06)]">
        {renderRichText(text, true)}
      </div>
    );
  }

  return (
    <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl rounded-br-xs bg-gradient-to-br from-teal-700 to-[#0c5c56] px-4 py-3 text-[13.5px] sm:text-[14px] font-normal leading-relaxed text-white shadow-sm">
      {renderRichText(text, false)}
    </div>
  );
}

export default TextMessage;
