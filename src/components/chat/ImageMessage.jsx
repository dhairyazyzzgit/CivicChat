import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

function ImageMessage({ src, alt = 'Uploaded issue photo', uploadStatus = 'uploaded', onRetry }) {
  const [showUploadedBadge, setShowUploadedBadge] = useState(true);

  useEffect(() => {
    if (uploadStatus === 'uploaded') {
      const timer = setTimeout(() => {
        setShowUploadedBadge(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
    setShowUploadedBadge(true);
  }, [uploadStatus]);

  return (
    <div className="relative w-full max-w-[280px] overflow-hidden rounded-[20px] rounded-br-md border border-slate-200 bg-white shadow-sm">
      {src ? (
        <img src={src} alt={alt} className="h-48 w-full object-cover" />
      ) : (
        <div className="h-48 w-full animate-pulse bg-slate-100" aria-hidden="true" />
      )}

      {uploadStatus === 'uploading' && (
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white shadow backdrop-blur-xs">
          <Loader2 size={12} className="animate-spin text-blue-300" />
          <span>Uploading photo…</span>
        </div>
      )}

      {uploadStatus === 'uploaded' && showUploadedBadge && (
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-1.5 rounded-full bg-emerald-700/85 px-2.5 py-1 text-[11px] font-medium text-white shadow backdrop-blur-xs transition-opacity duration-500">
          <Check size={12} className="text-white" />
          <span>Uploaded</span>
        </div>
      )}

      {uploadStatus === 'failed' && (
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-1.5 rounded-full bg-rose-700/90 px-2.5 py-1 text-[11px] font-medium text-white shadow backdrop-blur-xs">
          <span>Upload failed</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/30"
            >
              <RefreshCw size={10} />
              Retry upload
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageMessage;
