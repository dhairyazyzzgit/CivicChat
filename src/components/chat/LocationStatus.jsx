import { Loader2, MapPinOff, RefreshCw, ShieldAlert } from 'lucide-react';
import { locationStateMessage } from '../../lib/location';

export function LocationStatus({ phase, onRetry, onUseMap }) {
  const message = locationStateMessage(phase);
  const isError = ['denied', 'timeout', 'unavailable', 'unsupported'].includes(phase);

  return (
    <div className="w-full max-w-[340px] rounded-[22px] rounded-tl-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          {phase === 'denied' ? (
            <ShieldAlert size={18} />
          ) : isError ? (
            <MapPinOff size={18} />
          ) : (
            <Loader2 size={18} className="animate-spin" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900">
            {phase === 'prompt' ? 'Location permission' : isError ? 'Location unavailable' : 'Finding your position'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{message}</p>
        </div>
      </div>

      {isError && (
        <div className="mt-3 flex flex-col gap-2">
          {onRetry && phase !== 'unsupported' && (
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-ghost !min-h-11 !text-xs"
            >
              <RefreshCw size={13} />
              Try again
            </button>
          )}
          {onUseMap && (
            <button
              type="button"
              onClick={onUseMap}
              className="btn btn-primary !min-h-11 !text-xs"
            >
              Pin location on map
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default LocationStatus;
