function ImageMessage({ src, alt, progress = 100, caption }) {
  return (
    <div className="max-w-[80%] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <img src={src} alt={alt} className="h-52 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/70 to-transparent p-3 text-xs text-white">
          {caption || 'Uploaded photo'}
        </div>
        {progress < 100 && (
          <div className="absolute inset-x-3 top-3 rounded-full bg-slate-900/55 p-1">
            <div className="h-1.5 rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageMessage;
